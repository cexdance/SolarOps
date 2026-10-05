import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireUser } from './_auth';
import { decryptMailbox, mailboxFromEnv } from './_mailbox';

export async function mailboxDb(path: string, init: RequestInit = {}) {
  const url = (process.env.SUPABASE_URL || 'https://cjmhfagkkayelcsprbai.supabase.co').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const response = await fetch(`${url}/${path}`, { ...init, signal: AbortSignal.timeout(8000), headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json', ...init.headers } });
  if (!response.ok) throw new Error('Mailbox storage request failed.');
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
export function mailboxRpc(name: string, args: Record<string, unknown> = {}) {
  return mailboxDb(`rest/v1/rpc/${name}`, { method: 'POST', body: JSON.stringify(args) });
}
export async function configuredMailbox() {
  const rows = await mailboxDb('rest/v1/shared_mailbox?id=eq.primary&select=encrypted_config&limit=1');
  const mailbox = rows[0] ? decryptMailbox(rows[0].encrypted_config, process.env.MAILBOX_ENCRYPTION_KEY || '') : mailboxFromEnv(process.env);
  if (!mailbox) throw new Error('Mailbox is not configured.');
  return mailbox;
}
export async function requireMailboxAdmin(req: VercelRequest, res: VercelResponse) {
  const user = await requireUser(req, res);
  if (!user) return false;
  const rows = await mailboxDb(`rest/v1/user_roles?user_id=eq.${encodeURIComponent(user.id)}&select=role&limit=1`);
  if (rows[0]?.role === 'admin') return true;
  res.status(403).json({ error: 'Mailbox access requires an administrator.' });
  return false;
}
