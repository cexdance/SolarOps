/**
 * SolarOps, Database Client (Phase 2)
 *
 * Routes saves through the per-record sync engine:
 *   solarflow_data  → pushToSupabase (per-record rows + metadata)
 *   KV sync keys    → pushKeyValue (single row per key)
 *   all others      → localStorage only (not synced)
 */
import { pushToSupabase, pushKeyValue, pullFromSupabase, mergeRemote, isKVSyncKey } from './syncEngine';
import { idbGetState, idbSetState } from './stateStore';
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
 * On app startup: pull from Supabase → merge into the IndexedDB state store.
 * Phase 2 pull is incremental (only records changed since last sync).
 *
 * Boot-only: App.tsx calls hydrateData() (which populates the local IDB copy,
 * migrating it out of the legacy localStorage blob) BEFORE this, and re-hydrates
 * AFTER this, so the merged result reaches React state. This function's job is
 * just to fold the remote delta into the local IDB copy.
 */
export async function syncFromDB(): Promise<void> {
  try {
    const remote = await pullFromSupabase();
    if (!remote) return;

    // Read the current local copy from IDB immediately before merge+write so we
    // don't clobber mutations that landed during the network round-trip.
    const local = await idbGetState();

    if (!local) {
      // First-time device: no local data yet. Initialize with the remote data
      // (defaults as base, then overlay remote).
      const { generateDefaultState } = await import('./dataStore');
      const defaults = generateDefaultState();
      await idbSetState({ ...defaults, ...remote } as AppState);
      return;
    }

    await idbSetState(mergeRemote(local, remote));
  } catch {
    // Network error or IDB error, local data is untouched
  }
}
