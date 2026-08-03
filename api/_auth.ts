/**
 * Shared auth guard for the LIVE serverless tree (repo-root `api/`).
 *
 * Endpoints that proxy paid or rate-limited third-party APIs, or that return
 * customer data, must call this first so a bearer token is required to reach
 * them. Without it the endpoint is open to the internet: `/api/solaredge`
 * returned 361 customers' names and street addresses to an unauthenticated
 * GET, and spent the SolarEdge quota doing it.
 *
 * A near-identical guard exists at `solarflow-dashboard/api/_auth.ts`, but that
 * tree is dead code and does not deploy (see the closing comments on PRs #2 and
 * #4). This one uses `fetch` rather than `@supabase/supabase-js` because the
 * root tree does not depend on the Supabase SDK; `notify.ts` verifies tokens the
 * same way.
 *
 * The `_` prefix keeps Vercel from exposing this file as a route.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

// .trim() strips trailing \n that Vercel env-pull embeds in quoted values.
const SUPABASE_URL     = (process.env.SUPABASE_URL || 'https://cjmhfagkkayelcsprbai.supabase.co').trim();
const SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();

export interface AuthUser {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}

/**
 * Returns the authenticated user, or null AFTER writing a 401/500 response.
 * Callers must `return` immediately when the result is null:
 *
 *   if (!(await requireUser(req, res))) return;
 *
 * `headerName` exists for routes where `Authorization` is reserved for an
 * upstream API's own token.
 */
export async function requireUser(
  req: VercelRequest,
  res: VercelResponse,
  headerName = 'authorization',
): Promise<AuthUser | null> {
  // Reject unauthenticated callers FIRST, before looking at server config. An
  // anonymous request must always get 401, never a 500 that reveals whether the
  // server is misconfigured. Checking config first turns a missing key into an
  // information leak on any unauthenticated probe.
  const rawHeader = req.headers[headerName.toLowerCase()];
  const headerValue = Array.isArray(rawHeader) ? rawHeader[0] : (rawHeader ?? '');
  // `\b` then `\s*`, not `\s+`: a bare "Bearer" with no token must reduce to an
  // empty string and be rejected here, rather than surviving as the literal
  // token "Bearer" and costing a pointless round trip to the auth server. The
  // word boundary keeps "Bearerabc" from being mistaken for the prefix.
  const token = headerValue.trim().replace(/^Bearer\b\s*/i, '').trim();
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  // Token present but we cannot verify it: that is our problem, not the
  // caller's, so it is a 500.
  if (!SERVICE_ROLE_KEY) {
    console.error('[auth] SUPABASE_SERVICE_ROLE_KEY not configured');
    res.status(500).json({ error: 'Server auth not configured' });
    return null;
  }

  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SERVICE_ROLE_KEY },
    });
    if (!r.ok) {
      res.status(401).json({ error: 'Unauthorized' });
      return null;
    }
    const user = await r.json() as AuthUser;
    if (!user?.id) {
      res.status(401).json({ error: 'Unauthorized' });
      return null;
    }
    return user;
  } catch (err) {
    // Network failure reaching the auth server. Fail CLOSED: a verification we
    // could not perform is not a verification that passed.
    console.error('[auth] token verification failed:', err);
    res.status(503).json({ error: 'Auth verification unavailable' });
    return null;
  }
}
