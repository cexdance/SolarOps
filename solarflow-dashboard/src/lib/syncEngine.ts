/**
 * SolarOps, Sync Engine (Phase 2)
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
 *   • key index already exists (unique constraint), prefix scans are fast.
 *
 * Backward compat: blob rows (key='customers' etc.) are still written as a
 * fallback so old clients and admin recovery tools continue to work.
 *
 * Standalone KV keys (contractor_jobs, contractors, service_rates) still use
 * their own single-row approach from the Phase 1 KV extension.
 */

import { supabase } from './supabase';
import { markPushPending, clearPendingPush, isRowPoisoned, incRowFailure, clearRowPoison } from './outbox';
import { isAllowedCustomer } from './solarEdgeSiteFilter';
import type { AppState, Customer, Job, WOPhoto } from '../types';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

// ── Key constants ─────────────────────────────────────────────────────────────

export const PREFIX = {
  customer: 'customer:',
  job:      'job:',
  solar:    'solar:',
} as const;

// Standalone KV keys that are their own single rows
export const KV_SYNC_KEYS = [
  'solarflow_contractor_jobs',
  'solarflow_contractors',
  'solarflow_service_rates',
  'solarflow_crm_data',
  'solarops_address_cleanup',
] as const;
type KVSyncKey = typeof KV_SYNC_KEYS[number];

export function isKVSyncKey(key: string): key is KVSyncKey {
  return (KV_SYNC_KEYS as readonly string[]).includes(key);
}

// localStorage key that tracks when we last successfully pulled
const LAST_SYNC_KEY = 'solarops_last_record_sync';

// Bump this whenever the cursor semantics change to force ONE full resync on every
// device. Devices that ran the old client-clock cursor may hold a stale FUTURE
// `since` that incrementally skips records forever (a contractor never receiving a
// just-assigned job); resetting the cursor once makes the next pull full and
// recovers all missed rows. After that, the server-time cursor keeps it correct.
const SYNC_CURSOR_VERSION = '2';
const SYNC_CURSOR_VERSION_KEY = 'solarops_sync_cursor_v';

function ensureCursorVersion(): void {
  try {
    if (localStorage.getItem(SYNC_CURSOR_VERSION_KEY) !== SYNC_CURSOR_VERSION) {
      localStorage.removeItem(LAST_SYNC_KEY); // force a full pull once
      localStorage.setItem(SYNC_CURSOR_VERSION_KEY, SYNC_CURSOR_VERSION);
    }
  } catch { /* localStorage unavailable, fall through to a normal pull */ }
}

function getLastSync(): string | null {
  return localStorage.getItem(LAST_SYNC_KEY);
}

function setLastSync(ts: string): void {
  localStorage.setItem(LAST_SYNC_KEY, ts);
}

// ── Tombstones ─────────────────────────────────────────────────────────────

function getDeletedCustomerIds(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem('solarflow_deleted_customer_ids') || '[]'));
  } catch { return new Set(); }
}

function getDeletedJobIds(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem('solarflow_deleted_job_ids') || '[]'));
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
  // Stamp updatedAt on each record so conflict resolution has an authoritative
  // edit time to compare on the next pull. Mutates the value in place so the
  // same reference held in local state / localStorage also carries the stamp.
  for (const r of rows) {
    if (r.value && typeof r.value === 'object') {
      (r.value as { updatedAt?: string }).updatedAt = now;
    }
  }
  const { error } = await supabase
    .from('app_data')
    .upsert(
      rows.map(r => ({ key: r.key, value: r.value, updated_at: now })),
      { onConflict: 'key' },
    );
  if (error) throw error;
}

/**
 * Push all customers as per-record rows.
 */
export async function pushCustomers(customers: Customer[]): Promise<void> {
  const deletedIds = getDeletedCustomerIds();
  const live = customers.filter(c => !deletedIds.has(c.id));
  await pushRows(live.map(c => ({ key: `${PREFIX.customer}${c.id}`, value: c })));
}

/**
 * Push all jobs as per-record rows.
 */
