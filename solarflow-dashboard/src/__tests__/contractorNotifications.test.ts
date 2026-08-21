import { describe, it, expect } from 'vitest';
import { mergeContractorNotifications, KV_MERGERS, KV_SYNC_KEYS } from '../lib/syncEngine';

const n = (id: string, over: Record<string, unknown> = {}) =>
  ({ id, contractorId: 'c1', createdAt: `2026-08-1${id.length}T00:00:00.000Z`, read: false, ...over });

describe('contractor notifications sync', () => {
  it('is registered as a synced, merged key', () => {
    // Office writes them, contractor reads them: multi-writer by definition.
    // Without the merger a pull would overwrite one side's notices wholesale.
    expect(KV_SYNC_KEYS).toContain('solarflow_contractor_notifications');
    expect(KV_MERGERS['solarflow_contractor_notifications']).toBeTypeOf('function');
  });

  it('keeps notices that exist on only one side', () => {
    const merged = mergeContractorNotifications([n('office')], [n('phone')]);
    expect(merged.map(x => x.id).sort()).toEqual(['office', 'phone']);
  });

  it('marking read on one device is never undone by the other', () => {
    const merged = mergeContractorNotifications(
      [n('a', { read: true })],
      [n('a', { read: false })],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].read).toBe(true);
  });

  it('tolerates a missing or non-array side instead of throwing', () => {
    expect(mergeContractorNotifications(undefined, [n('a')])).toHaveLength(1);
    expect(mergeContractorNotifications([n('a')], null)).toHaveLength(1);
    expect(mergeContractorNotifications(null, undefined)).toEqual([]);
  });

  it('caps the blob so it cannot grow without bound', () => {
    const many = Array.from({ length: 400 }, (_, i) => n(`id-${i}`));
    expect(mergeContractorNotifications(many, [])).toHaveLength(300);
  });
});
