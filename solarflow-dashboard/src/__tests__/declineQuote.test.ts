/**
 * Declining a quote archives the service order. Nothing is deleted, the stage
 * is kept so Restore puts it back in Quote Sent, and an LL funnel card moves to
 * the "Closed - Archived" column (mirrored to the Trello list).
 */
import { describe, it, expect } from 'vitest';
import { declineQuote, restoreJob } from '../lib/jobService';
import { getBillingColumn } from '../components/Billing';
import { cardPatchFor } from '../lib/trelloSync';
import { WO_TO_JOB_STATUS, type Job } from '../types';

const job = (over: Partial<Job> = {}): Job => ({
  id: 'j1', customerId: 'c1', woNumber: 'SO-2609-00001', status: 'new', woStatus: 'quote_sent',
  quoteSentAt: '2026-09-15T12:00:00Z', ...over,
} as unknown as Job);

describe('declineQuote', () => {
  it('archives with who and when, and keeps the stage', () => {
    const d = declineQuote(job(), 'Daniel Matos');
    expect(d.status).toBe('archived');
    expect(d.woStatus).toBe('quote_sent');
    expect(d.quoteDeclinedBy).toBe('Daniel Matos');
    expect(d.quoteDeclinedAt).toBeTruthy();
    expect(d.archivedAt).toBe(d.quoteDeclinedAt);
  });

  it('moves an LL funnel card to Closed - Archived and pushes that to Trello', () => {
    const prev = job({ pipelineStage: 'service_quote_in_progress' });
    const d = declineQuote(prev, 'Daniel Matos');
    expect(d.pipelineStage).toBe('closed_archived');
    expect(cardPatchFor(prev, d)?.stage).toBe('closed_archived');
  });

  it('does not put an order on the LL funnel that was never on it', () => {
    expect(declineQuote(job(), 'Daniel Matos').pipelineStage).toBeUndefined();
  });

  it('restores to the column its stage belongs to', () => {
    const d = declineQuote(job(), 'Daniel Matos');
    const r = restoreJob(d, WO_TO_JOB_STATUS[d.woStatus!]);
    expect(r.status).not.toBe('archived');
    expect(r.archivedAt).toBeUndefined();
    expect(getBillingColumn(r)).toBe('quote_sent');
  });
});
