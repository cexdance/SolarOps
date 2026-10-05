import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireUser } from './_auth';
import { checkMailbox, decryptMailbox, encryptMailbox, mailboxFromEnv, validateMailbox } from './_mailbox';

export const config = { maxDuration: 60 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const user = await requireUser(req, res);
  if (!user) return;
  const url = (process.env.SUPABASE_URL || 'https://cjmhfagkkayelcsprbai.supabase.co').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const key = process.env.MAILBOX_ENCRYPTION_KEY || '';
  const headers = { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/json' };
  try {
    const roleResponse = await fetch(`${url}/rest/v1/user_roles?user_id=eq.${encodeURIComponent(user.id)}&select=role&limit=1`, { headers });
    if (!roleResponse.ok) return res.status(503).json({ error: 'Unable to verify mailbox permissions.' });
    const roles = await roleResponse.json() as { role: string }[];
    if (roles[0]?.role !== 'admin') return res.status(403).json({ error: 'Mailbox setup requires an administrator.' });

    if (req.method === 'POST' && req.body?.action === 'save') {
      let mailbox;
      try { mailbox = validateMailbox(req.body.config); }
      catch (error) { return res.status(400).json({ error: (error as Error).message }); }
      if (!/^[a-f\d]{64}$/i.test(key)) return res.status(503).json({ error: 'Server setup required: configure MAILBOX_ENCRYPTION_KEY before saving.' });
      const checks = await checkMailbox(mailbox);
      if (!checks.smtp.ok || !checks.imap.ok) return res.status(422).json({ error: 'Connection checks failed. Existing settings were kept.', checks });
      const saved = await fetch(`${url}/rest/v1/shared_mailbox?on_conflict=id`, {
        method: 'POST', headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ id: 'primary', encrypted_config: encryptMailbox(mailbox, key), updated_by: user.id, updated_at: new Date().toISOString() }),
      });
      if (!saved.ok) return res.status(503).json({ error: 'Could not save mailbox. Verify the shared mailbox database migration.' });
      return res.status(200).json({ configured: true, source: 'database', email: mailbox.email, smtpHost: mailbox.smtpHost, smtpPort: mailbox.smtpPort, imapHost: mailbox.imapHost, checks });
    }
    if (req.method === 'POST' && req.body?.action !== 'check') return res.status(400).json({ error: 'Unknown mailbox action.' });

    const stored = await fetch(`${url}/rest/v1/shared_mailbox?id=eq.primary&select=encrypted_config&limit=1`, { headers });
    // Do not silently use another mailbox if the saved configuration is unavailable.
    if (!stored.ok) return res.status(503).json({ error: 'Mailbox storage unavailable. Apply the shared mailbox database migration.' });
    const rows = await stored.json() as { encrypted_config: string }[];
    const mailbox = rows[0] ? decryptMailbox(rows[0].encrypted_config, key) : mailboxFromEnv(process.env);
    if (!mailbox) return res.status(200).json({ configured: false });
    const summary = { configured: true, source: rows[0] ? 'database' : 'environment', email: mailbox.email, smtpHost: mailbox.smtpHost, smtpPort: mailbox.smtpPort, imapHost: mailbox.imapHost };
    if (req.method === 'GET') return res.status(200).json(summary);
    return res.status(200).json({ ...summary, checks: await checkMailbox(mailbox) });
  } catch {
    // Never serialize provider errors, configuration objects, or credentials.
    return res.status(503).json({ error: 'Mailbox configuration unavailable. Check server settings and encryption key.' });
  }
}
