import { describe, it, expect } from 'vitest';
import { getBillingColumn, ageTier, cardAge, sortByAge, displayName, orderKind, isServiceOrder } from '../components/Billing';
import type { Job, Customer } from '../types';

const job = (p: Partial<Job>): Job => ({
  id: 'j1',
  customerId: 'c1',
  technicianId: '',
  serviceType: 'Site visit',
  status: 'new',
  scheduledDate: '',
  scheduledTime: '',
  notes: '',
  photos: [],
  laborHours: 0,
  laborRate: 0,
  partsCost: 0,
  totalAmount: 0,
  createdAt: '2026-07-01T00:00:00.000Z',
  urgency: 'medium',
  isPowercare: false,
  ...p,
});

describe('getBillingColumn, site transfers', () => {
  // Daniel invoices the flat fee directly, no quote and no field work, so the
  // card belongs in Invoiced from creation instead of sitting in New.
  it('pins a site transfer to Invoiced from creation, by code or by type', () => {
    expect(getBillingColumn(job({ serviceCode: 'SITE-TRX' }))).toBe('invoiced');
    expect(getBillingColumn(job({ serviceType: 'Site Transfer' }))).toBe('invoiced');
  });

  it('keeps it in Invoiced even while woStatus still says draft', () => {
    // The draft check runs first for every other order and would send this to New.
    expect(getBillingColumn(job({ serviceCode: 'SITE-TRX', woStatus: 'draft' }))).toBe('invoiced');
  });

  it('still closes out normally once paid', () => {
    expect(getBillingColumn(job({ serviceCode: 'SITE-TRX', status: 'paid' }))).toBe('paid');
    expect(getBillingColumn(job({
      serviceCode: 'SITE-TRX', status: 'paid', costsCoveredAt: '2026-08-01T00:00:00.000Z',
    }))).toBe('costs_covered');
  });

  it('does not drag ordinary orders into Invoiced', () => {
    expect(getBillingColumn(job({ serviceType: 'Site visit', woStatus: 'draft' }))).toBe('new');
    expect(getBillingColumn(job({ serviceCode: 'OPT-1', woStatus: 'draft' }))).toBe('new');
  });

  it('is not confused by the completion flag, which never moves the column', () => {
    expect(getBillingColumn(job({
      serviceCode: 'SITE-TRX', siteTransferCompletedAt: '2026-08-20T00:00:00.000Z',
    }))).toBe('invoiced');
  });
});

describe('getBillingColumn', () => {
  it('lands a never-worked service call in New', () => {
    expect(getBillingColumn(job({}))).toBe('new');
    expect(getBillingColumn(job({ woStatus: 'draft' }))).toBe('new');
  });

  it('lands a sent quote in Quote Sent', () => {
    expect(getBillingColumn(job({ woStatus: 'quote_sent' }))).toBe('quote_sent');
  });

  it('moves an approved quote out of billing into Pending Completion', () => {
    expect(getBillingColumn(job({ status: 'assigned', woStatus: 'quote_approved' }))).toBe('pending');
    expect(getBillingColumn(job({ status: 'in_progress', woStatus: 'scheduled' }))).toBe('pending');
  });

  it('returns a completed order to Ready to Invoice from any WORKED woStatus', () => {
    // The auto-return path: contractor finishes, status flips to completed,
    // and the card comes back to billing on its own.
    expect(getBillingColumn(job({ status: 'completed', woStatus: 'scheduled' }))).toBe('to_invoice');
    expect(getBillingColumn(job({ status: 'completed', woStatus: 'in_progress' }))).toBe('to_invoice');
    expect(getBillingColumn(job({ status: 'completed', woStatus: 'completed' }))).toBe('to_invoice');
  });

  it('will not let a stale status put unworked orders in the money columns', () => {
    // WO-2605-48600 / -55497 / -79732 live: status says invoiced, woStatus says
    // draft, and no completedAt / invoicedAt / clientPaidAt / xeroInvoiceId
    // backs the claim. woStatus wins, so they sit in the quote queue where the
    // work actually is, not in Invoiced pretending to be revenue.
    expect(getBillingColumn(job({ status: 'invoiced', woStatus: 'draft' }))).toBe('new');
    expect(getBillingColumn(job({ status: 'paid', woStatus: 'draft' }))).toBe('new');
    expect(getBillingColumn(job({ status: 'invoiced', woStatus: 'quote_sent' }))).toBe('quote_sent');
    // costsCoveredAt must not smuggle one into the closed-out column either.
    expect(getBillingColumn(job({ status: 'paid', woStatus: 'draft', costsCoveredAt: '2026-07-02T00:00:00.000Z' }))).toBe('new');
  });

  it('still trusts status once woStatus reports the work done', () => {
    expect(getBillingColumn(job({ status: 'invoiced', woStatus: 'completed' }))).toBe('invoiced');
  });

  it('keeps the existing invoiced / paid / closed-out stages', () => {
    expect(getBillingColumn(job({ status: 'invoiced' }))).toBe('invoiced');
    expect(getBillingColumn(job({ status: 'paid' }))).toBe('paid');
    expect(getBillingColumn(job({ status: 'paid', costsCoveredAt: '2026-07-02T00:00:00.000Z' }))).toBe('costs_covered');
  });
});

