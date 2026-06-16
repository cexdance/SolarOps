import { describe, it, expect } from 'vitest';
import { photoUrlStem, dedupePhotoUrls } from '../lib/woHelpers';

describe('photoUrlStem', () => {
  it('strips folder, extension and query to a stable stem', () => {
    expect(photoUrlStem('https://x/wo-photos/job1/ph-123-abc.jpg')).toBe('ph-123-abc');
    expect(photoUrlStem('https://x/job1/old_serial/ph-123-abc.jpeg')).toBe('ph-123-abc');
    expect(photoUrlStem('https://x/job1/ph-123-abc.jpg?token=zzz')).toBe('ph-123-abc');
  });

  it('treats base64 data URLs as their own identity', () => {
    const d = 'data:image/jpeg;base64,AAAA';
    expect(photoUrlStem(d)).toBe(d);
  });
});

describe('dedupePhotoUrls', () => {
  it('collapses the same image uploaded under two storage keys (.jpg vs .jpeg)', () => {
    const urls = [
      'https://x/wo-photos/job1/ph-123-abc.jpg',
      'https://x/job1/old_serial/ph-123-abc.jpeg', // same image, different key
      'https://x/wo-photos/job1/ph-999-zzz.jpeg',   // different image
    ];
    const out = dedupePhotoUrls(urls);
    expect(out).toEqual([
      'https://x/wo-photos/job1/ph-123-abc.jpg',
      'https://x/wo-photos/job1/ph-999-zzz.jpeg',
    ]);
  });

  it('preserves first-seen order and skips empties', () => {
    expect(dedupePhotoUrls(['', 'https://x/a/p-1.jpg', 'https://x/b/p-1.png'])).toEqual([
      'https://x/a/p-1.jpg',
    ]);
  });
});
