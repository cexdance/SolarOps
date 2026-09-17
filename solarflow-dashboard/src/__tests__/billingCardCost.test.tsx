// Billing card shows the visit's field cost (labor, parts, total) so the quote
// and later the invoice are priced from real numbers, not dashes.
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { Billing } from '../components/Billing';
import type { Job } from '../types';

const job = {
  id: 'j1', customerId: 'c1', woNumber: 'SO-2609-00001', status: 'new', woStatus: 'draft',
  createdAt: '2026-09-01T00:00:00.000Z', serviceType: 'Inverter Replacement',
  contractorPayRate: 100, contractorPayUnit: 'flat',
  lineItems: [
    { id: 'a', type: 'part', description: 'Optimizer', quantity: 2, unitCost: 35, totalCost: 70 },
    { id: 'b', type: 'labor', description: 'Extra hour', quantity: 1, unitCost: 50, totalCost: 50 },
  ],
} as unknown as Job;

describe('Billing card cost line', () => {
  it('shows labor, parts, total and the added labor', () => {
    const html = renderToStaticMarkup(
      <Billing jobs={[job]} customers={[]} users={[]} onUpdateJob={() => {}} isMobile={false} />,
    );
    expect(html).toContain('Labor $150.00 · Parts $70.00');
    expect(html).toContain('$220.00');
    expect(html).toContain('extra labor $50.00');
  });
});
