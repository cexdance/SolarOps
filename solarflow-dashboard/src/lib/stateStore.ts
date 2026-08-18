/**
 * SolarOps, Local App-State Store (IndexedDB)
 *
 * The whole `AppState` (every customer + job) used to live in a single
 * `localStorage['solarflow_data']` JSON string. localStorage caps at ~5MB per
 * origin, so on a data-heavy device (a contractor's phone) that blob overflowed
 * and threw QuotaExceededError, surfacing the blocking "Storage full" modal and
 * silently dropping edits.
 *
 * IndexedDB stores JS objects natively (no JSON string, no 5MB ceiling), so the
 * blob moves here. Supabase remains the cross-device source of truth (syncEngine
 * is unchanged); this is purely the local persistence tier.
 *
 * DB is separate from the photos DB (`solarops_photos`) so the two never collide.
 * IDB plumbing (openDb / tx / reqToPromise) mirrors lib/photoStore.ts.
 */
import type { AppState } from '../types';

const DB_NAME    = 'solarops_state';
const DB_VERSION = 1;
const STORE      = 'kv';
const STATE_KEY  = 'solarflow_data';

// Legacy localStorage key the blob used to live under, read once for migration.
const LEGACY_LS_KEY = 'solarflow_data';

interface KvRow { key: string; value: unknown; }

// ── IndexedDB plumbing (mirrors photoStore.ts) ──────────────────────────────

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' });
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

// ── Storage adapter ─────────────────────────────────────────────────────────
//
// The migration/verify logic below is a PURE function over this interface so it
// can be unit-tested with an in-memory fake (jsdom has no IndexedDB and we add no
// fake-indexeddb dependency). The live adapter is IDB-backed.

export interface StateStorage {
  get(key: string): Promise<AppState | null>;
  set(key: string, value: AppState): Promise<void>;
}

// Untyped access to the same object store. The AppState blob and the KV mirror
// below share one store, separated by key prefix.
async function idbGetRaw(key: string): Promise<unknown> {
  const store = await tx('readonly');
  const row = await reqToPromise<KvRow | undefined>(store.get(key));
  return row?.value ?? null;
}

async function idbSetRaw(key: string, value: unknown): Promise<void> {
  const store = await tx('readwrite');
  await reqToPromise(store.put({ key, value } satisfies KvRow));
}

const idbStorage: StateStorage = {
  async get(key) {
    return (await idbGetRaw(key)) as AppState | null;
  },
  async set(key, value) {
    return idbSetRaw(key, value);
  },
};

// ── One-time localStorage → IDB migration (pure, testable) ──────────────────
//
// First boot after this ships: the blob still lives in localStorage. Move it to
// IDB, VERIFY the read-back, and only THEN clear localStorage (frees the 5MB).
// If anything fails, leave localStorage untouched so no data is ever lost. This
// is the one risk moment in the whole change (a prior incident wiped 225
// customers from an unverified write), hence verify-before-delete.

export interface MigrationDeps {
  storage:  StateStorage;
  readLS:   () => string | null;       // localStorage.getItem
  clearLS:  () => void;                // localStorage.removeItem
  parse:    (raw: string) => AppState; // JSON.parse (+ any load-time massaging)
}

/**
 * Ensure the state blob lives in IDB. Returns the resolved state, or null if
 * neither IDB nor localStorage holds anything yet (fresh device).
 *
 * - IDB already has it        → return it (localStorage cleared if a stale copy lingers).
 * - IDB empty, localStorage has it → migrate: write IDB, verify, then clear LS.
 * - Migration write/verify fails   → return the parsed LS state, KEEP LS (retry next boot).
 * - Neither has it            → return null.
 */
