/**
 * Grant dual staff+contractor access to specific users.
 * - cesar.jurado@conexsol.us  → keeps role='staff', adds isContractor=true
 * - carlos.solar@elite-solar.com → keeps role='contractor', adds isStaff=true
 *
 * Run: SUPABASE_SERVICE_ROLE_KEY=xxx npx tsx scripts/grant-dual-access.mts
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cjmhfagkkayelcsprbai.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY env var');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const updates: Array<{ email: string; metadata: Record<string, unknown> }> = [
  {
    email: 'cesar.jurado@conexsol.us',
    metadata: { isContractor: true }, // keeps existing role, adds contractor access
  },
  {
    email: 'carlos.solar@elite-solar.com',
    metadata: { isStaff: true }, // keeps existing role='contractor', adds staff access
  },
];

async function run() {
  const { data: { users }, error: listErr } = await admin.auth.admin.listUsers();
  if (listErr) { console.error('Failed to list users:', listErr.message); process.exit(1); }

  for (const { email, metadata } of updates) {
    const user = users.find(u => u.email === email);
    if (!user) { console.warn(`⚠️  User not found: ${email}`); continue; }

    const { error } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: { ...user.user_metadata, ...metadata },
    });

    if (error) {
      console.error(`❌ Failed ${email}:`, error.message);
    } else {
      console.log(`✅ Updated ${email} →`, { ...user.user_metadata, ...metadata });
    }
  }
}

run();
