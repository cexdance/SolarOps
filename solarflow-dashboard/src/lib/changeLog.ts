/**
 * SolarOps — Append-Only Change Log
 *
 * Every mutation (create / update / delete) is recorded here BEFORE
 * touching React state. Entries persist in localStorage and are
 * asynchronously pushed to Supabase. Nothing is ever deleted from
 * this log — it is the authoritative audit trail.
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
    // iOS Private Mode — generate ephemeral ID
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

function writeLog(entries: ChangeEntry[]): void {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {} // storage quota: fail silently — log is a bonus, not critical path
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

  const log = readLog();
  log.push(entry);
  writeLog(log);

  // Async Supabase push — does NOT block the UI
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
  if (!session) return; // not logged in — flush on next login

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
const HEAVY_DIFF_FIELDS = new Set([
  'woPhotos', 'photos', 'lineItems', 'rmaEntries', 'activityHistory', 'parts',
]);

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
    const { error } = await supabase.from('change_log').upsert({
      id:          entry.id,
      op_type:     entry.opType,
      entity_type: entry.entityType,
      entity_id:   entry.entityId,
      payload:     { ...((entry.payload as object) ?? {}), _device: entry.device, _ms: entry.durationMs },
      user_email:  entry.userEmail,
      device_id:   entry.deviceId,
      created_at:  entry.createdAt,
    });

    if (!error) {
      // Mark synced in local log
      const log = readLog();
      writeLog(log.map(e => e.id === entry.id
        ? { ...e, syncedAt: new Date().toISOString() }
        : e));
    }
  } catch {
    // Network error — will retry on next flush
  }
}
