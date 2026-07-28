import { describe, it, expect } from 'vitest';
import { getBillingColumn, ageTier, cardAge } from '../components/Billing';
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

  it('never ages a column that is not billing\'s clock', () => {
    expect(cardAge(job({ createdAt: daysAgo(90) }), 'pending', now)).toBeNull();
    expect(cardAge(job({ invoicedAt: daysAgo(90) }), 'paid', now)).toBeNull();
    expect(cardAge(job({ invoicedAt: daysAgo(90) }), 'costs_covered', now)).toBeNull();
  });

  it('floors a future timestamp at 0 instead of going negative', () => {
    expect(cardAge(job({ quoteSentAt: daysAgo(-5) }), 'quote_sent', now)).toEqual({ days: 0, exact: true });
  });
});
