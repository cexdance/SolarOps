/**
 * SolarOps, Send Quote Email API
 *
 * POST /api/send-quote
 * Body: { customerName, customerEmail, address, woNumber, lineItems, laborTotal, partsTotal, grandTotal, notes?, validDays? }
 *
 * Sends a branded HTML quote email to the customer with a one-click approval link.
 * Stores the quote token in Supabase for approval verification.
 *
 * Uses native fetch only, no SDK dependencies (avoids Vercel bundling issues).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

const SUPABASE_URL     = 'https://cjmhfagkkayelcsprbai.supabase.co';
// .trim() strips trailing \n that Vercel env-pull embeds in quoted values
const SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
const RESEND_API_KEY   = (process.env.RESEND_API_KEY ?? '').trim();

const APP_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : 'https://solarflow-dashboard-sooty.vercel.app';

interface LineItem {
  description: string;
  qty: number;
  unitPrice: number;
  total: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  // ── Auth: verify caller JWT ────────────────────────────────────────────────
  const token = (req.headers.authorization ?? '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SERVICE_ROLE_KEY,
    },
  });
  if (!verifyRes.ok) return res.status(401).json({ error: 'Unauthorized' });

  // ── Parse body ─────────────────────────────────────────────────────────────
  const {
    customerName, customerEmail, address, woNumber, jobId,
    lineItems, laborTotal, partsTotal, grandTotal,
    notes, validDays = 30,
  } = (req.body ?? {}) as Record<string, unknown>;

  if (!customerEmail || !woNumber || !jobId) {
    return res.status(400).json({ error: 'customerEmail, woNumber, and jobId are required' });
  }

  const approvalToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + Number(validDays) * 24 * 60 * 60 * 1000).toISOString();

  // ── Store quote token in Supabase via REST ─────────────────────────────────
  const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/quote_approvals`, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${SERVICE_ROLE_KEY}`,
      apikey:          SERVICE_ROLE_KEY,
      'Content-Type':  'application/json',
      Prefer:          'return=minimal,resolution=merge-duplicates',
    },
    body: JSON.stringify({
      job_id:          jobId,
      token:           approvalToken,
      customer_email:  customerEmail,
      customer_name:   customerName,
      wo_number:       woNumber,
      grand_total:     grandTotal,
      line_items:      lineItems,
      expires_at:      expiresAt,
      approved_at:     null,
      created_at:      new Date().toISOString(),
    }),
  });

  if (!upsertRes.ok) {
    const detail = await upsertRes.text().catch(() => '');
    console.error('[send-quote] insert error:', detail);
    return res.status(500).json({ error: 'Failed to store quote' });
  }

  // ── Build email HTML ───────────────────────────────────────────────────────
  const approvalUrl = `${APP_URL}/api/approve-quote?token=${approvalToken}`;
  const items: LineItem[] = Array.isArray(lineItems) ? (lineItems as LineItem[]) : [];

  const lineItemsHtml = items.map((item: LineItem) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#334155">${(item.description || '').replace(/</g, '&lt;')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#334155;text-align:center">${item.qty}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#334155;text-align:right">$${Number(item.unitPrice).toFixed(2)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#334155;text-align:right;font-weight:600">$${Number(item.total).toFixed(2)}</td>
    </tr>
  `).join('');

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#f97316,#ea580c);padding:28px 32px">
            <div style="font-size:22px;font-weight:700;color:#fff">☀️ Conexsol Energy</div>
            <div style="font-size:13px;color:rgba(255,255,255,.85);margin-top:4px">Service Quote</div>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px">
            <p style="margin:0 0 8px;font-size:16px;color:#1e293b">Dear ${(String(customerName || 'Valued Customer')).replace(/</g, '&lt;')},</p>
            <p style="margin:0 0 24px;font-size:14px;color:#64748b;line-height:1.6">
              Thank you for choosing Conexsol Energy. Please find your service quote below for work order <strong>${woNumber}</strong>.
            </p>

            <!-- Quote Details -->
            <div style="background:#f8fafc;border-radius:8px;padding:16px;margin-bottom:24px">
              <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#64748b">
                <tr>
                  <td><strong>Quote #:</strong> ${woNumber}</td>
                  <td style="text-align:right"><strong>Valid until:</strong> ${new Date(expiresAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</td>
                </tr>
                <tr>
                  <td colspan="2" style="padding-top:4px"><strong>Address:</strong> ${(String(address || '')).replace(/</g, '&lt;')}</td>
                </tr>
              </table>
            </div>

            <!-- Line Items Table -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:16px">
              <tr style="background:#f1f5f9">
                <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;color:#475569;text-transform:uppercase">Description</th>
                <th style="padding:10px 12px;text-align:center;font-size:12px;font-weight:600;color:#475569;text-transform:uppercase">Qty</th>
                <th style="padding:10px 12px;text-align:right;font-size:12px;font-weight:600;color:#475569;text-transform:uppercase">Unit Price</th>
                <th style="padding:10px 12px;text-align:right;font-size:12px;font-weight:600;color:#475569;text-transform:uppercase">Total</th>
              </tr>
              ${lineItemsHtml}
            </table>

            <!-- Totals -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
              <tr>
                <td style="padding:4px 12px;font-size:14px;color:#64748b">Labor</td>
                <td style="padding:4px 12px;font-size:14px;color:#334155;text-align:right">$${Number(laborTotal || 0).toFixed(2)}</td>
              </tr>
              <tr>
                <td style="padding:4px 12px;font-size:14px;color:#64748b">Parts &amp; Materials</td>
                <td style="padding:4px 12px;font-size:14px;color:#334155;text-align:right">$${Number(partsTotal || 0).toFixed(2)}</td>
              </tr>
              <tr>
                <td style="padding:8px 12px;font-size:18px;font-weight:700;color:#1e293b;border-top:2px solid #e2e8f0">Total</td>
                <td style="padding:8px 12px;font-size:18px;font-weight:700;color:#1e293b;text-align:right;border-top:2px solid #e2e8f0">$${Number(grandTotal || 0).toFixed(2)}</td>
              </tr>
            </table>

            ${notes ? `
            <div style="background:#fffbeb;border-left:3px solid #f59e0b;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:24px">
              <p style="margin:0;font-size:13px;color:#92400e;font-weight:600">Notes</p>
              <p style="margin:4px 0 0;font-size:13px;color:#78350f;line-height:1.5">${(String(notes || '')).replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>
            </div>
            ` : ''}

            <!-- Approve Button -->
            <div style="text-align:center;margin:32px 0">
              <a href="${approvalUrl}"
                 style="display:inline-block;background:#16a34a;color:#fff;font-size:16px;font-weight:700;padding:16px 48px;border-radius:8px;text-decoration:none;letter-spacing:0.5px">
                ✓ Approve This Quote
              </a>
              <p style="margin:12px 0 0;font-size:12px;color:#94a3b8">Click the button above to approve this quote</p>
            </div>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #f1f5f9;background:#f8fafc">
            <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5">
              Conexsol Energy · Miami, FL · (305) 555-0199<br>
              This quote is valid for ${validDays} days. If you have questions, reply to this email or call us.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  // ── Send email via Resend REST API ─────────────────────────────────────────
  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from:     'Conexsol Energy <notifications@conexsol.us>',
      to:       customerEmail,
      subject:  `Service Quote ${woNumber}, Conexsol Energy`,
      html,
      reply_to: 'daniel.matos@conexsol.us',
    }),
  });

  if (!emailRes.ok) {
    const detail = await emailRes.text().catch(() => '');
    console.error('[send-quote] email error:', detail);
    return res.status(500).json({ error: 'Failed to send email' });
  }

  return res.status(200).json({ success: true, approvalToken, expiresAt });
}