export async function pushJobs(jobs: Job[]): Promise<void> {
  await pushRows(jobs.map(j => ({ key: `${PREFIX.job}${j.id}`, value: j })));
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

/** Strip any remaining base64 dataUrl strings from contractor photos before pushing.
 *  After Phase 1 photos should be Storage URLs, but legacy data may still have base64. */
function sanitizeContractorJobsPayload(jobs: unknown): unknown {
  if (!Array.isArray(jobs)) return jobs;
  return jobs.map((job: Record<string, unknown>) => {
    if (!job?.['photos'] || typeof job['photos'] !== 'object') return job;
    const cleanPhotos: Record<string, string[]> = {};
    for (const [cat, urls] of Object.entries(job['photos'] as Record<string, string[]>)) {
      cleanPhotos[cat] = (urls ?? []).map((u: string) =>
        typeof u === 'string' && u.startsWith('data:') ? '' : u
      ).filter(Boolean);
    }
    return { ...job, photos: cleanPhotos };
  });
}

/** Photo categories on a ContractorJob.photos object. Union is taken per category
 *  so a merge never drops a photo that only one side has. */
type PhotoMap = Record<string, string[]>;

function unionPhotos(a: PhotoMap | undefined, b: PhotoMap | undefined): PhotoMap {
  const out: PhotoMap = {};
  const cats = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  for (const cat of cats) {
    const merged = [...(a?.[cat] ?? []), ...(b?.[cat] ?? [])]
      .filter((u): u is string => typeof u === 'string' && u.length > 0);
    // De-dup while preserving order.
    out[cat] = Array.from(new Set(merged));
  }
  return out;
}

type CJobLike = {
  id: string;
  sourceJobId?: string;
  updatedAt?: string;
  assignedAt?: string;
  photos?: PhotoMap;
  [k: string]: unknown;
};

function cjTime(j: CJobLike): string {
  return j.updatedAt ?? j.assignedAt ?? '';
}

/**
 * Per-record merge for the contractor_jobs blob.
 *
 * - Merge by job id. On conflict, the newer record wins (LWW by updatedAt, then
 *   assignedAt), but photos are always unioned per category so neither side's
 *   uploads are lost regardless of which record wins on time (CB-3).
 * - Records present on only one side are kept (never drop a job).
 * - After the id merge, collapse duplicate jobs that point at the same
 *   sourceJobId, keeping the newest and unioning their photos (CB-4).
 */
export function mergeContractorJobs(localArr: unknown, remoteArr: unknown): CJobLike[] {
  const local: CJobLike[]  = Array.isArray(localArr)  ? (localArr  as CJobLike[]) : [];
  const remote: CJobLike[] = Array.isArray(remoteArr) ? (remoteArr as CJobLike[]) : [];

  const byId = new Map<string, CJobLike>();
  for (const j of local) if (j?.id) byId.set(j.id, j);

  for (const rj of remote) {
    if (!rj?.id) continue;
    const lj = byId.get(rj.id);
    if (!lj) { byId.set(rj.id, rj); continue; }
    const winner = cjTime(rj) >= cjTime(lj) ? rj : lj;
    byId.set(rj.id, { ...winner, photos: unionPhotos(lj.photos, rj.photos) });
  }

  // Collapse duplicates that share a sourceJobId (CB-4).
  const result: CJobLike[] = [];
  const bySource = new Map<string, number>(); // sourceJobId -> index in result
  for (const j of byId.values()) {
    const src = j.sourceJobId;
    if (!src) { result.push(j); continue; }
    const existingIdx = bySource.get(src);
    if (existingIdx == null) {
      bySource.set(src, result.length);
      result.push(j);
    } else {
      const existing = result[existingIdx];
      const winner = cjTime(j) >= cjTime(existing) ? j : existing;
      result[existingIdx] = { ...winner, photos: unionPhotos(existing.photos, j.photos) };
    }
  }
  return result;
}

type CleanupItemLike = { id: string; updatedAt?: string; [k: string]: unknown };

/**
 * Per-item merge for the shared address-cleanup checklist
 * ('solarops_address_cleanup'). Merge by item id, newer updatedAt wins; items
 * present on only one side are kept, so a freshly seeded local list and an
 * older remote list combine instead of one wiping the other.
 */
export function mergeAddressCleanupItems(localArr: unknown, remoteArr: unknown): CleanupItemLike[] {
  const local: CleanupItemLike[]  = Array.isArray(localArr)  ? (localArr  as CleanupItemLike[]) : [];
  const remote: CleanupItemLike[] = Array.isArray(remoteArr) ? (remoteArr as CleanupItemLike[]) : [];
  const byId = new Map<string, CleanupItemLike>();
  for (const i of local) if (i?.id) byId.set(i.id, i);
  for (const r of remote) {
    if (!r?.id) continue;
    const l = byId.get(r.id);
    if (!l || (r.updatedAt ?? '') >= (l.updatedAt ?? '')) byId.set(r.id, r);
  }
  return Array.from(byId.values());
}

/** Fetch the current remote contractor_jobs blob (raw, un-sanitized) for merge. */
async function fetchRemoteContractorJobs(): Promise<unknown> {
  try {
    const { data, error } = await supabase
      .from('app_data')
      .select('value')
      .eq('key', 'solarflow_contractor_jobs')
      .maybeSingle();
    if (error) {
      console.warn('[SyncEngine] fetchRemoteContractorJobs failed:', error.message);
      return null;
    }
    return data?.value ?? null;
  } catch (err) {
    console.warn('[SyncEngine] fetchRemoteContractorJobs error:', err);
    return null;
  }
}

/**
 * Upsert a single standalone KV row (contractor jobs, contractors, rates).
 */
export async function pushKeyValue(key: string, value: unknown): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      window.dispatchEvent(new CustomEvent('supabase-sync-error', {
        detail: { message: 'Session expired, your changes are saved locally but not synced. Please re-login.' },
      }));
      return;
    }

    // Guard: if the row has repeatedly failed, skip it to avoid blocking other saves.
    if (isRowPoisoned(key)) {
      console.warn(`[SyncEngine] pushKeyValue(${key}) - row is poisoned, skipping push.`);
      return;
    }

    // For contractor jobs: merge against the current remote blob first so a
    // whole-blob upsert can never clobber another device's jobs or photos
    // (CB-3), then strip any base64 photos to stay under the row size limit.
    let payload = value;
    if (key === 'solarflow_contractor_jobs') {
      const remote = await fetchRemoteContractorJobs();
      const merged = mergeContractorJobs(value, remote);
      payload = sanitizeContractorJobsPayload(merged);
    }

    const { error } = await supabase
      .from('app_data')
      .upsert([{ key, value: payload, updated_at: new Date().toISOString() }], { onConflict: 'key' });

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

