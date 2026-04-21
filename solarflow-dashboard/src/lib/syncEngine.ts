/**
 * SolarOps — Sync Engine (Phase 1)
 *
 * Manages bidirectional sync between:
 *   localStorage (instant local reads) ↔ Supabase (shared cloud source of truth)
 *
 * Architecture decisions (2026-04-21):
 *   1. Single shared DB — all staff see the same data pool, no per-user isolation
 *   2. Offline is critical — outbox ensures no edit is ever lost
 *   3. Low volume (~3-4 WOs/day) — bulk blob push is fine for Phase 1
 *   4. Soft delete — deletions use tombstone list; `deleted_at` per record in Phase 2
 *
 * Phase 1 improvements over original:
 *   - Failed pushes are recorded in the outbox (never silently dropped)
 *   - Merge no longer keeps ghost local-only records when outbox is empty
 *   - pullAndMerge() exported for polling on focus / online / interval
 */

import { supabase } from './supabase';
import { markPushPending, clearPendingPush, hasPendingPush } from './outbox';
import type { AppState } from '../types';

// Keys synced to Supabase app_data table
const SYNC_KEYS = ['customers', 'jobs', 'solarEdgeExtraSites'] as const;

// ── Tombstones ─────────────────────────────────────────────────────────────────

function getDeletedCustomerIds(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem('solarflow_deleted_customer_ids') || '[]'));
  } catch { return new Set(); }
}

// ── Push ──────────────────────────────────────────────────────────────────────

/**
 * Push customers + jobs + solarEdgeSites + tombstones to Supabase.
 *
 * On SUCCESS → clears the outbox (pending flag).
 * On FAILURE → records the failure in the outbox for retry.
 *
 * Callers should NOT fire-and-forget this — await it so the outbox
 * is properly updated. db.ts / dataStore.ts handle the async boundary.
 */
export async function pushToSupabase(state: AppState): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const deletedIds = Array.from(getDeletedCustomerIds());

    const valueFor = (key: string) => {
      if (key === 'customers')           return state.customers;
      if (key === 'jobs')                return state.jobs;
      if (key === 'solarEdgeExtraSites') return state.solarEdgeExtraSites ?? [];
      return null;
    };

    const rows = [
      ...SYNC_KEYS.map(key => ({
        key,
        value:      valueFor(key),
        updated_at: new Date().toISOString(),
      })),
      // Push tombstones so other devices respect soft-deletions
      {
        key:        'deleted_customer_ids',
        value:      deletedIds,
        updated_at: new Date().toISOString(),
      },
    ];

    const { error } = await supabase
      .from('app_data')
      .upsert(rows, { onConflict: 'key' });

    if (error) {
      console.warn('[SyncEngine] push failed:', error.message);
      markPushPending(error.message);
      window.dispatchEvent(new CustomEvent('supabase-sync-error', {
        detail: { message: 'Failed to sync to cloud. Will retry automatically.', error: error.message },
      }));
    } else {
      clearPendingPush();
      window.dispatchEvent(new CustomEvent('supabase-sync-success'));
    }
  } catch (err) {
    console.warn('[SyncEngine] push error:', err);
    markPushPending(String(err));
    window.dispatchEvent(new CustomEvent('supabase-sync-error', {
      detail: { message: 'Connection lost. Working offline...', error: String(err) },
    }));
  }
}

// ── Pull ──────────────────────────────────────────────────────────────────────

