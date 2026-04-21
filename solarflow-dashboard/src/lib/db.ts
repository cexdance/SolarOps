/**
 * SolarOps — Database Client (Supabase-backed, Phase 1)
 *
 * pushToSupabase is no longer fire-and-forget. Failures are recorded in
 * the outbox (src/lib/outbox.ts) and retried on the next drain trigger.
 */
import { pushToSupabase, pullFromSupabase, mergeRemote } from './syncEngine';
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
 * Persist a value. For the main app state blob, syncs to Supabase.
 *
 * Phase 1: awaits the push and records failure in the outbox if it fails.
 * This replaces the old fire-and-forget .catch(() => {}) pattern.
 */
export async function dbSet(key: string, data: unknown): Promise<void> {
  if (key === 'solarflow_data' && data && typeof data === 'object') {
    // pushToSupabase now handles outbox marking internally on failure
    await pushToSupabase(data as AppState).catch(() => {
      // outbox is already updated inside pushToSupabase's catch block
    });
  }
}

/** @deprecated — generic get not used in new sync flow. Kept for compat. */
export async function dbGet(_key: string): Promise<unknown | null> {
  return null;
}

/**
 * On app startup: pull from Supabase → merge into localStorage.
 * After this returns, `loadData()` will read the merged result.
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
