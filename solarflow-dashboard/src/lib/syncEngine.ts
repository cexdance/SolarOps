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
const SYNC_KEYS = ['customers', 'jobs'] as const;

// ── Push ─────────────────────────────────────────────────────────────────────

/** Push customers + jobs to Supabase. Fire-and-forget from callers. */
export async function pushToSupabase(state: AppState): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const rows = SYNC_KEYS.map(key => ({
      key,
      value: key === 'customers' ? state.customers : state.jobs,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('app_data')
      .upsert(rows, { onConflict: 'key' });

    if (error) console.warn('[SyncEngine] push failed:', error.message);
  } catch (err) {
    console.warn('[SyncEngine] push error:', err);
  }
}

// ── Pull ─────────────────────────────────────────────────────────────────────

/** Pull customers + jobs from Supabase. Returns null if not authenticated. */
export async function pullFromSupabase(): Promise<Partial<AppState> | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    const { data, error } = await supabase
      .from('app_data')
      .select('key, value')
      .in('key', SYNC_KEYS);

    if (error || !data) return null;

    const result: Partial<AppState> = {};
    for (const row of data) {
      if (row.key === 'customers' && Array.isArray(row.value)) result.customers = row.value;
      if (row.key === 'jobs'      && Array.isArray(row.value)) result.jobs      = row.value;
    }
    return result;
  } catch {
    return null;
  }
}

// ── Merge ─────────────────────────────────────────────────────────────────────

/**
 * Merge remote data into local state.
 *
 * Rules:
 *   - Remote record exists → use remote version (another device may have updated it)
 *   - Record only in local → keep it (created on this device, not yet synced)
 *   - Record only in remote → add it (created on another device)
 */
export function mergeRemote(local: AppState, remote: Partial<AppState>): AppState {
  let customers = local.customers;
  if (remote.customers && remote.customers.length > 0) {
    const remoteMap = new Map(remote.customers.map(c => [c.id, c]));
    // Local-only (not in remote yet) — keep them
    const localOnly = local.customers.filter(c => !remoteMap.has(c.id));
    customers = [...remote.customers, ...localOnly];
  }

  let jobs = local.jobs;
  if (remote.jobs && remote.jobs.length > 0) {
    const remoteMap = new Map(remote.jobs.map(j => [j.id, j]));
    const localOnly = local.jobs.filter(j => !remoteMap.has(j.id));
    jobs = [...remote.jobs, ...localOnly];
  }

  return { ...local, customers, jobs };
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
