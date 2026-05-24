/**
 * SolarOps — Approve Quote (one-click from email)
 *
 * GET /api/approve-quote?token=<token>
 *
 * Validates the token, marks the quote as approved in Supabase,
 * and returns a branded confirmation page.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  'https://cjmhfagkkayelcsprbai.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function htmlPage(title: string, message: string, success: boolean) {
  const color = success ? '#16a34a' : '#dc2626';
  const icon = success ? '✓' : '✕';
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title} — Conexsol Energy</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh">
  <div style="background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);max-width:480px;width:90%;text-align:center;overflow:hidden">
    <div style="background:linear-gradient(135deg,#f97316,#ea580c);padding:24px">
      <div style="font-size:20px;font-weight:700;color:#fff">☀️ Conexsol Energy</div>
    </div>
    <div style="padding:40px 32px">
      <div style="width:64px;height:64px;border-radius:50%;background:${color};color:#fff;font-size:32px;font-weight:700;display:flex;align-items:center;justify-content:center;margin:0 auto 20px">${icon}</div>
      <h1 style="margin:0 0 12px;font-size:22px;color:#1e293b">${title}</h1>
      <p style="margin:0;font-size:15px;color:#64748b;line-height:1.6">${message}</p>
    </div>
    <div style="padding:16px 32px;border-top:1px solid #f1f5f9;background:#f8fafc">
      <p style="margin:0;font-size:12px;color:#94a3b8">Conexsol Energy · Miami, FL</p>
    </div>
  </div>
</body>
</html>`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  const token = req.query.token as string;
  if (!token) {
    return res.status(400)
      .setHeader('Content-Type', 'text/html')
      .send(htmlPage('Invalid Link', 'This approval link is invalid. Please contact Conexsol Energy for assistance.', false));
  }

  const { data: quote, error } = await supabaseAdmin
    .from('quote_approvals')
    .select('*')
    .eq('token', token)
    .single();

  if (error || !quote) {
    return res.status(404)
      .setHeader('Content-Type', 'text/html')
      .send(htmlPage('Quote Not Found', 'This approval link is no longer valid. The quote may have expired or already been processed.', false));
  }

  if (quote.approved_at) {
    return res.status(200)
      .setHeader('Content-Type', 'text/html')
      .send(htmlPage('Already Approved', `This quote for <strong>${quote.wo_number}</strong> was already approved on ${new Date(quote.approved_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}. Our team will be in touch shortly.`, true));
  }

  if (new Date(quote.expires_at) < new Date()) {
    return res.status(410)
      .setHeader('Content-Type', 'text/html')
      .send(htmlPage('Quote Expired', 'This quote has expired. Please contact Conexsol Energy at (305) 555-0199 for an updated quote.', false));
  }

  // Mark as approved
  const { error: updateErr } = await supabaseAdmin
    .from('quote_approvals')
    .update({ approved_at: new Date().toISOString() })
    .eq('token', token);

  if (updateErr) {
    console.error('[approve-quote] update error:', updateErr.message);
    return res.status(500)
      .setHeader('Content-Type', 'text/html')
      .send(htmlPage('Error', 'Something went wrong. Please try again or contact us at (305) 555-0199.', false));
  }

  return res.status(200)
    .setHeader('Content-Type', 'text/html')
    .send(htmlPage(
      'Quote Approved!',
      `Thank you! Your quote for <strong>${quote.wo_number}</strong> ($${Number(quote.grand_total).toFixed(2)}) has been approved. Our team will schedule your service and contact you shortly.`,
      true
    ));
}
