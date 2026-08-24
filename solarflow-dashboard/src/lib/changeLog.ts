/**
 * SolarOps, Append-Only Change Log
 *
 * Every mutation (create / update / delete) is recorded here BEFORE
 * touching React state. Entries persist in localStorage and are
 * asynchronously pushed to Supabase. Nothing is ever deleted from
 * this log, it is the authoritative audit trail.
 *
 * v2: adds device fingerprint (userAgent, platform, screen), upload
 *     timing (durationMs), and typed photo/avatar event helpers.
 */
import { supabase } from './supabase';

const LOG_KEY     = 'solarops_change_log';
const MAX_ENTRIES = 2000; // trim to last 2000 after each write

// Stable per-device ID (survives page refresh, not browser wipe)
export const DEVICE_ID = (() => {
  const k = 'solarops_device_id';
  try {
    let id = localStorage.getItem(k);
    if (!id) {
      id = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      localStorage.setItem(k, id);
    }
    return id;
  } catch {
    // iOS Private Mode, generate ephemeral ID
    return `eph-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
})();

/** Snapshot of the browser/device at the time of the event. */
export interface DeviceInfo {
  ua: string;       // navigator.userAgent (capped at 220 chars)
  platform: string; // 'iPhone' | 'MacIntel' | etc.
  screen: string;   // '390x844'
}

function captureDevice(): DeviceInfo {
  try {
    return {
      ua:       navigator.userAgent.slice(0, 220),
      platform: navigator.platform ?? 'unknown',
      screen:   `${window.screen?.width ?? 0}x${window.screen?.height ?? 0}`,
    };
  } catch {
    return { ua: 'unknown', platform: 'unknown', screen: 'unknown' };
  }
}

export interface ChangeEntry {
  id:         string;
  opType:     string;   // 'customer.create' | 'job.update' | 'photo.upload_success' | ...
  entityType: string;   // 'customer' | 'job' | 'photo' | 'user'
  entityId:   string;
  payload:    unknown;
  userEmail:  string;
  deviceId:   string;
  device:     DeviceInfo;
  durationMs: number | null; // for timed ops (uploads)
  createdAt:  string;
  syncedAt:   string | null; // null = pending Supabase sync
}

// ── Local storage helpers ──────────────────────────────────────────────────

function readLog(): ChangeEntry[] {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

/**
 * MAX_ENTRIES caps the log by COUNT, which says nothing about bytes. Measured
 * against the live change_log table, the average entry is ~2 KB and `job.update`
 * averages 9.7 KB (one hit 1.43 MB), so 2000 entries is ~3.9 MB of a ~5 MB
 * localStorage origin cap. That is what actually filled Cesar's device while he
 * edited a work order, not the write that happened to throw.
 *
 * The full payload still goes to Supabase (see pushEntry) which is the real audit
 * store. Locally we keep a slim copy: enough to see what happened and when.
 */
const MAX_LOCAL_PAYLOAD_BYTES = 1024;
const MAX_LOCAL_LOG_BYTES     = 512 * 1024;

export function slimPayload(payload: unknown): unknown {
  try {
    const json = JSON.stringify(payload);
    if (json == null || json.length <= MAX_LOCAL_PAYLOAD_BYTES) return payload;
    return { _truncated: true, bytes: json.length, preview: json.slice(0, 200) };
  } catch {
    return { _truncated: true, bytes: -1 };
  }
}

/**
 * Trim to MAX_ENTRIES, then drop oldest until the serialized log fits
 * MAX_LOCAL_LOG_BYTES. The byte pass is the backstop that matters: it also
 * reclaims devices already carrying multi-MB logs written by earlier builds,
 * on the first write after this ships.
 */
export function trimLog(entries: ChangeEntry[]): ChangeEntry[] {
  let kept = entries.slice(-MAX_ENTRIES);
  while (kept.length > 1 && JSON.stringify(kept).length > MAX_LOCAL_LOG_BYTES) {
    kept = kept.slice(Math.ceil(kept.length / 2)); // halve, not one-by-one
  }
  return kept;
}

function writeLog(entries: ChangeEntry[]): void {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(trimLog(entries)));
  } catch {} // storage quota: fail silently, log is a bonus, not critical path
}

/**
 * Reclaim an oversized log at BOOT, before anything else touches storage.
 *
 * The byte cap in writeLog only fires on the next logChange, so a device already
 * at the quota could throw on some other key first and never reach it: it stayed
 * wedged, showing "out of storage" on every session. This runs unconditionally at
 * startup and does not depend on any write path succeeding.
 *
 * Existing fat payloads are slimmed too, not just trimmed by age, because a device
 * carrying entries from before the cap has fat rows throughout, not only old ones.
 * If anything at all fails, the log is dropped entirely: it is a local cache, and
 * Supabase holds the durable audit trail. Freeing the device wins over keeping it.
 */
export function reclaimLocalStorage(): { before: number; after: number } {
  let before = -1;
  try {
    const raw = localStorage.getItem(LOG_KEY);
    before = raw?.length ?? 0;
    if (!raw || before <= MAX_LOCAL_LOG_BYTES) return { before, after: before };

    const entries = JSON.parse(raw) as ChangeEntry[];
    const slimmed = trimLog(entries.map(e => ({ ...e, payload: slimPayload(e.payload) })));
    const json = JSON.stringify(slimmed);
    localStorage.setItem(LOG_KEY, json);
    console.info(`[changeLog] reclaimed ${before} -> ${json.length} bytes at boot`);
    return { before, after: json.length };
  } catch (e) {
    try {
      localStorage.removeItem(LOG_KEY);
      console.warn('[changeLog] log unreadable/unwritable, dropped to free storage', e);
      return { before, after: 0 };
    } catch { return { before, after: -1 }; }
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Record any mutation. Called synchronously before state updates.
 * Supabase push is fire-and-forget.
 */
export function logChange(
  opType:      string,
  entityType:  string,
  entityId:    string,
  payload:     unknown,
  userEmail  = 'unknown',
  durationMs?: number,
): ChangeEntry {
  const entry: ChangeEntry = {
    id:         `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    opType,
    entityType,
    entityId,
    payload,
    userEmail,
    deviceId:   DEVICE_ID,
    device:     captureDevice(),
    durationMs: durationMs ?? null,
    createdAt:  new Date().toISOString(),
    syncedAt:   null,
  };

  // Local copy is slimmed; the FULL payload goes to Supabase below. Caveat: if
  // that push fails, flushPending retries from this local copy and so re-sends
  // the truncated payload. Losing detail on a retried entry is an acceptable
  // trade for not filling the device, and the entry itself is never lost.
  const log = readLog();
  log.push({ ...entry, payload: slimPayload(entry.payload) });
  writeLog(log);

  // Async Supabase push, does NOT block the UI
  pushEntry(entry).catch((e) => console.error('[changeLog] pushEntry to Supabase failed', e));

  return entry;
}

/**
 * Convenience wrapper for photo / avatar upload lifecycle events.
 * opType examples: 'photo.upload_start' | 'photo.upload_success' | 'photo.upload_fail'
 *                  'avatar.upload_start' | 'avatar.upload_success' | 'avatar.upload_fail'
 */
export function logUpload(
  opType:    string,
  entityId:  string,          // photoId or userId
  details:   Record<string, unknown>,
  userEmail = 'unknown',
  durationMs?: number,
): ChangeEntry {
  return logChange(opType, 'photo', entityId, details, userEmail, durationMs);
}

/** Drain all unsynced entries to Supabase (call after login / reconnect). */
export async function flushChangeLog(): Promise<void> {
  // Check the session ONCE for the whole flush instead of once per entry.
  // getSession() was previously called inside pushEntry for every row, so a
  // 50-entry backlog meant 50 redundant session reads. One check up front.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return; // not logged in, flush on next login

  const pending = readLog().filter(e => e.syncedAt === null);
  const BATCH = 10;
  for (let i = 0; i < pending.length; i += BATCH) {
    await Promise.allSettled(pending.slice(i, i + BATCH).map(pushEntry));
  }
}

/** Return the last N entries for display in a UI (newest first). */
export function getRecentLog(limit = 100): ChangeEntry[] {
  return readLog().slice(-limit).reverse();
}

// ── Field-level diff + per-entity history (WO audit) ────────────────────────

// Heavy fields are summarized by count, not dumped, so the audit payload stays small.
//
// `auditLog` and `fieldTimes` were added after measuring live change_log rows:
// they were 2.24 MB and 1.73 MB of the 4.65 MB that job.update diffs occupy, far
// more than every other field combined. Both are append-only, so each edit grows
// them and the diff then dumps the full before AND after copies. Logging a job's
// own audit log inside an audit entry is pure duplication.
const HEAVY_DIFF_FIELDS = new Set([
  'woPhotos', 'photos', 'lineItems', 'rmaEntries', 'activityHistory', 'parts',
  'auditLog', 'fieldTimes',
]);

/**
 * Describe a URL for an audit payload without embedding it. A `data:` URL is the
 * whole image inline: live `photo.delete` rows averaged 115 KB with one at 639 KB
 * purely because 3 of 13 captured base64 instead of an uploaded https:// link.
 * The identity of a blob matters for an audit trail; its bytes do not.
 */
export function describeUrl(url: unknown): string {
  if (typeof url !== 'string') return String(url);
  if (!url.startsWith('data:')) return url;
  const mime = url.slice(5, url.indexOf(';') > 0 ? url.indexOf(';') : 5);
  return `[data:${mime || 'unknown'} ${url.length} bytes]`;
}

/**
 * Shallow field-level diff between two entity snapshots → { field: {before, after} }.
 * Objects/arrays compared by JSON; heavy array fields reported as a count change.
 */
export function diffEntity(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): Record<string, { before: unknown; after: unknown }> {
  const out: Record<string, { before: unknown; after: unknown }> = {};
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  for (const k of keys) {
    const b = (before ?? {})[k];
    const a = (after ?? {})[k];
    if (HEAVY_DIFF_FIELDS.has(k)) {
      const bl = Array.isArray(b) ? b.length : (b ? 1 : 0);
      const al = Array.isArray(a) ? a.length : (a ? 1 : 0);
      if (bl !== al) out[k] = { before: `${bl}`, after: `${al}` };
      continue;
    }
    const bs = typeof b === 'object' ? JSON.stringify(b) : b;
    const as = typeof a === 'object' ? JSON.stringify(a) : a;
    if (bs !== as) out[k] = { before: b, after: a };
  }
  return out;
}

/**
 * Log a job mutation with a field-level diff (what changed), not a blind snapshot.
 * Skips the write entirely if nothing changed.
 */
export function logJobChange(
  opType: string,
  jobId: string,
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown>,
  actor: string,
): ChangeEntry | null {
  const changed = before ? diffEntity(before, after) : null;
  if (changed && Object.keys(changed).length === 0) return null; // no-op edit
  return logChange(opType, 'job', jobId, {
    changed: changed ?? '(new record)',
    woNumber: after['woNumber'],
    status: after['woStatus'] ?? after['status'],
  }, actor);
}

/** Local-only history for one entity (this device's log). */
export function getLogForEntity(entityType: string, entityId: string, limit = 100): ChangeEntry[] {
  return readLog().filter(e => e.entityType === entityType && e.entityId === entityId).slice(-limit).reverse();
}

/**
 * Cross-device history for one entity: queries Supabase change_log (so an admin
 * sees the CONTRACTOR's edits made on another device), merged with the local log
 * (covers entries not yet synced). Newest first, deduped by id.
 */
export async function fetchLogForEntity(entityType: string, entityId: string, limit = 100): Promise<ChangeEntry[]> {
  const local = getLogForEntity(entityType, entityId, limit);
  try {
    const { data, error } = await supabase
      .from('change_log')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error || !data) return local;
    const remote: ChangeEntry[] = data.map((r: any) => ({
      id: r.id,
      opType: r.op_type,
      entityType: r.entity_type,
      entityId: r.entity_id,
      payload: r.payload,
      userEmail: r.user_email ?? 'unknown',
      deviceId: r.device_id ?? '',
      device: (r.payload?._device as DeviceInfo) ?? ({} as DeviceInfo),
      durationMs: r.payload?._ms ?? null,
      createdAt: r.created_at,
      syncedAt: r.created_at,
    }));
    const byId = new Map<string, ChangeEntry>();
    for (const e of [...remote, ...local]) byId.set(e.id, e);
    return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  } catch {
    return local;
  }
}