// ── Dirty-tracking snapshot ──────────────────────────────────────────────────
// Stores a hash (JSON string) per record so pushToSupabase only upserts records
// that actually changed since the last successful push.

const _lastPushed = new Map<string, string>();

function isDirty(key: string, value: unknown): boolean {
  const json = JSON.stringify(value);
  if (_lastPushed.get(key) === json) return false;
  return true;
}

function markClean(key: string, value: unknown): void {
  _lastPushed.set(key, JSON.stringify(value));
}

// ── Session push gate ─────────────────────────────────────────────────────────
// INCIDENT 2026-06-12: a session that loaded stale/seed local data pushed ALL
// of it before its first successful pull (the in-memory dirty map starts empty,
// so every record counted as dirty). 269 customer rows were blind-upserted as
// seed skeletons, wiping notes/files/emails server-side, and the push-time
// updatedAt stamp made them win every later LWW merge on every device.
// Rule: a session may not PUSH until it has successfully PULLED once.

let _pulledThisSession = false;

/** Marks the session as having completed a successful remote pull. Exposed for tests. */
export function markSessionPulled(value = true): void {
  _pulledThisSession = value;
}
export function hasSessionPulled(): boolean {
  return _pulledThisSession;
}

// ── Stale-write guard ─────────────────────────────────────────────────────────
// Before upserting per-record rows, compare each row's local value.updatedAt to
// the server's. Drop rows where the SERVER copy is strictly newer: those are
// stale local copies (a device that hasn't pulled recently), and pushing them
// would overwrite fresher data written by other devices. New rows (no server
// copy) always pass. Fails CLOSED: if the check query fails, nothing is pushed
// (the outbox retries later).

async function dropStaleRows(
  rows: Array<{ key: string; value: unknown }>,
): Promise<Array<{ key: string; value: unknown }>> {
  if (rows.length === 0) return rows;
  const serverTimes = new Map<string, string>();
  const keys = rows.map(r => r.key);
  for (let i = 0; i < keys.length; i += 200) {
    const { data, error } = await supabase
      .from('app_data')
      .select('key, updatedAt:value->>updatedAt')
      .in('key', keys.slice(i, i + 200));
    if (error) throw new Error(`stale-guard check failed: ${error.message}`);
    for (const row of (data ?? []) as Array<{ key: string; updatedAt: string | null }>) {
      if (row.updatedAt) serverTimes.set(row.key, row.updatedAt);
    }
  }
  const kept: Array<{ key: string; value: unknown }> = [];
  let dropped = 0;
  for (const r of rows) {
    const server = serverTimes.get(r.key);
    const local  = (r.value as { updatedAt?: string } | null)?.updatedAt;
    // Drop when the server copy is strictly newer, OR when the server has an
    // edit time and the local copy has none: a stamped server row is real synced
    // data, an unstamped local row is seed/fallback data and must never win.
    if (server && (!local || server > local)) {
      // Stale local record, do not overwrite. Mark this exact content clean so
      // it stops counting as dirty; any real local edit changes the content and
      // re-arms the dirty check.
      markClean(r.key, r.value);
      dropped++;
      continue;
    }
    kept.push(r);
  }
  if (dropped > 0) {
    console.warn(`[SyncEngine] stale-write guard dropped ${dropped} record(s), server copies are newer`);
  }
  return kept;
}

// ── Full AppState push (Phase 2, dirty-only) ───────────────────────────────

/**
 * Push changed records from AppState to Supabase.
 * Compares each record against the last-pushed snapshot and only upserts dirty ones.
 * Used by the 500ms debounced save and outbox drain.
 */
