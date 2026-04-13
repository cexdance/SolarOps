import { neon } from '@netlify/neon';
import { createClient } from '@supabase/supabase-js';

const sql = neon(process.env.NETLIFY_DATABASE_URL!);

const supabaseAdmin = createClient(
  'https://cjmhfagkkayelcsprbai.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS stores (
      key TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

// Keys contractors are allowed to read/write
const CONTRACTOR_ALLOWED_KEYS = new Set([
  'solarflow_contractors',
  'solarflow_service_rates',
  'solarflow_contractor_jobs',
  'solarflow_contractor_invites',
]);

// Keys that read-only roles (support, sales) may NOT write
const WRITE_RESTRICTED_KEYS = new Set([
  'solarflow_data',
  'solarflow_customers',
  'solarflow_interactions',
  'solarops_work_orders',
  'solarops_alerts',
  'solarops_site_profiles',
]);

// Roles that have write access to all staff keys
const WRITE_ROLES = new Set(['admin', 'coo']);
// Roles that have read-only access
const READ_ONLY_ROLES = new Set(['support', 'sales']);

async function getAuthorizedUser(req: Request): Promise<{ role: string } | null> {
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  const role = (user.user_metadata?.role as string) ?? 'unknown';
  return { role };
}

function isAllowed(key: string, role: string, method: string): boolean {
  const isWrite = method === 'POST';

  if (role === 'contractor') {
    return CONTRACTOR_ALLOWED_KEYS.has(key);
  }
  if (WRITE_ROLES.has(role)) {
    return true; // admins and COO can read/write everything
  }
  if (READ_ONLY_ROLES.has(role)) {
    if (isWrite && WRITE_RESTRICTED_KEYS.has(key)) return false; // block writes
    return true; // reads always allowed for staff
  }
  return false; // unknown roles denied
}

export default async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN ?? 'https://conexsol.com',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  const authUser = await getAuthorizedUser(req);
  if (!authUser) {
    return new Response('Unauthorized', { status: 401 });
  }

  const url = new URL(req.url);
  const key = url.searchParams.get('key');

  if (!key) {
    return new Response('Missing key', { status: 400 });
  }

  if (!isAllowed(key, authUser.role, req.method)) {
    return new Response('Forbidden', { status: 403 });
  }

  const headers = {
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN ?? 'https://conexsol.com',
    'Content-Type': 'application/json',
  };

  try {
    await ensureTable();

    if (req.method === 'GET') {
      const rows = await sql`SELECT data FROM stores WHERE key = ${key}`;
      if (rows.length === 0) return new Response('null', { status: 200, headers });
      return new Response(JSON.stringify(rows[0].data), { status: 200, headers });
    }

    if (req.method === 'POST') {
      const body = await req.json();
      await sql`
        INSERT INTO stores (key, data, updated_at)
        VALUES (${key}, ${JSON.stringify(body)}, NOW())
        ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
      `;
      return new Response('ok', { status: 200, headers });
    }

    return new Response('Method not allowed', { status: 405 });
  } catch (err) {
    console.error('store fn error:', err);
    return new Response('Internal error', { status: 500 });
  }
};

export const config = { path: '/api/store' };
