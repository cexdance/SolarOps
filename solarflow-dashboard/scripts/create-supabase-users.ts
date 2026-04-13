/**
 * Run once to create staff users in Supabase Auth.
 * Usage: SUPABASE_SERVICE_ROLE_KEY=eyJ... npx tsx scripts/create-supabase-users.ts
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

const staff = [
  { email: 'cesar.jurado@conexsol.us',   name: 'Cesar Jurado (Admin)',       role: 'admin',   phone: '555-0100', username: '@cjurado'   },
  { email: 'carlos.valbuena@conexsol.us', name: 'Carlos Valbuena (COO)',      role: 'coo',     phone: '555-0101', username: '@cvalbuena' },
  { email: 'daniel.matos@conexsol.us',    name: 'Daniel Matos (Admin)',       role: 'admin',   phone: '',         username: '@dmatos'    },
  { email: 'anthony.lopez@conexsol.us',   name: 'Anthony Lopez (Admin)',      role: 'admin',   phone: '',         username: '@alopez'    },
  { email: 'andrea.alvarez@conexsol.net', name: 'Andrea Alvarez (Admin)',     role: 'admin',   phone: '',         username: '@aalvarez'  },
  { email: 'carlos.valbuena2@conexsol.us',name: 'Carlos Valbuena (Support)',  role: 'support', phone: '',         username: '@cvalbuena2'},
  { email: 'edgar.diaz@conexsol.us',      name: 'Edgar Diaz',                role: 'sales',   phone: '',         username: '@ediaz'     },
  { email: 'andreina.lecue@conexsol.us',  name: 'Andreina Lecue',            role: 'sales',   phone: '',         username: '@alecue'    },
  { email: 'mia.lopez@conexsol.us',       name: 'Mia Lopez (Admin)',         role: 'admin',   phone: '',         username: '@mlopez'    },
];

async function main() {
  for (const user of staff) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: user.email,
      password: INITIAL_PASSWORD,
      email_confirm: true,
      user_metadata: {
        name: user.name,
        role: user.role,
        phone: user.phone,
        username: user.username,
      },
    });

    if (error) {
      console.error(`❌ ${user.email}: ${error.message}`);
    } else {
      console.log(`✅ ${user.email} (${data.user.id})`);
    }
  }
}

main();