export async function pushToSupabase(state: AppState): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      window.dispatchEvent(new CustomEvent('supabase-sync-error', {
        detail: { message: 'Session expired, your changes are saved locally but not synced. Please re-login.' },
      }));
      return;
    }

    // ── Session push gate ────────────────────────────────────────────────────
    // Never push before this session has pulled once. A pre-pull session holds
    // whatever localStorage had (possibly seed/stale data) and the dirty map is
    // empty, so a push here would blind-upsert EVERY record. Mark pending so
    // the outbox retries after the startup pull completes.
    if (!_pulledThisSession) {
      console.warn('[SyncEngine] push blocked: no successful pull yet this session (prevents mass-overwrite from stale local data)');
      markPushPending('initial-pull-pending');
      return;
    }

    const deletedIds = Array.from(getDeletedCustomerIds());

    // ── Dirty customers only ─────────────────────────────────────────────────
    const dirtyCustomerRows = await dropStaleRows(
      state.customers
        .filter(c => !deletedIds.includes(c.id))
        .filter(c => isDirty(`${PREFIX.customer}${c.id}`, c))
        .map(c => ({ key: `${PREFIX.customer}${c.id}`, value: c })),
    );

    if (dirtyCustomerRows.length > 0) {
      await pushRows(dirtyCustomerRows);
      for (const r of dirtyCustomerRows) markClean(r.key, r.value);
    }

    // ── Dirty jobs only ──────────────────────────────────────────────────────
    const dirtyJobRows = await dropStaleRows(
      state.jobs
        .filter(j => isDirty(`${PREFIX.job}${j.id}`, j))
        .map(j => ({ key: `${PREFIX.job}${j.id}`, value: j })),
    );

    const failedJobs: Array<{ key: string; error: string }> = [];
    for (const row of dirtyJobRows) {
      if (isRowPoisoned(row.key)) {
        console.warn('[SyncEngine] Skipping poisoned row:', row.key);
        continue;
      }
      try {
        await pushRows([row]);
        clearRowPoison(row.key);
        markClean(row.key, row.value);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        incRowFailure(row.key, msg);
        failedJobs.push({ key: row.key, error: msg });
      }
    }
    if (failedJobs.length > 0) {
      console.warn('[SyncEngine] some job rows failed to push:', failedJobs);
      throw new Error(`Failed to push ${failedJobs.length} job rows: ${failedJobs[0].error}`);
    }

    // ── Lightweight metadata rows (config + tombstones) ─────────────────────
    const now = new Date().toISOString();
    const metaRows: Array<{ key: string; value: unknown; updated_at: string }> = [];

    const tombstoneKey = 'deleted_customer_ids';
    if (isDirty(tombstoneKey, deletedIds)) {
      metaRows.push({ key: tombstoneKey, value: deletedIds, updated_at: now });
    }
    const seConfigKey = 'solarEdgeConfig';
    if (isDirty(seConfigKey, state.solarEdgeConfig)) {
      metaRows.push({ key: seConfigKey, value: state.solarEdgeConfig, updated_at: now });
    }
    if (state.solarEdgeExtraSites?.length && isDirty('solarEdgeExtraSites', state.solarEdgeExtraSites)) {
      metaRows.push({ key: 'solarEdgeExtraSites', value: state.solarEdgeExtraSites, updated_at: now });
    }
    if (isDirty('standaloneRmas', state.standaloneRmas ?? [])) {
      metaRows.push({ key: 'standaloneRmas', value: state.standaloneRmas ?? [], updated_at: now });
    }

    if (metaRows.length > 0) {
      const { error } = await supabase
        .from('app_data')
        .upsert(metaRows, { onConflict: 'key' });

      if (error) {
        console.warn('[SyncEngine] pushToSupabase meta failed:', error.message);
        markPushPending(error.message);
        window.dispatchEvent(new CustomEvent('supabase-sync-error', {
          detail: { message: 'Failed to sync to cloud. Will retry automatically.', error: error.message },
        }));
        throw error;
      }
      for (const r of metaRows) markClean(r.key, r.value);
    }

    const totalDirty = dirtyCustomerRows.length + dirtyJobRows.length + metaRows.length;
    if (totalDirty > 0) {
      console.info(`[SyncEngine] Pushed ${totalDirty} dirty records (${dirtyCustomerRows.length}C ${dirtyJobRows.length}J ${metaRows.length}M)`);
    }

    clearPendingPush();
    // Do NOT advance the read cursor here. A push must not touch `lastSync`: the
    // outbox drains right before the pull, so setting the cursor to client-now made
    // the very next pull skip every other device's recent server writes (the cause of
    // contractors never receiving freshly-assigned jobs). Re-pulling our own just-
    // pushed rows once is harmless (idempotent merge); the pull owns the cursor.
    window.dispatchEvent(new CustomEvent('supabase-sync-success'));
  } catch (err) {
    console.warn('[SyncEngine] pushToSupabase error:', err);
    markPushPending(String(err));
    window.dispatchEvent(new CustomEvent('supabase-sync-error', {
      detail: { message: 'Connection lost. Working offline...', error: String(err) },
    }));
    throw err;
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
  try {
    let q = supabase
      .from('app_data')
      .select('key, value, updated_at')
      .like('key', `${prefix}%`);

    if (since) q = q.gt('updated_at', since);

    const { data, error } = await q;
    if (error || !data) {
      console.warn(`[SyncEngine] pullPrefix failed for prefix ${prefix}:`, error?.message || 'No data returned');
      return [];
    }
    // Stamp the authoritative app_data.updated_at onto the value so mergeRemote
    // can compare it against the local record's updatedAt.
    return data.map(r => {
      const v = r.value as T;
      if (v && typeof v === 'object' && r.updated_at) {
        (v as { updatedAt?: string }).updatedAt = r.updated_at as string;
      }
      return v;
    });
  } catch (err) {
    console.warn(`[SyncEngine] pullPrefix error for prefix ${prefix}:`, err);
    return [];
  }
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

    ensureCursorVersion(); // one-time full resync to recover any stale future cursor
    const since = getLastSync();

    // ── Per-record pull (Phase 2) ─────────────────────────────────────────────
    const [customers, jobs] = await Promise.all([
      pullPrefix<Customer>(PREFIX.customer, since),
      pullPrefix<Job>(PREFIX.job, since),
    ]);

    // ── Tombstones + standalone KV keys + solarEdgeConfig ───────────────────
    const { data: kvData, error: kvError } = await supabase
      .from('app_data')
      .select('key, value')
      .in('key', ['deleted_customer_ids', 'solarEdgeConfig', 'standaloneRmas', ...KV_SYNC_KEYS]);

    if (kvError) {
      console.warn('[SyncEngine] pullFromSupabase KV data fetch error:', kvError.message);
    }

    const changedKVKeys: string[] = [];
    if (kvData) {
      for (const row of kvData) {
        if (row.key === 'deleted_customer_ids' && Array.isArray(row.value)) {
          try {
            const local: string[] = JSON.parse(localStorage.getItem('solarflow_deleted_customer_ids') || '[]');
            const merged = Array.from(new Set([...local, ...row.value]));
            localStorage.setItem('solarflow_deleted_customer_ids', JSON.stringify(merged));
          } catch (err) {
            console.warn('[SyncEngine] Error updating deleted customer IDs:', err);
          }
        }
        if (isKVSyncKey(row.key) && row.value != null) {
          try {
            // CRM data: merge leads by ID so neither side loses new entries.
            if (row.key === 'solarflow_crm_data') {
              const prev = localStorage.getItem(row.key);
              const local = prev ? JSON.parse(prev) : null;
              const remote = row.value as { leads?: { id: string; updatedAt?: string }[] };
              if (local && Array.isArray(local.leads) && Array.isArray(remote.leads)) {
                // Build a map of remote leads, then overlay any local lead that is newer.
                const merged: Record<string, { id: string; updatedAt?: string }> = {};
                for (const l of remote.leads) merged[l.id] = l;
                for (const l of local.leads) {
                  const existing = merged[l.id];
                  if (!existing || (l.updatedAt && existing.updatedAt && l.updatedAt > existing.updatedAt)) {
                    merged[l.id] = l;
                  } else if (!existing) {
                    merged[l.id] = l; // local-only lead, keep it
                  }
                }
                const finalData = { ...remote, leads: Object.values(merged) };
                const next = JSON.stringify(finalData);
                if (prev !== next) {
                  localStorage.setItem(row.key, next);
                  changedKVKeys.push(row.key);
                }
              } else {
                // No local data yet, just write remote.
                const next = JSON.stringify(remote);
                if (prev !== next) {
                  localStorage.setItem(row.key, next);
                  changedKVKeys.push(row.key);
                }
              }
            } else if (row.key === 'solarflow_contractor_jobs') {
              // Contractor jobs: merge remote into local per-record so a pull
              // can never wipe locally-uploaded photos or local-only jobs (CB-3).
              const prev = localStorage.getItem(row.key);
              let local: unknown = null;
              try { local = prev ? JSON.parse(prev) : null; } catch { local = null; }
              const merged = mergeContractorJobs(local, row.value);
              const next = JSON.stringify(merged);
              if (prev !== next) {
                localStorage.setItem(row.key, next);
                changedKVKeys.push(row.key);
              }
            } else if (row.key === 'solarops_address_cleanup') {
              // Shared checklist: merge per item by updatedAt so two users
              // checking different items concurrently never stomp each other.
              const prev = localStorage.getItem(row.key);
              let local: unknown = null;
              try { local = prev ? JSON.parse(prev) : null; } catch { local = null; }
              const merged = mergeAddressCleanupItems(local, row.value);
              const next = JSON.stringify(merged);
              if (prev !== next) {
                localStorage.setItem(row.key, next);
                changedKVKeys.push(row.key);
              }
            } else {
              const next = JSON.stringify(row.value);
              const prev = localStorage.getItem(row.key);
              if (prev !== next) {
                localStorage.setItem(row.key, next);
                changedKVKeys.push(row.key);
              }
            }
          } catch (err) {
            console.warn(`[SyncEngine] Error processing KV key ${row.key}:`, err);
          }
        }
      }
    }

    if (changedKVKeys.length > 0) {
      window.dispatchEvent(new CustomEvent('solarflow-remote-update', {
        detail: { keys: changedKVKeys },
      }));
    }

    // Advance the incremental cursor using SERVER timestamps (the values pullPrefix
    // stamped from app_data.updated_at), NOT the client clock. A device whose clock
    // runs ahead of the DB would otherwise store a future `since` and PERMANENTLY
    // skip every record the server wrote in that skew window - the "contractor keeps
    // refreshing but never sees the job just assigned to them" bug. Rewind a small
    // safety buffer so rows committed during this pull are re-checked next time, and
    // keep the prior cursor (don't jump to client-now) when nothing new came back.
    const serverTimes = [...customers, ...jobs]
      .map(v => (v as { updatedAt?: string }).updatedAt)
      .filter((t): t is string => !!t)
      .sort();
    const maxServerTs = serverTimes.length ? serverTimes[serverTimes.length - 1] : null;
    if (maxServerTs) {
      const SYNC_SAFETY_MS = 5000;
      setLastSync(new Date(new Date(maxServerTs).getTime() - SYNC_SAFETY_MS).toISOString());
    }
    // If nothing new returned, leave `since` untouched (never advance to client-now).

    // Extract solarEdgeConfig from kvData if present
    const remoteSEConfig = kvData?.find(r => r.key === 'solarEdgeConfig')?.value as AppState['solarEdgeConfig'] | undefined;
    const remoteStandaloneRmas = kvData?.find(r => r.key === 'standaloneRmas')?.value as AppState['standaloneRmas'] | undefined;

    const result: Partial<AppState> = {};
    if (customers.length > 0)  result.customers       = customers;
    if (jobs.length > 0)       result.jobs            = jobs;
    if (remoteSEConfig?.apiKey) result.solarEdgeConfig = remoteSEConfig;
    if (Array.isArray(remoteStandaloneRmas)) result.standaloneRmas = remoteStandaloneRmas;

    // Pull succeeded: this session is now allowed to push (see session push gate).
    markSessionPulled();
    return result;
  } catch (err) {
    console.warn('[SyncEngine] pullFromSupabase error:', err);
    return null;
  }
}

