import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabaseAdmin = createClient(
  'https://cjmhfagkkayelcsprbai.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
) as any;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  const token = (req.headers.authorization ?? '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Unauthorized' });

  const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
  if (listError) return res.status(500).json({ error: 'Failed to fetch users' });

  const staff = users
    .filter(u => {
      const role = (u.user_metadata?.role as string) ?? '';
      return ['admin', 'coo', 'support', 'sales', 'technician'].includes(role);
    })
    .map(u => ({
      id: u.id,
      name: u.user_metadata?.name ?? u.email ?? 'Staff',
      email: u.email ?? '',
      phone: u.user_metadata?.phone ?? '',
      role: u.user_metadata?.role ?? 'admin',
      active: true,
      username: u.user_metadata?.username ?? '',
      // Avatar URL stored in user_metadata by the client after Storage upload
      avatar: (u.user_metadata?.avatar_url as string | undefined) ?? undefined,
    }));

  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.status(200).json(staff);
}
