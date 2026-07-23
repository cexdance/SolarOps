// SolarOps, Fault-Tolerant Data Store
// ─────────────────────────────────────────────────────────────────────────────
// PREVIOUS BUG: DATA_VERSION bump wiped ALL localStorage (including user-created
// customers, jobs, and edits). This has been replaced with a SAFE MERGE:
//   • User-created records are NEVER deleted
//   • New seed records from a version bump are ADDED
//   • Edited seed records preserve the user's edits
// ─────────────────────────────────────────────────────────────────────────────
import { AppState, Customer, ClientStatus, CustomerCategory, SystemType } from '../types';
import { mergedCustomerData } from './mergedCustomers';
import { dbSet } from './db';
import { authedFetch } from './supabase';
import { isAllowedCustomer } from './solarEdgeSiteFilter';
import { idbSetState, hydrateStateFromIdb } from './stateStore';

const STORAGE_KEY = 'solarflow_data';
const VERSION_KEY = 'solarflow_data_version';

// ── In-memory synchronous snapshot ──────────────────────────────────────────
// The app-state blob now persists to IndexedDB (async), but many callers still
// expect a synchronous `loadData()`. This module-level snapshot is the bridge:
// `hydrateData()` fills it once at boot, and `saveData()` keeps it live on every
// write, so the scattered synchronous readers get current data without touching
// IndexedDB or the (now-migrated-away) 5MB localStorage blob.
let _snapshot: AppState | null = null;

// ── Bump only when genuinely new seed data needs to be ADDED (not wiped) ────
// The version is now used to trigger an additive merge, not a destructive wipe.
const DATA_VERSION = '2026-04-15-fault-tolerant-v1';

// ── Seed data builder ─────────────────────────────────────────────────────────

// Shape of a merged seed-customer record. The PowerCare enrichment fields are
// optional because only PowerCare entries carry them; modeling them here lets us
// read them without per-field casts.
interface SeedCustomer {
  clientId?: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  type: string;
  clientStatus: string;
  solarEdgeSiteId?: string;
  systemType?: string;
  notes: string;
  installDate?: string;
  isPowerCare: boolean;
  powerCareCaseNumber?: string;
  powerCareTrackingNumber?: string;
}

const buildSeedCustomers = (): Customer[] =>
  (mergedCustomerData as SeedCustomer[]).map((c, index) => ({
    id: `cust-${index + 1}`,
    clientId: c.clientId,
    name: c.name,
    email: c.email,
    phone: c.phone,
    address: c.address,
    city: c.city,
    state: c.state || 'FL',
    zip: c.zip,
    type: c.type as 'residential' | 'commercial',
    category: (c.solarEdgeSiteId ? 'O&M' : undefined) as CustomerCategory | undefined,
    clientStatus: c.clientStatus as ClientStatus,
    createdAt: c.installDate ? new Date(c.installDate).toISOString() : new Date().toISOString(),
    notes: c.notes,
    referralSource: '',
    howFound: '',
    isPowerCare: c.isPowerCare,
    powerCareCaseNumber:   c.powerCareCaseNumber   || undefined,
    powerCareTrackingNumber: c.powerCareTrackingNumber || undefined,
    solarEdgeSiteId: c.solarEdgeSiteId || undefined,
    systemType: (c.systemType as SystemType) || undefined,
    trelloBackupUrl: undefined,
  }));
// ── Default state factory ──────────────────────────────────────────────────────
export const generateDefaultState = (): AppState => ({
  users: [{
    id: 'user-mia-lopez',
    name: 'Mia Lopez',
    email: 'mia.lopez@conexsol.us',
    phone: '',
    role: 'sales',
    active: true,
    username: 'mialopez',
  }],
  customers: buildSeedCustomers(),
  jobs: [],
  xeroConfig:    { connected: false },
  solarEdgeConfig: { apiKey: '' },
  currentUser:   undefined as any,
  notifications: [],
  standaloneRmas: [],
});

// ── Tombstone list, customers explicitly deleted by the user ──────────────────
export function getDeletedCustomerIds(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem('solarflow_deleted_customer_ids') || '[]'));
  } catch { return new Set(); }
}

function addToTombstone(ids: string[]): void {
  try {
    const key = 'solarflow_deleted_customer_ids';
    const existing: string[] = JSON.parse(localStorage.getItem(key) || '[]');
    const merged = Array.from(new Set([...existing, ...ids]));
    localStorage.setItem(key, JSON.stringify(merged));
  } catch (e) { console.error('[dataStore] markCustomersDeleted tombstone write failed', e); }
}

