// SO-2609-23039 (2026-09-16): an order converted from a Trello lead showed no
// Trello control at all, because the component returned null for any
// `job-trello-*` id. Those orders already have a card, so they must LINK to it,
// never offer to create a second one.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SendToTrello } from '../components/SendToTrello';
import type { Job } from '../types';

const render = (job: Partial<Job>) => renderToStaticMarkup(
  React.createElement(SendToTrello, { job: job as Job, rmaEntries: [], onLinked: () => {} }),
);

describe('SendToTrello on every service order', () => {
  it('an order converted from a Trello lead links to that lead card', () => {
    const html = render({ id: 'job-trello-6aa4940ed25ee20fff76d045', woNumber: 'SO-2609-23039' });
    expect(html).toContain('Open in Trello');
    expect(html).toContain('href="https://trello.com/c/6aa4940ed25ee20fff76d045"');
    expect(html).not.toContain('Send to Trello');
  });

  it('an order created in SolarOps offers Send to Trello', () => {
    expect(render({ id: 'job-1788191664892', woNumber: 'SO-2609-11111' })).toContain('Send to Trello');
  });

  it('an order already sent links to the card it created', () => {
    const html = render({ id: 'job-1788191664892', trelloCardUrl: 'https://trello.com/c/qJOzg5Kz' });
    expect(html).toContain('href="https://trello.com/c/qJOzg5Kz"');
    expect(html).not.toContain('Send to Trello');
  });
});
