/**
 * SolarOps — Sync Engine
 *
 * Manages bidirectional sync between:
 *   localStorage (instant local reads) ↔ Supabase (cloud source of truth)
 *
 * Strategy:
 *   - Every save: write localStorage immediately, push Supabase async
 *   - On login: pull Supabase → merge into local (cloud wins for shared records)
 *   - Offline: local changes accumulate; flush when reconnected
 */
import { supabase } from './supabase';
import type { AppState } from '../types';

// Keys synced to Supabase app_data table
const SYNC_KEYS = ['customers', 'jobs', 'solarEdgeExtraSites'] as const;

// ── Push ─────────────────────────────────────────────────────────────────────

/** Push customers + jobs + deleted IDs to Supabase. Fire-and-forget from callers. */
export async function pushToSupabase(state: AppState): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const deletedIds = Array.from(getDeletedCustomerIds());

    const valueFor = (key: string) => {
      if (key === 'customers')          return state.customers;
      if (key === 'jobs')               return state.jobs;
      if (key === 'solarEdgeExtraSites') return state.solarEdgeExtraSites ?? [];
      return null;
    };

    const rows = [
      ...SYNC_KEYS.map(key => ({
        key,
        value: valueFor(key),
        updated_at: new Date().toISOString(),
      })),
      // Push tombstones so other devices respect deletions
      {
        key: 'deleted_customer_ids',
        value: deletedIds,
        updated_at: new Date().toISOString(),
      },
    ];

    const { error } = await supabase
      .from('app_data')
      .upsert(rows, { onConflict: 'key' });

    if (error) console.warn('[SyncEngine] push failed:', error.message);
  } catch (err) {
    console.warn('[SyncEngine] push error:', err);
  }
}

// ── Pull ─────────────────────────────────────────────────────────────────────

/** Pull customers + jobs + tombstones from Supabase. Returns null if not authenticated. */
export async function pullFromSupabase(): Promise<Partial<AppState> | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    const { data, error } = await supabase
      .from('app_data')
      .select('key, value')
      .in('key', [...SYNC_KEYS, 'deleted_customer_ids']);

    if (error || !data) return null;

    const result: Partial<AppState> = {};
    for (const row of data) {
      if (row.key === 'customers'           && Array.isArray(row.value)) result.customers           = row.value;
      if (row.key === 'jobs'                && Array.isArray(row.value)) result.jobs                = row.value;
      if (row.key === 'solarEdgeExtraSites' && Array.isArray(row.value)) result.solarEdgeExtraSites = row.value;
      // Merge remote tombstones into local tombstone list
      if (row.key === 'deleted_customer_ids' && Array.isArray(row.value)) {
        try {
          const localDeleted: string[] = JSON.parse(localStorage.getItem('solarflow_deleted_customer_ids') || '[]');
          const merged = Array.from(new Set([...localDeleted, ...row.value]));
          localStorage.setItem('solarflow_deleted_customer_ids', JSON.stringify(merged));
        } catch {}
      }
    }
    return result;
  } catch {
    return null;
  }
}

// ── Merge ─────────────────────────────────────────────────────────────────────

// Read the local tombstone list so we never resurrect deleted records
function getDeletedCustomerIds(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem('solarflow_deleted_customer_ids') || '[]'));
  } catch { return new Set(); }
}

/**
 * Merge remote data into local state.
 *
 * Rules:
 *   - Remote record exists → use remote version (another device may have updated it)
 *   - Record only in local → keep it (created on this device, not yet synced)
 *   - Record only in remote → add it (created on another device)
 *   - Record was DELETED locally (in tombstone list) → never resurrect it
 */
export function mergeRemote(local: AppState, remote: Partial<AppState>): AppState {
  const deletedIds = getDeletedCustomerIds();

  let customers = local.customers;
  if (remote.customers && remote.customers.length > 0) {
    const remoteMap = new Map(remote.customers.map(c => [c.id, c]));
    const localOnly = local.customers.filter(c => !remoteMap.has(c.id));
    customers = [...remote.customers, ...localOnly]
      .filter(c => !deletedIds.has(c.id)); // ← never resurrect deleted
  }

  let jobs = local.jobs;
  if (remote.jobs && remote.jobs.length > 0) {
    const remoteMap = new Map(remote.jobs.map(j => [j.id, j]));
    const localOnly = local.jobs.filter(j => !remoteMap.has(j.id));
    jobs = [...remote.jobs, ...localOnly];
  }

  // Also filter jobs belonging to deleted customers
  if (deletedIds.size > 0) {
    jobs = jobs.filter(j => !deletedIds.has(j.customerId));
  }

  // Merge solarEdgeExtraSites — remote wins, local-only preserved
  let solarEdgeExtraSites = local.solarEdgeExtraSites ?? [];
  if (remote.solarEdgeExtraSites && remote.solarEdgeExtraSites.length > 0) {
    const remoteMap = new Map(remote.solarEdgeExtraSites.map(s => [s.siteId, s]));
    const localOnly = solarEdgeExtraSites.filter(s => !remoteMap.has(s.siteId));
    solarEdgeExtraSites = [...remote.solarEdgeExtraSites, ...localOnly];
  }

  return { ...local, customers, jobs, solarEdgeExtraSites };
}

// ── Full sync (login / reconnect) ─────────────────────────────────────────────

/**
 * Pull from Supabase and return merged state.
 * If Supabase is unavailable, returns local state unchanged.
 */
export async function syncOnLogin(localState: AppState): Promise<AppState> {
  try {
    const remote = await pullFromSupabase();
    if (!remote) return localState;
    const merged = mergeRemote(localState, remote);
    console.info(
      `[SyncEngine] synced — remote: ${remote.customers?.length ?? 0} customers, ` +
      `local-only: ${merged.customers.length - (remote.customers?.length ?? 0)} preserved`
    );
    return merged;
  } catch {
    return localState;
  }
}
