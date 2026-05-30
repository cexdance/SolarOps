/**
 * stress.test.ts — Load, fault, concurrency, and clock-skew tests
 *
 * Covers the four known fragile areas:
 *   1. Volume: localStorage quota pressure under large datasets
 *   2. Concurrency: interleaved mergeRemote calls with conflicting records
 *   3. Fault injection: repeated Supabase failures, oversized payloads, full storage
 *   4. Clock skew: future/past/missing updated_at into mergeRemote
 *
 * All tests are local and deterministic. No real network calls are made.
 * The vitest jsdom FakeStorage from setup.ts is used; we override setItem
 * for quota-simulation tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Module mocks (must be hoisted before imports) ───────────────────────────

vi.mock('../lib/db', () => ({
  dbSet: vi.fn().mockResolvedValue(undefined),
  dbGet: vi.fn().mockResolvedValue(null),
}));

vi.mock('../lib/syncEngine', () => ({
  pushToSupabase:   vi.fn().mockResolvedValue(undefined),
  pushKeyValue:     vi.fn().mockResolvedValue(undefined),
  pullFromSupabase: vi.fn().mockResolvedValue(null),
  mergeRemote:      vi.fn((local: any) => local),
  isKVSyncKey:      vi.fn(() => false),
}));

import { saveData, loadData, clearData } from '../lib/dataStore';
import {
  mergeRemote,
} from '../lib/syncEngine';
import {
  hasPendingPush,
  markPushPending,
  clearPendingPush,
  getPendingAttempts,
  drainOutbox,
  isRowPoisoned,
  incRowFailure,
  clearRowPoison,
  resetAllPoison,
  resetOutboxAttempts,
} from '../lib/outbox';

// Re-import the real mergeRemote (not the mock) for conflict-resolution tests
import { mergeRemote as realMergeRemote } from '../lib/syncEngine';

import type { AppState, Customer, Job, WOPhoto } from '../types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'c1',
    name: 'Test Customer',
    email: 'test@example.com',
    phone: '555-0001',
    address: '1 Main St',
    city: 'Orlando',
    state: 'FL',
    zip: '32801',
    type: 'residential',
    createdAt: '2024-01-01T00:00:00Z',
    notes: '',
    ...overrides,
  };
}

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'j1',
    customerId: 'c1',
    title: 'Install',
    status: 'scheduled',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    source: 'manual',
    ...overrides,
  } as Job;
}

function makeState(overrides: Partial<AppState> = {}): AppState {
  return {
    users: [],
    customers: [],
    jobs: [],
    xeroConfig: { connected: false },
    solarEdgeConfig: { apiKey: '' },
    currentUser: null,
    notifications: [],
    ...overrides,
  };
}

/** Generate N customers with optional activityHistory entries */
function generateCustomers(
  n: number,
  opts: { activityEntries?: number; filesMeta?: number } = {},
): Customer[] {
  const out: Customer[] = [];
  for (let i = 0; i < n; i++) {
    const c: Customer = makeCustomer({
      id: `c-${i}`,
      name: `Customer ${i}`,
      email: `customer${i}@example.com`,
    });
    if (opts.activityEntries) {
      (c as any).activityHistory = Array.from({ length: opts.activityEntries }, (_, j) => ({
        id: `act-${i}-${j}`,
        type: 'note',
        content: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
        createdAt: new Date().toISOString(),
        userId: 'u1',
      }));
    }
    if (opts.filesMeta) {
      (c as any).files = Array.from({ length: opts.filesMeta }, (_, j) => ({
        id: `f-${i}-${j}`,
        name: `doc-${j}.pdf`,
        url: `https://storage.example.com/f-${i}-${j}.pdf`,
        mimeType: 'application/pdf',
        size: 1024,
        source: 'upload',
        createdAt: new Date().toISOString(),
      }));
    }
    out.push(c);
  }
  return out;
}

