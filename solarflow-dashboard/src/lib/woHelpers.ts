/**
 * Work Order Helpers — Phase 2 Foundation
 *
 * These selectors derive contractor-visible views from the single `Job[]`
 * source of truth. Today they are used as read-side helpers; in Phase 2
 * they will replace the separate `contractorJobs` array entirely.
 */
import type { Job } from '../types';
import type { ContractorJob, JobStatusContractor, PhotoCategory } from '../types/contractor';

// Statuses that mean the contractor should see this job
const CONTRACTOR_VISIBLE_STATUSES: Set<string> = new Set([
  'assigned', 'scheduled', 'in_progress', 'completed', 'invoiced', 'paid',
]);

/**
 * Pick the admin Jobs that belong to a contractor.
 * Returns only jobs where `contractorId` matches AND the WO status implies
 * the job has been dispatched (not just drafted/quoted).
 */
export function pickupJobsForContractor(contractorId: string, jobs: Job[]): Job[] {
  return jobs.filter(j =>
    j.contractorId === contractorId &&
    CONTRACTOR_VISIBLE_STATUSES.has(j.woStatus ?? j.status)
  );
}

// Map admin WOStatus → contractor-side JobStatusContractor
const STATUS_MAP: Record<string, JobStatusContractor> = {
  scheduled:   'assigned',
  assigned:    'assigned',
  in_progress: 'in_progress',
  completed:   'completed',
  invoiced:    'invoiced',
  paid:        'paid',
};

/**
 * Project an admin Job into a ContractorJob view. Used for PDF/email
 * payloads and any code that still expects the ContractorJob shape.
 * This is a read-only projection — mutations should go through handleUpdateJob.
 */
export function toContractorJobView(job: Job, existingCj?: ContractorJob): ContractorJob {
  const emptyPhotos: ContractorJob['photos'] = {
    before: [], serial: [], parts: [], process: [], after: [],
    progress: [], ppe: [], voltage: [],
    old_serial: [], string_voltage: [], cabinet_old: [],
    cabinet_new: [], new_serial: [], inv_overview: [],
  };

  // Convert admin WOPhoto[] → contractor photo shape (object of arrays)
  const photos: Record<PhotoCategory, string[]> = { ...emptyPhotos };
  if (job.woPhotos) {
    for (const p of job.woPhotos) {
      const cat = p.category as PhotoCategory;
      const url = p.storageUrl || p.dataUrl;
      if (cat in photos && url) {
        photos[cat] = [...(photos[cat] ?? []), url];
      }
    }
  }
  // Merge with existing contractor photos if provided
  if (existingCj?.photos) {
    for (const [cat, urls] of Object.entries(existingCj.photos) as [PhotoCategory, string[]][]) {
      const existing = photos[cat] ?? [];
      const existingSet = new Set(existing);
      for (const u of (urls ?? [])) {
        if (u && !existingSet.has(u)) existing.push(u);
      }
      photos[cat] = existing;
    }
  }

  return {
    id: existingCj?.id ?? `cj-view-${job.id}`,
    sourceJobId: job.id,
    contractorId: job.contractorId ?? '',
    customerId: job.customerId,
    customerName: job.clientName ?? '',
    customerPhone: '',
    address: job.siteAddress ?? '',
    city: '', state: 'FL', zip: '',
    latitude: 0, longitude: 0,
    serviceType: job.serviceType,
    description: job.notes || job.title || '',
    priority: job.urgency === 'critical' ? 'critical' : job.urgency === 'high' ? 'high' : job.urgency === 'medium' ? 'normal' : 'low',
    status: STATUS_MAP[job.woStatus ?? job.status] ?? 'assigned',
    isRecurringClient: !!job.isRecurringClient,
    urgency: job.urgency ?? 'medium',
    isPowercare: !!job.isPowercare,
    scheduledDate: job.scheduledDate,
    scheduledTime: job.scheduledTime,
    estimatedDuration: existingCj?.estimatedDuration ?? 120,
    assignedAt: existingCj?.assignedAt ?? job.contractorSentAt ?? new Date().toISOString(),
    startedAt: job.startedAt ?? existingCj?.startedAt,
    completedAt: job.completedAt ?? existingCj?.completedAt,
    notes: job.notes,
    completionNotes: job.completionNotes ?? existingCj?.completionNotes,
    photos,
    parts: existingCj?.parts ?? [],
    laborAmount: existingCj?.laborAmount ?? 0,
    partsAmount: existingCj?.partsAmount ?? 0,
    markupPercent: existingCj?.markupPercent ?? 0,
    totalAmount: job.quoteAmount ?? job.totalAmount ?? existingCj?.totalAmount ?? 0,
    contractorPayRate: job.contractorPayRate ?? existingCj?.contractorPayRate ?? 0,
    contractorPayUnit: (job.contractorPayUnit as 'hour' | 'flat') ?? existingCj?.contractorPayUnit ?? 'flat',
    contractorTotalPay: existingCj?.contractorTotalPay ?? (job.contractorPayRate ?? 0) * ((job.contractorPayUnit ?? 'flat') === 'flat' ? 1 : (job.laborHours ?? 1)),
    paymentStatus: existingCj?.paymentStatus ?? 'pending',
    payRate: job.contractorPayRate ?? existingCj?.payRate ?? 0,
    payUnit: (job.contractorPayUnit as 'hour' | 'flat') ?? existingCj?.payUnit ?? 'flat',
    totalPay: existingCj?.totalPay ?? (job.contractorPayRate ?? 0) * ((job.contractorPayUnit ?? 'flat') === 'flat' ? 1 : (job.laborHours ?? 1)),
    serviceStatus: job.serviceStatus ?? existingCj?.serviceStatus,
    requiresFollowUp: job.requiresFollowUp ?? existingCj?.requiresFollowUp,
    nextSteps: job.nextSteps ?? existingCj?.nextSteps,
    miles: job.travelMiles ?? existingCj?.miles,
    mileageCost: existingCj?.mileageCost,
    mileageCharge: existingCj?.mileageCharge,
    // Preserve contractor-specific fields
    signature: existingCj?.signature,
    clientSignature: existingCj?.clientSignature,
    signatureDate: existingCj?.signatureDate,
    invoiceId: existingCj?.invoiceId,
    invoiceStatus: existingCj?.invoiceStatus,
    invoiceSentAt: existingCj?.invoiceSentAt,
    invoicePaidAt: existingCj?.invoicePaidAt,
    contractorInvoiceNumber: existingCj?.contractorInvoiceNumber,
    operationalNotes: existingCj?.operationalNotes,
    optimizerCount: existingCj?.optimizerCount,
    partsReimbursementRequested: existingCj?.partsReimbursementRequested,
    upsellFlagged: existingCj?.upsellFlagged,
    upsellNotes: existingCj?.upsellNotes,
    upsellLeadCreated: existingCj?.upsellLeadCreated,
  };
}
