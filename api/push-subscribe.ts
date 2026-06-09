/**
 * SolarOps - Web Push subscription storage
 *
 * POST /api/push-subscribe  { subscription: PushSubscriptionJSON }
 *   Upserts the push subscription for the authenticated user.
 *
 * DELETE /api/push-subscribe  { endpoint: string }
 *   Removes a push subscription by endpoint for the authenticated user.
 *   Call when the browser unsubscribes (e.g. user revokes permission).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

const SUPABASE_URL     = 'https://cjmhfagkkayelcsprbai.supabase.co';
const SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();

const svcHeaders = {
  Authorization:  `Bearer ${SERVICE_ROLE_KEY}`,
  apikey:          SERVICE_ROLE_KEY,
  'Content-Type':  'application/json',
};

interface AuthUser { id: string }

async function getCallerUser(req: VercelRequest): Promise<AuthUser | null> {
  const token = (req.headers.authorization ?? '').replace('Bearer ', '');
  if (!token) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SERVICE_ROLE_KEY },
  });
  if (!r.ok) return null;
  return r.json() as Promise<AuthUser>;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'DELETE') return res.status(405).end();

  const user = await getCallerUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'POST') {
    const { subscription } = (req.body ?? {}) as { subscription?: { endpoint?: string } };
    if (!subscription?.endpoint) return res.status(400).json({ error: 'subscription required' });

    const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions`, {
      method:  'POST',
      headers: { ...svcHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body:    JSON.stringify({
        user_id:      user.id,
        endpoint:     subscription.endpoint,
        subscription: subscription,
      }),
    });

    if (!upsertRes.ok) {
      const detail = await upsertRes.text().catch(() => '');
      console.error('[push-subscribe] upsert error:', detail);
      return res.status(500).json({ error: 'Failed to save subscription' });
    }
    return res.status(200).json({ ok: true });
  }

  // DELETE
  const { endpoint } = (req.body ?? {}) as { endpoint?: string };
  if (!endpoint) return res.status(400).json({ error: 'endpoint required' });

  const delRes = await fetch(
    `${SUPABASE_URL}/rest/v1/push_subscriptions?user_id=eq.${user.id}&endpoint=eq.${encodeURIComponent(endpoint)}`,
    { method: 'DELETE', headers: svcHeaders },
  );
  return res.status(delRes.ok ? 200 : 500).json({ ok: delRes.ok });
}
