/**
 * SolarOps, Local Photo Store (IndexedDB)
 *
 * Append-row photo storage backed by IndexedDB on the device, with a
 * background mirror queue that uploads each row to Supabase Storage.
 *
 * Each photo is a row:
 *   { id, jobId, category, blob, contentType, createdAt,
 *     uploadStatus: 'pending' | 'uploaded' | 'failed',
 *     supabaseUrl?, lastError? }
 *
 * Why IndexedDB instead of localStorage:
 *  - localStorage caps at ~5MB per origin and stores strings only.
 *  - Base64 dataURLs add 33% overhead to already-compressed JPEGs.
 *  - IndexedDB stores Blobs natively, scales to hundreds of MB.
 *
 * Why mirror to Supabase Storage instead of the change_log row payload:
 *  - Photos are large; the change_log row would bloat Postgres.
 *  - Storage gives a public/signed URL that any device can fetch on
 *    demand without re-replicating the bytes through every sync.
 */
const DB_NAME    = 'solarops_photos';
const DB_VERSION = 1;
const STORE      = 'rows';

export interface PhotoRow {
  id:           string;
  jobId:        string;
  category:     string;
  /**
   * The local bytes. Absent once `purgeUploadedBlobs()` has reclaimed them,
   * which only happens after the row reached Supabase Storage, so `supabaseUrl`
   * is the fallback source for any row without a blob.
   */
  blob?:        Blob;
  contentType:  string;
  createdAt:    string;
  uploadStatus: 'pending' | 'uploaded' | 'failed';
  supabaseUrl?: string;
  lastError?:   string;
}

// ── IndexedDB plumbing ──────────────────────────────────────────────────────

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('jobId', 'jobId', { unique: false });
        store.createIndex('uploadStatus', 'uploadStatus', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error ?? new Error('indexeddb open failed'));
  });
  return dbPromise;
}

function tx(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return openDb().then(db => db.transaction(STORE, mode).objectStore(STORE));
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error ?? new Error('indexeddb request failed'));
  });
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Append a photo row to the local DB. Triggers a background mirror to
 * Supabase Storage (fire-and-forget). Returns the new row.
 */
