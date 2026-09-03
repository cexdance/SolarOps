// One level of undo.
// ─────────────────────────────────────────────────────────────────────────────
// A single in-memory slot holding the PREVIOUS version of only the records a
// mutation touched. Deliberately not a snapshot of the whole AppState: undoing
// by restoring the whole blob would also revert anything a teammate's edit
// merged in between the mutation and the undo, and every record that differed
// would go dirty and be pushed back over theirs. Touched-records-only keeps the
// blast radius equal to what the user actually did.
//
// ponytail: one slot, no redo, cleared on reload. A stale undo button is worse
// than no undo button. Add a stack when one level is demonstrably not enough.

import type { AppState, Customer, Job, RMAEntry } from '../types';
import { unmarkCustomersDeleted, unmarkJobsDeleted, getDeletedCustomerIds, getDeletedJobIds } from './dataStore';
import { pushKeyValue } from './syncEngine';

/** A stale Cmd+Z an hour later must not fire. */
const UNDO_TTL_MS = 60_000;

interface RecordDelta<T> {
  /** Previous version of records that changed or were deleted. Put these back. */
  restore: T[];
  /** Ids that did not exist before the mutation. Remove these. */
  remove: string[];
}

export interface UndoSlot {
  label: string;
  at: number;
  customers: RecordDelta<Customer>;
  jobs: RecordDelta<Job>;
  standaloneRmas: RecordDelta<RMAEntry>;
  /** Ids this mutation tombstoned. Undo must clear these or sync re-hides them. */
  tombstones: { customers: string[]; jobs: string[] };
}

let slot: UndoSlot | null = null;

// ── Diff ────────────────────────────────────────────────────────────────────

function deltaOf<T extends { id: string }>(before: T[], after: T[]): RecordDelta<T> {
  const afterById = new Map(after.map(r => [r.id, r]));
  const restore: T[] = [];
  for (const b of before) {
    const a = afterById.get(b.id);
    // Gone, or changed. JSON compare matches how diffEntity and isDirty decide.
    if (!a || JSON.stringify(a) !== JSON.stringify(b)) restore.push(b);
  }
  const beforeIds = new Set(before.map(r => r.id));
  const remove = after.filter(a => !beforeIds.has(a.id)).map(a => a.id);
  return { restore, remove };
}

/** Ids present before and absent after: exactly the ones a delete/merge tombstones. */
function goneIds<T extends { id: string }>(before: T[], after: T[]): string[] {
  const afterIds = new Set(after.map(r => r.id));
  return before.filter(b => !afterIds.has(b.id)).map(b => b.id);
}

// ── Record ──────────────────────────────────────────────────────────────────

/**
 * Arm the undo slot. Call from user-initiated handlers ONLY, inside the setData
 * updater where `prev` and `next` are both in hand. Never call it from the sync
 * engine or realtime paths: that would hand the user a button that reverts
 * someone else's change.
 */
export function markUndo(label: string, prev: AppState, next: AppState): void {
  const customers = deltaOf(prev.customers ?? [], next.customers ?? []);
  const jobs = deltaOf(prev.jobs ?? [], next.jobs ?? []);
  const standaloneRmas = deltaOf(prev.standaloneRmas ?? [], next.standaloneRmas ?? []);
  const empty = (d: RecordDelta<{ id: string }>) => d.restore.length === 0 && d.remove.length === 0;
  // A handler that only touched config, users, or notifications arms nothing:
  // undo covers records, and an undo button that silently does nothing is worse
  // than an absent one.
  if (empty(customers) && empty(jobs) && empty(standaloneRmas)) return;
  slot = {
    label,
    at: Date.now(),
    customers,
    jobs,
    standaloneRmas,
    tombstones: {
      customers: goneIds(prev.customers ?? [], next.customers ?? []),
      jobs: goneIds(prev.jobs ?? [], next.jobs ?? []),
    },
  };
  // Every call site lives inside a setData updater, which React StrictMode
  // invokes twice. Announcing rather than toasting here keeps undo.ts free of
  // UI, and the listener's fixed toast id collapses the double-fire.
  try {
    window.dispatchEvent(new CustomEvent('solarops:undo-armed', { detail: { label } }));
  } catch { /* non-browser env (tests) */ }
}

/** What undo would revert, or null if nothing is armed / it has expired. */
export function peekUndo(): { label: string } | null {
  if (!slot) return null;
  if (Date.now() - slot.at > UNDO_TTL_MS) { slot = null; return null; }
  return { label: slot.label };
}

/** Take the slot and disarm it. Undo is never itself undoable. */
export function takeUndo(): UndoSlot | null {
  if (!peekUndo()) return null;
  const s = slot;
  slot = null;
  return s;
}

/** Drop the slot without applying it (e.g. on logout or user switch). */
export function clearUndo(): void { slot = null; }

// ── Apply ───────────────────────────────────────────────────────────────────

function applyDelta<T extends { id: string }>(current: T[], d: RecordDelta<T>): T[] {
  const removed = new Set(d.remove);
  const byId = new Map(d.restore.map(r => [r.id, r]));
  const out: T[] = [];
  for (const c of current) {
    if (removed.has(c.id)) continue;
    const prev = byId.get(c.id);
    if (prev) { out.push(prev); byId.delete(c.id); continue; }
    out.push(c);
  }
  // Records the mutation deleted are not in `current`, so append them back.
  for (const r of byId.values()) out.push(r);
  return out;
}

/**
 * Splice the slot's records back into the CURRENT state. Records the mutation
 * never touched are passed through untouched, which is what stops undo from
 * clobbering work that synced in from another device meanwhile.
 */
export function applyUndo(current: AppState, s: UndoSlot): AppState {
  return {
    ...current,
    customers: applyDelta(current.customers ?? [], s.customers),
    jobs: applyDelta(current.jobs ?? [], s.jobs),
    standaloneRmas: applyDelta(current.standaloneRmas ?? [], s.standaloneRmas),
  };
}

/**
 * Un-tombstone what the mutation tombstoned, locally AND remotely.
 *
 * The remote lists are UNIONed into the local ones on every pull
 * (syncEngine.pullFromSupabase), so clearing locally alone is undone by the very
 * next poll. The shortened list has to reach Supabase too.
 *
 * ponytail: another device that still holds the id in its own list re-adds it
 * on its next tombstone push. Single-operator app, seconds-wide undo window, so
 * the race is theoretical. Fix by moving tombstones to per-id rows with a
 * clearedAt stamp if it ever bites.
 */
export async function clearUndoTombstones(s: UndoSlot): Promise<void> {
  const { customers, jobs } = s.tombstones;
  if (customers.length === 0 && jobs.length === 0) return;
  if (customers.length) {
    unmarkCustomersDeleted(customers);
    await pushKeyValue('deleted_customer_ids', Array.from(getDeletedCustomerIds()));
  }
  if (jobs.length) {
    unmarkJobsDeleted(jobs);
    await pushKeyValue('deleted_job_ids', Array.from(getDeletedJobIds()));
  }
}
