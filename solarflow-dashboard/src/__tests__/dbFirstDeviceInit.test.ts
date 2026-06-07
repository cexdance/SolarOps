/**
 * Tests for the first-device-init path in src/lib/db.ts (syncFromDB).
 *
 * Scenario: localStorage is empty (brand-new device). syncFromDB should seed
 * localStorage with { ...defaults, ...remote } so the app has a working initial
 * state. A second call (localStorage now populated) must NOT re-seed over the
 * existing data -- it must use the normal mergeRemote path instead.
 *
 * We mock pullFromSupabase and mergeRemote so these tests are deterministic and
 * require no network.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock is hoisted. Variables used inside the factory must be defined with
// vi.fn() inline -- they cannot reference module-scope variables.
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
import type { AppState } from '../types';

// Minimal remote payload that pullFromSupabase returns when a user has data.
function makeRemotePayload(extra: Partial<AppState> = {}): Partial<AppState> {
  return {
    customers: [],
    jobs: [],
    ...extra,
  };
}

const STORAGE_KEY = 'solarflow_data';

// ---------------------------------------------------------------------------

describe('syncFromDB - first-device-init path', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Re-apply the default pass-through for mergeRemote after resetAllMocks
    vi.mocked(mergeRemote).mockImplementation((local: unknown) => local as AppState);
    localStorage.clear();
  });

  it('seeds localStorage with defaults merged over remote when storage is empty', async () => {
    const remote = makeRemotePayload();
    vi.mocked(pullFromSupabase).mockResolvedValue(remote);

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    await syncFromDB();

    const stored = localStorage.getItem(STORAGE_KEY);
    expect(stored).not.toBeNull();

    const parsed = JSON.parse(stored!) as AppState;
    expect(Array.isArray(parsed.customers)).toBe(true);
    expect(Array.isArray(parsed.jobs)).toBe(true);
  });

  it('does not call mergeRemote on the first-init path (returns early after seeding)', async () => {
    vi.mocked(pullFromSupabase).mockResolvedValue(makeRemotePayload());

    await syncFromDB();

    // mergeRemote must NOT have been called -- the early-return path skips it
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

    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppState;
    // Remote customers must replace the default seed customers
    expect(parsed.customers).toHaveLength(1);
    expect(parsed.customers[0].id).toBe('remote-c1');
  });

  it('does not re-seed when localStorage already has data on a second call', async () => {
    // First call: empty storage -- seeds defaults
    vi.mocked(pullFromSupabase).mockResolvedValue(makeRemotePayload());
    await syncFromDB();

    const firstValue = localStorage.getItem(STORAGE_KEY);
    expect(firstValue).not.toBeNull();

    // Simulate a user mutation that happened after the first seed
    const mutated = JSON.parse(firstValue!) as AppState;
    mutated.customers = [
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
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mutated));

    // Second call: storage is now populated -- must use mergeRemote, not re-seed
    vi.mocked(pullFromSupabase).mockResolvedValue(makeRemotePayload());
    await syncFromDB();

    expect(mergeRemote).toHaveBeenCalledTimes(1);

    // The local customer from the mutation must survive (mock returns local)
    const afterSecondSync = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as AppState;
    expect(afterSecondSync.customers[0].id).toBe('local-c1');
  });

  it('returns without writing storage when pullFromSupabase returns null (no session)', async () => {
    vi.mocked(pullFromSupabase).mockResolvedValue(null);

    await syncFromDB();

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(mergeRemote).not.toHaveBeenCalled();
  });
});
