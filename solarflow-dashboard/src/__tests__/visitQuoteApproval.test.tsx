/**
 * A follow-up visit is approved by Daniel creating its quote. There used to be
 * a second "Record quote approval" step that made him approve his own quote;
 * these pin that it is gone and that a quoted visit no longer blocks the office.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import VisitWorkspace from '../components/VisitWorkspace';
import { visitAwaitingQuote, visitNeedsApproval } from '../lib/visits';
import type { Job } from '../types';

const pending = { id: 'j1:visit:2', number: 2, serviceType: 'Inverter Change', proposedDate: '2026-09-17', proposedTime: '', reason: 'Replace inverter.', approval: 'pending' as const, requestedAt: '2026-09-16T12:00:00Z', requestedBy: 'u1' };
const job = (over: Partial<Job> = {}): Job => ({ id: 'j1', customerId: 'c1', woStatus: 'draft', status: 'new', currentVisit: pending, visits: [], ...over } as unknown as Job);

describe('follow-up visit approval by quote', () => {
  it('blocks the office only until the quote exists', () => {
    expect(visitAwaitingQuote(job())).toBe(true);
    expect(visitAwaitingQuote(job({ quoteSentAt: '2026-09-16T13:00:00Z' }))).toBe(false);
  });

  it('still reports the visit pending until the save records it, so contractors stay blocked', () => {
    expect(visitNeedsApproval(job({ quoteSentAt: '2026-09-16T13:00:00Z' }))).toBe(true);
  });

  it('no longer offers a separate quote approval button', () => {
    const html = renderToStaticMarkup(<VisitWorkspace job={job()} isAdmin onSave={() => {}} />);
    expect(html).not.toContain('Record quote approval');
    expect(html).toContain('Included, no additional charge');
    expect(html).toContain('Waiting on Daniel');
  });
});
