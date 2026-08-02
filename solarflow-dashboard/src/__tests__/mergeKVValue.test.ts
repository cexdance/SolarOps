import { describe, it, expect } from 'vitest';
import { KV_MERGERS, mergeKVValue } from '../lib/syncEngine';

/**
 * A pull row or a Realtime broadcast carries only the SENDING device's array.
 * A record this device holds but the sender does not means "that device has not
 * seen it", never "deleted". If the merge drops it, the sync silently destroys
 * local-only records. kvMergers.test.ts checks that each multi-writer key HAS a
 * merger; these cases check that the merger actually preserves the record.
 *
 * Contract: callers parse the localStorage string and pass mergeKVValue an
 * already-parsed value. The JSON.parse and its try/catch live at the three call
 * sites in syncEngine.ts, not in the merger. Passing a raw string here would
 * fail Array.isArray inside every merger and silently drop the whole local side.
 */
describe('mergeKVValue keeps local-only records a remote payload omits', () => {
  const multiWriter = [
    ['solarflow_contractor_jobs', 'cj1'],
    ['solarops_address_cleanup', 'a1'],
    ['solarops_inventory', 'i1'],
  ] as const;

  for (const [key, remoteId] of multiWriter) {
    it(`${key} keeps a record only this device has`, () => {
      const local = [{ id: remoteId }, { id: 'local-only' }];
      const merged = mergeKVValue(key, local, [{ id: remoteId }]) as { id: string }[];
      expect(merged.map(i => i.id).sort()).toEqual([remoteId, 'local-only'].sort());
    });
  }

  it('a single-writer key is overwritten by remote, deliberately', () => {
    // solarflow_crm_data has no merger on purpose: it is a single-writer blob,
    // so a whole-blob overwrite is the correct behaviour. If someone gives it a
    // merger, this test should be replaced by a local-only case above.
    expect(KV_MERGERS['solarflow_crm_data']).toBeUndefined();
    expect(mergeKVValue('solarflow_crm_data', { leads: [{ id: 'gone' }] }, { leads: [{ id: 'l1' }] }))
      .toEqual({ leads: [{ id: 'l1' }] });
  });

  it('an unregistered key passes remote straight through', () => {
    expect(mergeKVValue('solarflow_contractors', [{ id: 'gone' }], [{ id: 'c1' }])).toEqual([{ id: 'c1' }]);
  });

  it('a null local side yields remote, matching a first sync on a fresh device', () => {
    expect(mergeKVValue('solarops_inventory', null, [{ id: 'i1' }])).toEqual([{ id: 'i1' }]);
  });
});
