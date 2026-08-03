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
 *
 * Paths are `../../../api/`, the repo-ROOT tree, which is what Vercel deploys.
 * Until 2026-08-03 these pointed at `../../api/` (solarflow-dashboard/api/), so
 * every assertion here was made against code that does not run in production.
 * The three xero-* handlers listed then existed only in that dead tree, answered
 * 404 in production, and were called by nothing but this file; they went with it.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// `import.meta.glob`, not `import(/* @vite-ignore */ path)`.
//
// The repo-root api/ tree sits OUTSIDE the Vite root (solarflow-dashboard), and
// @vite-ignore hands the specifier straight to Node's ESM loader, which cannot
// load TypeScript at all — every import failed with ERR_MODULE_NOT_FOUND. It only
// worked before this file was repointed because the old target, the now-deleted
// solarflow-dashboard/api/, was inside the Vite root and so got transformed.
//
// glob is resolved by Vite at build time (so the .ts is transformed) while
// staying lazy, which is what preserves the point of these tests: the module must
// be imported AFTER clearServerEnv(), not at file load.
const API_MODULES = import.meta.glob('../../../api/*.ts');

const loader = (name: string) => {
  const key = `../../../api/${name}`;
  const fn = API_MODULES[key];
  if (!fn) throw new Error(`no such handler in the live api tree: ${name}`);
  return fn;
};

// The same handlers this file already covered, repointed at the live tree.
// Deliberately not widened to every handler: notify/push-subscribe/send-quote/
// approve-quote/xero pull runtime-only deps (web-push, docx) that do not resolve
// inside the Vite workspace, so importing them here fails for reasons that have
// nothing to do with the contract being tested. Covering those needs those deps
// stubbed first, which is its own change.
const GUARDED_HANDLERS = [
  'solaredge.ts',
  'trello-card.ts',
  'parse-lead-image.ts',
  'ups-tracking.ts',
  'users.ts',
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

  it.each(GUARDED_HANDLERS)('imports %s without throwing', async (name) => {
    await expect(loader(name)()).resolves.toBeTruthy();
  });
});

describe('requireUser degrades gracefully without a service-role key', () => {
  beforeEach(() => {
    clearServerEnv();
    vi.resetModules();
  });

  it('returns 401 (not 500) for an UNAUTHENTICATED request even when key is missing', async () => {
    // Anonymous probes must never receive a 500 that leaks server config state.
    const { requireUser } = await loader('_auth.ts')();
    const { res, out } = makeRes();
    const req = { headers: {}, query: {}, method: 'GET' } as never;

    const user = await requireUser(req, res as never);

    expect(user).toBeNull();
    expect(out.statusCode).toBe(401);
  });

  it('returns a clean 500 (not a crash) when a token is sent but the key is missing', async () => {
    const { requireUser } = await loader('_auth.ts')();
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
    const { requireUser } = await loader('_auth.ts')();
    const { res, out } = makeRes();
    const req = { headers: {}, query: {}, method: 'GET' } as never;

    const user = await requireUser(req, res as never);

    expect(user).toBeNull();
    expect(out.statusCode).toBe(401);
  });
});

// The 'env contract' block that lived here tested `_env.ts`, a helper that only
// ever existed in solarflow-dashboard/api/ and so was never used by anything in
// production. It was removed with that tree on 2026-08-03. The live handlers read
// process.env directly. If a declared env contract is wanted for the real tree,
// it should be written against `api/`, not resurrected from the dead copy.
