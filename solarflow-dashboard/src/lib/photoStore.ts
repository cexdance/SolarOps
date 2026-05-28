/**
 * SolarOps — Local Photo Store (IndexedDB)
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
import { supabase } from './supabase';

const DB_NAME    = 'solarops_photos';
const DB_VERSION = 1;
const STORE      = 'rows';
const BUCKET     = 'customer-files'; // aligned with photoStorage.ts — was 'wo-photos'

export interface PhotoRow {
  id:           string;
  jobId:        string;
  category:     string;
  blob:         Blob;
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

export async function deletePhoto(id: string): Promise<void> {
  const store = await tx('readwrite');
  await reqToPromise(store.delete(id));
}

/** Re-attempt mirror for every row whose uploadStatus is not 'uploaded'. */
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
//     Idempotent — already-migrated photos pass through unchanged.
//
//   hydrateWoPhotos(photos)
//     Inverse: for any photo with `photoStoreId` and no `dataUrl`, read the
//     blob from IndexedDB and produce an object URL so <img src=...> works.
//     Object URLs are NOT auto-revoked here — caller must `URL.revokeObjectURL`
//     when the component unmounts to avoid leaks.

interface WoPhotoLike {
  id: string;
  category: string;
  name: string;
  dataUrl: string;
  photoStoreId?: string;
  createdAt: string;
}

function dataUrlToBlob(dataUrl: string): Blob | null {
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

  // Path layout: <jobId>/<category>/<photoId>.<ext>
  const ext  = row.contentType.split('/')[1] || 'jpg';
  const path = `${row.jobId}/${row.category}/${row.id}.${ext}`;

  try {
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, row.blob, {
        contentType: row.contentType,
        upsert: true,
      });
    if (error) throw error;
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const updated: PhotoRow = {
      ...row,
      uploadStatus: 'uploaded',
      supabaseUrl: pub.publicUrl,
      lastError: undefined,
    };
    const store = await tx('readwrite');
    await reqToPromise(store.put(updated));
    return { ok: true };
  } catch (e) {
    const updated: PhotoRow = {
      ...row,
      uploadStatus: 'failed',
      lastError: e instanceof Error ? e.message : String(e),
    };
    const store = await tx('readwrite');
    await reqToPromise(store.put(updated));
    return { ok: false, error: updated.lastError };
  }
}
