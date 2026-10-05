import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash, timingSafeEqual } from 'node:crypto';
import { mailboxDb, mailboxRpc, requireMailboxAdmin } from './_mailboxStore';
import { runMailboxSync, startNewMailSync } from './_mailboxSync';

export function isMailboxScheduler(header: unknown, expected = process.env.MAILBOX_SYNC_TOKEN_SHA256 || '') {
  if (typeof header !== 'string' || !/^[a-f\d]{64}$/i.test(expected)) return false;
  const token = /^Bearer ([^\s]+)$/.exec(header)?.[1];
  if (!token) return false;
  return timingSafeEqual(createHash('sha256').update(token).digest(), Buffer.from(expected, 'hex'));
}
export default async function mailboxSyncApi(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  try {
    // The scheduler credential can only run a batch; it cannot read messages,
    // enable importing, change credentials, or change permissions.
    const scheduler = req.method === 'POST' && req.body?.action === 'run' && isMailboxScheduler(req.headers.authorization);
    if (!scheduler && !(await requireMailboxAdmin(req, res))) return;
    if (req.method === 'GET') {
      const states = await mailboxDb('rest/v1/mailbox_sync_state?id=eq.primary&select=enabled,mailbox_email,folders,started_at,last_completed_at,last_error&limit=1');
      const latest = await mailboxDb('rest/v1/mailbox_messages?select=id,subject,message_date,direction,content_status&order=message_date.desc.nullslast&limit=10');
      return res.status(200).json({ state: states[0] || null, latest });
    }
    switch (req.body?.action) {
      case 'start-new': await startNewMailSync(); return res.status(200).json({ ok: true });
      case 'pause': await mailboxRpc('mailbox_sync_pause'); return res.status(200).json({ ok: true });
      case 'run': return res.status(200).json(await runMailboxSync());
      default: return res.status(400).json({ error: 'Unknown synchronization action.' });
    }
  } catch {
    return res.status(503).json({ error: 'Mailbox synchronization unavailable. Check configuration and the saved sync status.' });
  }
}
