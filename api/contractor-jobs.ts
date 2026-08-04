/**
 * SolarOps, scoped contractor work-order read.
 *
 * GET /api/contractor-jobs
 *
 * Phase 2 of the contractor data boundary plan. Returns ONLY the calling
 * contractor's work orders, plus only the customers those work orders reference.
 *
 * WHY THIS EXISTS
 * The contractor portal currently pulls the ENTIRE dataset and filters in the
 * browser (App.tsx:2854 and :3309 call pickupJobsForContractor(id, data.jobs)
 * and look up data.customers). That filtering is cosmetic: a contractor's token
 * works directly against the REST API, so all 416 customer records are one
 * request away. This endpoint is the scoped read path that lets the portal stop
 * pulling everything.
 *
 * IT SCOPES, IT DOES NOT PROJECT
 * The plan originally said this should return jobs "with customer fields
 * projected". Reading the code changed that. toContractorJobView() in
 * woHelpers.ts merges staff job + contractor job + customer, including photo
 * category mapping and a union with existing contractor photos. Reimplementing
 * that here would duplicate real logic and let two copies drift.
 *
 * So this returns the three pieces already narrowed to the caller, and the
 * client keeps using toContractorJobView unchanged. Same security outcome, one
 * implementation of the merge.
 *
 * IDENTITY COMES FROM THE TOKEN, NEVER THE REQUEST
 * The contractor is resolved from the verified caller's email, mirroring
 * resolveSessionRoute() in authRouting.ts. There is deliberately no
 * ?contractorId= parameter: accepting one would let any contractor read any
 * other's work orders, which is the exact bug this endpoint exists to prevent.
 * Same class as api/notify.ts trusting `notifierName` from the request body.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireUser } from './_auth';

const SUPABASE_URL = 'https://cjmhfagkkayelcsprbai.supabase.co';
// .trim() strips trailing \n that Vercel env-pull embeds in quoted values
const SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();

const supabaseHeaders = {
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  apikey: SERVICE_ROLE_KEY,
  'Content-Type': 'application/json',
};

/**
 * Mirrors CONTRACTOR_VISIBLE_STATUSES in woHelpers.ts. Kept in sync by hand:
 * if that set changes and this does not, contractors silently lose or gain
 * visibility of work orders.
 */
const CONTRACTOR_VISIBLE_STATUSES = new Set([
  'assigned', 'scheduled', 'in_progress', 'completed',
]);

interface ContractorRecord {
  id: string;
  email?: string;
  altEmails?: string[];
  status?: string;
}

interface JobRow { id: string; contractorId?: string; customerId?: string; status?: string; woStatus?: string }

/** Read one KV blob row from app_data. Returns null on any failure. */
async function readKV<T>(key: string): Promise<T | null> {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/app_data?key=eq.${encodeURIComponent(key)}&select=value`,
      { headers: supabaseHeaders },
    );
    if (!r.ok) return null;
    const rows = await r.json() as Array<{ value: T }>;
    return rows[0]?.value ?? null;
  } catch {
    return null;
  }
}

/** Read per-record rows whose value matches a column filter. */
async function readRows<T>(query: string): Promise<T[]> {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/app_data?${query}`, { headers: supabaseHeaders });
    if (!r.ok) return [];
    const rows = await r.json() as Array<{ value: T }>;
    return rows.map(x => x.value).filter(Boolean);
  } catch {
    return [];
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const caller = await requireUser(req, res);
  if (!caller) return;

  // ── Resolve the contractor from the VERIFIED email ────────────────────────
  const email = (caller.email ?? '').trim().toLowerCase();
  if (!email) return res.status(403).json({ error: 'No email on this account' });

  const contractors = await readKV<ContractorRecord[]>('solarflow_contractors');
  if (!Array.isArray(contractors)) {
    return res.status(503).json({ error: 'Contractor directory unavailable' });
  }

  const me = contractors.find(c =>
    (c.email ?? '').toLowerCase() === email ||
    (c.altEmails ?? []).some(a => (a ?? '').toLowerCase() === email),
  );

  // Deliberately the same 403 for "not a contractor" and "not approved". A
  // distinct message would tell an unapproved or non-contractor caller which
  // of the two they are, which is more than they need to know.
  if (!me || me.status !== 'approved') {
    return res.status(403).json({ error: 'Not an approved contractor account' });
  }

  // ── Their work orders ─────────────────────────────────────────────────────
  // Filtered server-side by contractorId inside the JSONB, so other
  // contractors' jobs never leave the database. The status filter runs here
  // because it depends on `woStatus ?? status`, which PostgREST cannot express.
  const allMine = await readRows<JobRow>(
    `key=like.job:*&value->>contractorId=eq.${encodeURIComponent(me.id)}&select=value`,
  );
  const jobs = allMine.filter(j => CONTRACTOR_VISIBLE_STATUSES.has(j.woStatus ?? j.status ?? ''));

  // ── Their contractor-job records ──────────────────────────────────────────
  // Keyed off the jobs above, NOT off contractorId on the row. Rows are keyed
  // contractor_job:{sourceJobId ?? id} (contractorJobRowKey in syncEngine.ts),
  // and every live row keys by sourceJobId, which IS the job id.
  //
  // Scoping by the row's own contractorId was wrong in both directions, found
  // 2026-08-04 by diffing this payload against what the portal renders. When
  // admin reassigns a job the JOB moves but the row keeps the old stamp:
  //   LOSS: 2 of contractor-5's 8 visible work orders came back with no
  //   contractor-job record, so the portal re-projects them as cj-view-* and
  //   the next contractor save overwrites photos/parts/signature/invoice.
  //   LEAK: the same stale stamp kept 5 of contractor-5's jobs in
  //   contractor-2's payload, each with customer name, address and phone.
  //
  // The job list is already scoped by the verified token, so keying off it is
  // strictly narrower and cannot return another contractor's record.
  let contractorJobs: unknown[] = [];
  if (jobs.length > 0) {
    const cjKeys = jobs.map(j => `"contractor_job:${j.id}"`).join(',');
    contractorJobs = await readRows(`key=in.(${encodeURIComponent(cjKeys)})&select=value`);
  }

  // ── Only the customers those work orders reference ────────────────────────
  // Not all 416. This is the line that closes the exposure.
  const customerIds = [...new Set(jobs.map(j => j.customerId).filter((v): v is string => !!v))];
  let customers: unknown[] = [];
  if (customerIds.length > 0) {
    const keys = customerIds.map(id => `"customer:${id}"`).join(',');
    customers = await readRows(`key=in.(${encodeURIComponent(keys)})&select=value`);
  }

  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).json({
    contractorId: me.id,
    jobs,
    contractorJobs,
    customers,
  });
}
