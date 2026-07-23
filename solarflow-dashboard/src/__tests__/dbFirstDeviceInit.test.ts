/**
 * Tests for the first-device-init path in src/lib/db.ts (syncFromDB).
 *
 * Scenario: the local state store is empty (brand-new device). syncFromDB should
 * seed it with { ...defaults, ...remote } so the app has a working initial state.
 * A second call (store now populated) must NOT re-seed over the existing data --
 * it must use the normal mergeRemote path instead.
 *
 * The local tier is IndexedDB (src/lib/stateStore). jsdom has no IndexedDB, so we
 * mock stateStore with an in-memory holder (same approach as stateStore.test.ts's
 * fake). pullFromSupabase / mergeRemote are mocked for determinism.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AppState } from '../types';

// In-memory stand-in for the IDB state store. vi.hoisted so the mock factory
// (hoisted above imports) can reference it.
const idb = vi.hoisted(() => ({ value: null as AppState | null }));

vi.mock('../lib/stateStore', () => ({
  idbGetState: vi.fn(async () => idb.value),
  idbSetState: vi.fn(async (s: AppState) => { idb.value = s; }),
}));

vi.mock('../lib/syncEngine', () => ({
  pushToSupabase:   vi.fn().mockResolvedValue(undefined),
  pushKeyValue:     vi.fn().mockResolvedValue(undefined),
  pullFromSupabase: vi.fn(),
  // mergeRemote default: pass local through unchanged
  mergeRemote:      vi.fn((local: unknown) => local),
  isKVSyncKey:      vi.fn(() => false),
}));

// dataStore is imported dynamically inside syncFromDB so we do NOT mock it.
// The real generateDefaultState provides a deterministic default shape.

import { syncFromDB } from '../lib/db';
import { pullFromSupabase, mergeRemote } from '../lib/syncEngine';

function makeRemotePayload(extra: Partial<AppState> = {}): Partial<AppState> {
  return { customers: [], jobs: [], ...extra };
}

// ---------------------------------------------------------------------------

describe('syncFromDB - first-device-init path', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(mergeRemote).mockImplementation((local: unknown) => local as AppState);
    idb.value = null;
    localStorage.clear();
  });

  it('seeds the state store with defaults merged over remote when it is empty', async () => {
    vi.mocked(pullFromSupabase).mockResolvedValue(makeRemotePayload());

    expect(idb.value).toBeNull();

    await syncFromDB();

    expect(idb.value).not.toBeNull();
    expect(Array.isArray(idb.value!.customers)).toBe(true);
    expect(Array.isArray(idb.value!.jobs)).toBe(true);
  });

  it('does not call mergeRemote on the first-init path (returns early after seeding)', async () => {
    vi.mocked(pullFromSupabase).mockResolvedValue(makeRemotePayload());

    await syncFromDB();

    expect(mergeRemote).not.toHaveBeenCalled();
  });

  it('remote data wins over default values when both provide the same top-level key', async () => {
    const remoteCustomers = [
      {
        id: 'remote-c1',
        name: 'Remote Customer',
        email: 'remote@example.com',
        phone: '555-9999',
        address: '9 Remote Rd',
        city: 'Tampa',
        state: 'FL',
        zip: '33601',
        type: 'residential' as const,
        createdAt: '2025-01-01T00:00:00Z',
        notes: '',
      },
    ];
    vi.mocked(pullFromSupabase).mockResolvedValue(
      makeRemotePayload({ customers: remoteCustomers }),
    );

    await syncFromDB();

    // Remote customers must replace the default seed customers
    expect(idb.value!.customers).toHaveLength(1);
    expect(idb.value!.customers[0].id).toBe('remote-c1');
  });

  it('does not re-seed when the store already has data on a second call', async () => {
    // First call: empty store -- seeds defaults
    vi.mocked(pullFromSupabase).mockResolvedValue(makeRemotePayload());
    await syncFromDB();
    expect(idb.value).not.toBeNull();

    // Simulate a user mutation that happened after the first seed
    idb.value = {
      ...idb.value!,
      customers: [
        {
          id: 'local-c1',
          name: 'Local Customer',
          email: 'local@example.com',
          phone: '555-1111',
          address: '1 Local Ave',
          city: 'Orlando',
          state: 'FL',
          zip: '32801',
          type: 'residential',
          createdAt: '2025-06-01T00:00:00Z',
          notes: '',
        },
      ],
    } as AppState;

    // Second call: store is now populated -- must use mergeRemote, not re-seed
    vi.mocked(pullFromSupabase).mockResolvedValue(makeRemotePayload());
    await syncFromDB();

    expect(mergeRemote).toHaveBeenCalledTimes(1);
    // The local customer from the mutation must survive (mock returns local)
    expect(idb.value!.customers[0].id).toBe('local-c1');
  });

  it('returns without writing the store when pullFromSupabase returns null (no session)', async () => {
    vi.mocked(pullFromSupabase).mockResolvedValue(null);

    await syncFromDB();

    expect(idb.value).toBeNull();
    expect(mergeRemote).not.toHaveBeenCalled();
  });
});
