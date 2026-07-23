import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AppState } from '../types';

// hydrateData resolves the local state from IndexedDB (via stateStore) and, when
// there is NO local state, must reset the sync cursor so the startup pull is a
// FULL reconcile. This guards the regression that splitting the blob (IDB) from
// the cursor (localStorage) introduced: if IDB is evicted while the cursor
// survives, an incremental pull into an empty store would look like mass data loss.

const store = vi.hoisted(() => ({ next: null as AppState | null }));

vi.mock('../lib/stateStore', () => ({
  idbGetState:         vi.fn(async () => store.next),
  idbSetState:         vi.fn(async () => {}),
  hydrateStateFromIdb: vi.fn(async () => store.next),
}));

vi.mock('../lib/syncEngine', () => ({
  resetSyncCursor: vi.fn(),
}));

vi.mock('../lib/db', () => ({
  dbSet: vi.fn().mockResolvedValue(undefined),
}));

import { hydrateData, __resetSnapshotForTests } from '../lib/dataStore';
import { resetSyncCursor } from '../lib/syncEngine';

describe('hydrateData cursor reset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetSnapshotForTests();
    localStorage.clear();
    store.next = null;
  });

  it('resets the sync cursor when there is no local state (IDB evicted / first boot)', async () => {
    store.next = null;
    await hydrateData();
    expect(resetSyncCursor).toHaveBeenCalledTimes(1);
  });

  it('does NOT reset the cursor when local state is present (normal boot)', async () => {
    store.next = { customers: [{ id: 'c1' }], jobs: [] } as unknown as AppState;
    const state = await hydrateData();
    expect(resetSyncCursor).not.toHaveBeenCalled();
    expect(state.customers.some(c => c.id === 'c1')).toBe(true);
  });
});