describe('ageTier', () => {
  it('escalates one level every 3 calendar days and caps at 3', () => {
    expect([0, 1, 2].map(ageTier)).toEqual([0, 0, 0]);
    expect([3, 4, 5].map(ageTier)).toEqual([1, 1, 1]);
    expect([6, 7, 8].map(ageTier)).toEqual([2, 2, 2]);
    expect([9, 30, 400].map(ageTier)).toEqual([3, 3, 3]);
  });
});

describe('cardAge', () => {
  const now = new Date('2026-07-28T12:00:00.000Z').getTime();
  const daysAgo = (n: number) => new Date(now - n * 86400000).toISOString();

  it('clocks each column off its own stage stamp and calls it exact', () => {
    expect(cardAge(job({ createdAt: daysAgo(4) }), 'new', now)).toEqual({ days: 4, exact: true });
    expect(cardAge(job({ quoteSentAt: daysAgo(7) }), 'quote_sent', now)).toEqual({ days: 7, exact: true });
    expect(cardAge(job({ completedAt: daysAgo(2) }), 'to_invoice', now)).toEqual({ days: 2, exact: true });
    expect(cardAge(job({ invoicedAt: daysAgo(12) }), 'invoiced', now)).toEqual({ days: 12, exact: true });
  });

  it('falls back to last-touch, then creation, and flags the age inexact', () => {
    // The whole existing backlog looks like this: in the column, no stage stamp.
    expect(cardAge(job({ updatedAt: daysAgo(9), createdAt: daysAgo(40) }), 'quote_sent', now))
      .toEqual({ days: 9, exact: false });
    expect(cardAge(job({ createdAt: daysAgo(40) }), 'invoiced', now))
      .toEqual({ days: 40, exact: false });
  });

  it('skips a junk stamp instead of returning NaN days', () => {
    expect(cardAge(job({ quoteSentAt: 'not a date', updatedAt: daysAgo(5) }), 'quote_sent', now))
      .toEqual({ days: 5, exact: false });
  });

  it('clocks the working columns off their own stage stamp', () => {
    expect(cardAge(job({ quoteApprovedAt: daysAgo(6) }), 'pending', now)).toEqual({ days: 6, exact: true });
    expect(cardAge(job({ clientPaidAt: daysAgo(8) }), 'paid', now)).toEqual({ days: 8, exact: true });
  });

  it('never ages Costs Covered, the closed-out column', () => {
    // Nothing is wrong with an old closed-out order, so a marker there would
    // just turn the column red and dilute the columns that mean act now.
    expect(cardAge(job({ costsCoveredAt: daysAgo(400) }), 'costs_covered', now)).toBeNull();
    expect(cardAge(job({ createdAt: daysAgo(400) }), 'costs_covered', now)).toBeNull();
  });

  it('does not let a later stage read an earlier stage\'s stamp as exact', () => {
    // A paid card with no clientPaidAt must not silently age off invoicedAt.
    expect(cardAge(job({ invoicedAt: daysAgo(90), updatedAt: daysAgo(2) }), 'paid', now))
      .toEqual({ days: 2, exact: false });
  });

  it('returns null when there is nothing at all to measure from', () => {
    expect(cardAge({ ...job({}), createdAt: '' } as Job, 'invoiced', now)).toBeNull();
  });

  it('floors a future timestamp at 0 instead of going negative', () => {
    expect(cardAge(job({ quoteSentAt: daysAgo(-5) }), 'quote_sent', now)).toEqual({ days: 0, exact: true });
  });
});

