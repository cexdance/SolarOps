/**
 * Phase 2: the scoped contractor read endpoint (repo-root api/contractor-jobs.ts).
 *
 * Note the import path: `../../../api/` is the tree Vercel deploys.
 *
 * The case that matters most is impersonation. Before this endpoint, the
 * contractor portal pulled the entire dataset and filtered in the browser, so a
 * contractor's token could read all 416 customer records directly from the REST
 * API. The endpoint closes that only if the contractor identity comes from the
 * verified token and NOTHING else. A `?contractorId=` escape hatch would recreate
 * the exact bug, so there is a test asserting the parameter is ignored.
 *
 * Measured against production while writing this: contractor-2 has 57 jobs, 5 of
 * them in contractor-visible statuses, referencing 5 distinct customers. So the
 * payload goes from 155 jobs + 416 customers to 5 + 5.
 *
 * 2026-08-04, Phase 3 gate: contractor-job rows are now selected by the job ids
 * already scoped to the caller, not by the contractorId stamped on the row. See
 * the reassignment describe block at the bottom for why. Live payload also went
 * 194.2 KB to 98.3 KB, since 62 of contractor-2's 67 rows were for jobs the
 * portal never renders.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import handler from '../../../api/contractor-jobs';

const APPROVED = { id: 'contractor-2', email: 'bob@vendor.com', status: 'approved' };
const PENDING  = { id: 'contractor-9', email: 'new@vendor.com', status: 'pending' };

/** Vercel res stub that records what the handler wrote. */
function mockRes() {
  const seen: { code?: number; body?: unknown; headers: Record<string, string> } = { headers: {} };
  const res = {
    seen,
    status: vi.fn((c: number) => { seen.code = c; return res; }),
    json:   vi.fn((b: unknown) => { seen.body = b; return res; }),
    setHeader: vi.fn((k: string, v: string) => { seen.headers[k] = v; return res; }),
  };
  return res;
}

const req = (over: Record<string, unknown> = {}) => ({
  method: 'GET',
  headers: { authorization: 'Bearer good' },
  query: {},
  ...over,
} as never);

/**
 * Routes each outbound fetch by URL. `calls` records every request so a test can
 * assert what the handler asked the database for, not just what it returned.
 */
const calls: string[] = [];
function mockFetch(opts: {
  authUser?: unknown;
  contractors?: unknown[];
  jobs?: unknown[];
  contractorJobs?: unknown[];
  customers?: unknown[];
}) {
  return vi.fn(async (url: string) => {
    calls.push(String(url));
    const u = String(url);
    const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (u.includes('/auth/v1/user')) return ok(opts.authUser ?? { id: 'u1', email: APPROVED.email });
    if (u.includes('solarflow_contractors')) return ok([{ value: opts.contractors ?? [APPROVED, PENDING] }]);
    if (u.includes('key=like.job'))
      return ok((opts.jobs ?? []).map(v => ({ value: v })));
    // Both scoped lookups are `key=in.(...)`, told apart by the prefix inside.
    // The handler asks for exact row keys, so answer only the ones it asked for:
    // a mock that returns everything cannot catch a query that scopes wrongly.
    if (u.includes('key=in.') && u.includes('contractor_job'))
      return ok((opts.contractorJobs ?? [])
        .filter((v) => u.includes(`contractor_job%3A${(v as { sourceJobId?: string }).sourceJobId}`))
        .map(v => ({ value: v })));
    if (u.includes('key=in.'))
      return ok((opts.customers ?? []).map(v => ({ value: v })));
    return ok([]);
  }) as unknown as typeof fetch;
}

