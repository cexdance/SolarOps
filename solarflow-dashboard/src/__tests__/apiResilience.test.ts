/**
 * Regression + fault-tolerance tests for the serverless API layer.
 *
 * These pin the exact failure that took production down: a missing
 * SUPABASE_SERVICE_ROLE_KEY made api/_auth.ts call createClient('') AT IMPORT
 * TIME, which threw and crashed every endpoint (FUNCTION_INVOCATION_FAILED).
 *
 * The contract these tests enforce:
 *   1. No API handler throws at import, even with all server env vars empty.
 *   2. With the key missing, requireUser returns a clean 500 - never throws.
 *   3. The env contract flags `auth` as critical and never leaks secret values.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Handlers that import the shared auth guard - the blast radius of the outage.
const GUARDED_HANDLERS = [
  '../../api/solaredge.ts',
  '../../api/trello-card.ts',
  '../../api/xero-api.ts',
  '../../api/xero-token.ts',
  '../../api/xero-connections.ts',
  '../../api/parse-lead-image.ts',
  '../../api/ups-tracking.ts',
  '../../api/users.ts',
];

function clearServerEnv() {
  for (const k of [
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_URL',
    'SOLAREDGE_API_KEY',
    'TRELLO_API_KEY',
    'TRELLO_TOKEN',
    'VITE_TRELLO_API_KEY',
    'VITE_TRELLO_TOKEN',
    'XERO_CLIENT_SECRET',
    'UPS_ACCESS_TOKEN',
    'RESEND_API_KEY',
    'ANTHROPIC_API_KEY',
  ]) {
    delete process.env[k];
  }
}

/** Minimal Vercel res stub that records status + json without throwing. */
function makeRes() {
  const out: { statusCode: number; body: unknown; headers: Record<string, string> } = {
    statusCode: 0,
    body: undefined,
    headers: {},
  };
  const res = {
    status(code: number) {
      out.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      out.body = payload;
      return res;
    },
    setHeader(k: string, v: string) {
      out.headers[k] = v;
      return res;
    },
  };
  return { res, out };
}

describe('API layer does not crash at import (missing env)', () => {
  beforeEach(() => {
    clearServerEnv();
    vi.resetModules();
  });

  it.each(GUARDED_HANDLERS)('imports %s without throwing', async (path) => {
    await expect(import(/* @vite-ignore */ path)).resolves.toBeTruthy();
  });
});

describe('requireUser degrades gracefully without a service-role key', () => {
  beforeEach(() => {
    clearServerEnv();
    vi.resetModules();
  });

  it('returns 401 (not 500) for an UNAUTHENTICATED request even when key is missing', async () => {
    // Anonymous probes must never receive a 500 that leaks server config state.
    const { requireUser } = await import('../../api/_auth.ts');
    const { res, out } = makeRes();
    const req = { headers: {}, query: {}, method: 'GET' } as never;

    const user = await requireUser(req, res as never);

    expect(user).toBeNull();
    expect(out.statusCode).toBe(401);
  });

  it('returns a clean 500 (not a crash) when a token is sent but the key is missing', async () => {
    const { requireUser } = await import('../../api/_auth.ts');
    const { res, out } = makeRes();
    const req = { headers: { authorization: 'Bearer some-token' }, query: {}, method: 'GET' } as never;

    const user = await requireUser(req, res as never);

    expect(user).toBeNull();
    expect(out.statusCode).toBe(500);
    expect(JSON.stringify(out.body)).toMatch(/not configured/i);
  });

  it('returns 401 (not a crash) when a key is present but no token is sent', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
    vi.resetModules();
    const { requireUser } = await import('../../api/_auth.ts');
    const { res, out } = makeRes();
    const req = { headers: {}, query: {}, method: 'GET' } as never;

    const user = await requireUser(req, res as never);

    expect(user).toBeNull();
    expect(out.statusCode).toBe(401);
  });
});

describe('env contract', () => {
  beforeEach(() => {
    clearServerEnv();
    vi.resetModules();
  });

  it('flags auth as critical and reports it missing without leaking values', async () => {
    const { evaluateContract } = await import('../../api/_env.ts');
    const statuses = evaluateContract();
    const auth = statuses.find((s) => s.key === 'auth');

    expect(auth?.critical).toBe(true);
    expect(auth?.configured).toBe(false);
    // Reports the var NAME, never a value.
    expect(JSON.stringify(statuses)).toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('treats empty / whitespace strings as absent', async () => {
    process.env.SOLAREDGE_API_KEY = '   ';
    vi.resetModules();
    const { env } = await import('../../api/_env.ts');
    expect(env('SOLAREDGE_API_KEY')).toBeUndefined();
  });
});
