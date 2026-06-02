/**
 * Phase D — one-time fold of the legacy `contractorJobs` store into the single
 * Job source of truth (data.jobs).
 *
 * For each ContractorJob linked by `sourceJobId`, copy the contractor-entered
 * fields onto the matching Job — but ONLY into gaps (where the Job doesn't
 * already carry the value). This is:
 *   - idempotent: safe to run on every load; once a Job has the value it's skipped.
 *   - loss-proof: never overwrites existing Job data, never deletes contractorJobs.
 *     The legacy store remains as a fallback until the store is retired (which
 *     happens only after the 2-device smoke test).
 *
 * Photos are intentionally NOT folded here — the photo merge already runs through
 * handleContractorJobUpdate / toContractorJobView, and touching that fragile path
 * is out of scope for this gap-fill.
 */
import type { Job } from '../types';
import type { ContractorJob } from '../types/contractor';

export function foldContractorJobsIntoJobs(
  jobs: Job[],
  contractorJobs: ContractorJob[],
): { jobs: Job[]; changed: boolean } {
  if (!Array.isArray(contractorJobs) || contractorJobs.length === 0) {
    return { jobs, changed: false };
  }

  // Newest contractorJob per sourceJobId (LWW by updatedAt).
  const cjBySource = new Map<string, ContractorJob>();
  for (const cj of contractorJobs) {
    if (!cj.sourceJobId) continue;
    const prev = cjBySource.get(cj.sourceJobId);
    if (!prev || (cj.updatedAt ?? '') > (prev.updatedAt ?? '')) {
      cjBySource.set(cj.sourceJobId, cj);
    }
  }
  if (cjBySource.size === 0) return { jobs, changed: false };

  let changed = false;
  const next = jobs.map(job => {
    const cj = cjBySource.get(job.id);
    if (!cj) return job;

    const merged: Job = { ...job };
    let touched = false;
    const fill = <K extends keyof Job>(key: K, value: Job[K] | undefined | null) => {
      if (value === undefined || value === null) return;
      if (merged[key] === undefined || merged[key] === null) {
        merged[key] = value as Job[K];
        touched = true;
      }
    };

    fill('contractorParts', cj.parts as unknown as Job['contractorParts']);
    fill('contractorPartsAmount', cj.partsAmount);
    fill('contractorLaborAmount', cj.laborAmount);
    fill('markupPercent', cj.markupPercent);
    fill('signature', cj.signature);
    fill('clientSignature', cj.clientSignature);
    fill('signatureDate', cj.signatureDate);
    fill('contractorInvoiceId', cj.invoiceId);
    fill('contractorInvoiceStatus', cj.invoiceStatus);
    fill('contractorInvoiceSentAt', cj.invoiceSentAt);
    fill('contractorInvoiceNumber', cj.contractorInvoiceNumber);
    fill('mileageCost', cj.mileageCost);
    fill('mileageCharge', cj.mileageCharge);
    fill('contractorPaymentStatus', cj.paymentStatus);
    fill('contractorTotalPay', cj.contractorTotalPay);
    fill('assignedAt', cj.assignedAt);
    fill('serviceReport', cj.operationalNotes ?? cj.completionNotes);
    fill('serviceStatus', cj.serviceStatus);
    fill('nextSteps', cj.nextSteps);
    fill('requiresFollowUp', cj.requiresFollowUp);

    if (touched) changed = true;
    return touched ? merged : job;
  });

  return { jobs: changed ? next : jobs, changed };
}
