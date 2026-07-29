import { describe, it, expect } from 'vitest';
import { getBillingColumn, ageTier, cardAge, sortByAge } from '../components/Billing';
import type { Job } from '../types';

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

  it('returns a completed order to Ready to Invoice regardless of woStatus', () => {
    expect(getBillingColumn(job({ status: 'completed', woStatus: 'quote_sent' }))).toBe('to_invoice');
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