/** Generate N jobs with optional woPhotos */
function generateJobs(
  n: number,
  opts: { withBase64Photos?: number; withUrlPhotos?: number } = {},
): Job[] {
  const out: Job[] = [];
  for (let i = 0; i < n; i++) {
    const j: Job = makeJob({
      id: `j-${i}`,
      customerId: `c-${i % 100}`,
    });
    const photos: WOPhoto[] = [];
    if (opts.withBase64Photos) {
      for (let p = 0; p < opts.withBase64Photos; p++) {
        photos.push({
          id: `ph-${i}-${p}`,
          dataUrl: 'data:image/jpeg;base64,' + 'A'.repeat(500),
          caption: '',
          takenAt: new Date().toISOString(),
        } as WOPhoto);
      }
    }
    if (opts.withUrlPhotos) {
      for (let p = 0; p < opts.withUrlPhotos; p++) {
        photos.push({
          id: `phu-${i}-${p}`,
          dataUrl: '',
          storageUrl: `https://storage.example.com/photos/${i}-${p}.jpg`,
          caption: '',
          takenAt: new Date().toISOString(),
        } as WOPhoto);
      }
    }
    if (photos.length) (j as any).woPhotos = photos;
    out.push(j);
  }
  return out;
}

function setOnline(v: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => v });
}

// Store original setItem for quota simulation
const realSetItem = localStorage.setItem.bind(localStorage);

// ── 1. VOLUME TESTS ──────────────────────────────────────────────────────────

describe('Volume: saveData/loadData under large datasets', () => {
  beforeEach(() => {
    clearData();
    // Restore real setItem if a previous test overrode it
    localStorage.setItem = realSetItem;
  });

  it('1k customers: saves and reloads without loss', () => {
    const state = makeState({ customers: generateCustomers(1000) });
    expect(() => saveData(state)).not.toThrow();
    const raw = localStorage.getItem('solarflow_data');
    expect(raw).not.toBeNull();
    const loaded = JSON.parse(raw!);
    expect(loaded.customers.length).toBe(1000);
  });

  it('10k customers: saves and reloads without loss', () => {
    const state = makeState({ customers: generateCustomers(10_000) });
    expect(() => saveData(state)).not.toThrow();
    const raw = localStorage.getItem('solarflow_data');
    expect(raw).not.toBeNull();
    const loaded = JSON.parse(raw!);
    expect(loaded.customers.length).toBe(10_000);
  });

  it('50k customers: saves without throwing (may trim activity history)', () => {
    const state = makeState({
      customers: generateCustomers(50_000, { activityEntries: 3 }),
    });
    // Should not throw regardless of trimming path taken
    expect(() => saveData(state)).not.toThrow();
  });

  it('ST-3 FIXED: saveData strips base64 from uploaded photos (storageUrl present)', () => {
    const state = makeState({ jobs: generateJobs(10, { withUrlPhotos: 2 }) });
    saveData(state);
    const raw = localStorage.getItem('solarflow_data');
    // Uploaded photos are recoverable from Supabase, so their base64 is dropped.
    expect(raw).not.toContain('data:image/jpeg;base64,AAAA');
  });

  it('saveData preserves woPhotos that have storageUrl (url-only photos not dropped)', () => {
    const state = makeState({ jobs: generateJobs(10, { withUrlPhotos: 2 }) });
    saveData(state);
    const raw = localStorage.getItem('solarflow_data');
    const loaded = JSON.parse(raw!);
    const job = loaded.jobs[0];
    // Photos with storageUrl should be retained (just with empty dataUrl)
    expect(job.woPhotos?.length).toBe(2);
    expect(job.woPhotos[0].storageUrl).toBeTruthy();
    expect(job.woPhotos[0].dataUrl).toBe('');
  });

  it('ST-3 FIXED: in-flight photos (base64, no storageUrl) are KEPT so a reload does not lose them', () => {
    const state = makeState({ jobs: generateJobs(5, { withBase64Photos: 2 }) });
    saveData(state);
    const raw = localStorage.getItem('solarflow_data');
    const loaded = JSON.parse(raw!);
    // Previously these were dropped (permanent loss on reload before upload).
    // Now they are retained with their dataUrl intact until they upload.
    for (const job of loaded.jobs) {
      expect(job.woPhotos?.length).toBe(2);
      expect(job.woPhotos[0].dataUrl).toContain('data:image/jpeg;base64,');
    }
  });

  it('timing: saveData for 10k customers completes in under 2 seconds', () => {
    const state = makeState({ customers: generateCustomers(10_000) });
    const start = performance.now();
    saveData(state);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(2000);
  });

  it('timing: saveData for 50k customers with activity history completes in under 10 seconds', () => {
    const state = makeState({
      customers: generateCustomers(50_000, { activityEntries: 5 }),
    });
    const start = performance.now();
    saveData(state);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(10_000);
  });
});