// ── Tombstone list, jobs explicitly deleted by the user ──────────────────────
// Prevents realtime/sync from resurrecting a job after the user deletes it.
const DELETED_JOBS_KEY = 'solarflow_deleted_job_ids';

export function getDeletedJobIds(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DELETED_JOBS_KEY) || '[]'));
  } catch { return new Set(); }
}

export function markJobDeleted(jobId: string): void {
  try {
    const existing: string[] = JSON.parse(localStorage.getItem(DELETED_JOBS_KEY) || '[]');
    if (existing.includes(jobId)) return;
    existing.push(jobId);
    localStorage.setItem(DELETED_JOBS_KEY, JSON.stringify(existing));
  } catch (e) { console.error('[dataStore] markJobDeleted tombstone write failed', e); }
}

// ── Always-on exclusion filter ────────────────────────────────────────────────
// Runs on EVERY loadData(), not flag-gated, so bad accounts added by the
// SolarEdge sync (or any other path) are removed on the next page load.
// Also tombstones removed IDs so seed/sync migrations can't re-add them.

function applyExclusionFilter(customers: Customer[]): { customers: Customer[]; removed: string[] } {
  const removed: string[] = [];
  const kept = customers.filter(c => {
    if (isAllowedCustomer(c)) return true;
    removed.push(c.id);
    return false;
  });
  return { customers: kept, removed };
}

// Reserved (do not reuse) legacy localStorage key: 'solarops_ga_delete_cleanup_v1'
// It is no longer checked; documented here so the key is not repurposed.

// ── One-time enrichment: US-xxxxx → clientId, solarEdgeSiteId → O&M ─────────
const ENRICH_FLAG = 'solarops_us_id_om_enrich_v1';

function applyUsIdOmEnrichment(customers: Customer[]): { customers: Customer[]; changed: number } {
  let changed = 0;
  const enriched = customers.map(c => {
    let updated = { ...c };
    let dirty = false;

    // Extract US-NNNNN from name → clientId (only if clientId is blank)
    if (!c.clientId?.trim()) {
      const m = (c.name || '').match(/\bUS[\s-](\d+)/i);
      if (m) {
        updated.clientId = `US-${m[1]}`;
        dirty = true;
      }
    }

    // SolarEdge site ID present → category O&M (always, SE = monitored = O&M)
    if (c.solarEdgeSiteId && c.category !== 'O&M') {
      updated.category = 'O&M';
      dirty = true;
    }

    if (dirty) changed++;
    return updated;
  });
  return { customers: enriched, changed };
}

// ── One-time dedup: collapse exact duplicates by solarEdgeSiteId / clientId ───
const DEDUP_FLAG = 'solarops_dedup_v1';

function scoreRecord(c: Customer): number {
  // Higher = more data filled in → preferred record to keep
  return [c.name, c.email, c.phone, c.address, c.city, c.zip,
          c.clientId, c.solarEdgeSiteId, c.category, c.systemType,
          c.clientStatus, c.notes].filter(v => v && String(v).trim()).length;
}

function applyDedup(customers: Customer[]): { customers: Customer[]; removed: string[] } {
  const kept = new Map<string, Customer>(); // id → record to keep
  const tombstone: string[] = [];

  // Group by solarEdgeSiteId (strongest signal, same physical site)
  const bySiteId = new Map<string, Customer[]>();
  customers.forEach(c => {
    if (c.solarEdgeSiteId) {
      const g = bySiteId.get(c.solarEdgeSiteId) || [];
      g.push(c);
      bySiteId.set(c.solarEdgeSiteId, g);
    }
  });

  const dupIds = new Set<string>();
  bySiteId.forEach(group => {
    if (group.length < 2) return;
    const sorted = [...group].sort((a, b) => scoreRecord(b) - scoreRecord(a));
    sorted.slice(1).forEach(c => { dupIds.add(c.id); tombstone.push(c.id); });
  });

  // Group remaining (non-siteId-duped) by clientId
  const byClientId = new Map<string, Customer[]>();
  customers.filter(c => !dupIds.has(c.id)).forEach(c => {
    const cid = c.clientId?.trim();
    if (cid) {
      const g = byClientId.get(cid) || [];
      g.push(c);
      byClientId.set(cid, g);
    }
  });

  byClientId.forEach(group => {
    if (group.length < 2) return;
    const sorted = [...group].sort((a, b) => scoreRecord(b) - scoreRecord(a));
    sorted.slice(1).forEach(c => { dupIds.add(c.id); tombstone.push(c.id); });
  });

  kept; // unused, suppress lint
  const deduped = customers.filter(c => !dupIds.has(c.id));
  return { customers: deduped, removed: tombstone };
}

