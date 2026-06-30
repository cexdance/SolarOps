/**
 * Service Order Helpers, Phase 2 Foundation
 *
 * These selectors derive contractor-visible views from the single `Job[]`
 * source of truth. Today they are used as read-side helpers; in Phase 2
 * they will replace the separate `contractorJobs` array entirely.
 */
import type { Job, Customer } from '../types';
import type { ContractorJob, JobStatusContractor, PhotoCategory } from '../types/contractor';

// ─────────────────────────────────────────────────────────────────────────────
// Order numbering: one shared number, two prefixes.
// The end-to-end order is a SERVICE ORDER (SO-). When it is dispatched to a
// contractor, the contractor receives a WORK ORDER (WO-) with the SAME number.
// The persisted `Job.woNumber` keeps storing the raw value; these helpers just
// re-prefix it for display so old `WO-…` records render as `SO-…` in-app.
// ─────────────────────────────────────────────────────────────────────────────

/** Strip any leading SO-/WO- prefix, returning the bare `YYMM-NNNNN` core. */
export function bareOrderNo(n?: string): string {
  if (!n) return '';
  return n.replace(/^(?:SO|WO)-/i, '');
}

/** Display an order number as a Service Order (SO-…). */
export function serviceOrderNo(n?: string): string {
  const bare = bareOrderNo(n);
  return bare ? `SO-${bare}` : '';
}

/** Display an order number as a contractor Service Order (WO-…), same number. */
export function workOrderNo(n?: string): string {
  const bare = bareOrderNo(n);
  return bare ? `WO-${bare}` : '';
}

/**
 * Stable identity for a photo URL, used to de-duplicate the same image that was
 * uploaded to two slightly different storage keys (e.g. `.../id.jpg` vs
 * `.../category/id.jpeg`). Returns the last path segment without its extension or
 * query string, so both variants collapse to the same `ph-…`/`cp-…` stem.
 */
export function photoUrlStem(url: string): string {
  if (!url) return url;
  if (url.startsWith('data:')) return url; // base64 previews are their own identity
  const noQuery = url.split('?')[0];
  const seg = noQuery.substring(noQuery.lastIndexOf('/') + 1);
  const dot = seg.lastIndexOf('.');
  return dot > 0 ? seg.slice(0, dot) : seg;
}

/**
 * De-dupe a list of WO photo objects, preserving first-seen order. Drops:
 *  - exact-duplicate objects sharing the same `id` (root cause of the 581-photo
 *    WO-2605-97694 incident: one IDB-offloaded photo got cloned 528x and every
 *    full-record save/merge carried the clones forward), and
 *  - the same image stored under two storage keys (.jpg vs .../category/.jpeg).
 * Applied on every job write and every sync merge so duplicates can never
 * accumulate again, whatever the upstream append bug was.
 */
export function dedupeWoPhotos<T extends { id?: string; storageUrl?: string; dataUrl?: string }>(photos: T[]): T[] {
  const seenId = new Set<string>();
  const seenStem = new Set<string>();
  const out: T[] = [];
  for (const p of photos) {
    if (!p) continue;
    if (p.id && seenId.has(p.id)) continue;
    const stem = photoUrlStem(p.storageUrl || p.dataUrl || '');
    if (stem && seenStem.has(stem)) continue;
    if (p.id) seenId.add(p.id);
    if (stem) seenStem.add(stem);
    out.push(p);
  }
  return out;
}

/** De-dupe a list of photo URLs by stem, preserving first-seen order. */
export function dedupePhotoUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    if (!u) continue;
    const key = photoUrlStem(u);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(u);
  }
  return out;
}

/** Generate a fresh Service Order number (SO-YYMM-NNNNN). */
export function generateServiceOrderNumber(): string {
  const now = new Date();
  const yymm = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const seq = String(Date.now()).slice(-5);
  return `SO-${yymm}-${seq}`;
}

// Statuses the contractor sees in their portal: only ACTIVE work. A job assigned
// to a contractor but still at draft/quote_sent is NOT yet visible (it must reach
// the assigned stage first, advanced by the admin via the Service Order / WO
// panel). Finished/billing states (invoiced, paid) are deliberately EXCLUDED -
// once a job is invoiced the contractor's work is done and admin billing is not
// their concern, so it drops out of their active list.
const CONTRACTOR_VISIBLE_STATUSES: Set<string> = new Set([
  'assigned', 'scheduled', 'in_progress', 'completed',
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
 * This is a read-only projection, mutations should go through handleUpdateJob.
 */
export function toContractorJobView(job: Job, existingCj?: ContractorJob, customer?: Customer): ContractorJob {
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
  // Collapse the same image uploaded under two storage keys (.jpg vs
  // .../category/.jpeg) so it never renders two/three times.
  for (const cat of Object.keys(photos) as PhotoCategory[]) {
    photos[cat] = dedupePhotoUrls(photos[cat]);
  }

  return {
    id: existingCj?.id ?? `cj-view-${job.id}`,
    sourceJobId: job.id,
    woNumber: job.woNumber,
    // US-1XXXX client number, contractors need it to submit invoices. Prefer the
    // customer record (source of truth) and fall back to the job's stored value.
    clientId: customer?.clientId ?? job.clientId ?? job.solarEdgeClientId,
    // Scope of work mirrored from the SO line items (description + qty only, no
    // costs) so the contractor can review the SOW from their WO card.
    scopeItems: (job.lineItems ?? []).map(li => ({
      description: li.description,
      quantity: li.quantity,
      type: li.type,
    })),
    contractorId: job.contractorId ?? '',
    customerId: job.customerId,
    customerName: job.clientName || customer?.name || '',
    customerPhone: customer?.phone ?? '',
    customerEmail: customer?.email ?? '',
    // Address resolves LIVE from the customer record so an address edit on the
    // customer is reflected on the contractor WO immediately. Falls back to the
    // job's siteAddress snapshot (a full string) when no customer is linked.
    address: customer?.address || job.siteAddress || '',
    city: customer?.city ?? '', state: customer?.state ?? 'FL', zip: customer?.zip ?? '',
    latitude: 0, longitude: 0,
    serviceType: job.serviceType,
    description: job.notes || job.title || '',
    priority: job.urgency === 'critical' ? 'critical' : job.urgency === 'high' ? 'high' : job.urgency === 'medium' ? 'normal' : 'low',
    // A held order surfaces to the contractor as 'on_hold' (parked) regardless of
    // its underlying pipeline stage, which is preserved in job.woStatus.
    status: job.onHold ? 'on_hold' : (STATUS_MAP[job.woStatus ?? job.status] ?? 'assigned'),
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
