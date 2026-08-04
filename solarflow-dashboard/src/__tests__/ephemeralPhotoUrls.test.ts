/**
 * Guard against persisting `blob:` photo URLs.
 *
 * INCIDENT 2026-08-04, SO-2607-38097. A `blob:` URL is a handle into ONE browser
 * tab's memory from URL.createObjectURL(). It is meaningless anywhere else and
 * dead once that tab closes.
 *
 * hydrateWoPhotos() sets `dataUrl` to a blob: URL so <img> can render a photo
 * held in IndexedDB, which is correct for DISPLAY. That hydrated object reached
 * a write path, and 19 photos across 3 work orders were stored with a dead
 * handle and no storageUrl. They rendered fine for the contractor who took them
 * and were broken images for everyone else, while the work order read as
 * completed.
 *
 * The property these tests defend: `dataUrl` may hold real base64 or nothing,
 * never a blob: URL. And critically, cleaning must NOT drop the photo entry,
 * because `photoStoreId` is the last pointer to the real image and the only
 * thing that made 16 of those 19 photos recoverable.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isEphemeralUrl, stripEphemeralPhotoUrls } from '../lib/syncEngine';

beforeEach(() => { vi.restoreAllMocks(); vi.spyOn(console, 'warn').mockImplementation(() => {}); });

describe('isEphemeralUrl', () => {
  it('flags blob: urls', () => {
    expect(isEphemeralUrl('blob:https://solarflow-dashboard-sooty.vercel.app/abc-123')).toBe(true);
  });

  it('leaves real base64 and storage urls alone', () => {
    expect(isEphemeralUrl('data:image/jpeg;base64,/9j/4AAQ')).toBe(false);
    expect(isEphemeralUrl('https://cjmhfagkkayelcsprbai.supabase.co/storage/v1/object/x.jpg')).toBe(false);
  });

  it('is not fooled by non-strings or a blob: substring elsewhere', () => {
    for (const v of [null, undefined, 42, {}, [], '']) expect(isEphemeralUrl(v)).toBe(false);
    expect(isEphemeralUrl('https://cdn.example.com/blob:not-really')).toBe(false);
  });
});

describe('stripEphemeralPhotoUrls removes the dead pointer, keeps the recovery path', () => {
  const poisoned = () => ({
    id: 'job-1784646838098',
    woNumber: 'SO-2607-38097',
    woPhotos: [
      { id: 'p1', category: 'before', dataUrl: 'blob:https://app/abc', photoStoreId: 'ph-1' },
      { id: 'p2', category: 'after',  dataUrl: 'data:image/jpeg;base64,/9j/4AAQ' },
      { id: 'p3', category: 'serial', storageUrl: 'https://storage/x.jpg' },
    ],
  });

  it('drops the blob: dataUrl', () => {
    const out = stripEphemeralPhotoUrls(poisoned());
    expect(out.woPhotos[0]).not.toHaveProperty('dataUrl');
  });

  it('KEEPS photoStoreId, which is the only remaining pointer to the real image', () => {
    // This is the line that made 16 of 19 photos recoverable in the incident.
    // Dropping the whole entry to tidy the row would have destroyed them.
    const out = stripEphemeralPhotoUrls(poisoned());
    expect(out.woPhotos[0].photoStoreId).toBe('ph-1');
    expect(out.woPhotos).toHaveLength(3);
  });

  it('leaves real base64 and storage urls untouched', () => {
    const out = stripEphemeralPhotoUrls(poisoned());
    expect(out.woPhotos[1].dataUrl).toBe('data:image/jpeg;base64,/9j/4AAQ');
    expect(out.woPhotos[2].storageUrl).toBe('https://storage/x.jpg');
  });

  it('returns the SAME object when there is nothing to clean', () => {
    // Identity matters: pushRows runs this on every row of every push, so a
    // clean payload must not allocate a copy.
    const clean = { id: 'j1', woPhotos: [{ id: 'p', storageUrl: 'https://s/x.jpg' }] };
    expect(stripEphemeralPhotoUrls(clean)).toBe(clean);
  });

  it('does not mutate the input, so on-screen images keep rendering', () => {
    // The in-memory object must keep its blob: url; only the persisted copy is
    // cleaned. Mutating here would blank out photos the user is looking at.
    const input = poisoned();
    stripEphemeralPhotoUrls(input);
    expect(input.woPhotos[0].dataUrl).toBe('blob:https://app/abc');
  });

  it('passes through records with no photos at all', () => {
    for (const v of [{ id: 'c1', name: 'Acme' }, { id: 'j', woPhotos: [] }, null, undefined, 'str']) {
      expect(() => stripEphemeralPhotoUrls(v as never)).not.toThrow();
    }
  });

  it('handles every photo being poisoned, as SO-2607-38097 was', () => {
    const all = {
      id: 'j',
      woPhotos: Array.from({ length: 12 }, (_, i) => ({
        id: `p${i}`, category: 'before', dataUrl: `blob:https://app/${i}`, photoStoreId: `ph-${i}`,
      })),
    };
    const out = stripEphemeralPhotoUrls(all);
    expect(out.woPhotos).toHaveLength(12);
    expect(out.woPhotos.every(p => !('dataUrl' in p))).toBe(true);
    expect(out.woPhotos.every(p => !!p.photoStoreId)).toBe(true);
  });
});
