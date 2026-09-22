import type { Job } from '../solarflow-dashboard/src/types';

/**
 * Xero quote acceptance, arriving as the email Xero sends when a customer
 * accepts: "Georgina Martinez has accepted quote QU-0460 for 500.00 USD".
 *
 * Xero has no webhook for quotes (contacts and invoices only) and this app has
 * no Xero API connection, so the email IS the signal. A Gmail Apps Script posts
 * it to /api/notify?action=xero-quote-accepted (the Hobby plan caps api/ at 12
 * functions and we are at the cap, so this rides notify rather than getting its
 * own file).
 */
export interface QuoteAcceptance {
  quoteNumber: string;
  customerName?: string;
  amount?: number;
  currency?: string;
}

/** Quote numbers are matched case-insensitively and without spacing noise. */
export const normalizeQuoteNumber = (raw: string): string => raw.trim().toUpperCase().replace(/\s+/g, '');

/**
 * Pull the acceptance out of the Xero subject line. The subject is the stable
 * part: the body is templated marketing text and gets forwarded, quoted and
 * re-wrapped on its way through a mailbox.
 */
export function parseAcceptance(subject: string): QuoteAcceptance | null {
  if (!subject) return null;
  // Strips any number of Fwd:/Re: prefixes a forward adds.
  const line = subject.replace(/^(\s*(fwd|fw|re)\s*:\s*)+/i, '').trim();
  const m = /^(.+?)\s+has accepted quote\s+([A-Za-z0-9][\w-]*)(?:\s+for\s+([\d,]+(?:\.\d+)?)\s*([A-Za-z]{3})?)?/i.exec(line);
  if (!m) return null;
  const amount = m[3] ? Number(m[3].replace(/,/g, '')) : undefined;
  return {
    quoteNumber: normalizeQuoteNumber(m[2]),
    customerName: m[1].trim() || undefined,
    amount: Number.isFinite(amount) ? amount : undefined,
    currency: m[4]?.toUpperCase(),
  };
}

/** The order this acceptance belongs to, by the quote number typed on the SO. */
export const findQuotedJob = (jobs: Job[], quoteNumber: string): Job | undefined =>
  jobs.find(j => j.xeroQuoteNumber && normalizeQuoteNumber(j.xeroQuoteNumber) === normalizeQuoteNumber(quoteNumber));

export type AcceptanceOutcome =
  | { action: 'approved'; job: Job }
  | { action: 'already-approved' }
  | { action: 'wrong-stage'; woStatus?: string };

/**
 * Move a quoted order to approved. Deliberately narrow: only an order sitting at
 * Quote Sent moves. An order already past that stage (scheduled, completed,
 * invoiced) must never be dragged backwards by a late or re-sent email, and an
 * order that never reached Quote Sent has no quote to accept.
 */
export function applyAcceptance(job: Job, acceptance: QuoteAcceptance, now: string): AcceptanceOutcome {
  const stage = job.woStatus ?? job.status;
  if (stage === 'quote_approved' || job.quoteApprovedAt) return { action: 'already-approved' };
  if (stage !== 'quote_sent') return { action: 'wrong-stage', woStatus: stage };
  const amount = acceptance.amount != null ? ` for ${acceptance.amount.toFixed(2)}${acceptance.currency ? ` ${acceptance.currency}` : ''}` : '';
  return {
    action: 'approved',
    job: {
      ...job,
      status: 'assigned',
      woStatus: 'quote_approved',
      quoteApprovedAt: now,
      updatedAt: now,
      auditLog: [...(job.auditLog ?? []), {
        id: `audit-xero-${acceptance.quoteNumber}-${Date.parse(now)}`,
        action: 'updated',
        details: `Stage quote_sent → quote_approved (Xero: ${acceptance.customerName ?? 'customer'} accepted quote ${acceptance.quoteNumber}${amount})`,
        userName: 'Xero quote acceptance',
        timestamp: now,
      }],
    },
  };
}
