// Multi-visit service orders.
//
// One SO can take several trips to site. The job's top-level fields are always
// the CURRENT visit (date, report, quote, invoice), so single-visit orders and
// every legacy record need no migration. When the contractor finishes a visit
// with a return trip needed, a snapshot of it is appended to `job.visits`.
// New follow-ups archive billing atomically through /api/service-visits. The
// billing-cycle helper below remains for older orders without currentVisit.
//
// `visits` is written by both the field app and the office, so it is merged
// by visit id, newest `updatedAt` wins (mergeById), never replaced wholesale.
import type { Job, WOVisit, WOVisitBilling } from '../types';
import type { ContractorJob } from '../types/contractor';
import { mergeVisitRecords } from './woHelpers';

export const MAX_VISITS = 11;
export const currentVisitId = (j: { id: string; sourceJobId?: string; currentVisit?: { id: string }; visits?: WOVisit[] }) => j.currentVisit?.id ?? `${j.sourceJobId || j.id}:visit:${(j.visits?.length ?? 0) + 1}`;
export const visitNeedsApproval = (j: { currentVisit?: { approval: string } }) => !!j.currentVisit && !['approved', 'included'].includes(j.currentVisit.approval);

export const mergeVisits = (a?: WOVisit[], b?: WOVisit[]): WOVisit[] | undefined =>
  mergeVisitRecords(a, b);

/** Snapshot the contractor's current visit so it can be appended to `visits`. */
export function buildVisit(cj: ContractorJob, finishedAt: string): WOVisit {
  const prior = cj.visits ?? [];
  const seenPhotos = new Set(prior.flatMap(v => v.photoUrls));
  const seenParts = new Set(prior.flatMap(v => (v.parts ?? []).map(p => p.id)));
  return {
    id: currentVisitId(cj),
    serviceType: cj.serviceType,
    plan: cj.currentVisit,
    labor: cj.visitLabor?.filter(l => l.visitId === currentVisitId(cj)),
    number: prior.length + 1,
    date: cj.scheduledDate || finishedAt.slice(0, 10),
    contractorId: cj.contractorId || undefined,
    startedAt: cj.startedAt,
    finishedAt,
    workDone: (cj.operationalNotes ?? '').trim(),
    serviceStatus: cj.serviceStatus,
    nextSteps: cj.nextSteps,
    // Photos stay cumulative on the job, so this visit owns only what it added.
    // Pending captures are attached later using their persisted visitId.
    photoUrls: Object.values(cj.photos ?? {}).flat()
      .filter((u): u is string => !!u && !u.startsWith('data:') && !seenPhotos.has(u) && (!cj.visitPhotoOwners?.[u] || cj.visitPhotoOwners[u] === currentVisitId(cj))),
    parts: (cj.parts ?? []).filter(p => p.visitId ? p.visitId === currentVisitId(cj) : !seenParts.has(p.id)),
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
  const done = (job.visits ?? []).map(v => ({ ...v, photoUrls: [...new Set([...v.photoUrls, ...(job.woPhotos ?? []).filter(p => (p.visitId || job.visitPhotoOwners?.[p.storageUrl || p.dataUrl]) === v.id).map(p => p.storageUrl || p.dataUrl)])] }));
  const seen = new Set(done.flatMap(v => v.photoUrls));
  const current: WOVisit = {
    id: currentVisitId(job),
    serviceType: job.serviceType,
    plan: job.currentVisit,
    parts: job.contractorParts?.filter(p => p.visitId ? p.visitId === currentVisitId(job) : !done.some(v => v.parts?.some(q => q.id === p.id))),
    labor: job.visitLabor?.filter(l => l.visitId === currentVisitId(job)),
    number: done.length + 1,
    date: job.scheduledDate,
    contractorId: job.contractorId,
    startedAt: job.startedAt,
    finishedAt: job.completedAt ?? '',
    workDone: (job.serviceReport ?? job.completionNotes ?? '').trim(),
    serviceStatus: job.serviceStatus,
    nextSteps: job.nextSteps,
    photoUrls: (job.woPhotos ?? []).map(p => p.storageUrl || p.dataUrl).filter(u => u && !seen.has(u) && (!job.visitPhotoOwners?.[u] || job.visitPhotoOwners[u] === currentVisitId(job))),
    updatedAt: job.updatedAt ?? '',
  };
  const hasCurrent = !!job.currentVisit || done.length === 0 || current.workDone || current.startedAt || current.finishedAt || current.photoUrls.length;
  return hasCurrent ? [...done, current] : done;
}