/** Pull customers + jobs + solarEdgeSites + tombstones from Supabase.
 *  Returns null if not authenticated or network is unavailable. */
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

      // Merge remote tombstones into local list (union — never un-delete)
      if (row.key === 'deleted_customer_ids' && Array.isArray(row.value)) {
        try {
          const local: string[] = JSON.parse(localStorage.getItem('solarflow_deleted_customer_ids') || '[]');
          const merged = Array.from(new Set([...local, ...row.value]));
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

/**
 * Merge remote state into local state.
 *
 * Rules (Phase 1 — outbox-aware):
 *
 *   OUTBOX HAS PENDING PUSH
 *     → local-only records are KEPT (they exist only here because the push
 *       hasn't landed yet — not ghosts, just unsent)
 *
 *   OUTBOX IS EMPTY (last push confirmed by Supabase)
 *     → local-only records are DROPPED (they should be in remote if they were
 *       ever pushed; if they're not, they're ghost records from a failed old push)
 *
 *   RECORD IN BOTH local and remote
 *     → remote wins (another device may have updated it)
 *
 *   RECORD IN remote only
 *     → add it (created on another device)
 *
 *   RECORD IN tombstone list
 *     → always filtered out, never resurrected
 */
export function mergeRemote(local: AppState, remote: Partial<AppState>): AppState {
  const deletedIds   = getDeletedCustomerIds();
  const pendingPush  = hasPendingPush();

  // ── Customers ──────────────────────────────────────────────────────────────
  let customers = local.customers;
  if (remote.customers && remote.customers.length > 0) {
    const remoteMap = new Map(remote.customers.map(c => [c.id, c]));

    const localOnly = local.customers.filter(c => !remoteMap.has(c.id));

    // Only preserve local-only records when we have a pending push —
    // otherwise they are orphaned ghosts.
    const preserve = pendingPush ? localOnly : [];

    customers = [
      ...remote.customers,
      ...preserve,
    ].filter(c => !deletedIds.has(c.id));  // soft-delete filter
  }

  // ── Jobs ──────────────────────────────────────────────────────────────────
  let jobs = local.jobs;
  if (remote.jobs && remote.jobs.length > 0) {
    const remoteMap = new Map(remote.jobs.map(j => [j.id, j]));
    const localOnly = local.jobs.filter(j => !remoteMap.has(j.id));
    const preserve  = pendingPush ? localOnly : [];
    jobs = [...remote.jobs, ...preserve];
  }

  // Also filter jobs whose customer was soft-deleted
  if (deletedIds.size > 0) {
    jobs = jobs.filter(j => !deletedIds.has(j.customerId));
  }

  // ── SolarEdge extra sites ─────────────────────────────────────────────────
  let solarEdgeExtraSites = local.solarEdgeExtraSites ?? [];
  if (remote.solarEdgeExtraSites && remote.solarEdgeExtraSites.length > 0) {
    const remoteMap = new Map(remote.solarEdgeExtraSites.map(s => [s.siteId, s]));
    const localOnly = solarEdgeExtraSites.filter(s => !remoteMap.has(s.siteId));
    const preserve  = pendingPush ? localOnly : [];
    solarEdgeExtraSites = [...remote.solarEdgeExtraSites, ...preserve];
  }

  return { ...local, customers, jobs, solarEdgeExtraSites };
}

// ── Full sync ─────────────────────────────────────────────────────────────────

/**
 * Pull from Supabase and return merged state.
 * If Supabase is unavailable, returns local state unchanged.
 * Used on login (syncOnLogin) and on-demand polls (pullAndMerge).
 */
export async function syncOnLogin(localState: AppState): Promise<AppState> {
  try {
    const remote = await pullFromSupabase();
    if (!remote) return localState;
    const merged = mergeRemote(localState, remote);
    console.info(
      `[SyncEngine] synced — remote customers: ${remote.customers?.length ?? 0}, ` +
      `remote jobs: ${remote.jobs?.length ?? 0}`
    );
    return merged;
  } catch {
    return localState;
  }
}

/**
 * Pull from Supabase, merge into localStorage, and return the merged state.
 *
 * Used by the focus/online/interval poll in App.tsx.
 * Reads and writes localStorage directly so App.tsx can apply the result via setData().
 *
 * Returns null if not logged in or network unavailable.
 */
export async function pullAndMerge(): Promise<Partial<AppState> | null> {
  try {
    const remote = await pullFromSupabase();
    if (!remote) return null;

    const raw = localStorage.getItem('solarflow_data');
    if (!raw) return null;

    const local  = JSON.parse(raw) as AppState;
    const merged = mergeRemote(local, remote);
    localStorage.setItem('solarflow_data', JSON.stringify(merged));
    return merged;
  } catch {
    return null;
  }
}
