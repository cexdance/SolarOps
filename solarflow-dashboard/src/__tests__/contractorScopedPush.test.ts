/**
 * Phase 4: a contractor session must not PUSH customer:/job: rows.
 *
 * Phase 3 (contractorScopedPull.test.ts) stopped contractors READING those
 * prefixes but left the write direction open, and it was not merely latent:
 * pullContractorScope returns the endpoint's jobs WITHOUT markClean, and
 * isDirty() treats a key with no baseline as dirty, so every job the endpoint
 * handed back was pushed straight back up as an admin job:{id} row.
 *
 * This is also the client half of the app_data RLS policy that denies
 * contractors customer:/job: access. If this guard regresses while that policy
 * is live, every contractor push throws on a policy violation and their sync
 * stops, so this test protects the portal as much as the data.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const pushed = vi.hoisted(() => ({ keys: [] as string[] }));
const getSession = vi.hoisted(() => vi.fn());

vi.mock('../lib/supabase', () => {
  const builder = () => {
    const b: Record<string, unknown> = {};
    Object.assign(b, {
      select: () => b,
      like: () => b,
      gt: () => b,
      in: () => Promise.resolve({ data: [], error: null }),
      upsert: (rows: Array<{ key: string }>) => {
        for (const r of rows) pushed.keys.push(r.key);
        return Promise.resolve({ data: null, error: null });
      },
      then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null }),
    });
    return b;
  };
  return {
    supabase: { from: () => builder(), auth: { getSession } },
    authedFetch: vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ jobs: [], customers: [], contractorJobs: [] }) })),
  };
});

vi.mock('../lib/stateStore', () => ({
  idbGetState: vi.fn(async () => null),
  idbSetState: vi.fn(async () => undefined),
}));

import { pushToSupabase, markSessionPulled } from '../lib/syncEngine';
import type { AppState } from '../types';

const session = (role: string) => ({
  data: { session: { access_token: 't', user: { email: 'a@b.com', user_metadata: { role } } } },
});

// Each test needs its OWN ids. syncEngine's `_lastPushed` dirty map is
// module-level and survives between tests in this file, so reusing ids lets an
// earlier test markClean them and the next one silently pushes nothing, which
// reads as a pass for the contractor case. Unique ids keep every test honest.
const state = (tag: string): AppState => ({
  customers: [{ id: `c-${tag}`, name: 'Alice', updatedAt: '2026-01-01T00:00:00Z' }],
  jobs: [{ id: `j-${tag}`, customerId: `c-${tag}`, updatedAt: '2026-01-01T00:00:00Z' }],
} as unknown as AppState);

beforeEach(() => {
  pushed.keys.length = 0;
  vi.clearAllMocks();
  localStorage.clear();
  markSessionPulled(true); // satisfy the push gate
});

const rowKeys = () => pushed.keys.filter(k => k.startsWith('customer:') || k.startsWith('job:'));

describe('contractor sessions', () => {
  it('push NO customer: or job: rows', async () => {
    getSession.mockResolvedValue(session('contractor'));
    await pushToSupabase(state('contractor'));
    // Anything here means a contractor is writing admin records, and once the
    // app_data RLS policy is live it also means their sync is about to break.
    expect(rowKeys()).toEqual([]);
  });
});

describe('staff sessions are unchanged', () => {
  it('still push customer: and job: rows', async () => {
    getSession.mockResolvedValue(session('admin'));
    await pushToSupabase(state('admin'));
    expect(rowKeys()).toEqual(expect.arrayContaining(['customer:c-admin', 'job:j-admin']));
  });

  it('treat a user with no role as staff, matching isContractorAccount', async () => {
    getSession.mockResolvedValue({
      data: { session: { access_token: 't', user: { email: 'a@b.com', user_metadata: {} } } },
    });
    await pushToSupabase(state('norole'));
    expect(rowKeys()).toEqual(expect.arrayContaining(['customer:c-norole', 'job:j-norole']));
  });
});
