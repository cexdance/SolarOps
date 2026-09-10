/**
 * Verbal approval: the client says yes on the phone, the order jumps straight
 * to Scheduled, and Daniel still owes a formal quote.
 *
 * The whole feature hangs on one predicate and one routing line, so that is
 * what is pinned here: a verbally approved order must land back in Daniel's
 * Create Quote column, and must leave it the moment a quote is sent, without
 * dragging the historic no-quoteSentAt backlog in with it.
 */

import { describe, it, expect } from 'vitest';
import { needsFormalQuote } from '../lib/woHelpers';
import { getBillingColumn } from '../components/Billing';
import type { Job } from '../types';

const job = (over: Partial<Job>): Job => ({
  id: 'j1',
  customerId: 'c1',
  woNumber: 'WO-2609-78916',
  serviceType: 'Repair',
  status: 'assigned',
  woStatus: 'scheduled',
  ...over,
} as unknown as Job);

describe('needsFormalQuote', () => {
  it('is true only when a verbal approval exists and no quote was sent', () => {
    expect(needsFormalQuote(job({ verbalApprovalAt: '2026-09-10T12:00:00Z' }))).toBe(true);
  });

  it('ignores the legacy backlog, which has no quoteSentAt either', () => {
    expect(needsFormalQuote(job({}))).toBe(false);
  });

  it('self-clears once the quote goes out', () => {
    expect(needsFormalQuote(job({
      verbalApprovalAt: '2026-09-10T12:00:00Z',
      quoteSentAt: '2026-09-11T09:00:00Z',
    }))).toBe(false);
  });
});

describe('getBillingColumn with a verbal approval', () => {
  it('routes a scheduled, unquoted order back to Create Quote', () => {
    expect(getBillingColumn(job({ verbalApprovalAt: '2026-09-10T12:00:00Z' }))).toBe('new');
  });

  it('releases it to Pending Completion once the quote is sent', () => {
    expect(getBillingColumn(job({
      verbalApprovalAt: '2026-09-10T12:00:00Z',
      quoteSentAt: '2026-09-11T09:00:00Z',
    }))).toBe('pending');
  });

  it('leaves an ordinary scheduled order in Pending Completion', () => {
    expect(getBillingColumn(job({}))).toBe('pending');
  });

  // Once work is done the invoice supersedes the quote, so the money columns
  // must win over the intake re-route or a completed order would sit in
  // Create Quote forever and never get billed.
  it('does not hold a completed order out of Ready to Invoice', () => {
    expect(getBillingColumn(job({
      verbalApprovalAt: '2026-09-10T12:00:00Z',
      status: 'completed',
    }))).toBe('to_invoice');
  });

  it('does not hold a paid order out of Paid', () => {
    expect(getBillingColumn(job({
      verbalApprovalAt: '2026-09-10T12:00:00Z',
      status: 'paid',
    }))).toBe('paid');
  });
});
