import { describe, it, expect } from 'vitest';
import { mergeCustomerLWW } from '../lib/syncEngine';
import type { Customer } from '../types';

const base = (over: Partial<Customer>) => ({
  id: 'c1', name: 'old', activityHistory: [], files: [], ...over,
} as unknown as Customer);

describe('mergeCustomerLWW (Realtime path)', () => {
  it('keeps the newer local record when the remote event is stale', () => {
    const local = base({ name: 'local-new', updatedAt: '2026-08-23T12:00:00Z' });
    const remote = base({ name: 'remote-old', updatedAt: '2026-08-23T10:00:00Z' });
    expect(mergeCustomerLWW(remote, local).name).toBe('local-new');
  });

  it('takes the remote record when it is newer', () => {
    const local = base({ name: 'local-old', updatedAt: '2026-08-23T10:00:00Z' });
    const remote = base({ name: 'remote-new', updatedAt: '2026-08-23T12:00:00Z' });
    expect(mergeCustomerLWW(remote, local).name).toBe('remote-new');
  });

  it('unions activity history and files regardless of which side wins', () => {
    const local = base({
      name: 'local-new', updatedAt: '2026-08-23T12:00:00Z',
      activityHistory: [{ id: 'a1', timestamp: '2026-08-23T09:00:00Z' }] as never,
      files: [{ id: 'f1', timestamp: '2026-08-23T09:00:00Z' }] as never,
    });
    const remote = base({
      name: 'remote-old', updatedAt: '2026-08-23T10:00:00Z',
      activityHistory: [{ id: 'a2', timestamp: '2026-08-23T10:00:00Z' }] as never,
      files: [{ id: 'f2', timestamp: '2026-08-23T10:00:00Z' }] as never,
    });
    const merged = mergeCustomerLWW(remote, local);
    expect(merged.activityHistory.map(a => a.id).sort()).toEqual(['a1', 'a2']);
    expect(merged.files.map(f => f.id).sort()).toEqual(['f1', 'f2']);
  });

  it('lets a synced remote record beat an unsynced local one with no updatedAt', () => {
    const local = base({ name: 'local-seed', createdAt: '2099-01-01T00:00:00Z' });
    const remote = base({ name: 'remote-real', updatedAt: '2026-08-23T10:00:00Z' });
    expect(mergeCustomerLWW(remote, local).name).toBe('remote-real');
  });
});
