/**
 * Run once to create contractor users in Supabase Auth.
 * Usage: SUPABASE_SERVICE_ROLE_KEY=eyJ... npx tsx scripts/create-contractor-users.ts
 *
 * NOTE: cesar.jurado@conexsol.us is already created as a staff admin — skip it.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cjmhfagkkayelcsprbai.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SERVICE_ROLE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const INITIAL_PASSWORD = process.env.INITIAL_PASSWORD ?? 'ChangeMe2026!';

const contractors = [
  { email: 'cjurado@mpowermarketing.com',  role: 'contractor', name: 'Cesar Jurado (MPower)' },
  { email: 'rperera@solarpowermax.com',     role: 'contractor', name: 'Reynaldo Perera' },
  { email: 'jmendez@ingengroup.com',        role: 'contractor', name: 'Jaime Mendez' },
  { email: 'cvalbuena@valnuarcapital.com',  role: 'contractor', name: 'Carlos Valbuena' },
  { email: 'mike.solar@solarcontractor.com',role: 'contractor', name: 'Mike Thompson' },
  { email: 'joe.electrical@sunpower.com',   role: 'contractor', name: 'Joe Rodriguez' },
  { email: 'carlos.solar@elite-solar.com',  role: 'contractor', name: 'Carlos Martinez' },
];

async function main() {
  for (const user of contractors) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: user.email,
      password: INITIAL_PASSWORD,
      email_confirm: true,
      user_metadata: {
        name: user.name,
        role: user.role,
      },
    });

    if (error) {
      if (error.message.toLowerCase().includes('already registered') || error.message.toLowerCase().includes('already been registered')) {
        console.log(`⚠️  ${user.email}: already exists`);
      } else {
        console.error(`❌ ${user.email}: ${error.message}`);
      }
    } else {
      console.log(`✅ ${user.email} (${data.user.id})`);
    }
  }
}

main();
