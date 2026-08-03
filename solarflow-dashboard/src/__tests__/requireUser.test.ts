/**
 * Guards on the shared auth helper for the LIVE serverless tree.
 *
 * Note the import path: `../../../api/` is the repo-root tree, the one Vercel
 * deploys. `../../api/` is the dead solarflow-dashboard copy (see PRs #2, #4).
 *
 * This is the gate that stopped `/api/solaredge` handing 361 customers' names
 * and street addresses to anonymous callers, so the failure modes below are the
 * point of the file, not incidental coverage.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { requireUser } from '../../../api/_auth';

// Closures, not `.bind()`: binding a vi.fn() returns a plain function and
// strips the mock properties, so assertions like toHaveBeenCalled stop working.
function mockRes() {
  const seen: { code?: number; body?: unknown } = {};
  const res = {
    seen,
    status: vi.fn((c: number) => { seen.code = c; return res; }),
    json:   vi.fn((b: unknown) => { seen.body = b; return res; }),
  };
  return res;
}

const req = (headers: Record<string, string | string[]> = {}) =>
  ({ headers } as never);

const okUser = { id: 'ab12cd34-0000-0000-0000-00000000beef', email: 'staff@conexsol.us' };

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('requireUser rejects callers who present nothing', () => {
  it('401s a request with no Authorization header, and never calls the auth server', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const res = mockRes();
    const user = await requireUser(req(), res as never);
    expect(user).toBeNull();
    expect(res.seen.code).toBe(401);
    // The anonymous case must short-circuit: no token means there is nothing to
    // verify, so it should never reach the network.
    expect(spy).not.toHaveBeenCalled();
  });

  it('401s an empty or bearer-only header', async () => {
    for (const h of ['', 'Bearer', 'Bearer    ']) {
      const res = mockRes();
      expect(await requireUser(req({ authorization: h }), res as never)).toBeNull();
      expect(res.seen.code).toBe(401);
    }
  });
});

describe('requireUser rejects callers the auth server does not vouch for', () => {
  it('401s when the auth server rejects the token', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 401 }),
    );
    const res = mockRes();
    expect(await requireUser(req({ authorization: 'Bearer forged' }), res as never)).toBeNull();
    expect(res.seen.code).toBe(401);
  });

  it('401s when the auth server returns 200 but no user id', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ email: 'x@y.z' }), { status: 200 }),
    );
    const res = mockRes();
    expect(await requireUser(req({ authorization: 'Bearer weird' }), res as never)).toBeNull();
    expect(res.seen.code).toBe(401);
  });
});

describe('requireUser fails CLOSED when it cannot verify', () => {
  it('503s instead of passing through when the auth server is unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const res = mockRes();
    const user = await requireUser(req({ authorization: 'Bearer real-looking' }), res as never);
    // The dangerous bug would be returning a user here: an outage at the auth
    // server would silently reopen every endpoint behind this guard.
    expect(user).toBeNull();
    expect(res.seen.code).toBe(503);
  });
});

describe('requireUser admits a verified caller', () => {
  it('returns the user and writes no response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(okUser), { status: 200 }),
    );
    const res = mockRes();
    const user = await requireUser(req({ authorization: `Bearer good` }), res as never);
    expect(user?.id).toBe(okUser.id);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('tolerates a header array, which node gives for repeated headers', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(okUser), { status: 200 }),
    );
    const res = mockRes();
    const user = await requireUser(req({ authorization: ['Bearer good', 'Bearer other'] }), res as never);
    expect(user?.id).toBe(okUser.id);
  });
});
