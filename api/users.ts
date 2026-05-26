import type { VercelRequest, VercelResponse } from '@vercel/node';

const SUPABASE_URL = 'https://cjmhfagkkayelcsprbai.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  // Validate caller JWT via Supabase Auth REST API
  const token = (req.headers.authorization ?? '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SERVICE_ROLE_KEY,
    },
  });
  if (!verifyRes.ok) return res.status(401).json({ error: 'Unauthorized' });

  // List all users via Supabase Auth Admin REST API
  const listRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=200`, {
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
    },
  });
  if (!listRes.ok) return res.status(500).json({ error: 'Failed to fetch users' });

  const body = await listRes.json() as { users?: Record<string, unknown>[] };
  const allUsers: Record<string, unknown>[] = body.users ?? [];

  const STAFF_ROLES = new Set(['admin', 'coo', 'support', 'sales', 'technician']);

  const staff = allUsers
    .filter(u => {
      const meta = (u.user_metadata as Record<string, unknown>) ?? {};
      return STAFF_ROLES.has((meta.role as string) ?? '');
    })
    .map(u => {
      const meta = (u.user_metadata as Record<string, unknown>) ?? {};
      return {
        id: u.id as string,
        name: (meta.name as string) ?? (u.email as string) ?? 'Staff',
        email: (u.email as string) ?? '',
        phone: (meta.phone as string) ?? '',
        role: (meta.role as string) ?? 'admin',
        active: true,
        username: (meta.username as string) ?? '',
        avatar: (meta.avatar_url as string | undefined) ?? undefined,
      };
    });

  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.status(200).json(staff);
}
