/**
 * Add mia.lopez@conexsol.us as staff (Supabase) and contractor (Neon).
 * Run: npx tsx scripts/add-mia-lopez.mts
 */
import { createClient } from '@supabase/supabase-js';
import { neon } from '@netlify/neon';

const SUPABASE_URL = 'https://cjmhfagkkayelcsprbai.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DB_URL = process.env.NETLIFY_DATABASE_URL!;
const EMAIL = 'mia.lopez@conexsol.us';
const PASSWORD = '123456789';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── 1. Staff (Supabase) ───────────────────────────────────────────────────────
async function addStaff() {
  console.log('\n── Staff (Supabase) ──');

  // Check if already exists
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
  const existing = list?.users.find(u => u.email === EMAIL);

  if (existing) {
    // Update password
    const { error } = await admin.auth.admin.updateUserById(existing.id, { password: PASSWORD });
    if (error) { console.error(`  FAIL update password: ${error.message}`); return; }
    console.log(`  UPDATED  ${EMAIL} — password reset to ${PASSWORD}`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { name: 'Mia Lopez', role: 'admin', phone: '', username: '@mlopez' },
    });
    if (error) { console.error(`  FAIL create: ${error.message}`); return; }
    console.log(`  CREATED  ${EMAIL} (${data.user.id})`);
  }
}

// ── 2. Contractor (Neon) ──────────────────────────────────────────────────────
async function addContractor() {
  console.log('\n── Contractor (Neon) ──');
  const sql = neon(DB_URL);

  const rows = await sql`SELECT data FROM stores WHERE key = 'solarflow_contractors'`;
  const contractors: any[] = rows[0]?.data ?? [];

  const existing = contractors.find((c: any) => c.email === EMAIL);
  if (existing) {
    // Update password
    const updated = contractors.map((c: any) =>
      c.email === EMAIL ? { ...c, password: PASSWORD, mustChangePassword: false } : c
    );
    await sql`UPDATE stores SET data = ${JSON.stringify(updated)}::jsonb WHERE key = 'solarflow_contractors'`;
    console.log(`  UPDATED  ${EMAIL} — password reset to ${PASSWORD}`);
    return;
  }

  const newContractor = {
    id: `contractor-mlopez-${Date.now()}`,
    email: EMAIL,
    password: PASSWORD,
    role: 'contractor',
    status: 'approved',
    createdAt: new Date().toISOString(),
    contactName: 'Mia Lopez',
    contactPhone: '',
    businessName: 'Mia Lopez',
    businessType: 'sole_proprietor',
    ein: '',
    streetAddress: '',
    city: '',
    state: '',
    zip: '',
    insuranceProvider: '',
    policyNumber: '',
    coiDocument: '',
    coiExpiryDate: '',
    generalLiabilityLimit: 0,
    workersCompPolicy: '',
    agreedToSafety: false,
    skills: [],
    mustChangePassword: false,
  };

  const updated = [...contractors, newContractor];

  if (rows.length === 0) {
    await sql`INSERT INTO stores (key, data) VALUES ('solarflow_contractors', ${JSON.stringify(updated)}::jsonb)`;
  } else {
    await sql`UPDATE stores SET data = ${JSON.stringify(updated)}::jsonb WHERE key = 'solarflow_contractors'`;
  }

  console.log(`  CREATED  ${EMAIL} (contractor)`);
}

(async () => {
  await addStaff();
  await addContractor();
  console.log('\nDone.\n');
})().catch(console.error);
