import { describe, it, expect } from 'vitest';
import { toContractorJobView } from '../lib/woHelpers';
import type { Job } from '../types';
import type { ContractorJob } from '../types/contractor';

const job = (over: Record<string, unknown> = {}) => ({
  id: 'j1', status: 'in_progress', ...over,
}) as unknown as Job;

const cj = (over: Record<string, unknown> = {}) => ({
  id: 'cj1', status: 'in_progress', photos: {}, ...over,
}) as unknown as ContractorJob;

// Regression guard: the admin mirror write (setData -> saveData) can fail to
// persist on a contractor's phone when localStorage is full, while the
// contractor's own saveContractorJobs write succeeds. A reload then re-hydrates
// the stale admin job, and toContractorJobView must not let that regress a
// completion the contractor already saved.
describe('toContractorJobView status', () => {
  it('keeps the contractor-completed status when the admin mirror is stale', () => {
    const view = toContractorJobView(job({ status: 'in_progress' }), cj({ status: 'completed' }));
    expect(view.status).toBe('completed');
  });

  it('adopts the admin status once it catches up (no existingCj lag)', () => {
    const view = toContractorJobView(job({ status: 'completed' }), cj({ status: 'completed' }));
    expect(view.status).toBe('completed');
  });

  it('still prefers admin status when it is further along than the contractor copy', () => {
    const view = toContractorJobView(job({ status: 'scheduled' }), cj({ status: 'assigned' }));
    expect(view.status).toBe('assigned'); // scheduled maps to assigned
    const ahead = toContractorJobView(job({ status: 'completed' }), cj({ status: 'in_progress' }));
    expect(ahead.status).toBe('completed');
  });

  // ── Contractor payment ───────────────────────────────────────────────────
  // The office covering contractor + expenses is what "paid" means to a
  // contractor. The admin `paid` stage means the CLIENT paid, which happens
  // earlier, so it must NOT leak through as a contractor payment.
  describe('paid is driven by costsCoveredAt, never by the client-paid stage', () => {
    it('shows paid once costs are covered', () => {
      const view = toContractorJobView(job({ status: 'paid', woStatus: 'paid', costsCoveredAt: '2026-08-18T00:00:00.000Z' }));
      expect(view.status).toBe('paid');
    });

    it('does NOT say paid while only the client has paid', () => {
      const view = toContractorJobView(job({ status: 'paid', woStatus: 'paid' }));
      expect(view.status).toBe('completed');
    });

    it('reads the client-invoicing tail as completed, not invoiced', () => {
      expect(toContractorJobView(job({ status: 'invoiced' })).status).toBe('completed');
      expect(toContractorJobView(job({ woStatus: 'invoiced', status: 'completed' })).status).toBe('completed');
    });

    it('a STALE paid in the contractor blob cannot claim payment on its own', () => {
      // 2 live contractor rows carry status 'paid' whose admin job was never
      // costs-covered. The furthest-along rule must not honour those.
      const view = toContractorJobView(job({ status: 'completed' }), cj({ status: 'paid' }));
      expect(view.status).toBe('completed');
    });

    it('carries the paid DATE through, which is what the card renders', () => {
      const view = toContractorJobView(job({ status: 'paid', woStatus: 'paid', costsCoveredAt: '2026-08-18T00:00:00.000Z' }));
      expect(view.paidAt).toBe('2026-08-18T00:00:00.000Z');
    });

    it('leaves paidAt unset while nobody has covered the costs', () => {
      // The card keys its green hue and Paid line off this, so an unpaid order
      // must not carry a date at all.
      expect(toContractorJobView(job({ status: 'paid', woStatus: 'paid' })).paidAt).toBeUndefined();
      expect(toContractorJobView(job({ status: 'completed' })).paidAt).toBeUndefined();
    });

    it('on_hold still wins over a covered order', () => {
      const view = toContractorJobView(job({ status: 'paid', costsCoveredAt: '2026-08-18T00:00:00.000Z', onHold: true }));
      expect(view.status).toBe('on_hold');
    });
  });

  it('on_hold always overrides regardless of pipeline stage', () => {
    const view = toContractorJobView(job({ status: 'in_progress', onHold: true }), cj({ status: 'completed' }));
    expect(view.status).toBe('on_hold');
  });
});