// ── Safe version migration ────────────────────────────────────────────────────
//
// When DATA_VERSION changes, we ADD new seed customers that don't already exist
// in stored data. We NEVER remove records the user has created or edited.
// We NEVER re-add records the user has explicitly deleted (tombstone check).

function applySafeMigration(stored: AppState): AppState {
  const seedCustomers = buildSeedCustomers();
  const storedIds     = new Set(stored.customers.map(c => c.id));
  const deletedIds    = getDeletedCustomerIds();

  // Only add seed customers that are completely new AND not previously deleted
  const newSeedCustomers = seedCustomers.filter(
    c => !storedIds.has(c.id) && !deletedIds.has(c.id)
  );

  if (newSeedCustomers.length > 0) {
    console.info(`[DataStore] Migration: adding ${newSeedCustomers.length} new seed customers`);
  }

  return {
    ...stored,
    customers: [...stored.customers, ...newSeedCustomers],
  };
}

// ── massageState ────────────────────────────────────────────────────────────
// The load-time pipeline: version migration, deleted-record filtering, the
// always-on exclusion self-heal, one-time enrichment/dedup, and shape defaults.
// Extracted so both the synchronous localStorage fallback and the async IDB
// hydrate run the IDENTICAL massaging (behavior parity with the old loadData).
// Idempotent: safe to run on every read (the filters are self-healing).
function massageState(parsed: AppState): AppState {
  // ── SAFE VERSION CHECK ──────────────────────────────────────────────
  // Old code: if (version !== DATA_VERSION) { localStorage.removeItem() }  ← DESTROYS data
  // New code: if (version !== DATA_VERSION) { additiveMigration() }        ← PRESERVES data
  const storedVersion = localStorage.getItem(VERSION_KEY);
  let state = parsed;
  if (storedVersion !== DATA_VERSION) {
    state = applySafeMigration(parsed);
    localStorage.setItem(VERSION_KEY, DATA_VERSION);
  }

  const defaults       = generateDefaultState();
  const seConfig       = (state.solarEdgeConfig || {}) as Record<string, any>;
  const apiKey         = (seConfig['apiKey'] as string | undefined)?.trim() ?? '';

  // Ensure customers list is populated, filter out deleted records
  const deletedIds = getDeletedCustomerIds();
  const rawCustomers =
    Array.isArray(state.customers) && state.customers.length > 0
      ? state.customers
      : defaults.customers;
  let customers = deletedIds.size > 0
    ? rawCustomers.filter(c => !deletedIds.has(c.id))
    : rawCustomers;

  // Always-on exclusion filter, runs every load, self-heals after any bad sync
  {
    const { customers: cleaned, removed } = applyExclusionFilter(customers);
    if (removed.length > 0) {
      addToTombstone(removed);
      customers = cleaned;
      console.info(`[DataStore] Excluded ${removed.length} non-FL/territory accounts:`, removed);
    }
  }

  // One-time enrichment: US-xxxxx name → clientId, solarEdgeSiteId → O&M category
  if (!localStorage.getItem(ENRICH_FLAG)) {
    const { customers: enriched, changed } = applyUsIdOmEnrichment(customers);
    if (changed > 0) {
      customers = enriched;
      console.info(`[DataStore] Enriched ${changed} customers (US-ID / O&M category)`);
    }
    localStorage.setItem(ENRICH_FLAG, '1');
  }

  // One-time dedup: collapse exact duplicates (same solarEdgeSiteId or clientId)
  if (!localStorage.getItem(DEDUP_FLAG)) {
    const { customers: deduped, removed } = applyDedup(customers);
    if (removed.length > 0) {
      addToTombstone(removed);
      customers = deduped;
      console.info(`[DataStore] Deduped ${removed.length} duplicate records`);
    }
    localStorage.setItem(DEDUP_FLAG, '1');
  }

  return {
    ...defaults,
    ...state,
    customers,
    notifications:      Array.isArray(state.notifications)      ? state.notifications      : [],
    solarEdgeExtraSites: Array.isArray(state.solarEdgeExtraSites) ? state.solarEdgeExtraSites : [],
    solarEdgeConfig: {
      apiKey,
      lastSync:        seConfig['lastSync'],
      siteCount:       seConfig['siteCount'],
      nextSyncAllowed: seConfig['nextSyncAllowed'],
      dailyCallCount:  seConfig['dailyCallCount'],
      dailyCallDate:   seConfig['dailyCallDate'],
    },
  };
}

