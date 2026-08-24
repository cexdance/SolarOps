/**
 * Service Order Helpers, Phase 2 Foundation
 *
 * These selectors derive contractor-visible views from the single `Job[]`
 * source of truth. Today they are used as read-side helpers; in Phase 2
 * they will replace the separate `contractorJobs` array entirely.
 */
import type { Job, Customer, PipelineStage, RMAEntry } from '../types';
import type { ContractorJob, JobStatusContractor, PhotoCategory } from '../types/contractor';

/**
 * Union merge for a job's RMA entries, by id, newest `updatedAt` wins.
 *
 * RMAs are now entered from two places (office in the SO panel, tech in the
 * contractor app) against copies of the record that each only know their own
 * half. Absence on one side therefore never means "deleted", so this keeps
 * entries present on only one side, same rule as inventory.
 */
export function mergeRmaEntries(
  a: RMAEntry[] | undefined,
  b: RMAEntry[] | undefined,
): RMAEntry[] | undefined {
  if (!a?.length) return b?.length ? b : a;
  if (!b?.length) return a;
  const byId = new Map<string, RMAEntry>();
  for (const e of a) if (e?.id) byId.set(e.id, e);
  for (const e of b) {
    if (!e?.id) continue;
    const prev = byId.get(e.id);
    // Tie goes to the incumbent: an unstamped legacy entry must not win over a
    // stamped edit, and identical stamps mean identical content anyway.
    if (!prev || (e.updatedAt ?? '') > (prev.updatedAt ?? '')) byId.set(e.id, e);
  }
  return Array.from(byId.values());
}

/**
 * Patch produced by dropping a card on the Tryout (multi-state pipeline) board.
 * Returns null when nothing changed, so a no-op drag never writes and never
 * bumps updatedAt (a needless write is a sync-clobber opportunity).
 *
 * INVARIANT: the patch only ever contains `pipelineStage`. The funnel is
 * orthogonal to execution state, so this must never touch `status`/`woStatus`,
 * which drive billing and CONTRACTOR_VISIBLE_STATUSES.
 */
export function pipelineDropPatch(
  job: Pick<Job, 'pipelineStage'>,
  target: PipelineStage | 'unstaged',
): { pipelineStage: PipelineStage | undefined } | null {
  const next = target === 'unstaged' ? undefined : target;
  return job.pipelineStage === next ? null : { pipelineStage: next };
}

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

// Shared label/color for the 6 coarse board-column statuses. Used wherever a
// job's WO_TO_JOB_STATUS-derived column needs a badge (dispatch board, SolarEdge
// monitoring table). Duplicated verbatim in 2 files before consolidation here.
export const WO_STATUS_COLOR: Record<string, string> = {
  new:         'bg-blue-100 text-blue-700',
  assigned:    'bg-indigo-100 text-indigo-700',
  in_progress: 'bg-amber-100 text-amber-700',
  completed:   'bg-emerald-100 text-emerald-700',
  invoiced:    'bg-purple-100 text-purple-700',
  paid:        'bg-green-100 text-green-700',
};
export const WO_STATUS_LABEL: Record<string, string> = {
  new: 'New', assigned: 'Assigned', in_progress: 'In Progress',
  completed: 'Completed', invoiced: 'Invoiced', paid: 'Paid',
};

/** Generate a fresh Service Order number (SO-YYMM-NNNNN). */
export function generateServiceOrderNumber(): string {
  const now = new Date();
  const yymm = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const seq = String(Date.now()).slice(-5);
  return `SO-${yymm}-${seq}`;
}

// Statuses the contractor sees in their portal. A job assigned to a contractor
// but still at draft/quote_sent is NOT yet visible (it must reach the assigned
// stage first, advanced by the admin via the Service Order / WO panel).
//
// invoiced/paid used to be excluded on the grounds that admin billing is not
// the contractor's concern. That still holds for CLIENT billing, but the
// contractor being PAID is very much their concern, and a card cannot move to
// their Paid column if it has already dropped out of the list. So the tail
// stays visible and toContractorJobView() decides what it is CALLED: still
// "completed" while the office invoices the client, "paid" only once costs are
// covered.
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
    // An archived order is gone for everyone. Checked explicitly because the
    // visible-status test reads woStatus FIRST, so an archived job carrying
    // woStatus 'paid' would otherwise reappear in the portal.
    j.status !== 'archived' &&
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

