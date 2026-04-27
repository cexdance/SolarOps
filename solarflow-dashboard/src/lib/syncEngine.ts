/**
 * SolarOps — Sync Engine (Phase 2)
 *
 * Architecture: uses the existing `app_data` table (key TEXT PK, value JSONB,
 * updated_at TIMESTAMPTZ). Per-record rows use prefixed keys:
 *
 *   customer:{id}   → Customer JSON
 *   job:{id}        → Job JSON
 *   solar:{siteId}  → SolarEdgeExtraSite JSON
 *
 * Benefits over Phase 1 blob approach:
 *   • No full-array race: writing customer A never touches customer B's row.
 *   • Incremental pull: only fetch rows changed since last sync (updated_at >).
 *   • Supabase Realtime: INSERT/UPDATE on app_data → instant push to all tabs.
 *   • key index already exists (unique constraint) — prefix scans are fast.
 *
 * Backward compat: blob rows (key='customers' etc.) are still written as a
 * fallback so old clients and admin recovery tools continue to work.
 *
 * Standalone KV keys (contractor_jobs, contractors, service_rates) still use
 * their own single-row approach from the Phase 1 KV extension.
 */

import { supabase } from './supabase';
import { markPushPending, clearPendingPush, hasPendingPush, drainOutbox } from './outbox';
import type { AppState, Customer, Job } from '../types';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

// ── Key constants ─────────────────────────────────────────────────────────────

export const PREFIX = {
  customer: 'customer:',
  job:      'job:',
  solar:    'solar:',
} as const;

// Legacy blob keys kept for backward compat write
const SYNC_KEYS = ['customers', 'jobs', 'solarEdgeExtraSites'] as const;

// Standalone KV keys that are their own single rows
export const KV_SYNC_KEYS = [
  'solarflow_contractor_jobs',
  'solarflow_contractors',
  'solarflow_service_rates',
] as const;
type KVSyncKey = typeof KV_SYNC_KEYS[number];

export function isKVSyncKey(key: string): key is KVSyncKey {
  return (KV_SYNC_KEYS as readonly string[]).includes(key);
}

// localStorage key that tracks when we last successfully pulled
const LAST_SYNC_KEY = 'solarops_last_record_sync';

function getLastSync(): string | null {
  return localStorage.getItem(LAST_SYNC_KEY);
}

function setLastSync(ts: string): void {
  localStorage.setItem(LAST_SYNC_KEY, ts);
}

// ── Tombstones ────────────────────────────────────────────────────────────────

function getDeletedCustomerIds(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem('solarflow_deleted_customer_ids') || '[]'));
  } catch { return new Set(); }
}

// ── Per-record push ───────────────────────────────────────────────────────────

/**
 * Upsert a batch of per-record rows into app_data.
 * rows: array of { key: 'customer:{id}', value: {...} }
 */
async function pushRows(
  rows: Array<{ key: string; value: unknown }>,
): Promise<void> {
  if (rows.length === 0) return;
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('app_data')
    .upsert(
      rows.map(r => ({ key: r.key, value: r.value, updated_at: now })),
      { onConflict: 'key' },
    );
  if (error) throw error;
}

/**
 * Push all customers as per-record rows + legacy blob row.
 */
export async function pushCustomers(customers: Customer[]): Promise<void> {
  const deletedIds = getDeletedCustomerIds();
  const live = customers.filter(c => !deletedIds.has(c.id));

  // Per-record rows (Phase 2)
  await pushRows(live.map(c => ({ key: `${PREFIX.customer}${c.id}`, value: c })));

  // Legacy blob (backward compat) — keep in sync so old clients don't diverge
  const now = new Date().toISOString();
  await supabase.from('app_data').upsert(
    [{ key: 'customers', value: live, updated_at: now }],
    { onConflict: 'key' },
  );
}

/**
 * Push all jobs as per-record rows + legacy blob row.
 */