// ── hydrateData (async, boot) ───────────────────────────────────────────────
// Read the app-state blob from IndexedDB (migrating it out of the legacy 5MB
// localStorage blob on first run), massage it, and populate the synchronous
// snapshot. Call once at startup before rendering. Never throws: on any failure
// it seeds fresh defaults so the app still boots.
export const hydrateData = async (): Promise<AppState> => {
  try {
    const raw = await hydrateStateFromIdb((s) => JSON.parse(s) as AppState);
    if (!raw) {
      // No local state anywhere: a genuine first boot, OR the IDB store was evicted
      // while the localStorage-based sync cursor survived (they now live in separate
      // backends with independent eviction). Reset the cursor so the startup pull is
      // a FULL reconcile, not an incremental one into an empty store, which would
      // otherwise surface as "most of my data vanished". No-op on a true first boot
      // (no cursor to clear).
      const { resetSyncCursor } = await import('./syncEngine');
      resetSyncCursor();
    }
    const state = raw ? massageState(raw) : freshDefaultState();
    _snapshot = state;
    return state;
  } catch (e) {
    console.error('[DataStore] hydrateData failed, seeding defaults:', e);
    const fresh = freshDefaultState();
    _snapshot = fresh;
    return fresh;
  }
};

function freshDefaultState(): AppState {
  const fresh = generateDefaultState();
  localStorage.setItem(VERSION_KEY, DATA_VERSION);
  return fresh;
}

// ── loadData (synchronous) ──────────────────────────────────────────────────
// Returns the in-memory snapshot. After boot (`hydrateData`) this is always set.
// Pre-hydrate callers fall back to the legacy localStorage blob if one still
// exists (older build not yet migrated), else fresh defaults, so a synchronous
// read is never empty.
export const loadData = (): AppState => {
  if (_snapshot) return _snapshot;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      _snapshot = massageState(JSON.parse(stored) as AppState);
      return _snapshot;
    }
  } catch (e) {
    console.error('[DataStore] Failed to load (sync fallback):', e);
  }
  _snapshot = freshDefaultState();
  return _snapshot;
};

// Replace the in-memory snapshot after an out-of-band merge (e.g. the sync poll's
// pullAndMerge), so a subsequent synchronous loadData() reflects the merged state
// immediately, before the debounced saveData() flush lands.
export const primeSnapshot = (state: AppState): void => { _snapshot = state; };

/** Test-only: clear the memoized snapshot so each test reads storage fresh. */
export const __resetSnapshotForTests = (): void => { _snapshot = null; };

// ── localStorage pressure monitor ─────────────────────────────────────────────
// iOS Safari caps localStorage at ~5MB/origin. Base64 photos no longer land here
// (they go to IndexedDB / Supabase Storage), but the base dataset still grows with
// the business. Warn once per session when the slim blob crosses 3.5MB, that's the
// signal the IndexedDB-mirror migration has stopped being YAGNI (see
// spec_indexeddb_mirror). ponytail: console warn only, no UI. bytes is the JS string
// length, a close-enough (slightly high, so it warns early) proxy for byte size.
const BLOB_WARN_BYTES = 3.5 * 1024 * 1024;
let warnedBlobSize = false;
function warnIfBlobLarge(bytes: number): void {
  if (bytes < BLOB_WARN_BYTES || warnedBlobSize) return;
  warnedBlobSize = true;
  console.warn(
    `[dataStore] solarflow_data is ~${(bytes / 1024 / 1024).toFixed(2)}MB, approaching the ~5MB ` +
    `localStorage cap. Time to plan the IndexedDB mirror migration (spec_indexeddb_mirror).`,
  );
}

// ── saveData ──────────────────────────────────────────────────────────────────
//
// Updates the in-memory snapshot synchronously (so an immediate loadData() sees
// the write), then persists the slim blob to IndexedDB and kicks off the async
// Supabase cloud backup with the full state (including photos). base64 photos are
// still stripped from the persisted blob (they live in Supabase Storage / the
// photo IDB), keeping the local copy lean even though IDB has no 5MB cap.