// ── Merge ─────────────────────────────────────────────────────────────────────

/**
 * Compare two records by edit time for last-writer-wins resolution.
 * Returns true if `a` is newer than or equal to `b`. Falls back to createdAt
 * when updatedAt is absent (legacy records), then to empty string (oldest).
 * NOTE: timestamps are client-stamped, so a device with a skewed clock can win.
 * Server-authoritative time (a DB default/trigger on app_data.updated_at) is the
 * proper fix and is tracked separately (SEC-18).
 */
function recordTime(r: { updatedAt?: string; createdAt?: string }): string {
  return r.updatedAt ?? r.createdAt ?? '';
}
function remoteWins(remote: { updatedAt?: string; createdAt?: string }, local: { updatedAt?: string; createdAt?: string }): boolean {
  // A synced record always carries updatedAt (stamped at push). A local record
  // WITHOUT one is unsynced seed/fallback data whose createdAt is generated at
  // load time (= now), which must never beat a real remote edit time. So when
  // exactly one side has updatedAt, that side wins outright.
  if (remote.updatedAt && !local.updatedAt) return true;
  if (!remote.updatedAt && local.updatedAt) return false;
  return recordTime(remote) >= recordTime(local);
}

/**
 * Merge remote state into local state.
 *
 * Conflict resolution is last-writer-wins by record `updatedAt` (then createdAt):
 *   - On an ID conflict, remote replaces local ONLY if it is newer or equal.
 *     A newer local edit (e.g. made offline) is preserved.
 *   - Records present locally but NOT in remote are kept (incremental pull only
 *     returns rows changed since last_sync, so a freshly created/pushed record
 *     may not come back and must not be dropped as a ghost).
 *   - Records in the tombstone list are always filtered.
 */
