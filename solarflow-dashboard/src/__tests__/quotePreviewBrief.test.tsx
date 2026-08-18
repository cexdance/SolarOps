import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { QuotePreviewModal } from '../components/QuotePreviewModal';

// The quote step hands pricing to Daniel. Whoever prices it needs the SCOPE,
// which used to live behind the modal on the WO overview. These pin that the
// brief actually reaches the screen, since the CREATE QUOTE column is often
// empty and the flow can't always be exercised by hand.
const base = {
  customerName: 'Temple Houston',
  customerEmail: 't@example.com',
  address: '152 Glencullen Cir',
  woNumber: 'SO-2607-50070',
  jobId: 'job-1',
  lineItems: [],
  laborTotal: 0,
  partsTotal: 0,
  grandTotal: 0,
  onClose: () => {},
  onSent: () => {},
};

const render = (props: Partial<React.ComponentProps<typeof QuotePreviewModal>> = {}) =>
  renderToStaticMarkup(<QuotePreviewModal {...base} {...props} />);

describe('QuotePreviewModal quote brief', () => {
  it('leads with the service type and the requested scope', () => {
    const html = render({
      serviceType: 'Optimizer / Microinverter Change',
      requestedWork: 'Replace 3 failing optimizers on the east array.',
    });
    expect(html).toContain('What to quote');
    expect(html).toContain('Optimizer / Microinverter Change');
    expect(html).toContain('Replace 3 failing optimizers on the east array.');
  });

  it('puts the brief ABOVE the customer fields', () => {
    const html = render({ serviceType: 'Site Visit', requestedWork: 'Inspect inverter fault.' });
    expect(html.indexOf('What to quote')).toBeLessThan(html.indexOf('Customer Name'));
  });

  it('says so plainly when no scope was written, rather than rendering blank', () => {
    const html = render({ serviceType: 'Site Visit' });
    expect(html).toContain('No scope written on this order yet');
  });

  it('flags the billing route, since it changes who gets charged', () => {
    expect(render({ serviceType: 'X', isPowercare: true })).toContain('bills to SolarEdge');
    expect(render({ serviceType: 'X', isServiceAccountExpense: true })).toContain('admin approval');
  });

  it('omits the block entirely when there is nothing to say', () => {
    expect(render()).not.toContain('What to quote');
  });
});
