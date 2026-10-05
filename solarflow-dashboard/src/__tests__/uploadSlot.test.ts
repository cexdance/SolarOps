import { describe, it, expect, vi } from 'vitest';
vi.mock('../lib/supabase', () => ({ supabase: {} }));
import { withUploadSlot } from '../lib/photoStorage';

describe('withUploadSlot', () => {
  it('never runs more than 3 uploads at once, and runs them all', async () => {
    let live = 0, peak = 0, done = 0;
    const job = () => withUploadSlot(async () => {
      live++; peak = Math.max(peak, live);
      await new Promise(r => setTimeout(r, 5));
      live--; done++;
    });
    await Promise.all(Array.from({ length: 12 }, job));
    expect(peak).toBe(3);
    expect(done).toBe(12);
  });

  it('releases the slot when an upload throws', async () => {
    await expect(withUploadSlot(async () => { throw new Error('Load failed'); })).rejects.toThrow();
    const r = await Promise.all(Array.from({ length: 4 }, (_, i) => withUploadSlot(async () => i)));
    expect(r).toEqual([0, 1, 2, 3]);
  });
});
