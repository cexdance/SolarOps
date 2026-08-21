// Told the contractor their work order has been settled.
//
// Fires when the office covers contractor + expenses on the billing board. Two
// channels on purpose, because they fail in different ways:
//   - in-app, a synced ContractorNotification, which is durable and is what
//     they see next time they open the portal (works with no network at send
//     time, syncs later)
//   - email via Resend, which reaches them when the portal is closed, and a
//     payment is exactly the kind of thing you do not want to sit unseen
//
// Neither carries a dollar amount: SHOW_MONEY hides commercial figures in the
// app, and the contractor's own submitted invoice is the authority on the sum.
import { addNotification } from './contractorStore';
import type { Job } from '../types';
import type { Contractor } from '../types/contractor';
import { serviceOrderNo } from './woHelpers';

export interface ContractorPaidResult { inApp: boolean; email: boolean }

/** Email half. Non-blocking, returns true on a 2xx send. */
async function sendContractorPaidEmail(opts: {
  contractorEmail: string;
  contractorName: string;
  orderNo?: string;
  customerName?: string;
}): Promise<boolean> {
  if (!opts.contractorEmail || !/.+@.+\..+/.test(opts.contractorEmail)) return false;
  try {
    const { supabase } = await import('./supabase');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return false;
    const res = await fetch('/api/notify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action: 'contractor-paid', ...opts }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Notify a contractor that this order has been paid out.
 *
 * The in-app write is attempted FIRST and independently of the email: it is the
 * durable record, and it must not be skipped just because the network or the
 * mail provider is having a bad day.
 */
export async function notifyContractorPaid(
  job: Job,
  contractor: Contractor | undefined,
  siteName?: string,
): Promise<ContractorPaidResult> {
  const contractorId = job.contractorId ?? contractor?.id;
  if (!contractorId) return { inApp: false, email: false };

  const orderNo = job.woNumber ? serviceOrderNo(job.woNumber) : undefined;
  const site = siteName || job.clientName || '';

  let inApp = false;
  try {
    addNotification({
      contractorId,
      type: 'payment',
      title: 'Payment processed',
      message: `Labor and approved expenses for ${orderNo ?? 'your work order'}${site ? ` (${site})` : ''} have been covered. This order now shows as Paid.`,
      workOrderId: job.woNumber,
      jobId: job.id,
    });
    inApp = true;
  } catch (e) {
    console.error('[contractorPaid] in-app notification failed', e);
  }

  const email = contractor?.email
    ? await sendContractorPaidEmail({
        contractorEmail: contractor.email,
        contractorName: contractor.contactName || contractor.businessName || 'there',
        orderNo,
        customerName: site,
      })
    : false;

  return { inApp, email };
}
