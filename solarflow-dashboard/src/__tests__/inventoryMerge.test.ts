import { describe, it, expect } from 'vitest';
import { mergeInventoryItems, KV_SYNC_KEYS, isKVSyncKey } from '../lib/syncEngine';

const item = (id: string, over: Record<string, unknown> = {}) => ({
  id, sku: id, name: id, quantity: 1, createdAt: '2026-07-01T00:00:00.000Z', ...over,
});

describe('inventory sync wiring', () => {
  it('solarops_inventory is a synced KV key', () => {
    expect(isKVSyncKey('solarops_inventory')).toBe(true);
    expect(KV_SYNC_KEYS).toContain('solarops_inventory');
  });
});

describe('mergeInventoryItems', () => {
  // THE regression this whole change exists to prevent: Cruz added items on his
  // phone while inventory was local-only. The push gate forces pull-before-push,
  // so if the pull overwrites instead of merging, the only copy is destroyed.
  it('keeps local-only items when remote has never seen them', () => {
    const local  = [item('inv-cat-1'), item('cruz-phone-item')];
    const remote = [item('inv-cat-1')];
    const merged = mergeInventoryItems(local, remote);
    expect(merged.map(i => i.id).sort()).toEqual(['cruz-phone-item', 'inv-cat-1']);
  });

  it('keeps remote-only items so other devices are adopted too', () => {
    const merged = mergeInventoryItems([item('a')], [item('b')]);
    expect(merged.map(i => i.id).sort()).toEqual(['a', 'b']);
  });

  it('newer updatedAt wins on a genuine conflict', () => {
    const local  = [item('x', { quantity: 5, updatedAt: '2026-07-20T10:00:00.000Z' })];
    const remote = [item('x', { quantity: 9, updatedAt: '2026-07-20T12:00:00.000Z' })];
    expect(mergeInventoryItems(local, remote)[0].quantity).toBe(9);
  });

  it('local wins when it is newer than remote', () => {
    const local  = [item('x', { quantity: 5, updatedAt: '2026-07-20T14:00:00.000Z' })];
    const remote = [item('x', { quantity: 9, updatedAt: '2026-07-20T12:00:00.000Z' })];
    expect(mergeInventoryItems(local, remote)[0].quantity).toBe(5);
  });

  it('falls back to createdAt for legacy items with no updatedAt', () => {
    const local  = [item('x', { quantity: 5, createdAt: '2026-07-20T14:00:00.000Z' })];
    const remote = [item('x', { quantity: 9, createdAt: '2026-07-20T12:00:00.000Z' })];
    expect(mergeInventoryItems(local, remote)[0].quantity).toBe(5);
  });

  it('an empty remote never empties local (first sync after the fix)', () => {
    const local = [item('a'), item('b')];
    expect(mergeInventoryItems(local, [])).toHaveLength(2);
    expect(mergeInventoryItems(local, null)).toHaveLength(2);
    expect(mergeInventoryItems(local, undefined)).toHaveLength(2);
  });

  it('survives malformed input without dropping valid items', () => {
    const merged = mergeInventoryItems([item('a'), { noId: true }], 'garbage');
    expect(merged.map(i => i.id)).toEqual(['a']);
  });
});
