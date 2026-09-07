// Regression: creating a customer from a Trello card dropped the card's comments
// and never built its attachments. handleCreateCustomer (App.tsx) whitelisted
// fields and silently discarded activityHistory/files; the create modal never
// called buildImportFiles at all. Both import paths must yield the same
// comments + files for the same card.
import { describe, it, expect, vi, beforeEach } from 'vitest';

// buildImportFiles copies each attachment into our own bucket through
// /api/trello-card?attachment=. Stub that call so the test covers the mapping
// and the failure handling, not the network.
const authedFetch = vi.fn();
vi.mock('../lib/supabase', () => ({
  authedFetch: (...args: unknown[]) => authedFetch(...args),
  supabase: {},
}));

const mirrorOk = (url: string) => ({
  ok: true,
  json: async () => ({ url, name: 'stored', mimeType: 'image/jpeg', size: 999 }),
});

import { buildImportActivities, buildImportFiles, extractAddress, TrelloCardData } from '../lib/trelloImporter';

const card: TrelloCardData = {
  name: 'US-10432 Jane Doe',
  desc: 'Inverter fault, needs site visit',
  due: null,
  shortUrl: 'https://trello.com/c/AbC123',
  labels: ['Site Transfer Completed', 'Paid Site Transfer'],
  attachments: [
    { name: 'meter.jpg', url: 'https://trello.com/a/meter.jpg', mimeType: 'image/jpeg', size: 1024, previewUrl: 'https://trello.com/p/meter-big.jpg' },
    { name: 'invoice.pdf', url: 'https://trello.com/a/invoice.pdf', mimeType: 'application/pdf', size: 2048, previewUrl: null },
  ],
  comments: [
    { author: 'Tech A', date: '2026-07-01T12:00:00.000Z', text: 'Called client, no answer' },
    { author: 'Tech B', date: '2026-07-02T12:00:00.000Z', text: 'Scheduled for Friday' },
  ],
  checklists: [],
  customFieldItems: [],
  actions: [],
};

describe('Trello import into a NEW customer', () => {
  it('carries every comment as its own activity', () => {
    const comments = buildImportActivities(card, 'Trello')
      .filter(a => a.id.startsWith('trello-comment-'));
    expect(comments).toHaveLength(2);
    expect(comments[0].description).toContain('Called client, no answer');
    expect(comments[1].userName).toBe('Tech B');
  });

  beforeEach(() => authedFetch.mockReset());

  // The bug this pins: attachments used to be stored as raw trello.com URLs, on
  // the assumption they were public. They are not, so only the importing user
  // could open them. Every stored URL must now point at our own bucket.
  it('copies every attachment into our bucket instead of linking to Trello', async () => {
    authedFetch
      .mockResolvedValueOnce(mirrorOk('https://x.supabase.co/storage/v1/object/public/customer-files/c1/meter.jpg'))
      .mockResolvedValueOnce(mirrorOk('https://x.supabase.co/storage/v1/object/public/customer-files/c1/invoice.pdf'));

    const { files, failed } = await buildImportFiles(card, 'cust-1');

    expect(failed).toHaveLength(0);
    expect(files).toHaveLength(2);
    expect(files.every(f => f.url.includes('/storage/v1/object/public/customer-files/'))).toBe(true);
    expect(files.some(f => f.url.includes('trello.com'))).toBe(false);
    expect(files.every(f => f.source === 'trello')).toBe(true);

    // The preview is the smaller render, so it is what gets copied for images.
    expect(authedFetch.mock.calls[0][0]).toContain(encodeURIComponent('https://trello.com/p/meter-big.jpg'));
    // No preview on the PDF, so the raw attachment URL is used.
    expect(authedFetch.mock.calls[1][0]).toContain(encodeURIComponent('https://trello.com/a/invoice.pdf'));
  });

  // A file only the importer can open is worse than an obvious failure, so a
  // copy that fails must be reported and dropped, never stored as a trello URL.
  it('drops and reports an attachment it cannot copy, never falls back to the Trello URL', async () => {
    authedFetch
      .mockResolvedValueOnce(mirrorOk('https://x.supabase.co/storage/v1/object/public/customer-files/c1/meter.jpg'))
      .mockResolvedValueOnce({ ok: false, status: 502, json: async () => ({ error: 'Trello download 401' }) });

    const { files, failed } = await buildImportFiles(card, 'cust-1');

    expect(files).toHaveLength(1);
    expect(files.some(f => f.url.includes('trello.com'))).toBe(false);
    expect(failed).toEqual([{ name: 'invoice.pdf', error: 'Trello download 401' }]);
  });

  it('produces stable IDs so a re-import dedups instead of duplicating', async () => {
    authedFetch.mockResolvedValue(mirrorOk('https://x.supabase.co/storage/v1/object/public/customer-files/c1/f'));
    const a = await buildImportFiles(card, 'cust-1');
    const b = await buildImportFiles(card, 'cust-1');
    expect(a.files.map(f => f.id)).toEqual(b.files.map(f => f.id));
    expect(a.files[0].id).toBe('trello-file-AbC123-0');
  });

  it('carries the card labels as their own note', () => {
    const labels = buildImportActivities(card, 'Trello')
      .find(a => a.id === 'trello-labels-AbC123');
    expect(labels?.description).toBe('Trello labels: Site Transfer Completed, Paid Site Transfer');
  });
});

// Real shape from card xw2wHqN8 (US-15661 Ed Chase): the desc's Address/City/State
// fields are blank and the only real address is inside a comment, bulleted and
// wrapped over two lines. This is what silently produced a blank required
// Address field and blocked the whole save.
describe('extractAddress', () => {
  const withText = (desc: string, comment = ''): TrelloCardData => ({
    ...card, desc,
    comments: comment ? [{ author: 'Cruz', date: '2026-07-27T20:06:28.369Z', text: comment }] : [],
  });

  it('finds a bulleted address wrapped across two lines in a comment', () => {
    const c = withText(
      'First Name: Ed\nAddress: \nCity: \nState: \nZip Code: 33625\n',
      '- Address: 6024 Williamsburg Way\n  Tampa, FL 33625\n- Problem: green blinking light',
    );
    expect(extractAddress(c)).toEqual({
      address: '6024 Williamsburg Way', city: 'Tampa', state: 'FL', zip: '33625',
    });
  });

  it('still prefers a complete single-line address over a joined pair', () => {
    expect(extractAddress(withText('123 Main St, Ocala, FL 34471\n9999 Wrong Rd')))
      .toEqual({ address: '123 Main St', city: 'Ocala', state: 'FL', zip: '34471' });
  });

  it('does not invent an address from the blank desc template alone', () => {
    expect(extractAddress(withText('Address: \nCity: \nState: \nZip Code: 33625\n'))).toBeNull();
  });

  // Real shape from card ZeH5cifO (US-15674 Hunter Agricultural Irrigation).
  // The whole desc is one bold line; the trailing ** defeated parseUsAddress,
  // which anchors the zip to end-of-string.
  it('finds an address wrapped in markdown bold', () => {
    expect(extractAddress(withText('**Address: 1963 Healy Wy Clermont, FL 34711**')))
      .toEqual({ address: '1963 Healy Wy', city: 'Clermont', state: 'FL', zip: '34711' });
  });

  it('handles other emphasis wrappers and heading markers', () => {
    expect(extractAddress(withText('## _Address: 88 Palm Ave Ocala, FL 34471_')))
      .toEqual({ address: '88 Palm Ave', city: 'Ocala', state: 'FL', zip: '34471' });
  });
});
