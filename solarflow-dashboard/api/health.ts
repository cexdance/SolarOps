/**
 * SolarOps - Readiness / health endpoint.
 *
 * GET /api/health
 *
 * Reports whether each serverless integration is configured and whether the
 * shared Supabase auth dependency is actually reachable. This is the "warning
 * light" that turns the original silent outage (users hitting 500s) into a
 * signal monitoring can scrape in seconds.
 *
 * Contract:
 *   - 200  status: "ok"        all critical integrations configured + auth live
 *   - 200  status: "degraded"  only NON-critical features missing/unreachable
 *   - 503  status: "critical"  a critical integration is down (alert me now)
 *
 * SECURITY: never returns secret values; only booleans + var NAMES.
 * No auth required: monitoring must reach it even when auth is broken, and it
 * exposes nothing sensitive.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { env, evaluateContract } from './_env';

/** Ping Supabase auth without throwing. Confirms the service-role key works. */
async function probeAuth(): Promise<{ reachable: boolean; detail: string }> {
  const url = env('SUPABASE_URL') || 'https://cjmhfagkkayelcsprbai.supabase.co';
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) return { reachable: false, detail: 'SUPABASE_SERVICE_ROLE_KEY not set' };
  try {
    const admin = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    // getUser('') returns a clean error if the key is valid, and rejects/throws
    // only if the client could not be built or the host is unreachable.
    await admin.auth.getUser('health-probe-token');
    return { reachable: true, detail: 'auth endpoint responded' };
  } catch (err) {
    return { reachable: false, detail: `auth probe failed: ${String(err)}` };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const integrations = evaluateContract();
  const auth = await probeAuth();

  // A critical integration is unhealthy if its vars are missing OR (for auth)
  // the live probe failed.
  const criticalProblems = integrations
    .filter((i) => i.critical && (!i.configured || (i.key === 'auth' && !auth.reachable)))
    .map((i) => i.key);

  const degraded = integrations.filter((i) => !i.critical && !i.configured).map((i) => i.key);

  const status = criticalProblems.length > 0 ? 'critical' : degraded.length > 0 ? 'degraded' : 'ok';
  const httpCode = status === 'critical' ? 503 : 200;

  res.setHeader('Cache-Control', 'no-store');
  return res.status(httpCode).json({
    status,
    timestamp: new Date().toISOString(),
    region: env('VERCEL_REGION') || 'local',
    auth: { reachable: auth.reachable, detail: auth.detail },
    integrations: integrations.map(({ key, label, critical, configured, missing }) => ({
      key,
      label,
      critical,
      configured,
      missing,
    })),
    criticalProblems,
    degraded,
  });
}
