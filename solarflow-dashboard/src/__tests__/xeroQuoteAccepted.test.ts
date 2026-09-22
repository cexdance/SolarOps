import { describe, it, expect } from 'vitest';
import { parseAcceptance, findQuotedJob, applyAcceptance, normalizeQuoteNumber } from '../../../api/_xeroQuote';
import type { Job } from '../types';

const now = '2026-09-22T14:00:00.000Z';
const real = 'Georgina Martinez has accepted quote QU-0460 for 500.00 USD';
const job = (patch: Partial<Job> = {}): Job => ({
  id: 'j1', woNumber: 'SO-2609-00001', customerId: 'c1', serviceType: 'Diagnostic',
  status: 'new', woStatus: 'quote_sent', quoteSentAt: '2026-09-20', xeroQuoteNumber: 'QU-0460',
  ...patch,
} as Job);

describe('parseAcceptance', () => {
  it('reads the real Xero subject', () => {
    expect(parseAcceptance(real)).toEqual({ quoteNumber: 'QU-0460', customerName: 'Georgina Martinez', amount: 500, currency: 'USD' });
  });

  it('survives forwarding, the subject Daniel actually sends', () => {
    expect(parseAcceptance(`Fwd: ${real}`)?.quoteNumber).toBe('QU-0460');
    expect(parseAcceptance(`FW: Re: Fwd: ${real}`)?.quoteNumber).toBe('QU-0460');
  });

  it('handles a thousands separator and a missing amount', () => {
    expect(parseAcceptance('ACME LLC has accepted quote QU-1203 for 12,450.75 USD')?.amount).toBe(12450.75);
    expect(parseAcceptance('ACME LLC has accepted quote QU-1203')).toMatchObject({ quoteNumber: 'QU-1203', amount: undefined });
  });

  it('ignores anything that is not an acceptance', () => {
    for (const s of ['', 'Invoice INV-0042 is due', 'Georgina Martinez has declined quote QU-0460', 'Quote QU-0460 sent'])
      expect(parseAcceptance(s)).toBeNull();
  });
});

describe('findQuotedJob', () => {
  it('matches regardless of case and spacing', () => {
    const jobs = [job({ id: 'other', xeroQuoteNumber: 'QU-0999' }), job()];
    expect(findQuotedJob(jobs, 'qu-0460')?.id).toBe('j1');
    // Typed by hand, so spacing is forgiven on both sides of the match.
    expect(findQuotedJob([job({ xeroQuoteNumber: ' qu - 0460 ' })], 'QU-0460')?.id).toBe('j1');
    expect(normalizeQuoteNumber(' qu - 0460 ')).toBe('QU-0460');
  });

  it('never matches an order with no quote number recorded', () => {
    expect(findQuotedJob([job({ xeroQuoteNumber: undefined })], 'QU-0460')).toBeUndefined();
    expect(findQuotedJob([job({ xeroQuoteNumber: '' })], '')).toBeUndefined();
  });
});

describe('applyAcceptance', () => {
  const acceptance = parseAcceptance(real)!;

  it('moves Quote Sent to Approved and records why', () => {
    const out = applyAcceptance(job(), acceptance, now);
    expect(out.action).toBe('approved');
    if (out.action !== 'approved') return;
    expect(out.job.woStatus).toBe('quote_approved');
    expect(out.job.status).toBe('assigned');
    expect(out.job.quoteApprovedAt).toBe(now);
    expect(out.job.auditLog?.at(-1)?.details).toContain('QU-0460');
    expect(out.job.auditLog?.at(-1)?.userName).toBe('Xero quote acceptance');
  });

  it('is a no-op on a re-sent or double-forwarded email', () => {
    expect(applyAcceptance(job({ woStatus: 'quote_approved' }), acceptance, now).action).toBe('already-approved');
    expect(applyAcceptance(job({ quoteApprovedAt: '2026-09-21' }), acceptance, now).action).toBe('already-approved');
  });

  it('never drags a later stage backwards', () => {
    for (const woStatus of ['scheduled', 'in_progress', 'completed', 'invoiced', 'paid'] as const)
      expect(applyAcceptance(job({ woStatus }), acceptance, now).action).toBe('wrong-stage');
  });

  it('does not approve an order that never reached Quote Sent', () => {
    expect(applyAcceptance(job({ woStatus: 'draft' }), acceptance, now).action).toBe('wrong-stage');
  });
});
