import { supabase } from './supabase';
import type { Job } from '../types';
export async function changeVisit(jobId: string, body: Record<string, unknown>): Promise<Job> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sign in to update visits.');
  const r = await fetch('/api/service-visits', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, jobId }) });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Could not save visit');
  window.dispatchEvent(new CustomEvent('solarops-visit-transition', { detail: data.job }));
  return data.job;
}