// Pipeline order for the linear part of JobStatusContractor. Side-states
// (on_hold/cancelled/returned) aren't part of the progression, rank -1 so
// they never win a "furthest along" comparison.
const STATUS_RANK: Record<JobStatusContractor, number> = {
  assigned: 0, en_route: 1, in_progress: 2, documentation: 3,
  completed: 4, invoiced: 5, paid: 6,
  on_hold: -1, cancelled: -1, returned: -1,
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
    // RMA entries flow BOTH ways: the tech sees what the office already filed so
    // they don't duplicate a case number, and anything they add here merges back
    // into the admin job. Union so a stale contractor copy never drops an entry.
    rmaEntries: mergeRmaEntries(job.rmaEntries, existingCj?.rmaEntries),
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
    //
    // Prefer whichever side is FURTHER ALONG. The admin Job is the mirror
    // target for contractor updates (see handleContractorJobUpdate), and that
    // mirror write can fail to persist locally (localStorage quota) while the
    // contractor's own `existingCj` write succeeds. Without this, a reload on
    // the contractor's device re-hydrates the stale admin status and a
    // completed call reverts to "in progress" even though it was saved.
    status: job.onHold ? 'on_hold' : (() => {
      // The admin `paid` stage means the CLIENT paid. That is NOT the same as
      // the contractor being paid, which happens later when the office covers
      // contractor + expenses and stamps costsCoveredAt. Mapping woStatus
      // 'paid' straight through would tell a contractor they had been paid
      // while they were still owed, so their 'paid' state keys off
      // costsCoveredAt alone. Until then the client-billing tail reads as
      // 'completed': their work IS done, and who has invoiced whom is not
      // their business.
      if (job.costsCoveredAt) return 'paid';
      // Resolve the stage the same way STATUS_MAP is keyed, so a job carrying
      // only the coarse `status` collapses identically to one with woStatus.
      const stage = job.woStatus ?? job.status;
      const mirrored: JobStatusContractor =
        (stage === 'invoiced' || stage === 'paid')
          ? 'completed'
          : STATUS_MAP[stage] ?? 'assigned';
      // The "furthest along wins" rule exists to stop a failed local mirror
      // write reverting FIELD progress (assigned -> completed). It must not
      // apply to billing states: 2 live contractor rows already carry a stale
      // status 'paid' whose admin job was never costs-covered, and without this
      // guard those would tell a contractor they had been paid.
      const cj = existingCj?.status;
      const cjIsBillingState = cj === 'invoiced' || cj === 'paid';
      return (cj && !cjIsBillingState && STATUS_RANK[cj] > STATUS_RANK[mirrored])
        ? cj
        : mirrored;
    })(),
    isRecurringClient: !!job.isRecurringClient,
    urgency: job.urgency ?? 'medium',
    isPowercare: !!job.isPowercare,
    scheduledDate: job.scheduledDate,
    scheduledTime: job.scheduledTime,
    estimatedDuration: existingCj?.estimatedDuration ?? 120,
    assignedAt: existingCj?.assignedAt ?? job.contractorSentAt ?? new Date().toISOString(),
    startedAt: job.startedAt ?? existingCj?.startedAt,
    completedAt: job.completedAt ?? existingCj?.completedAt,
    // Contractor payday. Same authority as the 'paid' status above.
    paidAt: job.costsCoveredAt ?? existingCj?.paidAt,
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
    additionalItems: existingCj?.additionalItems,
    upsellFlagged: existingCj?.upsellFlagged,
    upsellNotes: existingCj?.upsellNotes,
    upsellLeadCreated: existingCj?.upsellLeadCreated,
  };
}

/**
 * Maps URL for navigating to a work order, or null when there is nowhere to go.
 *
 * Prefers real coordinates and falls back to the address string. This exists
 * because every contractor job currently carries `latitude: 0, longitude: 0`
 * (nothing geocodes them on write), and the Navigate button used to interpolate
 * those straight into `?q=0,0`. That is Null Island, a point in the Atlantic
 * ~380 miles off Ghana, so every tech who tapped Navigate was routed there.
 *
 * Returns null rather than a broken link when there is neither a coordinate nor
 * an address: the caller disables the control instead of offering a wrong
 * destination. A wrong destination is worse than an absent one.
 */
export function jobMapsUrl(job: {
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): string | null {
  const { latitude: lat, longitude: lng } = job;
  const usableCoords =
    typeof lat === 'number' && typeof lng === 'number' &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    // An exact 0,0 pair is the "never geocoded" sentinel, not a real location.
    // Only the exact pair is rejected: a genuine 0 on one axis stays valid.
    !(lat === 0 && lng === 0) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  if (usableCoords) return `https://maps.google.com/?q=${lat},${lng}`;

  const addr = [job.address, job.city, job.state, job.zip]
    .map(p => (p ?? '').trim())
    .filter(Boolean)
    .join(', ');
  return addr ? `https://maps.google.com/?q=${encodeURIComponent(addr)}` : null;
}

/** Find an existing order by number, for create-is-really-an-update.
 *  A blank/absent number matches NOTHING: every legacy job without a woNumber
 *  would otherwise collapse onto the first one. */
export function findJobByWoNumber<J extends { woNumber?: string }>(
  jobs: J[], woNumber: string | undefined,
): J | undefined {
  if (!woNumber) return undefined;
  return jobs.find(j => j.woNumber === woNumber);
}