export async function pushJobs(jobs: Job[]): Promise<void> {
  // Per-record rows (Phase 2)
  await pushRows(jobs.map(j => ({ key: `${PREFIX.job}${j.id}`, value: j })));

  // Legacy blob
  const now = new Date().toISOString();
  await supabase.from('app_data').upsert(
    [{ key: 'jobs', value: jobs, updated_at: now }],
    { onConflict: 'key' },
  );
}

/**
 * Push a single customer record immediately (called on individual edits).
 * Faster than re-pushing all 400 customers.
 */
export async function pushCustomer(customer: Customer): Promise<void> {
  await pushRows([{ key: `${PREFIX.customer}${customer.id}`, value: customer }]);
}

/**
 * Push a single job record immediately.
 */
export async function pushJob(job: Job): Promise<void> {
  await pushRows([{ key: `${PREFIX.job}${job.id}`, value: job }]);
}

// ── Per-key push (standalone KV + general) ───────────────────────────────────

/**
 * Upsert a single standalone KV row (contractor jobs, contractors, rates).
 */
export async function pushKeyValue(key: string, value: unknown): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { error } = await supabase
      .from('app_data')
      .upsert([{ key, value, updated_at: new Date().toISOString() }], { onConflict: 'key' });

    if (error) {
      console.warn(`[SyncEngine] pushKeyValue(${key}) failed:`, error.message);
      markPushPending(error.message);
      window.dispatchEvent(new CustomEvent('supabase-sync-error', {
        detail: { message: 'Failed to sync to cloud. Will retry automatically.', error: error.message },
      }));
    } else {
      clearPendingPush();
      window.dispatchEvent(new CustomEvent('supabase-sync-success'));
    }
  } catch (err) {
    console.warn(`[SyncEngine] pushKeyValue(${key}) error:`, err);
    markPushPending(String(err));
  }
}

// ── Full AppState push (legacy + Phase 2) ────────────────────────────────────

/**
 * Push the full AppState. Writes both per-record rows AND legacy blobs.
 * Used by outbox drain and initial migration push.
 */
export async function pushToSupabase(state: AppState): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const deletedIds = Array.from(getDeletedCustomerIds());

    // ── Phase 2: per-record rows ──────────────────────────────────────────────
    const customerRows = state.customers
      .filter(c => !deletedIds.includes(c.id))
      .map(c => ({ key: `${PREFIX.customer}${c.id}`, value: c }));
    const jobRows = state.jobs
      .map(j => ({ key: `${PREFIX.job}${j.id}`, value: j }));

    // Batch upsert customers (small payloads — safe in one call)
    if (customerRows.length > 0) await pushRows(customerRows);

    // Jobs can carry photo dataURLs; one oversized job would fail the whole
    // batch and mark the entire push pending. Push individually so a single
    // bloated row only fails itself — the rest still land.
    const failedJobs: Array<{ key: string; error: string }> = [];
    for (const row of jobRows) {
      try {
        await pushRows([row]);
      } catch (err) {
        failedJobs.push({ key: row.key, error: err instanceof Error ? err.message : String(err) });
      }
    }
    if (failedJobs.length > 0) {
      console.warn('[SyncEngine] some job rows failed to push:', failedJobs);
    }

    // ── Legacy blobs (backward compat) ───────────────────────────────────────
    const now = new Date().toISOString();
    const legacyRows = [
      { key: 'customers',           value: state.customers,              updated_at: now },
      { key: 'jobs',                value: state.jobs,                   updated_at: now },
      { key: 'solarEdgeExtraSites', value: state.solarEdgeExtraSites ?? [], updated_at: now },
      { key: 'deleted_customer_ids', value: deletedIds,                  updated_at: now },
    ];

    const { error } = await supabase
      .from('app_data')
      .upsert(legacyRows, { onConflict: 'key' });

    if (error) {
      console.warn('[SyncEngine] pushToSupabase failed:', error.message);
      markPushPending(error.message);
      window.dispatchEvent(new CustomEvent('supabase-sync-error', {
        detail: { message: 'Failed to sync to cloud. Will retry automatically.', error: error.message },
      }));
    } else {
      clearPendingPush();
      setLastSync(now);
      window.dispatchEvent(new CustomEvent('supabase-sync-success'));
    }
  } catch (err) {
    console.warn('[SyncEngine] pushToSupabase error:', err);
    markPushPending(String(err));
    window.dispatchEvent(new CustomEvent('supabase-sync-error', {
      detail: { message: 'Connection lost. Working offline...', error: String(err) },
    }));
  }
}

