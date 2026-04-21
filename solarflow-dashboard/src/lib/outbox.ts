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

const OUTBOX_KEY = 'solarops_outbox_v1';

interface PendingPush {
  queuedAt: string;   // ISO — when the first failure was recorded
  attempts: number;   // consecutive failure count
  lastError?: string; // last error message for debugging
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
  } catch {}
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
  const existing = get();
  save({
    queuedAt:  existing?.queuedAt ?? new Date().toISOString(),
    attempts:  (existing?.attempts ?? 0) + 1,
    lastError: error,
  });
}

/**
 * Clear the outbox after a confirmed successful push.
 */
export function clearPendingPush(): void {
  save(null);
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

    await pushToSupabase(loadData());
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
