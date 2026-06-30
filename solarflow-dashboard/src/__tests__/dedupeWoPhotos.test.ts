import { describe, it, expect } from 'vitest';
import { dedupeWoPhotos } from '../lib/woHelpers';

// Regression guard for the WO-2605-97694 incident: one IDB-offloaded photo (no
// storageUrl, empty dataUrl) was cloned 528x under a single id and every save/merge
// carried the clones forward. dedupeWoPhotos must collapse same-id clones AND the
// same image stored under two storage keys, while keeping genuinely distinct photos.
describe('dedupeWoPhotos', () => {
  it('collapses byte-identical same-id clones to one', () => {
    const clone = { id: 'ph-x', name: 'a.jpeg', dataUrl: '', photoStoreId: 's1' };
    const out = dedupeWoPhotos(Array.from({ length: 528 }, () => ({ ...clone })));
    expect(out).toHaveLength(1);
  });

  it('collapses the same image stored under two keys (stem match)', () => {
    const out = dedupeWoPhotos([
      { id: 'p1', storageUrl: 'https://x/abc/ph-123.jpg' },
      { id: 'p2', storageUrl: 'https://x/abc/before/ph-123.jpeg' }, // same stem ph-123
    ]);
    expect(out).toHaveLength(1);
  });

  it('keeps genuinely distinct photos', () => {
    const out = dedupeWoPhotos([
      { id: 'p1', storageUrl: 'https://x/ph-1.jpg' },
      { id: 'p2', storageUrl: 'https://x/ph-2.jpg' },
      { id: 'p3', storageUrl: 'https://x/ph-3.jpg' },
    ]);
    expect(out).toHaveLength(3);
  });
});
