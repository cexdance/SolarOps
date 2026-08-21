import { describe, it, expect } from 'vitest';
import { pickupJobsForContractor } from '../lib/woHelpers';
import type { Job } from '../types';

const job = (over: Record<string, unknown> = {}) =>
  ({ id: 'j1', contractorId: 'c1', status: 'assigned', ...over }) as unknown as Job;

const ids = (l: Job[]) => l.map(j => j.id);

describe('pickupJobsForContractor', () => {
  it('shows dispatched work and hides anything still being quoted', () => {
    const jobs = [
      job({ id: 'draft', woStatus: 'draft' }),
      job({ id: 'quoted', woStatus: 'quote_sent' }),
      job({ id: 'live', woStatus: 'in_progress' }),
    ];
    expect(ids(pickupJobsForContractor('c1', jobs))).toEqual(['live']);
  });

  it('keeps the billing tail visible so a card can reach the Paid column', () => {
    // Before, invoiced/paid were excluded and the card vanished after
    // completion, which made a contractor-side Paid column impossible.
    const jobs = [
      job({ id: 'inv', woStatus: 'invoiced' }),
      job({ id: 'paid', woStatus: 'paid' }),
    ];
    expect(ids(pickupJobsForContractor('c1', jobs)).sort()).toEqual(['inv', 'paid']);
  });

  it('never resurrects an ARCHIVED order through its woStatus', () => {
    // Live hazard: one archived job carries woStatus 'paid', and the status
    // test reads woStatus first, so without the explicit archived check it
    // would reappear in the portal as Paid.
    const jobs = [job({ id: 'gone', status: 'archived', woStatus: 'paid' })];
    expect(pickupJobsForContractor('c1', jobs)).toEqual([]);
  });

  it('only ever returns the contractor their own jobs', () => {
    const jobs = [job({ id: 'mine' }), job({ id: 'theirs', contractorId: 'c2' })];
    expect(ids(pickupJobsForContractor('c1', jobs))).toEqual(['mine']);
  });
});