describe('isServiceOrder', () => {
  it('accepts a job that has a service order number', () => {
    expect(isServiceOrder(job({ woNumber: 'WO-2607-00042' }))).toBe(true);
  });

  it('rejects an S1 pipeline lead, which has a stage but no order yet', () => {
    // 33 live records look like this. They were never meant to reach billing:
    // pipelineStage is the sales funnel and nothing in billing reads it.
    expect(isServiceOrder(job({ woNumber: undefined, pipelineStage: 'needs_first_quote' }))).toBe(false);
  });

  it('keeps a real order that simply has no linked customer', () => {
    // The discriminator is the order number, NOT the customer link: 2 live
    // orders are unlinked but genuine, and must stay on the board.
    expect(isServiceOrder(job({ woNumber: 'WO-2605-20400', customerId: '' }))).toBe(true);
  });
});

describe('displayName', () => {
  it('falls back to clientName when the order has no customer row', () => {
    // 33 of the 38 orders in the intake column look exactly like this:
    // customerId '', name carried on the job itself.
    expect(displayName(job({ customerId: '', clientName: 'Daniel Torres' }))).toBe('Daniel Torres');
  });

  it('prefers the linked customer record when there is one', () => {
    const customer = { id: 'c1', name: 'Linked Co' } as Customer;
    expect(displayName(job({ clientName: 'Stale Name' }), customer)).toBe('Linked Co');
  });

  it('never renders an empty card title', () => {
    expect(displayName(job({ customerId: '', clientName: undefined }))).toBe('Unnamed order');
  });
});

describe('orderKind', () => {
  it('separates the three intake flows', () => {
    expect(orderKind(job({}))).toBe('quote');
    expect(orderKind(job({ isServiceAccountExpense: true }))).toBe('expense');
    expect(orderKind(job({ isPowercare: true }))).toBe('powercare');
  });

  it('calls a PowerCare expense PowerCare, since the plan covers the cost', () => {
    expect(orderKind(job({ isPowercare: true, isServiceAccountExpense: true }))).toBe('powercare');
  });
});

describe('sortByAge', () => {
  const now = new Date('2026-07-28T12:00:00.000Z').getTime();
  const daysAgo = (n: number) => new Date(now - n * 86400000).toISOString();
  const at = (id: string, n: number) => job({ id, quoteSentAt: daysAgo(n) });
  const ids = (l: Job[]) => l.map(j => j.id);

  it('puts the most critical (oldest) first descending', () => {
    const list = [at('b', 4), at('c', 20), at('a', 1)];
    expect(ids(sortByAge(list, 'quote_sent', 'desc', now))).toEqual(['c', 'b', 'a']);
  });

  it('puts the most recent first ascending', () => {
    const list = [at('b', 4), at('c', 20), at('a', 1)];
    expect(ids(sortByAge(list, 'quote_sent', 'asc', now))).toEqual(['a', 'b', 'c']);
  });

  it('sinks undatable cards to the bottom in BOTH directions', () => {
    // Ascending is the trap: a null age treated as 0 would lead the column with
    // cards that simply have no date, hiding the genuinely newest ones.
    const nodate = { ...job({ id: 'x' }), createdAt: '', updatedAt: undefined } as Job;
    const list = [nodate, at('old', 30), at('new', 1)];
    expect(ids(sortByAge(list, 'quote_sent', 'asc', now))).toEqual(['new', 'old', 'x']);
    expect(ids(sortByAge(list, 'quote_sent', 'desc', now))).toEqual(['old', 'new', 'x']);
  });

  it('does not mutate the array it was handed', () => {
    const list = [at('b', 4), at('c', 20), at('a', 1)];
    sortByAge(list, 'quote_sent', 'desc', now);
    expect(ids(list)).toEqual(['b', 'c', 'a']);
  });
});
