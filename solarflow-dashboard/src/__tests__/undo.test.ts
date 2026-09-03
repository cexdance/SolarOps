import { describe, it, expect, beforeEach } from 'vitest';
import { markUndo, peekUndo, takeUndo, applyUndo, clearUndo } from '../lib/undo';
import type { AppState, Customer, Job, RMAEntry } from '../types';

const cust = (id: string, name: string): Customer => ({ id, name } as unknown as Customer);
const job = (id: string, status: string, customerId = 'c1'): Job =>
  ({ id, status, customerId } as unknown as Job);

const rma = (id: string, n: string): RMAEntry => ({ id, rmaNumber: n } as unknown as RMAEntry);

const state = (customers: Customer[], jobs: Job[], standaloneRmas: RMAEntry[] = []): AppState =>
  ({ customers, jobs, standaloneRmas } as unknown as AppState);

describe('undo', () => {
  beforeEach(() => { clearUndo(); });

  it('reverts an edit', () => {
    const prev = state([], [job('j1', 'open')]);
    const next = state([], [job('j1', 'closed')]);
    markUndo('Edited WO', prev, next);

    const s = takeUndo()!;
    expect(s.label).toBe('Edited WO');
    expect(applyUndo(next, s).jobs[0].status).toBe('open');
  });

  it('restores a deleted record and reports its tombstone', () => {
    const prev = state([cust('c1', 'Ferrari')], [job('j1', 'open')]);
    const next = state([], []);
    markUndo('Deleted Ferrari', prev, next);

    const s = takeUndo()!;
    expect(s.tombstones.customers).toEqual(['c1']);
    expect(s.tombstones.jobs).toEqual(['j1']);

    const back = applyUndo(next, s);
    expect(back.customers.map(c => c.id)).toEqual(['c1']);
    expect(back.jobs.map(j => j.id)).toEqual(['j1']);
  });

  it('removes a created record', () => {
    const prev = state([], []);
    const next = state([], [job('j1', 'open')]);
    markUndo('Created WO', prev, next);

    expect(applyUndo(next, takeUndo()!).jobs).toEqual([]);
  });

  // The whole reason undo stores touched records instead of the whole AppState:
  // a teammate's edit that landed after the snapshot must survive the undo.
  it('leaves records the mutation never touched alone', () => {
    const prev = state([], [job('j1', 'open'), job('j2', 'open')]);
    const next = state([], [job('j1', 'closed'), job('j2', 'open')]);
    markUndo('Edited j1', prev, next);

    // j2 changes remotely between the mutation and the undo.
    const current = state([], [job('j1', 'closed'), job('j2', 'invoiced')]);
    const back = applyUndo(current, takeUndo()!);

    expect(back.jobs.find(j => j.id === 'j1')!.status).toBe('open');
    expect(back.jobs.find(j => j.id === 'j2')!.status).toBe('invoiced');
  });

  it('arms nothing for a no-op edit', () => {
    const s = state([], [job('j1', 'open')]);
    markUndo('No change', s, state([], [job('j1', 'open')]));
    expect(peekUndo()).toBeNull();
  });

  it('covers standalone RMAs', () => {
    const prev = state([], [], [rma('r1', 'RMA-1')]);
    const next = state([], [], [rma('r1', 'RMA-2')]);
    markUndo('Edited RMA', prev, next);
    expect(applyUndo(next, takeUndo()!).standaloneRmas[0].rmaNumber).toBe('RMA-1');
  });

  it('is single-use', () => {
    markUndo('Edited WO', state([], [job('j1', 'open')]), state([], [job('j1', 'closed')]));
    expect(takeUndo()).not.toBeNull();
    expect(takeUndo()).toBeNull();
  });
});
