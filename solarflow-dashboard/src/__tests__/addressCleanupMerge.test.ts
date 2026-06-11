// Tests for the shared address-cleanup checklist merge (syncEngine).
// Two users checking different items concurrently must not stomp each other.
import { describe, it, expect } from 'vitest';
import { mergeAddressCleanupItems } from '../lib/syncEngine';

const item = (id: string, done: boolean, updatedAt: string) => ({ id, done, updatedAt });

describe('mergeAddressCleanupItems', () => {
  it('keeps items present on only one side', () => {
    const merged = mergeAddressCleanupItems([item('a', false, '')], [item('b', true, '2026-06-10')]);
    expect(merged.map(i => i.id).sort()).toEqual(['a', 'b']);
  });

  it('newer updatedAt wins per item', () => {
    const merged = mergeAddressCleanupItems(
      [item('a', true, '2026-06-10T10:00:00Z')],
      [item('a', false, '2026-06-10T09:00:00Z')],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.done).toBe(true);
  });

  it('two users checking different items both survive', () => {
    const local  = [item('a', true, '2026-06-10T10:00:00Z'), item('b', false, '')];
    const remote = [item('a', false, ''), item('b', true, '2026-06-10T10:05:00Z')];
    const merged = mergeAddressCleanupItems(local, remote);
    const byId = Object.fromEntries(merged.map(i => [i.id, i]));
    expect(byId['a']?.done).toBe(true);
    expect(byId['b']?.done).toBe(true);
  });

  it('tolerates non-array input', () => {
    expect(mergeAddressCleanupItems(null, undefined)).toEqual([]);
    expect(mergeAddressCleanupItems(null, [item('a', false, '')])).toHaveLength(1);
  });
});
