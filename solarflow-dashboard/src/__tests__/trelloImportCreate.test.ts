// Regression: creating a customer from a Trello card dropped the card's comments
// and never built its attachments. handleCreateCustomer (App.tsx) whitelisted
// fields and silently discarded activityHistory/files; the create modal never
// called buildImportFiles at all. Both import paths must yield the same
// comments + files for the same card.
import { describe, it, expect } from 'vitest';
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

  it('carries every attachment, preferring the preview URL', () => {
    const files = buildImportFiles(card);
    expect(files).toHaveLength(2);
    expect(files[0].url).toBe('https://trello.com/p/meter-big.jpg'); // preview wins
    expect(files[1].url).toBe('https://trello.com/a/invoice.pdf');   // no preview, raw URL
    expect(files.every(f => f.source === 'trello')).toBe(true);
  });

  it('produces stable IDs so a re-import dedups instead of duplicating', () => {
    expect(buildImportFiles(card).map(f => f.id))
      .toEqual(buildImportFiles(card).map(f => f.id));
    expect(buildImportFiles(card)[0].id).toBe('trello-file-AbC123-0');
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
});