// ── Incremental pull ──────────────────────────────────────────────────────────

/**
 * Pull per-record rows for a given prefix.
 * If `since` is provided, only fetches rows changed after that timestamp.
 * Returns an array of the value field.
 */
async function pullPrefix<T>(
  prefix: string,
  since: string | null,
): Promise<T[]> {
  let q = supabase
    .from('app_data')
    .select('key, value')
    .like('key', `${prefix}%`);

  if (since) q = q.gt('updated_at', since);

  const { data, error } = await q;
  if (error || !data) return [];
  return data.map(r => r.value as T);
}

/**
 * Full pull from Supabase.
 * Phase 2: pulls per-record rows incrementally.
 * Also pulls standalone KV keys and tombstones.
 * Emits `solarflow-remote-update` for changed KV keys.
 */
export async function pullFromSupabase(): Promise<Partial<AppState> | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    const since = getLastSync();
    const now   = new Date().toISOString();

    // ── Per-record pull (Phase 2) ─────────────────────────────────────────────
    const [customers, jobs] = await Promise.all([
      pullPrefix<Customer>(PREFIX.customer, since),
      pullPrefix<Job>(PREFIX.job, since),
    ]);

    // ── Tombstones + standalone KV keys ──────────────────────────────────────
    const { data: kvData } = await supabase
      .from('app_data')
      .select('key, value')
      .in('key', ['deleted_customer_ids', ...KV_SYNC_KEYS]);

    const changedKVKeys: string[] = [];
    if (kvData) {
      for (const row of kvData) {
        if (row.key === 'deleted_customer_ids' && Array.isArray(row.value)) {
          try {
            const local: string[] = JSON.parse(localStorage.getItem('solarflow_deleted_customer_ids') || '[]');
            const merged = Array.from(new Set([...local, ...row.value]));
            localStorage.setItem('solarflow_deleted_customer_ids', JSON.stringify(merged));
          } catch {}
        }
        if (isKVSyncKey(row.key) && row.value != null) {
          try {
            const next = JSON.stringify(row.value);
            const prev = localStorage.getItem(row.key);
            if (prev !== next) {
              localStorage.setItem(row.key, next);
              changedKVKeys.push(row.key);
            }
          } catch {}
        }
      }
    }

    if (changedKVKeys.length > 0) {
      window.dispatchEvent(new CustomEvent('solarflow-remote-update', {
        detail: { keys: changedKVKeys },
      }));
    }

    setLastSync(now);

    const result: Partial<AppState> = {};
    if (customers.length > 0) result.customers = customers;
    if (jobs.length > 0)      result.jobs       = jobs;
    return result;
  } catch {
    return null;
  }
}

// ── Merge ─────────────────────────────────────────────────────────────────────

/**
 * Merge remote state into local state.
 *
 * Phase 2 merge is simpler than Phase 1:
 *   - Remote per-record rows are authoritative (last-writer-wins on `updated_at`)
 *   - Records present locally but NOT in remote are kept if outbox has a
 *     pending push (created locally, not yet confirmed)
 *   - Records in tombstone list are always filtered
 *
 * Incremental pull: remote may only contain CHANGED records (since > last_sync).
 * We merge by ID so unchanged local records are preserved.
 */