// ── Append-only array union ───────────────────────────────────────────────────
// Activity feeds (customer.activityHistory, job.activityHistory) and customer
// files are append-mostly: entries are added, never edited. LWW on the whole
// record let one stale side WIPE the other's entries (2026-06-12 incident
// destroyed SO comments and customer notes). Union by entry id so a merge can
// only ever ADD.

function unionById<T extends { id?: string; timestamp?: string; createdAt?: string }>(
  a: T[] | undefined,
  b: T[] | undefined,
  order: 'asc' | 'desc',
): T[] | undefined {
  const aa = a ?? [];
  const bb = b ?? [];
  if (aa.length === 0 && bb.length === 0) return a ?? b;
  const seen = new Map<string, T>();
  for (const e of [...aa, ...bb]) {
    const key = e.id ?? `${e.timestamp ?? e.createdAt ?? ''}|${JSON.stringify(e).slice(0, 80)}`;
    if (!seen.has(key)) seen.set(key, e);
  }
  const t = (e: T) => e.timestamp ?? e.createdAt ?? '';
  return Array.from(seen.values()).sort((x, y) =>
    order === 'asc' ? t(x).localeCompare(t(y)) : t(y).localeCompare(t(x)));
}

/** Merge a customer pair: LWW winner + union of activity history and files. */
export function mergeCustomerPair(winner: Customer, loser: Customer): Customer {
  return {
    ...winner,
    // activityHistory is rendered newest-first; files newest-first as well.
    activityHistory: unionById(winner.activityHistory, loser.activityHistory, 'desc'),
    files: unionById(winner.files, loser.files, 'desc'),
  };
}

/**
 * Merge two woPhoto lists so DELETIONS stick without dropping IN-FLIGHT uploads.
 *
 * The LWW `winner` is authoritative for what photos exist: if a photo the loser
 * still has is absent from the (newer) winner, it was deleted and must NOT come
 * back. The one exception is a loser photo that has not finished uploading yet
 * (no `storageUrl`) - that is a fresh local capture the winner simply has not
 * seen, so we keep it. This replaces the old "keep whichever side has more
 * photos" count heuristic, which resurrected a contractor-deleted photo whenever
 * another device still held the older, larger set (M1).
 */