export async function migrateStateToIdb(deps: MigrationDeps): Promise<AppState | null> {
  const { storage, readLS, clearLS, parse } = deps;

  const existing = await storage.get(STATE_KEY);
  if (existing) {
    // IDB is authoritative once populated. Drop any stale localStorage copy that
    // a pre-migration build may have written, so the 5MB stays freed.
    if (readLS()) { try { clearLS(); } catch { /* ignore */ } }
    return existing;
  }

  const raw = readLS();
  if (!raw) return null; // fresh device, nothing to migrate

  let parsed: AppState;
  try {
    parsed = parse(raw);
  } catch (e) {
    console.error('[stateStore] could not parse legacy localStorage blob', e);
    return null;
  }

  try {
    await storage.set(STATE_KEY, parsed);
    // Verify the write actually landed before deleting the only other copy.
    const readBack = await storage.get(STATE_KEY);
    if (!readBack) throw new Error('verify read-back returned null');
    clearLS();
    return parsed;
  } catch (e) {
    // IDB unavailable/blocked (private mode, quota, etc.). Keep localStorage as
    // the durable copy and try again next boot. Never delete the unverified side.
    console.error('[stateStore] IDB migration failed, keeping localStorage copy', e);
    return parsed;
  }
}

// ── Public API (live, IDB-backed) ────────────────────────────────────────────

/** Read the app-state blob from IDB (null if absent). */
export async function idbGetState(): Promise<AppState | null> {
  return idbStorage.get(STATE_KEY);
}

/** Persist the app-state blob to IDB. */
export async function idbSetState(state: AppState): Promise<void> {
  return idbStorage.set(STATE_KEY, state);
}

/** Live migration using real localStorage + a caller-supplied parse/massage fn. */
export async function hydrateStateFromIdb(
  parse: (raw: string) => AppState,
): Promise<AppState | null> {
  return migrateStateToIdb({
    storage: idbStorage,
    readLS:  () => localStorage.getItem(LEGACY_LS_KEY),
    clearLS: () => localStorage.removeItem(LEGACY_LS_KEY),
    parse,
  });
}

// ── KV blob mirror ───────────────────────────────────────────────────────────
//
// The contractor blobs (solarflow_contractor_jobs and friends) are the last big
// values still living in localStorage, the exact tier this file moved AppState
// off for the exact reason: a contractor's phone runs out of it. Two ways that
// surfaced as "my phone shows no contractor jobs":
//
//   1. localStorage.setItem throws QuotaExceededError. The old KV pull caught it,
//      logged, and skipped changedKVKeys, so no re-hydrate event ever fired and
//      the UI kept its empty list while the server had 146 jobs.
//   2. iOS evicts localStorage (ITP, ~7 days idle). loadContractorJobs() finds
//      nothing and returns the empty demo array, which reads as "no jobs".
//
// So the blob now lands in three places on every write: this in-memory map (the
// synchronous read path, because loadContractorJobs has six sync callers and
// cannot become async), IndexedDB (durable across reloads, far larger quota),
// and localStorage (kept only so an older build reading the key still works).
// A localStorage failure is now cosmetic instead of load-bearing.

const kvMirror = new Map<string, unknown>();

/** Synchronous read of a mirrored KV blob. null when nothing has hydrated it. */
export function getKVMirror<T>(key: string): T | null {
  return kvMirror.has(key) ? (kvMirror.get(key) as T) : null;
}

/**
 * Mirror a KV blob: memory immediately, IDB in the background.
 * Callers keep writing localStorage themselves; this is the tier that survives.
 */
export function setKVMirror(key: string, value: unknown): void {
  kvMirror.set(key, value);
  // Fire-and-forget. A rejected IDB write must not break the caller's save, the
  // value is already in memory for this session and in Supabase durably.
  idbSetRaw(`kv:${key}`, value).catch((e) => {
    console.warn(`[stateStore] IDB mirror write failed for ${key}`, e);
  });
}

/**
 * Populate the mirror from IDB at boot, for keys that have nothing in
 * localStorage. localStorage wins when present: the sync pull writes it directly,
 * so it is at least as fresh as anything IDB holds from a previous session.
 */
export async function hydrateKVMirror(keys: string[]): Promise<void> {
  await Promise.all(keys.map(async (key) => {
    try {
      if (localStorage.getItem(key)) return; // localStorage is intact, nothing to rescue
      const stored = await idbGetRaw(`kv:${key}`);
      if (stored != null) kvMirror.set(key, stored);
    } catch (e) {
      console.warn(`[stateStore] IDB mirror hydrate failed for ${key}`, e);
    }
  }));
}
