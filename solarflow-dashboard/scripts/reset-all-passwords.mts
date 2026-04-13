/**
 * Reset ALL staff (Supabase) and contractor (Neon) passwords to '123456789'
 * and set mustChangePassword = true so users are prompted to change on first login.
 *
 * Run: npx tsx scripts/reset-all-passwords.mts
 */
import { createClient } from '@supabase/supabase-js';
import { neon } from '@netlify/neon';

const SUPABASE_URL = 'https://cjmhfagkkayelcsprbai.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const NEW_PASSWORD = '123456789';

if (!SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY env var');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── 1. Reset Supabase staff accounts ──────────────────────────────────────────
async function resetStaff() {
  console.log('\n── Staff accounts (Supabase) ──');
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 100 });
  if (error) { console.error('List users error:', error.message); return; }

  for (const user of data.users) {
    const email = user.email ?? '(no email)';
    const role = user.user_metadata?.role ?? 'unknown';
    // Skip contractors managed in Neon
    if (role === 'contractor') { console.log(`  SKIP  ${email} (contractor role)`); continue; }

    const { error: pwErr } = await admin.auth.admin.updateUserById(user.id, {
      password: NEW_PASSWORD,
      user_metadata: { ...user.user_metadata, mustChangePassword: true },
    });
    if (pwErr) {
      console.error(`  FAIL  ${email}: ${pwErr.message}`);
    } else {
      console.log(`  OK    ${email} (${role})`);
    }
  }
}

// ── 2. Reset contractor accounts in Neon ──────────────────────────────────────
async function resetContractors() {
  console.log('\n── Contractor accounts (Neon) ──');
  const sql = neon(process.env.NETLIFY_DATABASE_URL!);

  // Load current contractors store
  const rows = await sql`SELECT data FROM stores WHERE key = 'solarflow_contractors'`;
  if (!rows.length) { console.log('  No contractors found in Neon'); return; }

  const contractors: any[] = rows[0].data ?? [];
  if (!Array.isArray(contractors) || contractors.length === 0) {
    console.log('  Contractors array is empty');
    return;
  }

  const updated = contractors.map((c: any) => ({
    ...c,
    password: NEW_PASSWORD,
    mustChangePassword: true,
  }));

  await sql`UPDATE stores SET data = ${JSON.stringify(updated)}::jsonb WHERE key = 'solarflow_contractors'`;

  for (const c of updated) {
    console.log(`  OK    ${c.email ?? c.contactName} (${c.id})`);
  }
}

(async () => {
  await resetStaff();
  await resetContractors();
  console.log('\nDone. All accounts reset to default password with mustChangePassword = true.\n');
})();