export async function appendPhoto(args: {
  jobId:    string;
  category: string;
  blob:     Blob;
}): Promise<PhotoRow> {
  const row: PhotoRow = {
    id:           `ph-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    jobId:        args.jobId,
    category:     args.category,
    blob:         args.blob,
    contentType:  args.blob.type || 'image/jpeg',
    createdAt:    new Date().toISOString(),
    uploadStatus: 'pending',
  };
  const store = await tx('readwrite');
  await reqToPromise(store.put(row));
  // Fire-and-forget mirror; failures are persisted so a later flush can retry.
  void mirrorRow(row.id);
  return row;
}

export async function getPhoto(id: string): Promise<PhotoRow | undefined> {
  const store = await tx('readonly');
  return reqToPromise(store.get(id));
}

export async function listPhotosForJob(jobId: string): Promise<PhotoRow[]> {
  const store = await tx('readonly');
  const idx = store.index('jobId');
  return reqToPromise(idx.getAll(jobId));
}

/**
 * Delete the local IDB row(s) for a job whose uploaded Storage URL matches.
 * Without this a deleted photo is re-added by the retry sweep (which re-reads
 * IDB), so a delete never sticks. Returns the number of rows removed.
 */
export async function deletePhotoForJobByUrl(jobId: string, url: string): Promise<number> {
  if (!url) return 0;
  const rows = await listPhotosForJob(jobId);
  const targets = rows.filter(r => r.supabaseUrl === url);
  if (targets.length === 0) return 0;
  const store = await tx('readwrite');
  await Promise.all(targets.map(r => reqToPromise(store.delete(r.id))));
  return targets.length;
}

/**
 * Reclaim device storage: drop the local Blob from rows already mirrored to
 * Supabase Storage.
 *
 * Nothing ever evicted these, so the photo DB grew for the life of the install.
 * IndexedDB shares one quota per origin with the app-state DB (`solarops_state`),
 * so a fat photo store eventually fails every `saveData()` write and raises the
 * blocking "Storage full, changes not saved" modal. The bytes are recoverable
 * from `supabaseUrl`, the row (and its metadata) stays, so `hydrateWoPhotos`
 * still resolves the photo, just over the network.
 *
 * Rows newer than `keepDays` keep their blob so recent jobs still render with no
 * signal. ponytail: 30 days is a guess, not a measurement. Lower it if devices
 * still fill up, raise it if field crews report missing photos offline.
 *
 * Idempotent and safe to call on every boot: a reclaimed row no longer matches.
 */
export function isReclaimable(row: PhotoRow, cutoffMs: number): boolean {
  // An unparseable createdAt yields NaN, and NaN < cutoff is false, so a row with
  // a bad date is KEPT. Erring toward keeping bytes beats deleting the only copy.
  return Boolean(row.blob)
    && row.uploadStatus === 'uploaded'
    && Boolean(row.supabaseUrl)
    && Date.parse(row.createdAt) < cutoffMs;
}

export async function purgeUploadedBlobs(keepDays = 30): Promise<{ rows: number; bytes: number }> {
  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  const store = await tx('readonly');
  const idx = store.index('uploadStatus');
  const uploaded = await reqToPromise(idx.getAll(IDBKeyRange.only('uploaded')));
  const stale = uploaded.filter(r => isReclaimable(r, cutoff));
  if (stale.length === 0) return { rows: 0, bytes: 0 };
  const bytes = stale.reduce((n, r) => n + (r.blob?.size ?? 0), 0);
  const rw = await tx('readwrite');
  // Issue every put synchronously so the transaction cannot auto-commit mid-loop.
  await Promise.all(stale.map(r => reqToPromise(rw.put({ ...r, blob: undefined }))));
  return { rows: stale.length, bytes };
}

export async function flushPendingMirrors(): Promise<{ ok: number; failed: number }> {
  const store = await tx('readonly');
  const idx = store.index('uploadStatus');
  const pending = await reqToPromise(idx.getAll(IDBKeyRange.only('pending')));
  const failed  = await reqToPromise(idx.getAll(IDBKeyRange.only('failed')));
  const all     = [...pending, ...failed];
  let ok = 0;
  let bad = 0;
  for (const row of all) {
    const result = await mirrorRow(row.id);
    if (result.ok) ok++; else bad++;
  }
  return { ok, failed: bad };
}

// ── WO-photo migration helpers ──────────────────────────────────────────────
//
// These let the existing `WOPhoto` interface (which carries an inline `dataUrl`)
// migrate to IndexedDB-backed storage without forcing every reader to change.
//
//   migrateWoPhotos(jobId, photos)
//     For any photo whose dataUrl is a base64 string and which has no
//     `photoStoreId` yet, write it as a Blob row in IndexedDB and return a
//     rewritten array where `dataUrl=''` and `photoStoreId` points at the row.
//     Idempotent, already-migrated photos pass through unchanged.
//
//   hydrateWoPhotos(photos)
//     Inverse: for any photo with `photoStoreId` and no `dataUrl`, read the
//     blob from IndexedDB and produce an object URL so <img src=...> works.
//     Object URLs are NOT auto-revoked here, caller must `URL.revokeObjectURL`
//     when the component unmounts to avoid leaks.

interface WoPhotoLike {
  id: string;
  category: string;
  name: string;
  dataUrl: string;
  photoStoreId?: string;
  createdAt: string;
}

export function dataUrlToBlob(dataUrl: string): Blob | null {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  const mime = m[1];
  const b64  = m[2];
  const bin  = atob(b64);
  const arr  = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export async function migrateWoPhotos<T extends WoPhotoLike>(
  jobId: string,
  photos: T[],
): Promise<T[]> {
  if (!Array.isArray(photos) || photos.length === 0) return photos ?? [];
  const out: T[] = [];
  for (const p of photos) {
    if (p.photoStoreId) { out.push(p); continue; }
    if (!p.dataUrl?.startsWith('data:')) { out.push(p); continue; }
    const blob = dataUrlToBlob(p.dataUrl);
    if (!blob) { out.push(p); continue; }
    try {
      const row = await appendPhoto({ jobId, category: p.category, blob });
      out.push({ ...p, dataUrl: '', photoStoreId: row.id });
    } catch (e) {
      console.error('[photoStore] migrateWoPhotos failed for', p.id, e);
      out.push(p);
    }
  }
  return out;
}

export async function hydrateWoPhotos<T extends WoPhotoLike>(photos: T[]): Promise<T[]> {
  if (!Array.isArray(photos) || photos.length === 0) return photos ?? [];
  const out: T[] = [];
  for (const p of photos) {
    if (p.dataUrl) { out.push(p); continue; }
    if (!p.photoStoreId) { out.push(p); continue; }
    try {
      const row = await getPhoto(p.photoStoreId);
      if (row?.blob) {
        const url = URL.createObjectURL(row.blob);
        out.push({ ...p, dataUrl: url });
      } else if (row?.supabaseUrl) {
        // Blob reclaimed by purgeUploadedBlobs(); Storage holds the only copy.
        out.push({ ...p, dataUrl: row.supabaseUrl });
      } else {
        out.push(p);
      }
    } catch (e) {
      console.error('[photoStore] hydrateWoPhotos failed for', p.id, e);
      out.push(p);
    }
  }
  return out;
}

// ── Supabase Storage mirror ─────────────────────────────────────────────────

async function mirrorRow(id: string): Promise<{ ok: boolean; error?: string }> {
  const row = await getPhoto(id);
  if (!row) return { ok: false, error: 'row not found' };
  if (row.uploadStatus === 'uploaded') return { ok: true };
  // Unreachable in practice: only uploaded rows ever lose their blob.
  if (!row.blob) return { ok: false, error: 'blob reclaimed, nothing to upload' };

  // Upload through the SAME canonical uploader as the in-editor direct upload
  // (addPhoto) so both paths write the IDENTICAL storage key (wo-photos/<jobId>/
  // <id>.<ext>, upsert). Previously this used a different key
  // (<jobId>/<category>/<id>.jpeg), so the same blob produced TWO public URLs and
  // the same photo appeared two/three times. Same key = idempotent = one URL.
  const { uploadPhotoToStorage } = await import('./photoStorage');
  const result = await uploadPhotoToStorage(row.blob, row.jobId, row.id);
  if (result.url) {
    const updated: PhotoRow = {
      ...row,
      uploadStatus: 'uploaded',
      supabaseUrl: result.url,
      lastError: undefined,
    };
    const store = await tx('readwrite');
    await reqToPromise(store.put(updated));
    return { ok: true };
  }
  const updated: PhotoRow = {
    ...row,
    uploadStatus: 'failed',
    lastError: result.error ?? 'upload failed',
  };
  const store = await tx('readwrite');
  await reqToPromise(store.put(updated));
  return { ok: false, error: updated.lastError };
}