export function mergeWoPhotos(winnerPhotos: WOPhoto[], loserPhotos: WOPhoto[]): WOPhoto[] {
  const eff = (p: WOPhoto) => p.storageUrl || p.dataUrl || p.id;
  const have = new Set(winnerPhotos.map(eff));
  const merged = [...winnerPhotos];
  for (const p of loserPhotos) {
    if (have.has(eff(p))) continue;
    // Loser-only photo: keep it ONLY if it is not yet uploaded (still in flight).
    // An uploaded photo (has storageUrl) absent from the newer winner = deleted.
    if (!p.storageUrl) merged.push(p);
  }
  return merged;
}

/** Merge a job pair: LWW winner + union of activities, upload-aware photo merge. */
export function mergeJobPair(winner: Job, loser: Job): Job {
  return {
    ...winner,
    // SO comments / team conversation feed, appended chronologically.
    activityHistory: unionById(winner.activityHistory, loser.activityHistory, 'asc'),
    woPhotos: mergeWoPhotos(winner.woPhotos ?? [], loser.woPhotos ?? []),
  };
}

export function mergeRemote(local: AppState, remote: Partial<AppState>): AppState {
  const deletedIds    = getDeletedCustomerIds();
  const deletedJobIds = getDeletedJobIds();

  // ── Customers ─────────────────────────────────────────────────────────────
  let customers = local.customers;
  if (remote.customers && remote.customers.length > 0) {
    const localMap  = new Map(local.customers.map(c => [c.id, c]));
    const remoteMap = new Map(remote.customers.map(c => [c.id, c]));

    // Merge by ID. On conflict, keep whichever record is newer (LWW), but UNION
    // the append-only containers (activityHistory, files) so a stale side can
    // never wipe notes/files the other side holds. Keep local-only records,
    // real deletions are handled by the tombstone filter.
    const merged = new Map(localMap);
    for (const [id, rc] of remoteMap) {
      const lc = localMap.get(id);
      if (!lc) { merged.set(id, rc); continue; }
      merged.set(id, remoteWins(rc, lc) ? mergeCustomerPair(rc, lc) : mergeCustomerPair(lc, rc));
    }

    customers = Array.from(merged.values()).filter(c => !deletedIds.has(c.id));

    // Apply exclusion filter ONLY to records that came from remote.
    // A locally-created customer mid-edit (incomplete address etc.) must NOT be dropped,
    // otherwise their newly-created jobs would orphan and disappear from the UI.
    customers = customers.filter(c => localMap.has(c.id) || isAllowedCustomer(c));
  }

  // ── Jobs ──────────────────────────────────────────────────────────────────
  let jobs = local.jobs;
  if (remote.jobs && remote.jobs.length > 0) {
    const localMap  = new Map(local.jobs.map(j => [j.id, j]));
    const remoteMap = new Map(remote.jobs.map(j => [j.id, j]));

    const merged = new Map(localMap);
    for (const [id, remoteJ] of remoteMap) {
      const localJ = localMap.get(id);
      if (!localJ) { merged.set(id, remoteJ); continue; }
      // Last-writer-wins on updatedAt, but union the activity feed (comments)
      // and keep whichever copy has more photos, so a stale remote pull (race
      // with an in-flight push) can wipe neither comments nor photos.
      const winner = remoteWins(remoteJ, localJ);
      merged.set(id, winner ? mergeJobPair(remoteJ, localJ) : mergeJobPair(localJ, remoteJ));
    }

    // Same ghost-purge removal as customers above. Jobs are deleted only via
    // explicit user action (handleDeleteJob), which records a job-id tombstone.
    jobs = Array.from(merged.values())
      .filter(j => !deletedIds.has(j.customerId))
      .filter(j => !deletedJobIds.has(j.id));
  }

  // ── SolarEdge extra sites (still blob, low volume, no Realtime needed) ───
  let solarEdgeExtraSites = local.solarEdgeExtraSites ?? [];

  // ── SolarEdge config, sync API key across devices ────────────────────────
  // Remote wins if it has a key and local is empty; otherwise keep local.
  // This lets desktop-saved API keys propagate to mobile automatically.
  const solarEdgeConfig = (remote.solarEdgeConfig?.apiKey && !local.solarEdgeConfig?.apiKey)
    ? { ...local.solarEdgeConfig, ...remote.solarEdgeConfig }
    : local.solarEdgeConfig;

  // ── Standalone RMAs, merge the synced blob by id (newest updatedAt wins) ──
  const standaloneRmas = (() => {
    const localList = local.standaloneRmas ?? [];
    const remoteList = remote.standaloneRmas ?? [];
    if (remoteList.length === 0) return localList;
    if (localList.length === 0) return remoteList;
    const byId = new Map(localList.map(e => [e.id, e]));
    for (const e of remoteList) {
      const cur = byId.get(e.id);
      if (!cur) { byId.set(e.id, e); continue; }
      const t1 = cur.updatedAt ?? cur.createdAt ?? '';
      const t2 = e.updatedAt ?? e.createdAt ?? '';
      if (t2 > t1) byId.set(e.id, e);
    }
    return Array.from(byId.values());
  })();

  return { ...local, customers, jobs, solarEdgeExtraSites, solarEdgeConfig, standaloneRmas };
}

