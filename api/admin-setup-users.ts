/**
 * ONE-TIME admin endpoint — creates/updates Cruz, Andreina, Edgar in Supabase Auth.
 * DELETE THIS FILE after running.
 * Auth: ?secret=solarops-setup-2026
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

const SUPABASE_URL = 'https://cjmhfagkkayelcsprbai.supabase.co';
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const USERS_TO_SETUP = [
  { email: 'curz.fernandez@conexsol.us',    name: 'Cruz Fernandez',   username: 'CruzF',    role: 'support' },
  { email: 'andreina@conexsol.us',          name: 'Andreina',         username: 'Andreina', role: 'support' },
  { email: 'edgar@conexsol.us',             name: 'Edgar',            username: 'Edgar',    role: 'support' },
];

async function listUsers(): Promise<Record<string, unknown>[]> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=200`, {
    headers: { Authorization: `Bearer ${SVC}`, apikey: SVC },
  });
  const body = await res.json() as { users?: Record<string, unknown>[] };
  return body.users ?? [];
}

async function createUser(email: string, meta: Record<string, string>): Promise<{ action: string; error?: string }> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SVC}`, apikey: SVC, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password: 'Conexsol2026!',
      email_confirm: true,
      user_metadata: meta,
    }),
  });
  const body = await res.json() as Record<string, unknown>;
  if (!res.ok) return { action: 'created', error: JSON.stringify(body) };
  return { action: 'created' };
}

async function updateUser(id: string, meta: Record<string, string>): Promise<{ action: string; error?: string }> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${SVC}`, apikey: SVC, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_metadata: meta }),
  });
  const body = await res.json() as Record<string, unknown>;
  if (!res.ok) return { action: 'updated', error: JSON.stringify(body) };
  return { action: 'updated' };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.query.secret !== 'solarops-setup-2026') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const existing = await listUsers();
  const results: Record<string, unknown>[] = [];

  for (const u of USERS_TO_SETUP) {
    const meta = { name: u.name, username: u.username, role: u.role };
    const found = existing.find(e => (e.email as string)?.toLowerCase() === u.email.toLowerCase());
    if (found) {
      const r = await updateUser(found.id as string, meta);
      results.push({ email: u.email, ...r });
    } else {
      const r = await createUser(u.email, meta);
      results.push({ email: u.email, ...r });
    }
  }

  return res.status(200).json({ ok: true, results });
}
