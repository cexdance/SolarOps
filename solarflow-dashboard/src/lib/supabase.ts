import { createClient } from '@supabase/supabase-js';

// .trim() guards against Vercel env-pull artifacts that embed literal \n in quoted values
const supabaseUrl     = (import.meta.env.VITE_SUPABASE_URL      as string ?? '').trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string ?? '').trim();

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables');
}

// iOS Chrome in Private Mode throws SecurityError when accessing localStorage.
// Provide an in-memory fallback so auth still works (session is lost on tab close,
// but the upload doesn't crash). All other browsers use the real localStorage.
function safeStorage(): Storage {
  try {
    // Probe for access — throws SecurityError in iOS Private Mode
    localStorage.setItem('__sb_probe__', '1');
    localStorage.removeItem('__sb_probe__');
    return localStorage;
  } catch {
    // In-memory fallback — session not persisted across page loads, but no crash
    const store: Record<string, string> = {};
    return {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
      clear: () => { Object.keys(store).forEach(k => delete store[k]); },
      key: (i: number) => Object.keys(store)[i] ?? null,
      get length() { return Object.keys(store).length; },
    } as Storage;
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    storageKey: 'solarflow_auth',
    storage: safeStorage(),
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export type SupabaseUser = Awaited<ReturnType<typeof supabase.auth.getUser>>['data']['user'];

/** Current Supabase access token, or '' when not signed in. */
export async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? '';
}

/**
 * fetch() that attaches the caller's Supabase JWT as `Authorization: Bearer`.
 * Use for any /api/* route guarded by requireUser (paid/rate-limited proxies).
 */
export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
