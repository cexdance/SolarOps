import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireUser } from './_auth';
import { requestVisit, decideVisit, visitId, recordVisitPayment } from './_serviceVisits';
import type { Job } from '../solarflow-dashboard/src/types';
const url = (process.env.SUPABASE_URL || 'https://cjmhfagkkayelcsprbai.supabase.co').trim();
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
async function read(path: string) {
  const r = await fetch(`${url}/rest/v1/${path}`, { headers });
  if (!r.ok) throw new Error('Service order storage unavailable');
  return r.json();
}
async function notifyReviewer(job: Job): Promise<void> {
  if (!job.currentVisit) return;
  const r = await fetch(`${url}/auth/v1/admin/users?per_page=200`, { headers });
  if (!r.ok) throw new Error('Could not resolve quote reviewer');
  const directory = await r.json();
  const trusted = await read('user_roles?role=in.(admin,coo)&select=user_id');
  const reviewer = (directory.users ?? []).find((u: { id: string; user_metadata?: { name?: string; full_name?: string; username?: string } }) => trusted.some((t: { user_id: string }) => t.user_id === u.id) && /daniel|dmatos/i.test(`${u.user_metadata?.name ?? ''} ${u.user_metadata?.full_name ?? ''} ${u.user_metadata?.username ?? ''}`));
  if (!reviewer) throw new Error('Daniel is not configured as a quote reviewer');
  const inserted = await fetch(`${url}/rest/v1/notifications?on_conflict=id`, { method: 'POST', headers: { ...headers, Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({
    id: `visit-review:${job.currentVisit.id}`, user_id: reviewer.id, type: 'mention',
    title: `Follow-up visit ${job.currentVisit.number} needs quote review`,
    message: `${job.woNumber || job.id}: ${job.currentVisit.serviceType}. Proposed ${job.currentVisit.proposedDate}. Create a quote or mark the visit included.`,
    related_job_id: job.id, related_customer_id: null, related_activity_id: null, read: false, created_at: job.currentVisit.requestedAt,
  }) });
  if (!inserted.ok) throw new Error('Could not notify quote reviewer');
}
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const caller = await requireUser(req, res); if (!caller) return;
  try {
    const b = req.body;
    if (!b || typeof b.jobId !== 'string' || !['request', 'included', 'approved', 'paid'].includes(b.action)) return res.status(400).json({ error: 'Invalid visit request' });
    const roles = await read(`user_roles?user_id=eq.${encodeURIComponent(caller.id)}&select=role`);
    const role = roles[0]?.role;
    const admin = ['admin', 'coo'].includes(role);
    if (b.action !== 'request' && !admin) return res.status(403).json({ error: 'Only an admin can approve or include a visit.' });
    const rows = await read(`app_data?key=eq.${encodeURIComponent(`job:${b.jobId}`)}&select=value,updated_at`);
    const row = rows[0]; if (!row) return res.status(404).json({ error: 'Service order not found' });
    const job: Job = row.value;
    if (!['admin', 'coo', 'technician'].includes(role)) {
      const directory = await read('app_data?key=eq.solarflow_contractors&select=value');
      const me = (directory[0]?.value ?? []).find((c: { id: string; email?: string; altEmails?: string[]; status?: string }) => c.status === 'approved' && [c.email, ...(c.altEmails ?? [])].some(e => e?.toLowerCase() === caller.email?.toLowerCase()));
      if (role !== 'contractor' || !me || ![job.contractorId, ...(job.supportContractorIds ?? [])].includes(me.id)) return res.status(403).json({ error: 'This service order is not assigned to you.' });
    }
    if (job.status === 'archived') return res.status(409).json({ error: 'Restore this order before adding a visit.' });
    if (['included', 'approved'].includes(b.action) && b.expectedVisitId !== visitId(job)) return res.status(409).json({ error: 'The visit changed. Refresh and try again.' });
    if (b.action === 'request') {
      const rates = await read('app_data?key=eq.solarflow_service_rates&select=value');
      const rate = (rates[0]?.value ?? []).find((r: { serviceName: string; active: boolean }) => r.active && r.serviceName === b.serviceType);
      if (!rate) return res.status(400).json({ error: 'Select an active service type from the catalog.' });
      b.serviceCode = rate.serviceCode || rate.id;
    }
    const now = new Date().toISOString();
    const next = b.action === 'paid' ? recordVisitPayment(job, b.expectedVisitId, b.reason, caller.id, now) : b.action === 'request' ? requestVisit(job, b, caller.id, now) : decideVisit(job, b.action, b.reason, caller.id, now);
    if (next === job) { if (b.action === 'request') await notifyReviewer(job).catch(e => console.warn('[visits] review notification', e.message)); return res.status(200).json({ job }); }
    next.fieldTimes = { ...job.fieldTimes, ...Object.fromEntries(Object.keys(next).filter(k => JSON.stringify(next[k as keyof Job]) !== JSON.stringify(job[k as keyof Job])).map(k => [k, now])) };
    // Removed fields need clocks too, so stale offline approval cannot win.
    for (const k of Object.keys(job)) if (!(k in next)) next.fieldTimes[k] = now;
    const r = await fetch(`${url}/rest/v1/app_data?key=eq.${encodeURIComponent(`job:${b.jobId}`)}&updated_at=eq.${encodeURIComponent(row.updated_at)}`, {
      method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify({ value: next, updated_at: now }),
    });
    if (!r.ok) return res.status(503).json({ error: 'Could not save the visit. Please retry.' });
    if (!(await r.json()).length) return res.status(409).json({ error: 'The order was updated on another device. Refresh and retry.' });
    let warning: string | undefined;
    if (b.action === 'request') await notifyReviewer(next).catch(() => { warning = 'Visit saved in the quote queue, but the reviewer notification could not be delivered.'; });
    return res.status(200).json({ job: next, warning });
  } catch (e) { return res.status(400).json({ error: e instanceof Error ? e.message : 'Could not update visit' }); }
}