export const saveData = (state: AppState): void => {
  // Always strip base64 photos from localStorage, they're stored in Supabase
  const slimState: AppState = {
    ...state,
    customers: state.customers.map(c => ({
      ...c,
      // Strip files but keep metadata (id, name, url, mimeType, size, source, createdAt)
      // Customer file objects should NOT contain base64 data, only Supabase URLs
      files: c.files?.map(f => ({
        id: f.id,
        name: f.name,
        url: f.url,
        mimeType: f.mimeType,
        size: f.size,
        source: f.source,
        createdAt: f.createdAt,
      })),
    })),
    jobs: state.jobs.map(j => ({
      ...j,
      // Keep photos that have a Supabase storageUrl (just a URL string, negligible space).
      // Strip only the inline base64 dataUrl so the localStorage blob stays small.
      // Stripping ALL woPhotos was the root cause: pullAndMerge reads localStorage, so if
      // the Supabase write hadn't landed yet the merge returned a job without photos and
      // the 500ms debounced save then pushed that stale job back, permanently deleting photos.
      // ST-3: keep in-flight photos so a reload before the upload finishes does
      // not lose them. A photo's binary is recoverable elsewhere only when it is
      // uploaded (storageUrl) or persisted to IndexedDB (photoStoreId); for those
      // we drop the heavy inline base64. In-flight photos (neither) keep dataUrl.
      woPhotos: j.woPhotos?.length
        ? j.woPhotos.map(p =>
            (p.storageUrl || p.photoStoreId)
              ? { ...p, dataUrl: '' } // durable elsewhere, safe to strip base64
              : p                      // in-flight, keep dataUrl so it survives reload
          )
        : undefined,
    })),
  };

  // Keep the synchronous snapshot current so loadData() reflects this write
  // immediately, without waiting on the async IDB flush below.
  _snapshot = slimState;
  warnIfBlobLarge(JSON.stringify(slimState).length);

  // Local durable copy → IndexedDB (native objects, no ~5MB localStorage cap, so
  // the old QuotaExceededError trim dance is gone). Fire-and-forget; on the rare
  // IDB failure the full state still reaches Supabase below, and we surface the
  // 'failed' warning so the export-backup escape hatch stays available.
  idbSetState(slimState).catch((e) => {
    console.error('[DataStore] IDB save failed, work at risk locally (cloud backup still attempted):', e);
    try {
      window.dispatchEvent(new CustomEvent('solarops:storage-warning', {
        detail: { kind: 'failed', reason: 'idb-write-failed' },
      }));
    } catch { /* non-browser env */ }
  });

  // Cloud backup: async Supabase write with FULL state (including photos)
  // Supabase has its own storage limits but handles large data better than localStorage
  dbSet(STORAGE_KEY, state).catch((e) => console.error('[dataStore] dbSet cloud backup failed', e));
};

export const clearData = (): void => {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(VERSION_KEY);
  _snapshot = null;
  void idbSetState(generateDefaultState()).catch(() => { /* best effort */ });
};

// ── PowerCare UPS Tracking Sync ────────────────────────────────────────────────

export interface UPSTrackingResponse {
  status: 'pending' | 'delivered' | 'error';
  trackingNumber: string;
  estimatedDelivery?: string;
  lastDeliveryAttempt?: string;
  signature?: string;
  message?: string;
}

/**
 * Sync PowerCare delivery status from UPS API
 * Updates customer state with delivery status, POD date, and last check timestamp
 */
export const syncPowerCareDeliveryStatus = async (customer: Customer): Promise<void> => {
  if (!customer.powerCareTrackingNumber) {
    return; // No tracking number to check
  }

  try {
    // Call UPS tracking API
    const response = await authedFetch('/api/ups-tracking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackingNumber: customer.powerCareTrackingNumber }),
    });

    if (!response.ok) {
      console.error('[PowerCare Sync] UPS API error:', response.status);
      updatePowerCareStatus(customer.id, 'error', undefined, Date.now());
      return;
    }

    const upsData: UPSTrackingResponse = await response.json();

    // Update customer state with delivery info
    if (upsData.status === 'delivered' && upsData.lastDeliveryAttempt) {
      updatePowerCareStatus(customer.id, 'delivered', upsData.lastDeliveryAttempt, Date.now());
    } else if (upsData.status === 'pending') {
      updatePowerCareStatus(customer.id, 'pending', undefined, Date.now());
    } else {
      updatePowerCareStatus(customer.id, 'error', undefined, Date.now());
    }

  } catch (error) {
    console.error('[PowerCare Sync] Error checking UPS status:', error);
    updatePowerCareStatus(customer.id, 'error', undefined, Date.now());
  }
};

/**
 * Helper: Update PowerCare delivery status in app state
 */
function updatePowerCareStatus(
  customerId: string,
  status: 'pending' | 'delivered' | 'error',
  podDate: string | undefined,
  lastCheck: number
): void {
  const state = loadData();
  const customer = state.customers.find(c => c.id === customerId);
  if (!customer) return;

  customer.powerCareDeliveryStatus = status;
  if (podDate && status === 'delivered') {
    customer.powercarePOD = podDate;
  }
  customer.powerCareLastStatusCheck = lastCheck;

  saveData(state);
}
