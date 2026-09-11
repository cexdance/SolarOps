// Multi-visit service orders.
//
// One SO can take several trips to site. The job's top-level fields are always
// the CURRENT visit (date, report, quote, invoice), so single-visit orders and
// every legacy record need no migration. When the contractor finishes a visit
// with a return trip needed, a snapshot of it is appended to `job.visits`.
// When Daniel starts a new quote/invoice cycle for the next visit, the current
// cycle's billing is archived onto the latest visit and cleared on the job.
//
// `visits` is written by both the field app and the office, so it is merged
// by visit id, newest `updatedAt` wins (mergeById), never replaced wholesale.
import type { Job, WOVisit, WOVisitBilling } from '../types';
import type { ContractorJob } from '../types/contractor';
import { mergeById } from './woHelpers';

export const mergeVisits = (a?: WOVisit[], b?: WOVisit[]): WOVisit[] | undefined =>
  mergeById(a, b)?.slice().sort((x, y) => x.number - y.number);

/** Snapshot the contractor's current visit so it can be appended to `visits`. */
export function buildVisit(cj: ContractorJob, finishedAt: string): WOVisit {
  const prior = cj.visits ?? [];
  const seenPhotos = new Set(prior.flatMap(v => v.photoUrls));
  const seenParts = new Set(prior.flatMap(v => (v.parts ?? []).map(p => p.id)));
  return {
    id: `visit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    number: prior.length + 1,
    date: cj.scheduledDate || finishedAt.slice(0, 10),
    contractorId: cj.contractorId || undefined,
    startedAt: cj.startedAt,
    finishedAt,
    workDone: (cj.operationalNotes ?? '').trim(),
    serviceStatus: cj.serviceStatus,
    nextSteps: cj.nextSteps,
    // Photos stay cumulative on the job, so this visit owns only what it added.
    // ponytail: base64 captures still mid-upload are skipped here; they land in
    // the next visit's set once uploaded. Tag photos at capture if that matters.
    photoUrls: Object.values(cj.photos ?? {}).flat()
      .filter((u): u is string => !!u && !u.startsWith('data:') && !seenPhotos.has(u)),
    parts: (cj.parts ?? []).filter(p => !seenParts.has(p.id)),
    updatedAt: finishedAt,
  };
}

const BILLING_KEYS = [
  'quoteAmount', 'quoteSentAt', 'quoteApprovedAt', 'verbalApprovalAt',
  'lineItems', 'xeroInvoiceId', 'invoicedAt', 'clientPaidAt',
] as const satisfies readonly (keyof WOVisitBilling & keyof Job)[];

/** True when the current cycle has quote or invoice history worth keeping. */
export const hasBillingCycle = (job: Job): boolean =>
  BILLING_KEYS.some(k => { const v = job[k]; return Array.isArray(v) ? v.length > 0 : v != null && v !== ''; });

/**
 * Patch that starts a fresh quote/invoice cycle: the current cycle's billing is
 * archived onto the latest visit and cleared on the job. Null when there is no
 * finished visit to hold it or nothing to archive, so the caller falls back to
 * a plain move. Contractor pay is per SO and deliberately untouched.
 */
export function startNewBillingCycle(job: Job, now = new Date().toISOString()): Partial<Job> | null {
  const visits = job.visits ?? [];
  const last = visits[visits.length - 1];
  if (!last || last.billing || !hasBillingCycle(job)) return null;
  const billing: WOVisitBilling = {
    archivedAt: now,
    ...Object.fromEntries(BILLING_KEYS.map(k => [k, job[k]])),
  };
  const cleared = Object.fromEntries(BILLING_KEYS.map(k => [k, undefined])) as Partial<Job>;
  return {
    ...cleared,
    completedAt: undefined,
    clientPaymentDueAt: undefined,
    visits: visits.map(v => (v.id === last.id ? { ...v, billing, updatedAt: now } : v)),
  };
}

/** Every visit for reports: the finished ones plus the current one, when it has
 *  anything on it. Single-visit orders yield exactly one entry. */
export function allVisits(job: Job): WOVisit[] {
  const done = job.visits ?? [];
  const seen = new Set(done.flatMap(v => v.photoUrls));
  const current: WOVisit = {
    id: 'current',
    number: done.length + 1,
    date: job.scheduledDate,
    contractorId: job.contractorId,
    startedAt: job.startedAt,
    finishedAt: job.completedAt ?? '',
    workDone: (job.serviceReport ?? job.completionNotes ?? '').trim(),
    serviceStatus: job.serviceStatus,
    nextSteps: job.nextSteps,
    photoUrls: (job.woPhotos ?? []).map(p => p.storageUrl || p.dataUrl).filter(u => u && !seen.has(u)),
    updatedAt: job.updatedAt ?? '',
  };
  const hasCurrent = done.length === 0 || current.workDone || current.startedAt || current.finishedAt || current.photoUrls.length;
  return hasCurrent ? [...done, current] : done;
}
