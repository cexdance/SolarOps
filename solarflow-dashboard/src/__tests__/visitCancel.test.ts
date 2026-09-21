import { describe, it, expect } from 'vitest';
import { requestVisit, cancelVisit, visitId } from '../../../api/_serviceVisits';
import { getBillingColumn } from '../components/Billing';
import { mergeJobFields } from '../lib/syncEngine';
import { mergeVisitRecords, cancelledVisits } from '../lib/woHelpers';
import type { Job } from '../types';

const now = '2026-09-12T18:00:00.000Z';
const later = '2026-09-13T09:00:00.000Z';
const base = (patch: Partial<Job> = {}): Job => ({
  id: 'j1', customerId: 'c1', contractorId: 'crew1', serviceType: 'Diagnostic',
  scheduledDate: '2026-09-11', scheduledTime: '09:00', status: 'completed', woStatus: 'completed',
  serviceReport: 'Diagnosed optimizer failure', completedAt: '2026-09-11T20:00:00.000Z',
  quoteAmount: 120, quoteSentAt: '2026-09-10', quoteApprovedAt: '2026-09-10', invoicedAt: '2026-09-11',
  xeroInvoiceId: 'invoice-1', laborHours: 2, totalAmount: 120, ...patch,
} as Job);
const input = { expectedVisitId: 'j1:visit:1', date: '2026-09-15', time: '10:00', serviceType: 'Optimizer replacement', reason: 'Bring replacement optimizer' };

describe('cancelVisit, a follow-up added by mistake', () => {
  it('restores the previous visit: billing, report, dates and stage', () => {
    const withFollowUp = requestVisit(base(), input, 'tech', now);
    const back = cancelVisit(withFollowUp, 'admin', later);
    expect(back.visits ?? []).toHaveLength(0);
    expect(back.currentVisit).toBeUndefined();
    expect(back.serviceType).toBe('Diagnostic');
    expect(back.scheduledDate).toBe('2026-09-11');
    expect(back.serviceReport).toBe('Diagnosed optimizer failure');
    expect(back.quoteAmount).toBe(120);
    expect(back.xeroInvoiceId).toBe('invoice-1');
    expect(back.invoicedAt).toBe('2026-09-11');
    expect(back.woStatus).toBe('invoiced');
    // Stage comes from the restored billing, not from whatever the job read
    // before: an archived visit carries its billing, not its column.
    expect(getBillingColumn(back)).toBe('invoiced');
    expect(back.cancelledVisitAt).toBe(later);
  });

  it('keeps the kept visit\'s labor, and refuses if the new visit has labor of its own', () => {
    const withFollowUp = requestVisit(base(), input, 'tech', now);
    const id = visitId(withFollowUp);
    const kept = { id: 'l1', visitId: 'j1:visit:1', hours: 1, rate: 50, description: 'first' };
    const back = cancelVisit({ ...withFollowUp, visitLabor: [kept] } as Job, 'admin', later);
    expect((back.visitLabor ?? []).map(l => l.id)).toEqual(['l1']);

    const logged = { ...withFollowUp, visitLabor: [kept, { id: 'l2', visitId: id, hours: 1, rate: 50, description: 'second' }] } as Job;
    expect(() => cancelVisit(logged, 'admin', later)).toThrow(/already has work/);
  });

  it('refuses once the new visit has work of its own', () => {
    const withFollowUp = requestVisit(base(), input, 'tech', now);
    const started = { ...withFollowUp, startedAt: later } as Job;
    expect(() => cancelVisit(started, 'admin', later)).toThrow(/already has work/);
  });

  it('refuses when there is no follow-up to cancel', () => {
    expect(() => cancelVisit(base(), 'admin', later)).toThrow(/no follow-up visit/);
  });

  it('tombstones both halves of the split, each with the cancel cutoff', () => {
    const back = cancelVisit(requestVisit(base(), input, 'tech', now), 'admin', later);
    expect(back.cancelledVisitIds).toEqual([`j1:visit:2@${later}`, `j1:visit:1@${later}`]);
  });

  it('round-trips a second follow-up back to the first one', () => {
    const one = requestVisit(base(), input, 'tech', now);
    const approved = { ...one, currentVisit: { ...one.currentVisit!, approval: 'approved' as const }, completedAt: '2026-09-15T20:00:00.000Z', serviceReport: 'Replaced optimizer' };
    const two = requestVisit(approved, { ...input, expectedVisitId: visitId(approved), date: '2026-09-20', reason: 'Check output' }, 'tech', now);
    expect(two.visits).toHaveLength(2);
    const back = cancelVisit(two, 'admin', later);
    expect(back.visits).toHaveLength(1);
    expect(back.currentVisit?.number).toBe(2);
    expect(back.serviceReport).toBe('Replaced optimizer');
  });
});

describe('a cancelled visit cannot be resurrected by a stale copy', () => {
  const cancelled = () => cancelVisit(requestVisit(base(), input, 'tech', now), 'admin', later);
  // The stale side: a phone or tab that still holds the follow-up.
  const stale = () => requestVisit(base(), input, 'tech', now);

  it('the union merge drops the tombstoned visit, whichever side it is on', () => {
    const dead = cancelledVisits(cancelled());
    expect(mergeVisitRecords(cancelled().visits, stale().visits, dead)).toEqual([]);
    expect(mergeVisitRecords(stale().visits, cancelled().visits, dead)).toEqual([]);
  });

  it('mergeJobFields keeps the cancel, not the stale higher visit number', () => {
    const fresh = { ...cancelled(), fieldTimes: { visits: later, currentVisit: later } };
    const old = { ...stale(), fieldTimes: { visits: now, currentVisit: now } };
    for (const merged of [mergeJobFields(fresh, old), mergeJobFields(old, fresh)]) {
      expect(merged.currentVisit).toBeUndefined();
      expect(merged.visits ?? []).toEqual([]);
      expect(merged.cancelledVisitIds).toEqual([`j1:visit:2@${later}`, `j1:visit:1@${later}`]);
      // The stale side's fresh billing cycle must not ride back in either.
      expect(merged.woStatus).not.toBe('draft');
    }
  });

  it('carries the tombstone so a later merge still honours it', () => {
    const merged = mergeJobFields({ ...cancelled(), fieldTimes: { visits: later } }, { ...stale(), fieldTimes: { visits: now } });
    const secondRound = mergeJobFields({ ...merged, fieldTimes: { visits: later } } as Job, { ...stale(), fieldTimes: { visits: '2026-09-14T00:00:00.000Z' } });
    expect(secondRound.visits ?? []).toEqual([]);
    expect(secondRound.currentVisit).toBeUndefined();
  });

  it('a genuine new follow-up after a cancel still merges in', () => {
    const back = cancelled();
    const again = requestVisit(back, { ...input, expectedVisitId: visitId(back), date: '2026-09-22', reason: 'Real return trip' }, 'tech', later);
    expect(again.currentVisit?.id).toBe('j1:visit:2');
    const merged = mergeJobFields({ ...again, fieldTimes: { visits: later } }, { ...back, fieldTimes: { visits: now } });
    expect(merged.visits).toHaveLength(1);
    expect(merged.currentVisit?.reason).toBe('Real return trip');
  });
});
