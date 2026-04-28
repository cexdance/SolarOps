/**
 * SolarOps — Database Client (Phase 2)
 *
 * Routes saves through the new per-record sync engine:
 *   solarflow_data  → pushToSupabase (full blob + per-record rows)
 *   KV sync keys    → pushKeyValue (single row per key)
 *   all others      → localStorage only (not synced)
 */
import { pushToSupabase, pushKeyValue, pullFromSupabase, mergeRemote, isKVSyncKey } from './syncEngine';
import type { AppState } from '../types';

export const ALL_KEYS = [
  'solarflow_data',
  'solarflow_crm_data',
  'solarflow_customers',
  'solarflow_interactions',
  'solarflow_contractors',
  'solarflow_service_rates',
  'solarflow_contractor_jobs',
  'solarflow_contractor_invites',
  'solarops_work_orders',
  'solarops_alerts',
  'solarops_site_profiles',
  'solarops_todos',
  'solarops_inventory',
  'solarops_projects',
];

/**
 * Persist a value and sync to Supabase when applicable.
 *
 * solarflow_data   → pushToSupabase (per-record + legacy blob, outbox on fail)
 * KV sync keys     → pushKeyValue (single row upsert, outbox on fail)
 * everything else  → no-op (localStorage only, not shared across devices)
 */
export async function dbSet(key: string, data: unknown): Promise<void> {
  if (key === 'solarflow_data' && data && typeof data === 'object') {
    await pushToSupabase(data as AppState).catch(() => {});
    return;
  }
  if (isKVSyncKey(key)) {
    await pushKeyValue(key, data).catch(() => {});
  }
}

/** @deprecated — generic get not used in new sync flow. Kept for compat. */
export async function dbGet(_key: string): Promise<unknown | null> {
  return null;
}

/**
 * On app startup: pull from Supabase → merge into localStorage.
 * Phase 2 pull is incremental (only records changed since last sync).
 */
export async function syncFromDB(): Promise<void> {
  try {
    const remote = await pullFromSupabase();
    if (!remote) return;

    const raw = localStorage.getItem('solarflow_data');
    if (!raw) return;

    const local  = JSON.parse(raw) as AppState;
    const merged = mergeRemote(local, remote);
    localStorage.setItem('solarflow_data', JSON.stringify(merged));
  } catch {
    // Network error or parse error — local data is untouched
  }
}
