/**
 * Phase 3: a contractor session must not pull customer:/job: rows.
 *
 * The portal's filtering was always client-side, so a contractor's token could
 * read all 416 customer records straight from PostgREST. Phase 3 moves the
 * contractor read onto GET /api/contractor-jobs, which scopes by the verified
 * token. This file asserts the pull actually stops, because the failure mode is
 * silent: everything still renders while the wide query keeps going out.
 *
 * The other half is the queries that must KEEP running. Contractor mode still
 * needs the KV keys: solarflow_contractors and solarflow_service_rates feed the
 * portal, and ContractorDashboard writes solarflow_crm_data, which has no merger,
 * so a client that stopped pulling it would push a stale blob over staff leads.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const seen = vi.hoisted(() => ({
  likes: [] as string[],      // prefix pulls: the patterns passed to .like()
  ins:   [] as string[][],    // KV pull: the key lists passed to .in()
}));

const authedFetch = vi.hoisted(() => vi.fn());
const getSession  = vi.hoisted(() => vi.fn());

vi.mock('../lib/supabase', () => {
  // Minimal PostgREST builder. Thenable so `await q` resolves, and recording so
  // a test can assert what was asked for rather than only what came back.
  const builder = () => {
    const b: Record<string, unknown> = {};
    Object.assign(b, {
      select: () => b,
      like: (_col: string, pattern: string) => { seen.likes.push(pattern); return b; },
      gt: () => b,
      in: (_col: string, keys: string[]) => { seen.ins.push(keys); return Promise.resolve({ data: [], error: null }); },
      then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null }),
    });
    return b;
  };
  return {
    supabase: { from: () => builder(), auth: { getSession } },
    authedFetch,
  };
});

vi.mock('../lib/stateStore', () => ({
  idbGetState: vi.fn(async () => null),
  idbSetState: vi.fn(async () => undefined),
}));

import { pullFromSupabase } from '../lib/syncEngine';

const LAST_SYNC_KEY = 'solarops_last_record_sync';

const session = (role: string | undefined) => ({
  data: { session: { access_token: 't', user: { email: 'a@b.com', user_metadata: role ? { role } : {} } } },
});

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

const pulledPrefixes = () => seen.likes.filter(p => p.startsWith('customer:') || p.startsWith('job:'));

beforeEach(() => {
  seen.likes.length = 0;
  seen.ins.length = 0;
  vi.clearAllMocks();
  localStorage.clear();
});

describe('staff sessions are unchanged', () => {
  it('still pulls the customer: and job: prefixes, and never calls the endpoint', async () => {
    getSession.mockResolvedValue(session('admin'));
    await pullFromSupabase();

    expect(pulledPrefixes()).toEqual(expect.arrayContaining(['customer:%', 'job:%']));
    expect(authedFetch).not.toHaveBeenCalled();
  });
});

describe('contractor sessions read from the scoped endpoint', () => {
  beforeEach(() => getSession.mockResolvedValue(session('contractor')));

  it('issues NO customer: or job: prefix query', async () => {
    authedFetch.mockResolvedValue(ok({ jobs: [], customers: [], contractorJobs: [] }));
    await pullFromSupabase();

    // The whole point of the phase. Anything here means the boundary is open.
    expect(pulledPrefixes()).toEqual([]);
  });

  it('calls GET /api/contractor-jobs and returns what it gave back', async () => {
    authedFetch.mockResolvedValue(ok({
      jobs: [{ id: 'j1', contractorId: 'contractor-2', customerId: 'c1' }],
      customers: [{ id: 'c1', name: 'Alice' }],
      contractorJobs: [],
    }));
    const result = await pullFromSupabase();

    expect(authedFetch).toHaveBeenCalledWith('/api/contractor-jobs');
    expect(result?.jobs).toHaveLength(1);
    expect(result?.customers).toHaveLength(1);
  });

  it('STILL pulls the KV keys the portal depends on', async () => {
    authedFetch.mockResolvedValue(ok({ jobs: [], customers: [], contractorJobs: [] }));
    await pullFromSupabase();

    const kvKeys = seen.ins.flat();
    expect(kvKeys).toContain('solarflow_contractors');
    expect(kvKeys).toContain('solarflow_service_rates');
    // No merger on this one: dropping it would let a stale client blob
    // overwrite every staff lead on the next upsell flag.
    expect(kvKeys).toContain('solarflow_crm_data');
  });

  it('does not advance the sync cursor', async () => {
    // The endpoint returns the record's own client-stamped updatedAt, not
    // app_data.updated_at. Writing that as a cursor is the documented skew bug.
    authedFetch.mockResolvedValue(ok({
      jobs: [{ id: 'j1', updatedAt: '2099-01-01T00:00:00Z' }],
      customers: [], contractorJobs: [],
    }));
    await pullFromSupabase();

    expect(localStorage.getItem(LAST_SYNC_KEY)).toBeNull();
  });
});

describe('when the endpoint fails it must not fall back to the wide pull', () => {
  beforeEach(() => getSession.mockResolvedValue(session('contractor')));

  it('returns nothing rather than pulling every customer on a non-2xx', async () => {
    authedFetch.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    const result = await pullFromSupabase();

    expect(pulledPrefixes()).toEqual([]);
    expect(result?.customers).toBeUndefined();
    expect(result?.jobs).toBeUndefined();
  });

  it('returns nothing rather than pulling every customer when the request throws', async () => {
    authedFetch.mockRejectedValue(new Error('offline'));
    const result = await pullFromSupabase();

    expect(pulledPrefixes()).toEqual([]);
    expect(result?.customers).toBeUndefined();
  });
});
