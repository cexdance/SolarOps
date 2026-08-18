import { describe, it, expect, vi, beforeEach } from 'vitest';

// The mirror is the rescue tier. These tests pin the one behaviour that matters:
// when localStorage is gone, a read must return real data, not the seed default.
const idb = new Map<string, unknown>();
let idbThrows = false;

vi.mock('../lib/db', () => ({ dbSet: vi.fn() }));

vi.mock('../lib/stateStore', async () => {
  const mem = new Map<string, unknown>();
  return {
    getKVMirror: <T,>(key: string): T | null =>
      mem.has(key) ? (mem.get(key) as T) : null,
    setKVMirror: (key: string, value: unknown) => {
      mem.set(key, value);
      if (!idbThrows) idb.set(`kv:${key}`, value);
    },
    hydrateKVMirror: async (keys: string[]) => {
      for (const key of keys) {
        if (localStorage.getItem(key)) continue;
        const stored = idb.get(`kv:${key}`);
        if (stored != null) mem.set(key, stored);
      }
    },
    __mem: mem,
  };
});

const store = await import('../lib/contractorStore');
const stateStore = await import('../lib/stateStore');
const { hydrateKVMirror } = stateStore;
const { dbSet } = await import('../lib/db');
const mem = (stateStore as unknown as { __mem: Map<string, unknown> }).__mem;

const JOBS_KEY = 'solarflow_contractor_jobs';
const job = { id: 'job-1', contractorId: 'contractor-2' } as never;

describe('contractor blob mirror', () => {
  beforeEach(() => {
    localStorage.clear();
    idb.clear();
    mem.clear();
    idbThrows = false;
    vi.mocked(dbSet).mockClear();
  });

  it('reads localStorage when it is intact', () => {
    localStorage.setItem(JOBS_KEY, JSON.stringify([job]));
    expect(store.loadContractorJobs()).toHaveLength(1);
  });

  it('falls back to the mirror after localStorage is evicted', async () => {
    store.saveContractorJobs([job]);
    // iOS ITP wipes localStorage but leaves IndexedDB, or the setItem was
    // rejected for quota in the first place. Same observable state.
    localStorage.clear();
    await hydrateKVMirror(store.MIRRORED_KEYS);
    expect(store.loadContractorJobs()).toHaveLength(1);
  });

  it('returned the empty seed before the mirror existed, which is the bug', async () => {
    // No save, nothing anywhere: the seed is the honest answer here.
    await hydrateKVMirror(store.MIRRORED_KEYS);
    expect(store.loadContractorJobs()).toEqual([]);
  });

  it('still reaches the cloud when the localStorage write throws', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    // Must not throw, and must not skip dbSet the way the old ordering did.
    expect(() => store.saveContractorJobs([job])).not.toThrow();
    expect(dbSet).toHaveBeenCalledWith(JOBS_KEY, [job]);
    setItem.mockRestore();
  });

  it('prefers localStorage over a staler mirror', async () => {
    store.saveContractorJobs([job]);
    await hydrateKVMirror(store.MIRRORED_KEYS);
    // The sync pull writes localStorage directly, so it can be ahead of the mirror.
    localStorage.setItem(JOBS_KEY, JSON.stringify([job, { ...job, id: 'job-2' }]));
    expect(store.loadContractorJobs()).toHaveLength(2);
  });
});
