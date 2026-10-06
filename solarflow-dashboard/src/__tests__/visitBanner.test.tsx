// The tech's visit banner. renderToStaticMarkup, so no login, no effects and no
// live writes (see the RMA screen tests for the same approach).
import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import VisitBanner from '../components/contractor/VisitBanner';
import type { ContractorJob } from '../types/contractor';

const base = { id: 'cj-1', sourceJobId: 'job-1' } as unknown as ContractorJob;

const visit = (number: number) => ({
  id: `job-1:visit:${number}`, number, date: '2026-09-11', serviceType: 'Inverter inspection',
  workDone: `Visit ${number} findings`, photoUrls: [`https://x/p${number}.jpg`], updatedAt: '2026-09-11T15:00:00Z',
});

describe('VisitBanner', () => {
  it('says which visit the tech is on and what the office approved for it', () => {
    const html = renderToStaticMarkup(<VisitBanner job={{
      ...base, visits: [visit(1)],
      currentVisit: { id: 'job-1:visit:2', number: 2, serviceType: 'Inverter Change', proposedDate: '2026-09-17', proposedTime: '', reason: 'Replace Inverter.', approval: 'approved', requestedAt: '2026-09-15T22:52:25.351Z', requestedBy: 'u1' },
    }} />);
    expect(html).toContain('Visit 2 of 2');
    expect(html).toContain('Inverter Change');
    expect(html).toContain('Replace Inverter.');
    // Earlier trips are reachable, collapsed until asked for.
    expect(html).toContain('Review earlier visits (1)');
    expect(html).not.toContain('Visit 1 findings');
  });

  it('stays out of the way on a single-visit order', () => {
    expect(renderToStaticMarkup(<VisitBanner job={base} />)).toBe('');
  });

  it('counts every finished visit, even with no plan on the current one', () => {
    const html = renderToStaticMarkup(<VisitBanner job={{ ...base, visits: [visit(1), visit(2)] }} />);
    expect(html).toContain('Visit 3 of 3');
    expect(html).toContain('Review earlier visits (2)');
  });
});
