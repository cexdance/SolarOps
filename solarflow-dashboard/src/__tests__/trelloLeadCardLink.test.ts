// A client's later order linked to their existing LEAD card (Send to Trello's
// duplicate guard does this) must not turn the card into "the order's card":
// the webhook skips those, which froze the lead record's own sync.
// SO-2610-62845 -> US-15707's card, whose lead record is SO-2609-95542.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { linkedJobFor } from '../../../api/trello-card';

const CARD = '6aa1d93d17258a6b5682fe86';
const rows = (r: unknown[]) => ({ ok: true, json: async () => r });

afterEach(() => vi.unstubAllGlobals());

describe('linkedJobFor', () => {
  it('a lead card stays a lead card even when an order links to it', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.includes(`job-trello-${CARD}`) ? rows([{ key: `job:job-trello-${CARD}` }]) : rows([{ key: 'job:job-1790862465567-hnpadq' }])));
    expect(await linkedJobFor(CARD, 'no ref line')).toBeUndefined();
  });

  it('a card made by Send to Trello still belongs to its order', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.includes('job-trello-') ? rows([]) : rows([{ key: 'job:job-1790862465567-hnpadq' }])));
    expect(await linkedJobFor('6ac3ba71bc3ba4f199f24ad1', undefined)).toBe('job-1790862465567-hnpadq');
  });
});
