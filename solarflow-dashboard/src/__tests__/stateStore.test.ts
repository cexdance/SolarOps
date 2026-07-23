import { describe, it, expect, vi } from 'vitest';
import { migrateStateToIdb, type StateStorage, type MigrationDeps } from '../lib/stateStore';
import type { AppState } from '../types';

// Minimal AppState stand-in; migrate logic is agnostic to the shape.
const state = (tag: string) => ({ customers: [{ id: tag }] } as unknown as AppState);

// In-memory StateStorage fake (jsdom has no IndexedDB; we add no fake-indexeddb dep).
function fakeStorage(seed?: AppState): StateStorage & { _v: AppState | null } {
  return {
    _v: seed ?? null,
    async get() { return this._v; },
    async set(_k, v) { this._v = v; },
  };
}

function deps(over: Partial<MigrationDeps> & { storage: StateStorage; ls: { v: string | null } }): MigrationDeps {
  const { ls, storage, ...rest } = over;
  return {
    storage,
    readLS:  () => ls.v,
    clearLS: () => { ls.v = null; },
    parse:   (raw) => JSON.parse(raw) as AppState,
    ...rest,
  };
}

describe('migrateStateToIdb', () => {
  it('migrates the localStorage blob to IDB and clears localStorage after verify', async () => {
    const storage = fakeStorage();
    const ls = { v: JSON.stringify(state('ls')) };
    const result = await migrateStateToIdb(deps({ storage, ls }));

    expect((result as any).customers[0].id).toBe('ls');
    expect(storage._v).not.toBeNull();               // written to IDB
    expect(ls.v).toBeNull();                          // localStorage freed
  });

  it('KEEPS localStorage when the IDB write fails (never delete the only copy)', async () => {
    const failing: StateStorage = {
      async get() { return null; },
      async set() { throw new Error('IDB blocked (private mode)'); },
    };
    const ls = { v: JSON.stringify(state('ls')) };
    const result = await migrateStateToIdb(deps({ storage: failing, ls }));

    expect((result as any).customers[0].id).toBe('ls'); // caller still gets data
    expect(ls.v).not.toBeNull();                         // localStorage preserved for retry
  });

  it('KEEPS localStorage when the verify read-back returns null', async () => {
    // set() no-ops so the subsequent get() still returns null → verify fails.
    const brokenVerify: StateStorage = {
      async get() { return null; },
      async set() { /* pretend success but nothing persisted */ },
    };
    const ls = { v: JSON.stringify(state('ls')) };
    await migrateStateToIdb(deps({ storage: brokenVerify, ls }));

    expect(ls.v).not.toBeNull(); // unverified write must not trigger a delete
  });

  it('returns the IDB copy and clears a stale localStorage leftover', async () => {
    const storage = fakeStorage(state('idb'));
    const ls = { v: JSON.stringify(state('stale')) };
    const result = await migrateStateToIdb(deps({ storage, ls }));

    expect((result as any).customers[0].id).toBe('idb'); // IDB is authoritative
    expect(ls.v).toBeNull();                              // stale LS copy dropped
  });

  it('returns null on a fresh device (nothing anywhere)', async () => {
    const storage = fakeStorage();
    const ls = { v: null };
    expect(await migrateStateToIdb(deps({ storage, ls }))).toBeNull();
  });

  it('returns null and does not throw on an unparseable blob', async () => {
    const storage = fakeStorage();
    const ls = { v: '{not json' };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await migrateStateToIdb(deps({ storage, ls }))).toBeNull();
    spy.mockRestore();
  });
});
