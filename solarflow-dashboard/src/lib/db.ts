/**
 * SolarOps, Database Client (Phase 2)
 *
 * Routes saves through the per-record sync engine:
 *   solarflow_data  → pushToSupabase (per-record rows + metadata)
 *   KV sync keys    → pushKeyValue (single row per key)
 *   all others      → localStorage only (not synced)
 */
import { pushToSupabase, pushKeyValue, pullFromSupabase, mergeRemote, isKVSyncKey } from './syncEngine';
import type { AppState } from '../types';

/**
 * Persist a value and sync to Supabase when applicable.
 *
 * solarflow_data   → pushToSupabase (per-record rows + metadata, outbox on fail)
 * KV sync keys     → pushKeyValue (single row upsert, outbox on fail)
 * everything else  → no-op (localStorage only, not shared across devices)
 */
export async function dbSet(key: string, data: unknown): Promise<void> {
  if (key === 'solarflow_data' && data && typeof data === 'object') {
    await pushToSupabase(data as AppState).catch((e) => console.error('[db] pushToSupabase failed', e));
    return;
  }
  if (isKVSyncKey(key)) {
    await pushKeyValue(key, data).catch((e) => console.error('[db] pushKeyValue failed', key, e));
  }
}

/** @deprecated, generic get not used in new sync flow. Kept for compat. */
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

    // Re-read localStorage immediately before merge+write so we don't clobber
    // user mutations that happened during the network round-trip.
    const raw = localStorage.getItem('solarflow_data');

    if (!raw) {
      // First-time device: no local data yet. Initialize localStorage with
      // the remote data (using defaults as base, then overlaying remote).
      const { generateDefaultState } = await import('./dataStore');
      const defaults = generateDefaultState();
      const initialState = { ...defaults, ...remote };
      localStorage.setItem('solarflow_data', JSON.stringify(initialState));
      return;
    }

    const local  = JSON.parse(raw) as AppState;
    const merged = mergeRemote(local, remote);

    // One more re-read just before write, in case a mutation landed during merge.
    const fresh = localStorage.getItem('solarflow_data');
    if (fresh && fresh !== raw) {
      const freshLocal = JSON.parse(fresh) as AppState;
      const finalMerged = mergeRemote(freshLocal, remote);
      localStorage.setItem('solarflow_data', JSON.stringify(finalMerged));
      return;
    }
    localStorage.setItem('solarflow_data', JSON.stringify(merged));
  } catch {
    // Network error or parse error, local data is untouched
  }
}