/**
 * Cross-device activity history for ONE user (by email): queries Supabase
 * change_log so an admin sees everything that user did on any device, merged
 * with the local log (covers not-yet-synced entries). Newest first, deduped.
 */
export async function fetchLogForUser(userEmail: string, limit = 200): Promise<ChangeEntry[]> {
  const email = (userEmail ?? '').trim();
  const local = readLog().filter(e => (e.userEmail ?? '').trim().toLowerCase() === email.toLowerCase())
    .slice(-limit).reverse();
  try {
    const { data, error } = await supabase
      .from('change_log')
      .select('*')
      .eq('user_email', email)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error || !data) return local;
    const remote: ChangeEntry[] = data.map((r: any) => ({
      id: r.id,
      opType: r.op_type,
      entityType: r.entity_type,
      entityId: r.entity_id,
      payload: r.payload,
      userEmail: r.user_email ?? 'unknown',
      deviceId: r.device_id ?? '',
      device: (r.payload?._device as DeviceInfo) ?? ({} as DeviceInfo),
      durationMs: r.payload?._ms ?? null,
      createdAt: r.created_at,
      syncedAt: r.created_at,
    }));
    const byId = new Map<string, ChangeEntry>();
    for (const e of [...remote, ...local]) byId.set(e.id, e);
    return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  } catch {
    return local;
  }
}

