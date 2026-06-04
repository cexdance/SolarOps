/**
 * Shared auth guard for SolarOps serverless functions.
 *
 * Verifies the caller's Supabase JWT (sent as `Authorization: Bearer <token>`)
 * against the auth server using the service-role key. Endpoints that proxy paid
 * or rate-limited third-party APIs must call this first so the bearer token, not
 * just the public anon key, is required to reach them.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { env } from './_env';

const SUPABASE_URL = env('SUPABASE_URL') || 'https://cjmhfagkkayelcsprbai.supabase.co';
const SERVICE_ROLE_KEY = env('SUPABASE_SERVICE_ROLE_KEY') || '';

// Lazily construct the admin client. `createClient` throws `supabaseKey is
// required.` when the key is empty, and doing that at module top-level crashes
// the whole serverless function on import (FUNCTION_INVOCATION_FAILED) before
// the graceful guard below can run. Defer it so a missing key returns a clean
// 500 instead of taking down every endpoint that imports this module.
let _supabaseAdmin: SupabaseClient | null = null;
function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _supabaseAdmin;
}

/**
 * Returns the authenticated user, or null after writing a 401/500 response.
 * Callers should `return` immediately when the result is null.
 *
 * By default the token is read from `Authorization: Bearer`. Pass a header name
 * (e.g. 'x-solar-auth') for routes where the Authorization header is reserved
 * for an upstream API's own token.
 */
export async function requireUser(
  req: VercelRequest,
  res: VercelResponse,
  headerName = 'authorization',
): Promise<User | null> {
  if (!SERVICE_ROLE_KEY) {
    console.error('[auth] SUPABASE_SERVICE_ROLE_KEY not configured');
    res.status(500).json({ error: 'Server auth not configured' });
    return null;
  }

  const rawHeader = req.headers[headerName.toLowerCase()];
  const headerValue = Array.isArray(rawHeader) ? rawHeader[0] : (rawHeader ?? '');
  const token = headerValue.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  const { data, error } = await getSupabaseAdmin().auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  return data.user;
}