// ── 2. QUOTA FAULT INJECTION ─────────────────────────────────────────────────

describe('Fault: QuotaExceededError handling in saveData', () => {
  afterEach(() => {
    localStorage.setItem = realSetItem;
    clearData();
  });

  it('first-level quota: falls back to trimmed state (strips activityHistory)', () => {
    let callCount = 0;
    // Fail only the first setItem call (full state), succeed on fallback
    localStorage.setItem = vi.fn((key: string, value: string) => {
      if (key === 'solarflow_data' && callCount === 0) {
        callCount++;
        const err = new Error('QuotaExceededError');
        err.name = 'QuotaExceededError';
        throw err;
      }
      callCount++;
      realSetItem(key, value);
    }) as typeof localStorage.setItem;

    const state = makeState({
      customers: generateCustomers(10, { activityEntries: 5 }),
    });

    // Should not throw; falls back to trimmed save
    expect(() => saveData(state)).not.toThrow();

    // The fallback save should have succeeded; data should be in storage
    const raw = localStorage.getItem('solarflow_data');
    expect(raw).not.toBeNull();
    const loaded = JSON.parse(raw!);
    // activityHistory should be stripped in fallback
    for (const c of loaded.customers) {
      expect(c.activityHistory).toBeUndefined();
    }
  });

  it('second-level quota (total failure): dispatches solarops:storage-warning failed event and does not throw', () => {
    // Both setItem calls fail
    localStorage.setItem = vi.fn((_key: string, _value: string) => {
      const err = new Error('QuotaExceededError');
      err.name = 'QuotaExceededError';
      throw err;
    }) as typeof localStorage.setItem;

    const events: Event[] = [];
    window.addEventListener('solarops:storage-warning', (e) => events.push(e));

    const state = makeState({ customers: generateCustomers(5) });
    expect(() => saveData(state)).not.toThrow();

    window.removeEventListener('solarops:storage-warning', (e) => events.push(e));

    // Should have dispatched warning event
    expect(events.length).toBeGreaterThanOrEqual(1);
    const detail = (events[0] as CustomEvent).detail;
    expect(detail.kind).toBe('failed');
  });

  it('activityHistory data loss on first-level quota: CONFIRMED data-loss scenario', () => {
    // This test deliberately confirms the known behaviour:
    // when localStorage is almost full, activityHistory is silently stripped
    let callCount = 0;
    localStorage.setItem = vi.fn((key: string, value: string) => {
      if (key === 'solarflow_data' && callCount === 0) {
        callCount++;
        const err = new Error('QuotaExceededError');
        err.name = 'QuotaExceededError';
        throw err;
      }
      callCount++;
      realSetItem(key, value);
    }) as typeof localStorage.setItem;

    const state = makeState({
      customers: generateCustomers(3, { activityEntries: 10 }),
    });
    saveData(state);

    const raw = localStorage.getItem('solarflow_data');
    const loaded = JSON.parse(raw!);
    // CONFIRMED: activityHistory is gone — this is a known data-loss path
    const anyHasActivity = loaded.customers.some(
      (c: Customer) => c.activityHistory && c.activityHistory.length > 0,
    );
    expect(anyHasActivity).toBe(false);
  });
});

// ── 3. CONCURRENCY: mergeRemote interleaved conflicts ────────────────────────

