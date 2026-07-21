import { describe, it, expect } from 'vitest';
import { KV_MERGERS, KV_SYNC_KEYS, mergeKVValue, mergeToolItems } from '../lib/syncEngine';

const rec = (id: string, over: Record<string, unknown> = {}) => ({
  id, createdAt: '2026-07-01T00:00:00.000Z', ...over,
});

// The standing rule used to live in a comment: "a multi-writer KV key needs a
// union merge in BOTH the pull and Realtime handlers BEFORE it joins the key
// list". Comments do not fail a build. These do.
describe('KV merge registry', () => {
  it('every registered merger is a real sync key', () => {
    for (const key of Object.keys(KV_MERGERS)) {
      expect(KV_SYNC_KEYS, `${key} has a merger but is not synced`).toContain(key);
    }
  });

  it('the multi-writer keys all have a merger', () => {
    // Single-writer blobs are deliberately absent: for them a whole-blob
    // overwrite is correct. Adding a key here without a merger means a pull can
    // silently delete another device's records.
    for (const key of ['solarflow_contractor_jobs', 'solarops_inventory', 'solarops_tools', 'solarops_address_cleanup']) {
      expect(KV_MERGERS[key], `${key} is multi-writer but has no merger`).toBeTypeOf('function');
    }
  });

  it('mergeKVValue unions a registered key instead of overwriting', () => {
    const merged = mergeKVValue('solarops_tools', [rec('mine')], [rec('theirs')]) as { id: string }[];
    expect(merged.map(r => r.id).sort()).toEqual(['mine', 'theirs']);
  });

  it('mergeKVValue passes an unregistered key straight through', () => {
    const remote = [rec('remote-wins')];
    expect(mergeKVValue('solarflow_service_rates', [rec('local')], remote)).toBe(remote);
  });
});

describe('mergeToolItems', () => {
  it('keeps a tool only one device has, so a pull cannot delete it', () => {
    const merged = mergeToolItems([rec('drill'), rec('van-only')], [rec('drill')]);
    expect(merged.map(t => t.id).sort()).toEqual(['drill', 'van-only']);
  });

  it('newest updatedAt wins, so a check-out beats a stale copy', () => {
    const merged = mergeToolItems(
      [rec('drill', { status: 'available', updatedAt: '2026-07-01T00:00:00.000Z' })],
      [rec('drill', { status: 'in_use',    updatedAt: '2026-07-02T00:00:00.000Z' })],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].status).toBe('in_use');
  });

  it('a tombstoned tool is not resurrected by a device that still holds it', () => {
    const merged = mergeToolItems(
      [rec('drill', { deletedAt: '2026-07-03T00:00:00.000Z', updatedAt: '2026-07-03T00:00:00.000Z' })],
      [rec('drill', { updatedAt: '2026-07-01T00:00:00.000Z' })],
    );
    expect(merged[0].deletedAt).toBeTruthy();
  });
});
