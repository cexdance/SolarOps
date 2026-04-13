import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    storageKey: 'solarflow_auth',
    storage: sessionStorage,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export type SupabaseUser = Awaited<ReturnType<typeof supabase.auth.getUser>>['data']['user'];