// ── Internal ───────────────────────────────────────────────────────────────

async function pushEntry(entry: ChangeEntry): Promise<void> {
  // Session is verified once in flushChangeLog before this is called.
  try {
    // ignoreDuplicates => ON CONFLICT DO NOTHING. An audit row is never
    // rewritten, and change_log has no UPDATE policy by design (it is
    // append-only at the RLS layer). A plain upsert took the UPDATE path on a
    // redelivery and hit a policy violation: the entry HAD landed, but the
    // local "mark synced" write below never ran, so the same row was retried on
    // every subsequent flush, forever. DO NOTHING makes a redelivery a no-op.
    //
    // actor_uid is deliberately not sent: change_log_stamp_actor_trg stamps it
    // from auth.uid() server-side. user_email is client-supplied and therefore
    // forgeable; actor_uid is the verified one.
    const { error } = await supabase.from('change_log').upsert({
      id:          entry.id,
      op_type:     entry.opType,
      entity_type: entry.entityType,
      entity_id:   entry.entityId,
      payload:     { ...((entry.payload as object) ?? {}), _device: entry.device, _ms: entry.durationMs },
      user_email:  entry.userEmail,
      device_id:   entry.deviceId,
      created_at:  entry.createdAt,
    }, { onConflict: 'id', ignoreDuplicates: true });

    if (!error) {
      // Mark synced in local log
      const log = readLog();
      writeLog(log.map(e => e.id === entry.id
        ? { ...e, syncedAt: new Date().toISOString() }
        : e));
    }
  } catch {
    // Network error, will retry on next flush
  }
}