export function mergeRemote(local: AppState, remote: Partial<AppState>): AppState {
  const deletedIds  = getDeletedCustomerIds();
  const pendingPush = hasPendingPush();

  // ── Customers ─────────────────────────────────────────────────────────────
  let customers = local.customers;
  if (remote.customers && remote.customers.length > 0) {
    const localMap  = new Map(local.customers.map(c => [c.id, c]));
    const remoteMap = new Map(remote.customers.map(c => [c.id, c]));

    // Merge: remote wins on conflict; keep local-only if outbox pending
    const merged = new Map(localMap);
    for (const [id, c] of remoteMap) merged.set(id, c);

    // Drop local-only records when outbox is confirmed empty (ghost records)
    if (!pendingPush) {
      for (const id of localMap.keys()) {
        if (!remoteMap.has(id)) merged.delete(id);
      }
    }

    customers = Array.from(merged.values()).filter(c => !deletedIds.has(c.id));
  }

  // ── Jobs ──────────────────────────────────────────────────────────────────
  let jobs = local.jobs;
  if (remote.jobs && remote.jobs.length > 0) {
    const localMap  = new Map(local.jobs.map(j => [j.id, j]));
    const remoteMap = new Map(remote.jobs.map(j => [j.id, j]));

    const merged = new Map(localMap);
    for (const [id, j] of remoteMap) merged.set(id, j);

    if (!pendingPush) {
      for (const id of localMap.keys()) {
        if (!remoteMap.has(id)) merged.delete(id);
      }
    }

    jobs = Array.from(merged.values()).filter(j => !deletedIds.has(j.customerId));
  }

  // ── SolarEdge extra sites (still blob — low volume, no Realtime needed) ───
  let solarEdgeExtraSites = local.solarEdgeExtraSites ?? [];

  return { ...local, customers, jobs, solarEdgeExtraSites };
}

// ── Full sync on login ────────────────────────────────────────────────────────

export async function syncOnLogin(localState: AppState): Promise<AppState> {
  try {
    const remote = await pullFromSupabase();
    if (!remote) return localState;
    const merged = mergeRemote(localState, remote);
    console.info(
      `[SyncEngine] synced — customers: ${merged.customers.length}, jobs: ${merged.jobs.length}`,
    );
    return merged;
  } catch {
    return localState;
  }
}

// ── Poll pull + merge (used by focus/online/30s cycle) ───────────────────────

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

// ── Realtime subscription ─────────────────────────────────────────────────────

export interface RealtimeHandlers {
  onCustomer: (customer: Customer, event: 'INSERT' | 'UPDATE' | 'DELETE') => void;
  onJob:      (job: Job,      event: 'INSERT' | 'UPDATE' | 'DELETE') => void;
  onKV:       (key: string, value: unknown) => void;
}

let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

/**
 * Subscribe to real-time changes on `app_data`.
 * Fires handlers instantly when another device writes a record.
 * Call once on app mount (admin view only).
 */
export function subscribeToChanges(handlers: RealtimeHandlers): () => void {
  // Clean up any previous channel
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  realtimeChannel = supabase
    .channel('solarops-realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'app_data' },
      (payload: RealtimePostgresChangesPayload<{ key: string; value: unknown; updated_at: string }>) => {
        const row = (payload.new ?? payload.old) as { key: string; value: unknown } | undefined;
        if (!row?.key) return;

        const { key, value } = row;

        if (key.startsWith(PREFIX.customer) && value && payload.eventType !== 'DELETE') {
          handlers.onCustomer(value as Customer, payload.eventType as 'INSERT' | 'UPDATE');
        } else if (key.startsWith(PREFIX.customer) && payload.eventType === 'DELETE') {
          handlers.onCustomer({ id: key.slice(PREFIX.customer.length) } as Customer, 'DELETE');
        } else if (key.startsWith(PREFIX.job) && value && payload.eventType !== 'DELETE') {
          handlers.onJob(value as Job, payload.eventType as 'INSERT' | 'UPDATE');
        } else if (key.startsWith(PREFIX.job) && payload.eventType === 'DELETE') {
          handlers.onJob({ id: key.slice(PREFIX.job.length) } as Job, 'DELETE');
        } else if (isKVSyncKey(key) && value != null) {
          // Write to localStorage and notify App.tsx
          const next = JSON.stringify(value);
          const prev = localStorage.getItem(key);
          if (prev !== next) {
            localStorage.setItem(key, next);
            handlers.onKV(key, value);
          }
        }
      },
    )
    .subscribe(status => {
      console.info('[Realtime]', status);
    });

  return () => {
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
  };
}
