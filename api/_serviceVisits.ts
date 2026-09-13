import type { Job, WOVisit, VisitPlan } from '../solarflow-dashboard/src/types';
import type { ContractorJob } from '../solarflow-dashboard/src/types/contractor';

export const visitId = (job: Job) => job.currentVisit?.id ?? `${job.id}:visit:${(job.visits?.length ?? 0) + 1}`;
export const pendingVisit = (job: Job) => !!job.currentVisit && !['approved', 'included'].includes(job.currentVisit.approval);
const billingKeys = ['totalAmount', 'clientPaymentDueAt', 'costsCoveredAt', 'quoteAmount', 'quoteSentAt', 'quoteApprovedAt', 'verbalApprovalAt', 'lineItems', 'xeroInvoiceId', 'invoicedAt', 'clientPaidAt'] as const;
export function requestVisit(job: Job, input: { expectedVisitId: string; date: string; time?: string; serviceCode?: string; serviceType: string; reason: string; snapshot?: Partial<ContractorJob> }, actor: string, now: string): Job {
  // Same expected visit is the idempotency key across retries and devices.
  if (job.visits?.some(v => v.id === input.expectedVisitId)) return job;
  if (input.expectedVisitId !== visitId(job)) throw new Error('This visit changed. Refresh the order before requesting a return.');
  if (pendingVisit(job)) throw new Error('The current visit is awaiting approval.');
  if ((job.visits?.length ?? 0) >= 10) throw new Error('The 10 follow-up limit has been reached. Contact the office.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !Number.isFinite(Date.parse(input.date)) || new Date(input.date).toISOString().slice(0, 10) !== input.date) throw new Error('Enter a valid return date.');
  if (input.date < new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(now))) throw new Error('Choose today or a future return date.');
  if (input.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) throw new Error('Enter a valid return time.');
  if (!input.serviceType?.trim() || input.serviceType.length > 200 || !input.reason?.trim() || input.reason.length > 5000) throw new Error('Service type and remaining work are required.');
  const s = input.snapshot ?? {};
  const id = visitId(job);
  const previous = job.visits ?? [];
  const owners = { ...job.visitPhotoOwners, ...s.visitPhotoOwners };
  const urls = [...new Set([...(job.woPhotos ?? []).map(p => p.storageUrl || p.dataUrl), ...Object.values(s.photos ?? {}).flat()])].filter(u => u?.startsWith('https://'));
  const parts = s.parts ?? job.contractorParts ?? [];
  const labor = s.visitLabor ?? job.visitLabor ?? [];
  const finished: WOVisit = {
    id, number: previous.length + 1, date: job.scheduledDate, contractorId: job.contractorId,
    startedAt: s.startedAt ?? job.startedAt, finishedAt: now,
    serviceType: job.serviceType, workDone: s.operationalNotes ?? job.serviceReport ?? job.completionNotes ?? '',
    serviceStatus: s.serviceStatus ?? job.serviceStatus, nextSteps: input.reason.trim(), plan: job.currentVisit,
    photoUrls: urls.filter(u => owners[u] ? owners[u] === id : !previous.some(v => v.photoUrls.includes(u))),
    parts: parts.filter(p => p.visitId ? p.visitId === id : !previous.some(v => v.parts?.some(q => q.id === p.id))),
    labor: labor.filter(l => l.visitId === id),
    additionalItems: (s.additionalItems ?? []).filter(l => l.visitId ? l.visitId === id : !previous.some(v => v.additionalItems?.some(p => p.id === l.id))),
    billing: { archivedAt: now, ...Object.fromEntries(billingKeys.map(k => [k, job[k]])) }, updatedAt: now,
  };
  const currentVisit: VisitPlan = { id: `${job.id}:visit:${finished.number + 1}`, number: finished.number + 1,
    serviceType: input.serviceType.trim(), proposedDate: input.date, proposedTime: input.time || '',
    reason: input.reason.trim(), approval: 'pending', requestedAt: now, requestedBy: actor };
  const next = { ...job, currentVisit, visits: [...previous, finished], visitPhotoOwners: owners,
    visitLabor: labor, contractorParts: parts, serviceType: currentVisit.serviceType as Job['serviceType'],
    serviceCode: input.serviceCode || '',
    scheduledDate: input.date, scheduledTime: input.time || '', woStatus: 'draft', status: 'new',
    serviceReport: '', completionNotes: '', nextSteps: currentVisit.reason, requiresFollowUp: false,
    contractorJobStatus: 'assigned', updatedAt: now, totalAmount: 0, laborHours: 0, partsCost: 0,
  } as Job;
  for (const k of [...billingKeys, 'startedAt', 'completedAt', 'scheduleConfirmedAt', 'clientPaymentDueAt', 'verbalApprovalBy', 'lateFee1AppliedAt', 'lateFee1Amount', 'lateFee2AppliedAt', 'lateFee2Amount', 'costsCoveredAt', 'serviceStatus'] as const) delete (next as unknown as Record<string, unknown>)[k];
  next.totalAmount = 0;
  next.lineItems = [{ id: `${currentVisit.id}:scope`, type: 'labor', description: currentVisit.serviceType, quantity: 1, unitCost: 0, totalCost: 0 }];
  next.contractorLaborAmount = 0; next.contractorPartsAmount = 0; next.travelMiles = 0;
  // Preserve the captured media on the parent, with explicit ownership.
  next.woPhotos = [...(job.woPhotos ?? []), ...urls.filter(u => !job.woPhotos?.some(p => (p.storageUrl || p.dataUrl) === u)).map((u, i) => ({ id: `${id}:photo:${i}`, category: 'process' as const, name: 'Visit photo', storageUrl: u, dataUrl: '', createdAt: now, visitId: owners[u] || id }))];
  return next;
}
export function decideVisit(job: Job, action: 'included' | 'approved', reason: string, actor: string, now: string): Job {
  if (!job.currentVisit) throw new Error('No follow-up visit to approve.');
  if (!reason?.trim()) throw new Error('Record the approval or included coverage reference.');
  if (action === 'approved' && !job.quoteSentAt) throw new Error('Create and send the visit quote before recording approval.');
  if (job.scheduledDate < new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(now))) throw new Error('Update the proposed date before approving this visit.');
  const currentVisit: VisitPlan = { ...job.currentVisit, approval: action, decidedAt: now, decidedBy: actor, decisionReason: reason.trim() };
  return { ...job, ...(action === 'included' ? { totalAmount: 0, quoteAmount: 0 } : {}), currentVisit, woStatus: 'quote_approved', status: 'assigned', quoteApprovedAt: now, updatedAt: now };
}

export function recordVisitPayment(job: Job, id: string, reference: string, actor: string, now: string): Job {
  const visit = job.visits?.find(v => v.id === id);
  if (!visit?.billing || (!visit.billing.invoicedAt && !visit.billing.xeroInvoiceId)) throw new Error('This visit has no issued invoice.');
  if (!reference?.trim()) throw new Error('Record the payment reference.');
  if (visit.billing.clientPaidAt) return job;
  return { ...job, updatedAt: now, visits: job.visits!.map(v => v.id !== id ? v : { ...v, updatedAt: now, billing: { ...v.billing!, clientPaidAt: now, paymentRecordedBy: actor, paymentReference: reference.trim() } }) };
}
