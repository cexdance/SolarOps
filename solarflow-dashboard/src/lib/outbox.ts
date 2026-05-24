/**
 * SolarOps — Push Outbox (Phase 1)
 *
 * Problem: pushToSupabase() was fire-and-forget. If it failed (offline, 500,
 * network blip), the change was silently dropped and would be overwritten the
 * next time another device pulled remote and re-saved.
 *
 * Fix: Every failed push writes a "pending" flag to localStorage.
 * drainOutbox() re-pushes the current state when connectivity returns.
 * The outbox survives page reloads so no offline edit is ever lost.
 *
 * Phase 2 will replace this with per-record row upserts. For now, Phase 1
 * keeps the blob approach but makes it durable.
 *
 * Drain is triggered by:
 *   - Every successful local save (catches transient failures quickly)
 *   - window 'online' event  (device reconnects)
 *   - window 'focus' event   (user switches back to the tab)
 *   - 30-second interval     (background convergence)
 */

const OUTBOX_KEY  = 'solarops_outbox_v1';
const POISON_KEY  = 'solarops_poisoned_rows_v1';

/** Consecutive failures before a row is considered "poisoned" and skipped. */
const POISON_THRESHOLD = 3;

interface PendingPush {
  queuedAt: string;   // ISO — when the first failure was recorded
  attempts: number;   // consecutive failure count
  lastError?: string; // last error message for debugging
}

interface PoisonEntry {
  failCount: number;
  lastError: string;
  since: string; // ISO — first failure timestamp
}

// ── Storage helpers ────────────────────────────────────────────────────────────

function get(): PendingPush | null {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    return raw ? (JSON.parse(raw) as PendingPush) : null;
  } catch { return null; }
}

function save(entry: PendingPush | null): void {
  try {
    if (entry === null) {
      localStorage.removeItem(OUTBOX_KEY);
    } else {
      localStorage.setItem(OUTBOX_KEY, JSON.stringify(entry));
    }
  } catch (err) {
    console.warn('[Outbox] Error saving to localStorage:', err);
  }
}

// ── Per-row poison tracking ────────────────────────────────────────────────────
// A "poisoned" row is one that has failed POISON_THRESHOLD times in a row.
// Poisoned rows are skipped in future pushes so one bad record can never
// block every other record from reaching Supabase.

function getPoison(): Record<string, PoisonEntry> {
  try {
    const raw = localStorage.getItem(POISON_KEY);
    return raw ? (JSON.parse(raw) as Record<string, PoisonEntry>) : {};
  } catch { return {}; }
}

function savePoison(poison: Record<string, PoisonEntry>): void {
  try {
    if (Object.keys(poison).length === 0) {
      localStorage.removeItem(POISON_KEY);
    } else {
      localStorage.setItem(POISON_KEY, JSON.stringify(poison));
    }
  } catch (err) {
    console.warn('[Outbox] Error saving poison list:', err);
  }
}

/** True if the row has hit the failure threshold and should be skipped. */
export function isRowPoisoned(key: string): boolean {
  return (getPoison()[key]?.failCount ?? 0) >= POISON_THRESHOLD;
}

/**
 * Record a per-row push failure.
 * After POISON_THRESHOLD calls the row is considered poisoned.
 */
export function incRowFailure(key: string, error: string): void {
  try {
    const poison = getPoison();
    const existing = poison[key];
    poison[key] = {
      failCount: (existing?.failCount ?? 0) + 1,
      lastError: error,
      since:     existing?.since ?? new Date().toISOString(),
    };
    savePoison(poison);
    if (poison[key].failCount >= POISON_THRESHOLD) {
      console.warn(`[Outbox] Row poisoned after ${POISON_THRESHOLD} failures:`, key, error);
    }
  } catch (err) {
    console.warn('[Outbox] Error incrementing row failure:', err);
  }
}

/** Clear the poison record for a specific row (called on success). */
export function clearRowPoison(key: string): void {
  try {
    const poison = getPoison();
    if (!poison[key]) return;
    delete poison[key];
    savePoison(poison);
  } catch (err) {
    console.warn('[Outbox] Error clearing row poison:', err);
  }
}

/** Returns all currently poisoned row keys (for UI display). */
export function getPoisonedKeys(): string[] {
  try {
    return Object.entries(getPoison())
      .filter(([, v]) => v.failCount >= POISON_THRESHOLD)
      .map(([k]) => k);
  } catch { return []; }
}

/** Reset all poisoned rows (called on explicit user-triggered sync). */
export function resetAllPoison(): void {
  try { localStorage.removeItem(POISON_KEY); } catch {}
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** Returns true if there is a push that has not yet landed on Supabase. */
export function hasPendingPush(): boolean {
  return get() !== null;
}

/** How many consecutive failures have been recorded. */
export function getPendingAttempts(): number {
  return get()?.attempts ?? 0;
}

/**
 * Record a push failure. Increments the attempt counter.
 * Call this inside the catch block of pushToSupabase().
 */
export function markPushPending(error?: string): void {
  try {
    const existing = get();
    save({
      queuedAt:  existing?.queuedAt ?? new Date().toISOString(),
      attempts:  (existing?.attempts ?? 0) + 1,
      lastError: error,
    });
  } catch (err) {
    console.warn('[Outbox] Error marking push pending:', err);
  }
}

/**
 * Clear the outbox after a confirmed successful push.
 */
export function clearPendingPush(): void {
  try {
    save(null);
  } catch (err) {
    console.warn('[Outbox] Error clearing outbox:', err);
  }
}

/**
 * Reset the attempt counter while keeping the pending flag.
 * Call when the device comes back online so the outbox will retry
 * even if it hit the consecutive-failure limit.
 */
export function resetOutboxAttempts(): void {
  try {
    const existing = get();
    if (!existing) return; // nothing pending — no-op
    save({ ...existing, attempts: 0 });
    console.info('[Outbox] Attempt counter reset — will retry on next drain');
  } catch (err) {
    console.warn('[Outbox] Error resetting attempts:', err);
  }
}

/**
 * Drain the outbox — push current localStorage state to Supabase.
 *
 * Always reads the CURRENT state so it includes every offline mutation,
 * even if many edits happened between failures.
 *
 * Returns true  → push succeeded, outbox is empty.
 * Returns false → push failed (offline, error) or nothing was pending.
 */
export async function drainOutbox(): Promise<boolean> {
  const pending = get();
  if (!pending) return true;       // nothing pending — already in sync
  if (!navigator.onLine) return false;  // wait for 'online' event
  if (pending.attempts > 8) {
    // Persistent failure — skip drain until user action forces a retry.
    // The UI SyncStatusIndicator will show the warning.
    console.warn('[Outbox] Too many consecutive failures, skipping drain until user action');
    return false;
  }

  try {
    // Lazy import to avoid circular dependencies at module evaluation time
    const { pushToSupabase } = await import('./syncEngine');
    const { loadData }       = await import('./dataStore');

    const state = loadData();
    if (!state) {
      console.warn('[Outbox] No local data to drain');
      return false;
    }

    await pushToSupabase(state);
    // clearPendingPush() is called inside pushToSupabase on success,
    // but call it here defensively too.
    clearPendingPush();
    console.info('[Outbox] Drained — state is now in sync with Supabase');
    return true;
  } catch (e) {
    markPushPending(String(e));
    console.warn('[Outbox] Drain failed:', e);
    return false;
  }
}
