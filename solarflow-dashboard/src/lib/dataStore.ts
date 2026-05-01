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

// ── One-time cleanup: remove GA-xxxxx and DELETE accounts ─────────────────────
// Runs once per browser, persisted by the migration flag below.
const CLEANUP_FLAG = 'solarops_ga_delete_cleanup_v1';

function applyGaDeleteCleanup(customers: Customer[]): { customers: Customer[]; removed: string[] } {
  const removed: string[] = [];
  const kept = customers.filter(c => {
    const name = (c.name || '').trim();
    if (/^GA[\s-]/i.test(name) || /\bDELETE\b/i.test(name)) {
      removed.push(c.id);
      return false;
    }
    return true;
  });
  return { customers: kept, removed };
}

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

// ── One-time territory cleanup: remove GT-xxxxx, USP-xxxxx, non-Florida ──────
// New flag (separate from CLEANUP_FLAG which already ran) so this runs once on
// every browser that hasn't seen it yet.
const TERRITORY_FLAG = 'solarops_territory_cleanup_v2'; // v2: removed bad state-based rule

function applyTerritoryCleanup(customers: Customer[]): { customers: Customer[]; removed: string[] } {
  const removed: string[] = [];
  const kept = customers.filter(c => {
    const name = (c.name || '').trim();

    // Remove other-territory prefix accounts (reliable signal — SolarEdge naming convention)
    if (/^GT[\s-]/i.test(name))  { removed.push(c.id); return false; }  // Guatemala territory
    if (/^USP[\s-]/i.test(name)) { removed.push(c.id); return false; }  // USP territory accounts

    // NOTE: Do NOT filter by customer.state — PowerCare XLSX imports map the RMA
    // shipping address state (often NV/GA warehouse) into this field, not the
    // customer's home state. All real customers are in Florida; use prefix rules only.

    return true;
  });
  return { customers: kept, removed };
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

      // One-time GA-xxxxx / DELETE cleanup — runs once per browser then never again
      if (!localStorage.getItem(CLEANUP_FLAG)) {
        const { customers: cleaned, removed } = applyGaDeleteCleanup(customers);
        if (removed.length > 0) {
          addToTombstone(removed);
          customers = cleaned;
          console.info(`[DataStore] Cleaned ${removed.length} GA/DELETE accounts:`, removed);
        }
        localStorage.setItem(CLEANUP_FLAG, '1');
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

      // One-time territory cleanup: remove GT-xxxxx, USP-xxxxx, non-Florida accounts
      if (!localStorage.getItem(TERRITORY_FLAG)) {
        const { customers: cleaned, removed } = applyTerritoryCleanup(customers);
        if (removed.length > 0) {
          addToTombstone(removed);
          customers = cleaned;
          console.info(`[DataStore] Territory cleanup: removed ${removed.length} non-FL/other-territory accounts`);
        }
        localStorage.setItem(TERRITORY_FLAG, '1');
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
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    // QuotaExceededError: localStorage is full.
    // Try saving a trimmed version without activityHistory to free space.
    try {
      const slim: AppState = {
        ...state,
        customers: state.customers.map(c => ({ ...c, activityHistory: undefined as any })),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
      console.warn('[DataStore] Saved trimmed state (activity history omitted) due to storage quota');
    } catch (e2) {
      console.error('[DataStore] Failed to save — storage quota exceeded:', e2);
    }
  }

  // Phase 2: async cloud backup via per-record push + legacy blob
  dbSet(STORAGE_KEY, state).catch(() => {});
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
