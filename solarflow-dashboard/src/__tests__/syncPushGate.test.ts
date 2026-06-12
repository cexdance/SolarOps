/**
 * Regression tests for the 2026-06-12 mass-overwrite incident.
 *
 * A session that loaded stale/seed local data pushed ALL of it before its
 * first successful pull (the in-memory dirty map starts empty, so every
 * record counted as dirty). 269 customer rows were blind-upserted as seed
 * skeletons, wiping notes, files and contact data server-side.
 *
 * Covers:
 *  1. Session push gate: pushToSupabase refuses to push until the session
 *     has completed one successful pull (markSessionPulled).
 *  2. Stale-write guard: rows whose SERVER copy is strictly newer are
 *     dropped from the push instead of overwriting fresher data.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

interface MockRow { key: string; updatedAt: string | null }

const mock = {
  session: { user: { id: 'test-user' } } as object | null,
  serverRows: [] as MockRow[],
  upserts: [] as Array<Array<{ key: string; value: unknown }>>,
};

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: mock.session } }),
    },
    from: () => ({
      select: () => ({
        in: async (_col: string, keys: string[]) => ({
          data: mock.serverRows.filter(r => keys.includes(r.key)),
          error: null,
        }),
      }),
      upsert: async (rows: Array<{ key: string; value: unknown }>) => {
        mock.upserts.push(rows);
        return { error: null };
      },
    }),
  },
  authedFetch: vi.fn(),
}));

import { pushToSupabase, markSessionPulled } from '../lib/syncEngine';
import type { AppState, Customer } from '../types';

function makeCustomer(id: string, updatedAt: string): Customer {
  return {
    id,
    name: `Customer ${id}`,
    email: `${id}@example.com`,
    phone: '555-0000',
    address: '1 Main St',
    city: 'Orlando',
    state: 'FL',
    zip: '32801',
    type: 'residential',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt,
    notes: '',
  } as Customer;
}

function makeState(customers: Customer[]): AppState {
  return {
    users: [],
    customers,
    jobs: [],
    xeroConfig: { connected: false },
    solarEdgeConfig: { apiKey: '' },
    currentUser: null,
    notifications: [],
    solarEdgeExtraSites: [],
  } as unknown as AppState;
}

beforeEach(() => {
  localStorage.clear();
  mock.session = { user: { id: 'test-user' } };
  mock.serverRows = [];
  mock.upserts = [];
  markSessionPulled(false);
});

describe('session push gate', () => {
  it('blocks all pushes before the first successful pull', async () => {
    const state = makeState([makeCustomer('c1', '2026-06-12T01:00:00Z')]);
    await pushToSupabase(state);
    expect(mock.upserts).toHaveLength(0);
  });

  it('allows pushes after markSessionPulled', async () => {
    markSessionPulled();
    const state = makeState([makeCustomer('c1', '2026-06-12T01:00:00Z')]);
    await pushToSupabase(state);
    const pushedKeys = mock.upserts.flat().map(r => r.key);
    expect(pushedKeys).toContain('customer:c1');
  });
});

describe('stale-write guard', () => {
  beforeEach(() => markSessionPulled());

  it('drops rows whose server copy is strictly newer', async () => {
    mock.serverRows = [{ key: 'customer:c1', updatedAt: '2026-06-12T14:00:00Z' }];
    const state = makeState([makeCustomer('c1', '2026-06-12T01:00:00Z')]); // older local
    await pushToSupabase(state);
    const pushedKeys = mock.upserts.flat().map(r => r.key);
    expect(pushedKeys).not.toContain('customer:c1');
  });

  it('pushes rows whose local copy is newer than the server', async () => {
    mock.serverRows = [{ key: 'customer:c1', updatedAt: '2026-06-12T01:00:00Z' }];
    const state = makeState([makeCustomer('c1', '2026-06-12T14:00:00Z')]); // newer local edit
    await pushToSupabase(state);
    const pushedKeys = mock.upserts.flat().map(r => r.key);
    expect(pushedKeys).toContain('customer:c1');
  });

  it('pushes rows with equal timestamps (same-baseline edit)', async () => {
    mock.serverRows = [{ key: 'customer:c1', updatedAt: '2026-06-12T01:00:00Z' }];
    const state = makeState([makeCustomer('c1', '2026-06-12T01:00:00Z')]);
    await pushToSupabase(state);
    const pushedKeys = mock.upserts.flat().map(r => r.key);
    expect(pushedKeys).toContain('customer:c1');
  });

  it('pushes brand-new rows that do not exist on the server', async () => {
    mock.serverRows = [];
    const state = makeState([makeCustomer('c-new', '2026-06-12T01:00:00Z')]);
    await pushToSupabase(state);
    const pushedKeys = mock.upserts.flat().map(r => r.key);
    expect(pushedKeys).toContain('customer:c-new');
  });

  it('a dropped stale row stays dropped until its content changes again', async () => {
    mock.serverRows = [{ key: 'customer:c1', updatedAt: '2026-06-12T14:00:00Z' }];
    const stale = makeCustomer('c1', '2026-06-12T01:00:00Z');
    await pushToSupabase(makeState([stale]));
    expect(mock.upserts.flat().map(r => r.key)).not.toContain('customer:c1');

    // Same content again: marked clean by the guard, no second check/push.
    await pushToSupabase(makeState([stale]));
    expect(mock.upserts.flat().map(r => r.key)).not.toContain('customer:c1');

    // A real local edit changes content AND carries a fresh edit-time stamp:
    // it must go through.
    const edited = { ...stale, name: 'Edited Name', updatedAt: '2026-06-12T15:00:00Z' };
    await pushToSupabase(makeState([edited]));
    expect(mock.upserts.flat().map(r => r.key)).toContain('customer:c1');
  });
});
