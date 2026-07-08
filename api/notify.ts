/**
 * SolarOps, @mention Notification API
 *
 * POST /api/notify
 * Body: { mentionedUserIds: string[], notifierName: string, customerName: string, customerId: string, message: string }
 *
 * 1. Validates caller JWT
 * 2. Writes AppNotification rows to Supabase (one per mentioned user)
 * 3. Sends Web Push to each user's registered push subscriptions (if VAPID keys set)
 * 4. Sends email to each mentioned user via Resend (if RESEND_API_KEY is set)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import webPush from 'web-push';

const SUPABASE_URL     = 'https://cjmhfagkkayelcsprbai.supabase.co';
// .trim() strips trailing \n that Vercel env-pull embeds in quoted values
const SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
const RESEND_API_KEY   = (process.env.RESEND_API_KEY ?? '').trim() || undefined;
const VAPID_PUBLIC_KEY = (process.env.VAPID_PUBLIC_KEY ?? '').trim();
const VAPID_PRIVATE_KEY = (process.env.VAPID_PRIVATE_KEY ?? '').trim();

// Guard: malformed VAPID keys make setVapidDetails throw synchronously. At module
// scope that crashes the whole function (FUNCTION_INVOCATION_FAILED) and takes the
// core @mention notifications down with it. Isolate push init so it stays best-effort.
let pushEnabled = false;
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try {
    webPush.setVapidDetails('mailto:admin@conexsol.us', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    pushEnabled = true;
  } catch (err) {
    console.error('[notify] invalid VAPID keys, web push disabled:', (err as Error).message);
  }
}

const supabaseHeaders = {
  Authorization:  `Bearer ${SERVICE_ROLE_KEY}`,
  apikey:          SERVICE_ROLE_KEY,
  'Content-Type':  'application/json',
};

interface AuthUser {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  // ── Validate caller JWT ────────────────────────────────────────────────────
  const token = (req.headers.authorization ?? '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SERVICE_ROLE_KEY,
    },
  });
  if (!verifyRes.ok) return res.status(401).json({ error: 'Unauthorized' });

  // ── Customer appointment confirmation email ────────────────────────────────
  // Distinct from the staff @mention flow: emails the CLIENT directly (no
  // Supabase user lookup) when a contractor schedules/confirms a service date.
  if ((req.body as Record<string, unknown>)?.action === 'customer-appointment') {
    const { customerEmail, customerName: cName, when, orderNo, contractorName } =
      (req.body ?? {}) as Record<string, string>;
    const to = String(customerEmail ?? '').trim();
    if (!to || !/.+@.+\..+/.test(to)) return res.status(400).json({ error: 'valid customerEmail required' });
    if (!RESEND_API_KEY) return res.status(200).json({ sent: 0, skipped: 'no RESEND_API_KEY' });

    const safe = (v: unknown) => String(v ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'SolarOps <solar.ops@conexsol.us>',
        reply_to: 'solar.ops@conexsol.us',
        to,
        subject: `Your solar service is scheduled${when ? ` for ${safe(when)}` : ''}`,
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
        <tr>
          <td style="background:linear-gradient(135deg,#f97316,#ea580c);padding:28px 32px">
            <div style="font-size:22px;font-weight:700;color:#fff">Conexsol Solar Service</div>
            <div style="font-size:13px;color:rgba(255,255,255,.85);margin-top:4px">Your appointment is confirmed</div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px">
            <p style="margin:0 0 8px;font-size:16px;color:#1e293b">Hi ${safe(cName) || 'there'},</p>
            <p style="margin:0 0 24px;font-size:14px;color:#64748b;line-height:1.6">
              Good news, your solar service visit has been scheduled. A technician will be on site at the time below.
            </p>
            <div style="background:#f8fafc;border-left:3px solid #f97316;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:24px">
              <p style="margin:0 0 6px;font-size:13px;color:#94a3b8;text-transform:uppercase;letter-spacing:.04em">Scheduled for</p>
              <p style="margin:0;font-size:18px;font-weight:700;color:#1e293b">${safe(when) || 'To be confirmed'}</p>
              ${orderNo ? `<p style="margin:8px 0 0;font-size:13px;color:#64748b">Service order ${safe(orderNo)}</p>` : ''}
            </div>
            <p style="margin:0;font-size:14px;color:#64748b;line-height:1.6">
              If this time does not work, just reply to this email and our office will help reschedule.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #f1f5f9">
            <p style="margin:0;font-size:12px;color:#94a3b8">
              Conexsol${contractorName ? ` &bull; Technician: ${safe(contractorName)}` : ''}. This confirmation was sent automatically.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
      }),
    }).catch((err: unknown) => { console.warn('[notify] customer email failed', err); return null; });

    if (!r || !r.ok) {
      const detail = r ? await r.text().catch(() => '') : 'fetch failed';
      console.error('[notify] customer email error:', detail);
      return res.status(502).json({ error: 'email send failed' });
    }
    return res.status(200).json({ sent: 1 });
  }

  const { mentionedUserIds, notifierName, customerName, customerId, message } = (req.body ?? {}) as Record<string, unknown>;
  if (!Array.isArray(mentionedUserIds) || mentionedUserIds.length === 0) {
    return res.status(400).json({ error: 'mentionedUserIds required' });
  }

  // ── Fetch ONLY the mentioned users by id (targeted lookups) ────────────────
  // Previously this listed up to 200 users and filtered in-memory, O(all-users)
  // and silently missed anyone past the page limit. Mentions are typically 1-3
  // users, so fetch each by id directly. Correct and scales to any org size.
  const ids = mentionedUserIds as string[];
  const lookups = await Promise.all(
    ids.map(async (id) => {
      try {
        const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, { headers: supabaseHeaders });
        if (!r.ok) return null;
        return await r.json() as AuthUser;
      } catch {
        return null;
      }
    }),
  );
  const mentioned = lookups.filter((u): u is AuthUser => !!u && !!u.id);
  if (mentioned.length === 0) return res.status(404).json({ error: 'No matching users found' });

  // ── Insert notification rows ───────────────────────────────────────────────
  const now = new Date().toISOString();
  const rows = mentioned.map(u => ({
    id: `notif-${u.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    user_id: u.id,
    type: 'mention',
    title: `${notifierName || 'A teammate'} mentioned you`,
    message: message
      ? `In ${customerName || 'a customer record'}: "${String(message).slice(0, 200)}${String(message).length > 200 ? '…' : ''}"`
      : `You were mentioned in ${customerName || 'a customer record'}`,
    related_customer_id: customerId ?? null,
    read: false,
    created_at: now,
  }));

  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
    method: 'POST',
    headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify(rows),
  });

  if (!insertRes.ok) {
    const detail = await insertRes.text().catch(() => '');
    console.error('[notify] insert error:', detail);
    return res.status(500).json({ error: 'Failed to save notifications' });
  }

  // ── Send Web Push to each mentioned user's registered devices ────────────
  if (pushEnabled) {
    await Promise.all(
      mentioned.map(async (u) => {
        const subRes = await fetch(
          `${SUPABASE_URL}/rest/v1/push_subscriptions?user_id=eq.${u.id}`,
          { headers: supabaseHeaders },
        ).catch(() => null);
        if (!subRes?.ok) return;
        const subs = await subRes.json() as Array<{ endpoint: string; subscription: Record<string, unknown> }>;

        await Promise.all(
          subs.map(async (row) => {
            const payload = JSON.stringify({
              title: `${notifierName || 'A teammate'} mentioned you`,
              body:  message
                ? `In ${customerName || 'a service order'}: "${String(message).slice(0, 120)}${String(message).length > 120 ? '…' : ''}"`
                : `You were mentioned in ${customerName || 'a service order'}`,
              url: '/',
            });
            try {
              await webPush.sendNotification(
                row.subscription as unknown as Parameters<typeof webPush.sendNotification>[0],
                payload,
                { TTL: 86400 },
              );
            } catch (err: unknown) {
              // 410 Gone = subscription expired; delete it
              if ((err as { statusCode?: number }).statusCode === 410) {
                await fetch(
                  `${SUPABASE_URL}/rest/v1/push_subscriptions?user_id=eq.${u.id}&endpoint=eq.${encodeURIComponent(row.endpoint)}`,
                  { method: 'DELETE', headers: supabaseHeaders },
                ).catch(() => {});
              }
            }
          }),
        );
      }),
    );
  }

  // ── Send email to each mentioned user (fire-and-forget) ───────────────────
  if (RESEND_API_KEY) {
    for (const u of mentioned) {
      const email = u.email;
      const name  = (u.user_metadata?.name as string) ?? email ?? 'there';
      if (!email) continue;

      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization:  `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from:    'SolarOps <notifications@conexsol.us>',
          to:      email,
          subject: `${notifierName || 'A teammate'} mentioned you in SolarOps`,
          html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
        <tr>
          <td style="background:linear-gradient(135deg,#f97316,#ea580c);padding:28px 32px">
            <div style="font-size:22px;font-weight:700;color:#fff">☀️ SolarOps</div>
            <div style="font-size:13px;color:rgba(255,255,255,.85);margin-top:4px">You were mentioned by a teammate</div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px">
            <p style="margin:0 0 8px;font-size:16px;color:#1e293b">Hi ${name},</p>
            <p style="margin:0 0 24px;font-size:14px;color:#64748b;line-height:1.6">
              <strong>${notifierName || 'A teammate'}</strong> mentioned you in the customer record for
              <strong>${customerName || 'a customer'}</strong>.
            </p>
            <div style="background:#f8fafc;border-left:3px solid #f97316;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:24px">
              <p style="margin:0;font-size:14px;color:#334155;line-height:1.7;white-space:pre-wrap">${(String(message ?? '')).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
            </div>
            <a href="https://solarflow-dashboard-sooty.vercel.app"
               style="display:inline-block;background:#f97316;color:#fff;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none">
              View in SolarOps →
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #f1f5f9">
            <p style="margin:0;font-size:12px;color:#94a3b8">
              You received this because you were @mentioned in SolarOps. Replies to this email are not monitored.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
        }),
      }).catch((err: unknown) => console.warn('[notify] email failed for', email, err));
    }
  }

  return res.status(200).json({ sent: mentioned.length });
}