beforeEach(() => { calls.length = 0; vi.restoreAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('method and auth gates', () => {
  it('405s anything that is not a GET', async () => {
    const res = mockRes();
    await handler(req({ method: 'POST' }), res as never);
    expect(res.seen.code).toBe(405);
  });

  it('401s a request with no bearer token, without touching the database', async () => {
    vi.stubGlobal('fetch', mockFetch({}));
    const res = mockRes();
    await handler(req({ headers: {} }), res as never);
    expect(res.seen.code).toBe(401);
    expect(calls.some(c => c.includes('app_data'))).toBe(false);
  });
});

describe('only approved contractors get through', () => {
  it('403s a signed-in account that is not in the contractor directory', async () => {
    vi.stubGlobal('fetch', mockFetch({ authUser: { id: 'u1', email: 'staff@conexsol.us' } }));
    const res = mockRes();
    await handler(req(), res as never);
    expect(res.seen.code).toBe(403);
  });

  it('403s a contractor whose status is not approved', async () => {
    vi.stubGlobal('fetch', mockFetch({ authUser: { id: 'u9', email: PENDING.email } }));
    const res = mockRes();
    await handler(req(), res as never);
    expect(res.seen.code).toBe(403);
  });

  it('gives the same 403 message either way, so it does not leak which case applies', async () => {
    vi.stubGlobal('fetch', mockFetch({ authUser: { id: 'u1', email: 'staff@conexsol.us' } }));
    const a = mockRes(); await handler(req(), a as never);
    vi.stubGlobal('fetch', mockFetch({ authUser: { id: 'u9', email: PENDING.email } }));
    const b = mockRes(); await handler(req(), b as never);
    expect(a.seen.body).toEqual(b.seen.body);
  });
});

describe('identity comes from the token, never the request', () => {
  it('IGNORES ?contractorId= and scopes to the caller', async () => {
    // The whole point. If this ever passes the query param through, any
    // contractor can read any other contractor's work orders.
    vi.stubGlobal('fetch', mockFetch({ authUser: { id: 'u1', email: APPROVED.email } }));
    const res = mockRes();
    await handler(req({ query: { contractorId: 'contractor-9' } }), res as never);

    expect((res.seen.body as { contractorId: string }).contractorId).toBe('contractor-2');
    const jobQuery = calls.find(c => c.includes('key=like.job')) ?? '';
    expect(jobQuery).toContain('contractor-2');
    expect(jobQuery).not.toContain('contractor-9');
  });

  it('matches on altEmails too, mirroring resolveSessionRoute', async () => {
    vi.stubGlobal('fetch', mockFetch({
      authUser: { id: 'u1', email: 'alias@vendor.com' },
      contractors: [{ ...APPROVED, altEmails: ['alias@vendor.com'] }],
    }));
    const res = mockRes();
    await handler(req(), res as never);
    expect((res.seen.body as { contractorId: string }).contractorId).toBe('contractor-2');
  });
});

describe('the payload is scoped', () => {
  const jobs = [
    { id: 'j1', contractorId: 'contractor-2', customerId: 'c1', woStatus: 'assigned' },
    { id: 'j2', contractorId: 'contractor-2', customerId: 'c2', woStatus: 'completed' },
    { id: 'j3', contractorId: 'contractor-2', customerId: 'c3', woStatus: 'draft' },
  ];

  it('drops jobs whose status is not contractor-visible', async () => {
    vi.stubGlobal('fetch', mockFetch({ authUser: { id: 'u1', email: APPROVED.email }, jobs }));
    const res = mockRes();
    await handler(req(), res as never);
    const body = res.seen.body as { jobs: Array<{ id: string }> };
    expect(body.jobs.map(j => j.id)).toEqual(['j1', 'j2']);
  });

  it('requests ONLY the customers those visible jobs reference', async () => {
    vi.stubGlobal('fetch', mockFetch({ authUser: { id: 'u1', email: APPROVED.email }, jobs }));
    await handler(req(), mockRes() as never);
    const custQuery = calls.find(c => c.includes('key=in.') && c.includes('customer')) ?? '';
    expect(custQuery).toContain('c1');
    expect(custQuery).toContain('c2');
    // c3's job was filtered out by status, so its customer must not be fetched.
    expect(custQuery).not.toContain('c3');
  });

  it('requests ONLY the contractor-job rows for those visible jobs', async () => {
    vi.stubGlobal('fetch', mockFetch({ authUser: { id: 'u1', email: APPROVED.email }, jobs }));
    await handler(req(), mockRes() as never);
    const cjQuery = calls.find(c => c.includes('key=in.') && c.includes('contractor_job')) ?? '';
    expect(cjQuery).toContain('j1');
    expect(cjQuery).toContain('j2');
    expect(cjQuery).not.toContain('j3');
  });

  it('skips both scoped queries entirely when there are no visible jobs', async () => {
    vi.stubGlobal('fetch', mockFetch({ authUser: { id: 'u1', email: APPROVED.email }, jobs: [] }));
    await handler(req(), mockRes() as never);
    expect(calls.some(c => c.includes('key=in.'))).toBe(false);
  });

  it('marks the response private so it is never cached by a shared proxy', async () => {
    vi.stubGlobal('fetch', mockFetch({ authUser: { id: 'u1', email: APPROVED.email }, jobs }));
    const res = mockRes();
    await handler(req(), res as never);
    expect(res.seen.headers['Cache-Control']).toContain('no-store');
  });
});

/**
 * Reassignment. When admin moves a job to a different contractor the JOB's
 * contractorId changes but the contractor_job ROW keeps the old stamp, so the
 * two disagree. Six such rows were live on 2026-08-04, two of them on jobs a
 * contractor could see. Selecting the rows by that stamp broke both ways, which
 * is why they are now selected by the (already token-scoped) job ids instead.
 */
describe('a job reassigned between contractors', () => {
  const MINE = { id: 'j1', contractorId: 'contractor-2', customerId: 'c1', woStatus: 'scheduled' };

  it('still returns the contractor-job row when the row carries a STALE contractorId', async () => {
    // Without this, the portal re-projects the work order as cj-view-* and the
    // contractor's next save overwrites photos, parts, signature and invoice.
    vi.stubGlobal('fetch', mockFetch({
      authUser: { id: 'u1', email: APPROVED.email },
      jobs: [MINE],
      contractorJobs: [{ id: 'cj-real', sourceJobId: 'j1', contractorId: 'contractor-5' }],
    }));
    const res = mockRes();
    await handler(req(), res as never);
    const body = res.seen.body as { contractorJobs: Array<{ id: string }> };
    expect(body.contractorJobs.map(c => c.id)).toEqual(['cj-real']);
  });

  it('does NOT return a row stamped with the caller when the job is no longer theirs', async () => {
    // The leak direction: contractor-2's live payload carried 5 of contractor-5's
    // work orders this way, each with customer name, address and phone.
    vi.stubGlobal('fetch', mockFetch({
      authUser: { id: 'u1', email: APPROVED.email },
      jobs: [MINE],
      contractorJobs: [
        { id: 'cj-real',  sourceJobId: 'j1', contractorId: 'contractor-2' },
        { id: 'cj-stale', sourceJobId: 'j9', contractorId: 'contractor-2', customerName: 'Leaked', customerPhone: '555' },
      ],
    }));
    const res = mockRes();
    await handler(req(), res as never);
    const body = res.seen.body as { contractorJobs: Array<{ id: string }> };
    expect(body.contractorJobs.map(c => c.id)).toEqual(['cj-real']);
    expect(JSON.stringify(body)).not.toContain('Leaked');
  });
});
