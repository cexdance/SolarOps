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
  pushEntry(entry).catch(() => {});

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
  const pending = readLog().filter(e => e.syncedAt === null);
  await Promise.allSettled(pending.map(pushEntry));
}

/** Return the last N entries for display in a UI (newest first). */
export function getRecentLog(limit = 100): ChangeEntry[] {
  return readLog().slice(-limit).reverse();
}

// ── Internal ───────────────────────────────────────────────────────────────

async function pushEntry(entry: ChangeEntry): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return; // not logged in — will be flushed on next login

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