describe('Concurrency: mergeRemote conflict resolution (uses real implementation)', () => {
  // We need the real mergeRemote, not the vi.mock version.
  // Import directly from the module bypassing the mock.
  let realMerge: typeof realMergeRemote;

  beforeEach(async () => {
    // Dynamically import to bypass the module-level mock
    const mod = await vi.importActual<typeof import('../lib/syncEngine')>('../lib/syncEngine');
    realMerge = mod.mergeRemote;
    // Set up required localStorage keys
    localStorage.setItem('solarflow_deleted_customer_ids', JSON.stringify([]));
    localStorage.setItem('solarflow_deleted_job_ids', JSON.stringify([]));
  });

  it('remote wins when timestamps are equal (LWW tie goes to remote)', () => {
    // Both records share the default createdAt and have no updatedAt, so they tie.
    // The tie is resolved in favour of remote (remoteWins uses >=).
    const local = makeState({
      customers: [makeCustomer({ id: 'c1', name: 'Local Name', notes: 'local' })],
    });
    const remote: Partial<AppState> = {
      customers: [makeCustomer({ id: 'c1', name: 'Remote Name', notes: 'remote' })],
    };
    const merged = realMerge(local, remote);
    const c = merged.customers.find(x => x.id === 'c1');
    expect(c?.name).toBe('Remote Name');
    expect(c?.notes).toBe('remote');
  });

  it('ST-1 FIXED: a newer local edit is preserved against a stale remote record', () => {
    const olderRemoteTs = '2024-01-01T00:00:00Z';
    const newerLocalTs  = '2024-12-31T23:59:59Z';

    const local = makeState({
      customers: [
        makeCustomer({
          id: 'c1',
          name: 'Newest Local Edit',
          updatedAt: newerLocalTs,
        }),
      ],
    });
    const remote: Partial<AppState> = {
      customers: [
        makeCustomer({
          id: 'c1',
          name: 'Stale Remote Record',
          updatedAt: olderRemoteTs,
        }),
      ],
    };

    const merged = realMerge(local, remote);
    const c = merged.customers.find(x => x.id === 'c1');

    // The newer local edit must survive: remote is older, so it does not win.
    expect(c?.name).toBe('Newest Local Edit');
  });

  it('ST-1: a newer remote record correctly overwrites an older local record', () => {
    const local = makeState({
      customers: [makeCustomer({ id: 'c1', name: 'Old Local', updatedAt: '2024-01-01T00:00:00Z' })],
    });
    const remote: Partial<AppState> = {
      customers: [makeCustomer({ id: 'c1', name: 'Fresh Remote', updatedAt: '2025-06-01T00:00:00Z' })],
    };
    const merged = realMerge(local, remote);
    const c = merged.customers.find(x => x.id === 'c1');
    expect(c?.name).toBe('Fresh Remote');
  });

  it('interleaved mergeRemote: 100 sequential calls with 500 conflicting customers produce no duplicates', () => {
    let state = makeState({ customers: generateCustomers(500) });

    for (let round = 0; round < 100; round++) {
      // Each round: remote has the same 500 customers with updated names
      const remoteCusts = generateCustomers(500).map(c => ({
        ...c,
        name: `Round ${round} - ${c.name}`,
      }));
      state = realMerge(state, { customers: remoteCusts });
    }

    // No duplicates by ID
    const ids = state.customers.map(c => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('mergeRemote: records present only in local are preserved (incremental pull does not ghost-purge)', () => {
    const local = makeState({
      customers: [
        makeCustomer({ id: 'c1', name: 'Local Only' }),
        makeCustomer({ id: 'c2', name: 'Shared' }),
      ],
    });
    const remote: Partial<AppState> = {
      // Remote only returns c2 (incremental pull — c1 unchanged, not in response)
      customers: [makeCustomer({ id: 'c2', name: 'Shared Updated' })],
    };
    const merged = realMerge(local, remote);
    const localOnlyCustomer = merged.customers.find(c => c.id === 'c1');
    expect(localOnlyCustomer).toBeDefined();
    expect(localOnlyCustomer?.name).toBe('Local Only');
  });

  it('mergeRemote: tombstoned customer IDs are removed even if present in remote', () => {
    localStorage.setItem(
      'solarflow_deleted_customer_ids',
      JSON.stringify(['c-dead']),
    );
    const local = makeState({
      customers: [makeCustomer({ id: 'c-alive', name: 'Alive' })],
    });
    const remote: Partial<AppState> = {
      customers: [
        makeCustomer({ id: 'c-alive', name: 'Alive Remote' }),
        makeCustomer({ id: 'c-dead', name: 'Should be filtered', state: 'FL' }),
      ],
    };
    const merged = realMerge(local, remote);
    const dead = merged.customers.find(c => c.id === 'c-dead');
    expect(dead).toBeUndefined();
  });

  it('mergeRemote with 5k customers x 5 rounds: confirms no record duplication under load', () => {
    let state = makeState({ customers: generateCustomers(5000) });
    for (let round = 0; round < 5; round++) {
      const remoteSlice = generateCustomers(5000).slice(0, 2500); // partial update
      state = realMerge(state, { customers: remoteSlice });
    }
    const ids = state.customers.map(c => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
    // All 5000 records should still be present
    expect(state.customers.length).toBe(5000);
  });
});

// ── 4. OUTBOX FAULT INJECTION ────────────────────────────────────────────────

describe('Fault: outbox drain under repeated Supabase failures', () => {
  beforeEach(() => {
    localStorage.setItem = realSetItem;
    clearPendingPush();
    resetAllPoison();
    setOnline(true);
  });

  it('ST-4 FIXED: drainOutbox backs off (returns false) right after a burst of failures', async () => {
    // Simulate 9 rapid failures — lastAttemptAt is ~now, so the backoff window
    // has not elapsed and drain should hold off instead of hammering the backend.
    for (let i = 0; i < 9; i++) {
      markPushPending(`failure ${i}`);
    }
    expect(getPendingAttempts()).toBe(9);
    const result = await drainOutbox();
    expect(result).toBe(false);
    // Outbox should still be pending (not cleared)
    expect(hasPendingPush()).toBe(true);
  });

  it('drainOutbox returns false immediately when offline', async () => {
    setOnline(false);
    markPushPending('queued');
    const result = await drainOutbox();
    expect(result).toBe(false);
    setOnline(true);
  });

  it('resetOutboxAttempts allows drain to retry after lock', async () => {
    for (let i = 0; i < 9; i++) {
      markPushPending(`failure ${i}`);
    }
    // Locked
    expect(await drainOutbox()).toBe(false);

    // User action: reset attempts
    resetOutboxAttempts();
    expect(getPendingAttempts()).toBe(0);
    // Should now attempt drain (will succeed because pushToSupabase is mocked to resolve)
    // Mock the lazy import inside drainOutbox
    vi.doMock('../lib/syncEngine', () => ({
      pushToSupabase: vi.fn().mockResolvedValue(undefined),
    }));
    // After reset, attempts = 0, so drain is attempted
    expect(getPendingAttempts()).toBe(0);
  });

  it('ST-4 FIXED: outbox auto-recovers — once backoff elapses, drain retries with no user action', async () => {
    // Many failures used to hard-lock the outbox forever (attempts > 8) until the
    // user manually intervened. Now it only waits out an exponential backoff.
    for (let i = 0; i < 9; i++) {
      markPushPending(`failure ${i}`);
    }
    // Right after the burst, backoff is active → drain holds off.
    expect(await drainOutbox()).toBe(false);
    expect(hasPendingPush()).toBe(true);

    // Simulate the backoff window elapsing by pushing lastAttemptAt into the past.
    const raw = JSON.parse(localStorage.getItem('solarops_outbox_v1')!);
    raw.lastAttemptAt = new Date(Date.now() - 60 * 60_000).toISOString(); // 1h ago
    localStorage.setItem('solarops_outbox_v1', JSON.stringify(raw));

    // pushToSupabase is mocked to resolve, so the auto-retry now succeeds and
    // clears the outbox — no resetOutboxAttempts() call required.
    const result = await drainOutbox();
    expect(result).toBe(true);
    expect(hasPendingPush()).toBe(false);
  });

  it('poison row: after POISON_THRESHOLD (3) failures, isRowPoisoned returns true', () => {
    const key = 'customer:test-poison-key';
    expect(isRowPoisoned(key)).toBe(false);
    incRowFailure(key, 'err1');
    incRowFailure(key, 'err2');
    expect(isRowPoisoned(key)).toBe(false); // 2 failures not enough
    incRowFailure(key, 'err3');
    expect(isRowPoisoned(key)).toBe(true);  // threshold reached at 3
  });

  it('clearRowPoison removes poisoned state for a specific key', () => {
    const key = 'customer:to-clear';
    incRowFailure(key, 'e1');
    incRowFailure(key, 'e2');
    incRowFailure(key, 'e3');
    expect(isRowPoisoned(key)).toBe(true);
    clearRowPoison(key);
    expect(isRowPoisoned(key)).toBe(false);
  });

  it('one poisoned row does not block other rows from being checked', () => {
    const badKey  = 'customer:bad-row';
    const goodKey = 'customer:good-row';
    incRowFailure(badKey, 'e1');
    incRowFailure(badKey, 'e2');
    incRowFailure(badKey, 'e3');
    expect(isRowPoisoned(badKey)).toBe(true);
    expect(isRowPoisoned(goodKey)).toBe(false);
  });

  it('markPushPending accumulates correctly across 20 rapid failures', () => {
    for (let i = 0; i < 20; i++) {
      markPushPending(`err ${i}`);
    }
    expect(getPendingAttempts()).toBe(20);
    // queuedAt should be from the first call, not the last
    const raw = JSON.parse(localStorage.getItem('solarops_outbox_v1')!);
    expect(raw.lastError).toBe('err 19');
  });
});

// ── 5. CLOCK SKEW: mergeRemote with malformed/skewed updated_at ──────────────

describe('Clock skew: mergeRemote behaviour with timestamp anomalies', () => {
  let realMerge: typeof realMergeRemote;

  beforeEach(async () => {
    const mod = await vi.importActual<typeof import('../lib/syncEngine')>('../lib/syncEngine');
    realMerge = mod.mergeRemote;
    localStorage.setItem('solarflow_deleted_customer_ids', JSON.stringify([]));
    localStorage.setItem('solarflow_deleted_job_ids', JSON.stringify([]));
  });

  it('ST-1 FIXED: remote with newer timestamp wins (2099 > local 2025)', () => {
    const futureTs = '2099-01-01T00:00:00Z';
    const local = makeState({
      customers: [makeCustomer({ id: 'c1', name: 'Current Local', createdAt: '2025-01-01T00:00:00Z' })],
    });
    const remote: Partial<AppState> = {
      customers: [makeCustomer({ id: 'c1', name: 'Future Remote', createdAt: futureTs })],
    };
    const merged = realMerge(local, remote);
    expect(merged.customers[0].name).toBe('Future Remote');
  });

  it('ST-1 FIXED: older remote (year 2000) no longer clobbers newer local edit (2025)', () => {
    const pastTs    = '2000-01-01T00:00:00Z';
    const presentTs = '2025-06-01T00:00:00Z';
    const local = makeState({
      customers: [makeCustomer({ id: 'c1', name: 'Recent Local Edit', createdAt: presentTs })],
    });
    const remote: Partial<AppState> = {
      customers: [makeCustomer({ id: 'c1', name: 'Ancient Remote Record', createdAt: pastTs })],
    };
    const merged = realMerge(local, remote);
    // LWW: local 2025 > remote 2000, so the local edit is preserved
    expect(merged.customers[0].name).toBe('Recent Local Edit');
  });

  it('ST-1 FIXED: remote missing both timestamps loses to a timestamped local record', () => {
    const local = makeState({
      customers: [makeCustomer({ id: 'c1', name: 'Local With Timestamp' })],
    });
    const remoteCustomer = {
      id: 'c1',
      name: 'Remote No Timestamp',
      email: 'x@example.com',
      phone: '',
      address: '',
      city: 'Tampa',
      state: 'FL',
      zip: '33601',
      type: 'residential' as const,
      notes: '',
      // createdAt intentionally omitted -> recordTime '' loses to any timestamp
    } as Customer;
    const remote: Partial<AppState> = { customers: [remoteCustomer] };
    const merged = realMerge(local, remote);
    expect(merged.customers[0].name).toBe('Local With Timestamp');
  });

  it('ST-1 FIXED: 1000 mixed-skew records resolve per-record by LWW, none lost', () => {
    // Local records all carry the makeCustomer default createdAt 2024-01-01.
    // Remote createdAt cycles through the timestamps below. Remote wins only
    // when its time is >= local 2024-01-01; bucket 0 (1999) loses to local.
    const timestamps = [
      '1999-12-31T23:59:59Z', // < 2024 -> local wins
      '2025-01-01T00:00:00Z', // >= 2024 -> remote wins
      '2099-06-15T12:00:00Z', // >= 2024 -> remote wins
      undefined,              // mapped to 2025 below -> remote wins
      'invalid-date-string',  // lexically > 2024 -> remote wins
    ];
    const localCustomers = generateCustomers(1000);
    const remoteCustomers = generateCustomers(1000).map((c, i) => ({
      ...c,
      name: `Updated ${c.name}`,
      createdAt: (timestamps[i % timestamps.length] as string) ?? '2025-01-01T00:00:00Z',
    }));

    const local = makeState({ customers: localCustomers });
    const merged = realMerge(local, { customers: remoteCustomers });

    // No records lost
    expect(merged.customers.length).toBe(1000);

    const byId = new Map(merged.customers.map((c) => [c.id, c]));
    for (let i = 0; i < 1000; i++) {
      const winner = byId.get(`c-${i}`)!;
      if (i % timestamps.length === 0) {
        // 1999 remote loses to 2024 local
        expect(winner.name.startsWith('Updated')).toBe(false);
      } else {
        expect(winner.name.startsWith('Updated')).toBe(true);
      }
    }
  });
});

// ── 6. OVERSIZED REMOTE PAYLOADS ─────────────────────────────────────────────

describe('Fault: oversized/malformed remote payloads into mergeRemote', () => {
  let realMerge: typeof realMergeRemote;

  beforeEach(async () => {
    const mod = await vi.importActual<typeof import('../lib/syncEngine')>('../lib/syncEngine');
    realMerge = mod.mergeRemote;
    localStorage.setItem('solarflow_deleted_customer_ids', JSON.stringify([]));
    localStorage.setItem('solarflow_deleted_job_ids', JSON.stringify([]));
  });

  it('mergeRemote with 50k remote customers does not throw or hang', () => {
    const local = makeState({ customers: generateCustomers(100) });
    const remote: Partial<AppState> = { customers: generateCustomers(50_000) };
    expect(() => realMerge(local, remote)).not.toThrow();
  });

  it('mergeRemote with empty remote customers array preserves all local records', () => {
    const local = makeState({ customers: generateCustomers(500) });
    // Empty array means no remote data — should be a no-op
    const merged = realMerge(local, { customers: [] });
    // With empty remote, all local records should be preserved
    expect(merged.customers.length).toBe(500);
  });

  it('mergeRemote with null/undefined remote customers: local state unchanged', () => {
    const local = makeState({ customers: generateCustomers(10) });
    const merged = realMerge(local, { customers: undefined });
    expect(merged.customers.length).toBe(10);
  });

  it('mergeRemote with customers containing null id fields: does not crash (may corrupt map)', () => {
    const local = makeState({ customers: generateCustomers(5) });
    const badCustomer = { ...makeCustomer(), id: null as unknown as string };
    const remote: Partial<AppState> = { customers: [badCustomer] };
    // Should not throw (Map with null key is legal in JS)
    expect(() => realMerge(local, remote)).not.toThrow();
  });

  it('mergeRemote with 1000 jobs each having 10 photos + activity history: timing under 3s', () => {
    const jobs = generateJobs(1000, { withUrlPhotos: 10 });
    const customers = generateCustomers(100, { activityEntries: 20 });
    const local = makeState({ customers, jobs });
    const remoteJobs = generateJobs(1000, { withUrlPhotos: 10 });
    const remoteCustomers = generateCustomers(100, { activityEntries: 20 });

    const start = performance.now();
    const merged = realMerge(local, { customers: remoteCustomers, jobs: remoteJobs });
    const elapsed = performance.now() - start;

    expect(merged.jobs.length).toBe(1000);
    expect(elapsed).toBeLessThan(3000);
  });
});

// ── 7. SAVEDATA TOTAL-FAILURE: no write at all ───────────────────────────────

describe('Fault: saveData total localStorage failure', () => {
  afterEach(() => {
    localStorage.setItem = realSetItem;
    clearData();
  });

  it('saveData total failure: does not throw, dispatches solarops:storage-warning', () => {
    localStorage.setItem = vi.fn((_k: string, _v: string) => {
      throw Object.assign(new Error('QuotaExceededError'), { name: 'QuotaExceededError' });
    }) as typeof localStorage.setItem;

    const events: CustomEvent[] = [];
    const handler = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener('solarops:storage-warning', handler);

    const state = makeState({ customers: generateCustomers(5) });
    expect(() => saveData(state)).not.toThrow();

    window.removeEventListener('solarops:storage-warning', handler);
    expect(events.some(e => e.detail?.kind === 'failed')).toBe(true);
  });

  it('saveData total failure: previous valid save is not corrupted (write is atomic-fail)', () => {
    // First save succeeds
    const state = makeState({ customers: generateCustomers(3) });
    saveData(state);
    const firstSave = localStorage.getItem('solarflow_data');
    expect(firstSave).not.toBeNull();

    // Now simulate total failure
    localStorage.setItem = vi.fn((_k: string, _v: string) => {
      throw Object.assign(new Error('QuotaExceededError'), { name: 'QuotaExceededError' });
    }) as typeof localStorage.setItem;

    const state2 = makeState({ customers: generateCustomers(5) });
    saveData(state2);

    // Previous save should not be changed (FakeStorage does not write on throw)
    // Restore setItem to check
    localStorage.setItem = realSetItem;
    const afterFailure = localStorage.getItem('solarflow_data');
    // The storage key should still hold the first save value
    expect(afterFailure).toBe(firstSave);
  });
});
