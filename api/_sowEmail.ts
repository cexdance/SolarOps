/**
 * SolarOps, email the SOW Completion Report.
 *
 * POST /api/users?sowEmail=1, body { jobId }.
 *
 * The twin of the "Send PDF to Trello" path in trello-card.ts: the browser
 * renders the PDF and uploads it to Storage first (a report with photos runs
 * past Vercel's 4.5 MB request cap), then the server mails that stored file.
 * The Storage path is built from the job id, so a request can only mail this
 * order's own report, and the recipient comes from config, never the request.
 *
 * Sent through the shared IONOS mailbox rather than Resend: conexsol.us is
 * still unverified in Resend, so every Resend send from that domain 403s.
 *
 * Not a route (leading underscore). Mounted on api/users.ts because the Hobby
 * plan caps api/ at 12 functions and we are at the cap. Imported STATICALLY
 * there: Vercel only bundles what it can trace, and a dynamic import is not
 * emitted into the lambda at all.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireUser } from './_auth';
import { decryptMailbox, mailboxFromEnv, sendMailboxMessage } from './_mailbox';

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://cjmhfagkkayelcsprbai.supabase.co').trim();
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

/** Who receives the report. Env-overridable so it can change without a deploy. */
export const SOW_EMAIL_TO = (process.env.SOW_EMAIL_TO || 'anthony.lopez@conexsol.us').trim();

/** Same cap the Trello attach uses; IONOS rejects far smaller, but fail early. */
const MAX_PDF_BYTES = 10_000_000;

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  // Any signed-in user, matching the Trello attach: whoever can open the report
  // can send it, and it only ever goes to the one configured internal address.
  if (!(await requireUser(req, res))) return;
  if (!SERVICE_KEY) return res.status(503).json({ error: 'Server not configured' });

  const jobId = String((req.body as { jobId?: string } | undefined)?.jobId ?? '').trim();
  if (!/^[A-Za-z0-9_-]{3,80}$/.test(jobId)) return res.status(400).json({ error: 'Malformed job id' });

  const headers = { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY };

  const jr = await fetch(
    `${SUPABASE_URL}/rest/v1/app_data?key=eq.${encodeURIComponent(`job:${jobId}`)}` +
    `&select=value->>woNumber,value->>clientName,value->>siteAddress`,
    { headers: { ...headers, 'Content-Type': 'application/json' } },
  );
  const job = jr.ok ? (await jr.json() as { woNumber?: string; clientName?: string; siteAddress?: string }[])[0] : undefined;
  if (!job) return res.status(404).json({ error: 'No such order' });

  const pdf = await fetch(
    `${SUPABASE_URL}/storage/v1/object/customer-files/sow-reports/${jobId}/sow.pdf`,
    { headers },
  );
  if (!pdf.ok) return res.status(404).json({ error: 'Report PDF not found. Try sending again.' });
  const bytes = Buffer.from(await pdf.arrayBuffer());
  // The upload is a plain Storage PUT, so check what came back really is a PDF
  // before mailing it out of the company mailbox.
  if (bytes.subarray(0, 4).toString('latin1') !== '%PDF') {
    return res.status(400).json({ error: 'Stored report is not a PDF' });
  }
  if (bytes.byteLength > MAX_PDF_BYTES) return res.status(413).json({ error: 'Report PDF is over 10 MB' });

  // Load the shared mailbox the same way the mailbox handler does, falling back
  // to env only when no record is stored.
  const key = process.env.MAILBOX_ENCRYPTION_KEY || '';
  const stored = await fetch(
    `${SUPABASE_URL}/rest/v1/shared_mailbox?id=eq.primary&select=encrypted_config&limit=1`,
    { headers: { ...headers, 'Content-Type': 'application/json' } },
  );
  if (!stored.ok) return res.status(503).json({ error: 'Mailbox storage unavailable.' });
  const rows = await stored.json() as { encrypted_config: string }[];

  let mailbox;
  try {
    mailbox = rows[0] ? decryptMailbox(rows[0].encrypted_config, key) : mailboxFromEnv(process.env);
  } catch {
    return res.status(503).json({ error: 'Mailbox configuration unavailable.' });
  }
  if (!mailbox) return res.status(503).json({ error: 'No shared mailbox is configured. Set one up in Settings.' });

  const order = job.woNumber || jobId;
  const who = job.clientName ? ` for ${job.clientName}` : '';
  const filename = `SOW ${order}.pdf`;
  const lines = [
    `SOW Completion Report${who}`,
    `Service order: ${order}`,
    job.siteAddress ? `Site: ${job.siteAddress}` : '',
    '',
    'The completion report is attached as a PDF.',
  ].filter(Boolean);

  try {
    await sendMailboxMessage(mailbox, {
      to: SOW_EMAIL_TO,
      subject: `SOW Completion Report, ${order}${who}`,
      text: lines.join('\n'),
      html: `<div style="font-family:-apple-system,Segoe UI,sans-serif;font-size:14px;color:#0f172a">
        ${lines.map(l => `<p style="margin:0 0 6px">${esc(l)}</p>`).join('')}
      </div>`,
      attachments: [{ filename, content: bytes, contentType: 'application/pdf' }],
    });
  } catch (err) {
    // Never return the provider error: it can echo the mailbox address and auth.
    console.error('[sow-email] send failed:', err instanceof Error ? err.message : err);
    return res.status(502).json({ error: 'The mail server rejected the message. Check the mailbox settings.' });
  }

  console.info(`[sow-email] ${filename} (${bytes.byteLength} bytes) sent to ${SOW_EMAIL_TO}`);
  return res.status(200).json({ sent: true, to: SOW_EMAIL_TO, filename, bytes: bytes.byteLength });
}
