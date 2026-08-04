// Regression: creating a customer from a Trello card dropped the card's comments
// and never built its attachments. handleCreateCustomer (App.tsx) whitelisted
// fields and silently discarded activityHistory/files; the create modal never
// called buildImportFiles at all. Both import paths must yield the same
// comments + files for the same card.
import { describe, it, expect } from 'vitest';
import { buildImportActivities, buildImportFiles, TrelloCardData } from '../lib/trelloImporter';

const card: TrelloCardData = {
  name: 'US-10432 Jane Doe',
  desc: 'Inverter fault, needs site visit',
  due: null,
  shortUrl: 'https://trello.com/c/AbC123',
  labels: [],
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
});