// ── Full sync on login ────────────────────────────────────────────────────────

export async function syncOnLogin(localState: AppState): Promise<AppState> {
  try {
    const remote = await pullFromSupabase();
    if (!remote) return localState;
    const merged = mergeRemote(localState, remote);
    console.info(
      `[SyncEngine] synced, customers: ${merged.customers.length}, jobs: ${merged.jobs.length}`,
    );
    return merged;
  } catch (err) {
    console.warn('[SyncEngine] syncOnLogin error:', err);
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
  } catch (err) {
    console.warn('[SyncEngine] pullAndMerge error:', err);
    return null;
  }
}

// ── Realtime subscription ─────────────────────────────────────────────────────

export interface SolarSitePayload {
  siteId: number;
  siteName: string;
  status: string;
  currentPower: number;
  lastUpdateTime: string;
  lastPolled: string;
  alerts: Array<{ type: string; severity: 'info' | 'warning' | 'critical'; message: string }>;
}

export interface RealtimeHandlers {
  onCustomer: (customer: Customer, event: 'INSERT' | 'UPDATE' | 'DELETE') => void;
  onJob:      (job: Job,      event: 'INSERT' | 'UPDATE' | 'DELETE') => void;
  onKV:       (key: string, value: unknown) => void;
  onSolarSite?: (site: SolarSitePayload) => void;
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

  // STEP 4: Batch rapid realtime events into a single flush window.
  // Multiple updates arriving in <200ms collapse to ONE React render pass
  // (since handler calls all happen in the same setTimeout tick, React 18 auto-batches the setState calls).
  const pendingEvents: Array<() => void> = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let batchCount = 0;
  let eventCount = 0;

  const scheduleFlush = () => {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      const events = pendingEvents.slice();
      pendingEvents.length = 0;
      flushTimer = null;
      batchCount++;
      eventCount += events.length;
      for (const fn of events) {
        try { fn(); } catch (err) { console.warn('[SyncEngine] Batched handler error:', err); }
      }
      if (batchCount % 50 === 0) {
        console.info(`[Realtime] Batched ${eventCount} events into ${batchCount} flushes`);
      }
    }, 200);
  };

  const enqueue = (fn: () => void) => {
    pendingEvents.push(fn);
    scheduleFlush();
  };

  let consecutiveErrors = 0;
  const MAX_REALTIME_ERRORS = 5;

  realtimeChannel = supabase
    .channel('solarops-realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'app_data' },
      (payload: RealtimePostgresChangesPayload<{ key: string; value: unknown; updated_at: string }>) => {
        try {
          const row = (payload.new ?? payload.old) as { key: string; value: unknown } | undefined;
          if (!row?.key) return;

          const { key, value } = row;

          if (key.startsWith(PREFIX.customer) && value && payload.eventType !== 'DELETE') {
            enqueue(() => handlers.onCustomer(value as Customer, payload.eventType as 'INSERT' | 'UPDATE'));
          } else if (key.startsWith(PREFIX.customer) && payload.eventType === 'DELETE') {
            enqueue(() => handlers.onCustomer({ id: key.slice(PREFIX.customer.length) } as Customer, 'DELETE'));
          } else if (key.startsWith(PREFIX.job) && value && payload.eventType !== 'DELETE') {
            enqueue(() => handlers.onJob(value as Job, payload.eventType as 'INSERT' | 'UPDATE'));
          } else if (key.startsWith(PREFIX.job) && payload.eventType === 'DELETE') {
            enqueue(() => handlers.onJob({ id: key.slice(PREFIX.job.length) } as Job, 'DELETE'));
          } else if (key.startsWith(PREFIX.solar) && value && payload.eventType !== 'DELETE') {
            if (handlers.onSolarSite) {
              enqueue(() => handlers.onSolarSite!(value as SolarSitePayload));
            }
          } else if (isKVSyncKey(key) && value != null) {
            const next = JSON.stringify(value);
            const prev = localStorage.getItem(key);
            if (prev !== next) {
              localStorage.setItem(key, next);
              enqueue(() => handlers.onKV(key, value));
            }
          }
        } catch (err) {
          console.warn('[SyncEngine] Realtime handler error:', err);
        }
      },
    )
    .subscribe(status => {
      if (status === 'SUBSCRIBED') {
        consecutiveErrors = 0;
        console.info('[Realtime] Connected');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        consecutiveErrors++;
        if (consecutiveErrors >= MAX_REALTIME_ERRORS) {
          console.warn(`[Realtime] ${consecutiveErrors} consecutive failures, disabling to stop reconnect storm. Poll fallback active.`);
          if (realtimeChannel) {
            supabase.removeChannel(realtimeChannel);
            realtimeChannel = null;
          }
        }
      } else {
        console.info('[Realtime]', status);
      }
    });

  return () => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    pendingEvents.length = 0;
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
  };
}
