/**
 * Reset all contractor passwords to '123456789' via the deployed /api/store endpoint.
 * Run: npx tsx scripts/reset-contractor-passwords.mts
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cjmhfagkkayelcsprbai.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ZJxDOnaciVIiLnPKCASeqQ_Y3OFzjis';
const API_BASE = 'https://solarflow-dashboard-sooty.vercel.app/api/store';
const NEW_PASSWORD = '123456789';

async function main() {
  // Authenticate as admin to get a token
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'cesar.jurado@conexsol.us',
    password: NEW_PASSWORD,
  });
  if (authErr || !auth.session) {
    console.error('Auth failed:', authErr?.message);
    process.exit(1);
  }
  const token = auth.session.access_token;
  console.log('Authenticated as cesar.jurado@conexsol.us');

  // GET contractors
  const getRes = await fetch(`${API_BASE}?key=solarflow_contractors`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!getRes.ok) { console.error('GET failed:', getRes.status, await getRes.text()); process.exit(1); }
  const contractors = await getRes.json() as any[];
  if (!Array.isArray(contractors) || contractors.length === 0) {
    console.log('No contractors found');
    process.exit(0);
  }

  console.log(`\n── Contractor accounts (${contractors.length}) ──`);
  const updated = contractors.map((c: any) => {
    console.log(`  OK    ${c.email ?? c.contactName}`);
    return { ...c, password: NEW_PASSWORD, mustChangePassword: true };
  });

  // POST updated contractors back
  const postRes = await fetch(`${API_BASE}?key=solarflow_contractors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(updated),
  });
  if (!postRes.ok) { console.error('POST failed:', postRes.status, await postRes.text()); process.exit(1); }
  console.log('\nAll contractor passwords reset to 123456789 with mustChangePassword = true');
}

main().catch(console.error);
