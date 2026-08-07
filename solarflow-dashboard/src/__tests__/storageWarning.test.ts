/**
 * Tests for the "device is out of storage" path.
 *
 * These pin the two claims the blocking modal makes to the user:
 *   1. "Your edits were sent to the cloud" — the durable write must happen even
 *      when the local write throws. If this regresses the modal starts lying.
 *   2. The event carries `reason`/`source`. The banner used to read only `kind`
 *      and drop them, which made a field report untraceable to a cause.
 *
 * What this CANNOT cover: whether Cesar's actual device hits the localStorage cap
 * or an exhausted IndexedDB origin quota. Those are device-state questions, so the
 * fix there is the diagnostic payload, not a test. See storage-audit.md.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { saveContractorJobs } from '../lib/contractorStore';
import { measureLocalStorage, topLocalStorageKeys } from '../components/StorageWarningBanner';
import type { ContractorJob } from '../types/contractor';

vi.mock('../lib/db', () => ({
  dbSet: vi.fn(),
  dbGet: vi.fn(),
}));
vi.mock('../lib/changeLog', () => ({ logChange: vi.fn() }));

import { dbSet } from '../lib/db';

const realSetItem = localStorage.setItem.bind(localStorage);

function makeJob(overrides: Partial<ContractorJob> = {}): ContractorJob {
  return {
    id: 'cj-1',
    contractorId: 'contractor-2',
    status: 'assigned',
    photos: {},
    ...overrides,
  } as ContractorJob;
}

function quotaThrow(): never {
  const err = new Error('QuotaExceededError');
  err.name = 'QuotaExceededError';
  throw err;
}

describe('saveContractorJobs under quota pressure', () => {
  beforeEach(() => {
    localStorage.setItem = realSetItem;
    localStorage.clear();
    vi.clearAllMocks();
  });
  afterEach(() => { localStorage.setItem = realSetItem; });

  it('still writes to the cloud when localStorage throws (the modal claims this)', () => {
    localStorage.setItem = vi.fn(quotaThrow);
    const jobs = [makeJob()];

    expect(() => saveContractorJobs(jobs)).not.toThrow();
    // The durable write is what makes "they are not lost" true.
    expect(dbSet).toHaveBeenCalledTimes(1);
    expect(dbSet).toHaveBeenCalledWith('solarflow_contractor_jobs', jobs);
  });

  it('emits a traceable reason and source, not a bare kind', () => {
    localStorage.setItem = vi.fn(quotaThrow);
    const seen: Array<Record<string, unknown>> = [];
    const handler = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener('solarops:storage-warning', handler);

    saveContractorJobs([makeJob()]);

    window.removeEventListener('solarops:storage-warning', handler);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      kind:   'failed',
      reason: 'quota-exceeded',
      source: 'contractor_jobs',
    });
  });

  it('never persists base64 photo data to localStorage, only uploaded URLs', () => {
    const jobs = [makeJob({
      photos: {
        before: ['data:image/jpeg;base64,AAAA', 'https://cdn.example.com/a.jpg'],
      } as ContractorJob['photos'],
    })];

    saveContractorJobs(jobs);

    const raw = localStorage.getItem('solarflow_contractor_jobs')!;
    expect(raw).not.toContain('data:image');
    expect(raw).toContain('https://cdn.example.com/a.jpg');
    // The cloud copy keeps the full payload, base64 included.
    expect(dbSet).toHaveBeenCalledWith('solarflow_contractor_jobs', jobs);
  });
});

describe('measureLocalStorage', () => {
  beforeEach(() => { localStorage.setItem = realSetItem; localStorage.clear(); });

  it('counts key and value bytes so the modal can name the real usage', () => {
    expect(measureLocalStorage()).toBe(0);
    localStorage.setItem('ab', 'cdef');
    expect(measureLocalStorage()).toBe(6);
  });

  it('ranks the biggest keys so the culprit is named, not just the total', () => {
    localStorage.setItem('small', 'x'.repeat(100));
    localStorage.setItem('huge', 'x'.repeat(300 * 1024));
    localStorage.setItem('medium', 'x'.repeat(50 * 1024));

    const top = topLocalStorageKeys(2);
    expect(top.map(t => t.key)).toEqual(['huge', 'medium']);
    expect(top[0].kb).toBeGreaterThan(top[1].kb);
  });

  it('exposes key names only, never stored values', () => {
    localStorage.setItem('secret', 'super-sensitive-payload');
    expect(JSON.stringify(topLocalStorageKeys())).not.toContain('super-sensitive-payload');
  });

  it('reports -1 rather than throwing when storage is unreadable', () => {
    localStorage.setItem('x', 'y');
    const realKey = localStorage.key.bind(localStorage);
    localStorage.key = () => { throw new Error('blocked'); };
    expect(measureLocalStorage()).toBe(-1);
    localStorage.key = realKey;
  });
});
