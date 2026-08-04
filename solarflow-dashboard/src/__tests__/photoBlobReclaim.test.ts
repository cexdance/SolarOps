import { describe, it, expect } from 'vitest';
import { isReclaimable, type PhotoRow } from '../lib/photoStore';

// Guards the predicate behind purgeUploadedBlobs(): dropping a blob is only safe
// when Supabase Storage holds the same bytes. Every false negative wastes space;
// every false POSITIVE destroys the only copy of a work order photo.

const CUTOFF = Date.parse('2026-07-05T00:00:00.000Z');

const row = (over: Partial<PhotoRow> = {}): PhotoRow => ({
  id: 'ph-1',
  jobId: 'job-1',
  category: 'before',
  blob: new Blob(['xxxx']),
  contentType: 'image/jpeg',
  createdAt: '2026-06-01T00:00:00.000Z', // older than CUTOFF
  uploadStatus: 'uploaded',
  supabaseUrl: 'https://storage.example/wo-photos/job-1/ph-1.jpeg',
  ...over,
});

describe('isReclaimable', () => {
  it('reclaims an old row that is mirrored to Storage', () => {
    expect(isReclaimable(row(), CUTOFF)).toBe(true);
  });

  it('keeps a row with no supabaseUrl, the device holds the only copy', () => {
    expect(isReclaimable(row({ supabaseUrl: undefined }), CUTOFF)).toBe(false);
  });

  it('keeps a pending or failed upload even if it somehow has a url', () => {
    expect(isReclaimable(row({ uploadStatus: 'pending' }), CUTOFF)).toBe(false);
    expect(isReclaimable(row({ uploadStatus: 'failed' }), CUTOFF)).toBe(false);
  });

  it('keeps a recent row so current jobs still render offline', () => {
    expect(isReclaimable(row({ createdAt: '2026-08-01T00:00:00.000Z' }), CUTOFF)).toBe(false);
  });

  it('keeps a row whose createdAt is unparseable, rather than guessing', () => {
    expect(isReclaimable(row({ createdAt: 'not-a-date' }), CUTOFF)).toBe(false);
    expect(isReclaimable(row({ createdAt: '' }), CUTOFF)).toBe(false);
  });

  it('is idempotent, an already-reclaimed row does not match again', () => {
    expect(isReclaimable(row({ blob: undefined }), CUTOFF)).toBe(false);
  });
});
