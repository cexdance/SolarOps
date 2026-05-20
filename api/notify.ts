/**
 * SolarOps — @mention Notification API
 *
 * POST /api/notify
 * Body: { mentionedUserIds: string[], notifierName: string, customerName: string, customerId: string, message: string }
 *
 * 1. Validates caller JWT
 * 2. Writes AppNotification rows to Supabase (one per mentioned user)
 * 3. Sends email to each mentioned user via Resend (if RESEND_API_KEY is set)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabaseAdmin = createClient(
  'https://cjmhfagkkayelcsprbai.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  // Validate caller
  const token = (req.headers.authorization ?? '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { data: { user: caller }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !caller) return res.status(401).json({ error: 'Unauthorized' });

  const { mentionedUserIds, notifierName, customerName, customerId, message } = req.body ?? {};
  if (!Array.isArray(mentionedUserIds) || mentionedUserIds.length === 0) {
    return res.status(400).json({ error: 'mentionedUserIds required' });
  }

  // Look up mentioned users in Supabase Auth
  const { data: { users: authUsers }, error: usersErr } = await supabaseAdmin.auth.admin.listUsers();
  if (usersErr) return res.status(500).json({ error: 'Could not fetch users' });

  const mentioned = authUsers.filter(u => mentionedUserIds.includes(u.id));

  // Insert notification rows (one per mentioned user)
  const now = new Date().toISOString();
  const rows = mentioned.map(u => ({
    id: `notif-${u.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    user_id: u.id,
    type: 'mention',
    title: `${notifierName || 'A teammate'} mentioned you`,
    message: message
      ? `In ${customerName || 'a customer record'}: "${message.slice(0, 200)}${message.length > 200 ? '…' : ''}"`
      : `You were mentioned in ${customerName || 'a customer record'}`,
    related_customer_id: customerId ?? null,
    read: false,
    created_at: now,
  }));

  const { error: insertErr } = await supabaseAdmin
    .from('notifications')
    .insert(rows);

  if (insertErr) {
    console.error('[notify] insert error:', insertErr.message);
    return res.status(500).json({ error: 'Failed to save notifications' });
  }

  // Send email to each mentioned user (fire-and-forget per user)
  if (resend) {
    for (const u of mentioned) {
      const email = u.email;
      const name = u.user_metadata?.name ?? email;
      if (!email) continue;

      resend.emails.send({
        from: 'SolarOps <notifications@conexsol.us>',
        to: email,
        subject: `${notifierName || 'A teammate'} mentioned you in SolarOps`,
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#f97316,#ea580c);padding:28px 32px">
            <div style="font-size:22px;font-weight:700;color:#fff">☀️ SolarOps</div>
            <div style="font-size:13px;color:rgba(255,255,255,.85);margin-top:4px">You were mentioned by a teammate</div>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px">
            <p style="margin:0 0 8px;font-size:16px;color:#1e293b">Hi ${name},</p>
            <p style="margin:0 0 24px;font-size:14px;color:#64748b;line-height:1.6">
              <strong>${notifierName || 'A teammate'}</strong> mentioned you in the customer record for
              <strong>${customerName || 'a customer'}</strong>.
            </p>
            <!-- Message bubble -->
            <div style="background:#f8fafc;border-left:3px solid #f97316;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:24px">
              <p style="margin:0;font-size:14px;color:#334155;line-height:1.7;white-space:pre-wrap">${(message ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
            </div>
            <a href="https://solarflow-dashboard-sooty.vercel.app"
               style="display:inline-block;background:#f97316;color:#fff;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none">
              View in SolarOps →
            </a>
          </td>
        </tr>
        <!-- Footer -->
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
      }).catch((err: unknown) => console.warn('[notify] email failed for', email, err));
    }
  }

  return res.status(200).json({ sent: mentioned.length });
}
