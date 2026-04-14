// Thin client for Netlify/Neon store function
// Wraps localStorage: Neon is source of truth, localStorage is in-session cache

import { supabase } from './supabase';

const BASE = '/api/store';

async function getAuthHeader(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? `Bearer ${session.access_token}` : '';
}

export const ALL_KEYS = [
  'solarflow_data',
  'solarflow_crm_data',
  'solarflow_customers',
  'solarflow_interactions',
  'solarflow_contractors',
  'solarflow_service_rates',
  'solarflow_contractor_jobs',
  'solarflow_contractor_invites',
  'solarops_work_orders',
  'solarops_alerts',
  'solarops_site_profiles',
  'solarops_todos',
  'solarops_inventory',
  'solarops_projects',
];

export async function dbGet(key: string): Promise<unknown | null> {
  try {
    const res = await fetch(`${BASE}?key=${encodeURIComponent(key)}`, {
      headers: { Authorization: await getAuthHeader() },
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text === 'null' ? null : JSON.parse(text);
  } catch {
    return null;
  }
}

export async function dbSet(key: string, data: unknown): Promise<void> {
  // Skip Neon sync on Vercel (frontend-only deployment, no backend API)
  if (!window.location.hostname.includes('localhost')) return;

  try {
    await fetch(`${BASE}?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: await getAuthHeader(),
      },
      body: JSON.stringify(data),
    });
  } catch {
    // silent — localStorage already saved
  }
}

// On app startup: pull all keys from Neon → seed localStorage
export async function syncFromDB(): Promise<void> {
  // Skip on Vercel (frontend-only deployment)
  if (!window.location.hostname.includes('localhost')) return;

  await Promise.all(
    ALL_KEYS.map(async (key) => {
      const data = await dbGet(key);
      if (data !== null) {
        localStorage.setItem(key, JSON.stringify(data));
      }
    })
  );
}
