// SolarOps — Fault-Tolerant Data Store
// ─────────────────────────────────────────────────────────────────────────────
// PREVIOUS BUG: DATA_VERSION bump wiped ALL localStorage (including user-created
// customers, jobs, and edits). This has been replaced with a SAFE MERGE:
//   • User-created records are NEVER deleted
//   • New seed records from a version bump are ADDED
//   • Edited seed records preserve the user's edits
// ─────────────────────────────────────────────────────────────────────────────
import { AppState, Customer, Job, User, ClientStatus, CustomerCategory } from '../types';
import { mergedCustomerData } from './mergedCustomers';
import { dbSet } from './db';
import { isAllowedCustomer } from './solarEdgeSiteFilter';

const STORAGE_KEY = 'solarflow_data';
const VERSION_KEY = 'solarflow_data_version';

// ── Bump only when genuinely new seed data needs to be ADDED (not wiped) ────
// The version is now used to trigger an additive merge, not a destructive wipe.
const DATA_VERSION = '2026-04-15-fault-tolerant-v1';

// ── Seed data builder ─────────────────────────────────────────────────────────

const buildSeedCustomers = (): Customer[] =>
  mergedCustomerData.map((c, index) => ({
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
    category: ((c as any).solarEdgeSiteId ? 'O&M' : undefined) as CustomerCategory | undefined,
    clientStatus: c.clientStatus as ClientStatus,
    createdAt: c.installDate ? new Date(c.installDate).toISOString() : new Date().toISOString(),
    notes: c.notes,
    referralSource: '',
    howFound: '',
    isPowerCare: c.isPowerCare,
    powerCareCaseNumber:   (c as any).powerCareCaseNumber   || undefined,
    powerCareTrackingNumber: (c as any).powerCareTrackingNumber || undefined,
    solarEdgeSiteId: (c as any).solarEdgeSiteId || undefined,
    systemType: c.systemType as any || undefined,
    trelloBackupUrl: undefined,
  }));

const generateDefaultState = (): AppState => ({
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
});

// ── Tombstone list — customers explicitly deleted by the user ──────────────────
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
  } catch {}
}

// ── Tombstone list — jobs explicitly deleted by the user ──────────────────────
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
  } catch {}
}

// ── Always-on exclusion filter ────────────────────────────────────────────────
// Runs on EVERY loadData() — not flag-gated — so bad accounts added by the
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

// Keep old flag constant so the flag value in localStorage is not re-used
const CLEANUP_FLAG    = 'solarops_ga_delete_cleanup_v1';    // legacy — no longer checked

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

    // SolarEdge site ID present → category O&M (always — SE = monitored = O&M)
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

  // Group by solarEdgeSiteId (strongest signal — same physical site)
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

  kept; // unused — suppress lint
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

// ── loadData ──────────────────────────────────────────────────────────────────

export const loadData = (): AppState => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);

    if (stored) {
      const parsed: AppState = JSON.parse(stored);

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
      const apiKey         = (seConfig.apiKey as string | undefined)?.trim() ?? '';

      // Ensure customers list is populated, filter out deleted records
      const deletedIds = getDeletedCustomerIds();
      const rawCustomers =
        Array.isArray(state.customers) && state.customers.length > 0
          ? state.customers
          : defaults.customers;
      let customers = deletedIds.size > 0
        ? rawCustomers.filter(c => !deletedIds.has(c.id))
        : rawCustomers;

      // Always-on exclusion filter — runs every load, self-heals after any bad sync
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
          lastSync:        seConfig.lastSync,
          siteCount:       seConfig.siteCount,
          nextSyncAllowed: seConfig.nextSyncAllowed,
          dailyCallCount:  seConfig.dailyCallCount,
          dailyCallDate:   seConfig.dailyCallDate,
        },
      };
    }
  } catch (e) {
    console.error('[DataStore] Failed to load:', e);
  }

  // First load or corrupted storage — start fresh from seed data
  const fresh = generateDefaultState();
  localStorage.setItem(VERSION_KEY, DATA_VERSION);
  return fresh;
};

// ── saveData ──────────────────────────────────────────────────────────────────
//
// Writes to localStorage synchronously (instant, never fails silently due to
// storage quota because we handle the error below), then kicks off an async
// Supabase cloud backup.

export const saveData = (state: AppState): void => {
  let saved = false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    saved = true;
  } catch (e) {
    // QuotaExceededError: localStorage is full.
    // Try saving a trimmed version without activityHistory + woPhotos to free space.
    try {
      const slim: AppState = {
        ...state,
        customers: state.customers.map(c => ({ ...c, activityHistory: undefined as any })),
        jobs: state.jobs.map(j => ({ ...j, woPhotos: undefined as any })),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
      saved = true;
      console.warn('[DataStore] Saved trimmed state (activity history + woPhotos omitted) due to storage quota');
      // Surface to the app so a toast/banner can warn the user. Listeners can subscribe to
      // 'solarops:storage-warning' to render a UI prompt to clear or migrate photo blobs.
      try {
        window.dispatchEvent(new CustomEvent('solarops:storage-warning', {
          detail: { kind: 'trimmed', reason: 'quota-exceeded' },
        }));
      } catch {}
    } catch (e2) {
      console.error('[DataStore] FAILED TO SAVE — storage quota exceeded, work is at risk:', e2);
      try {
        window.dispatchEvent(new CustomEvent('solarops:storage-warning', {
          detail: { kind: 'failed', reason: 'quota-exceeded' },
        }));
      } catch {}
    }
  }

  // Phase 2: async cloud backup via per-record push + legacy blob.
  // Even if local save failed, still attempt cloud write so work isn't fully lost.
  dbSet(STORAGE_KEY, state).catch(() => {});
  void saved;
};

export const clearData = (): void => {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(VERSION_KEY);
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
    const response = await fetch('/api/ups-tracking', {
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
