/**
 * Tests for src/lib/dataStore.ts
 *
 * Covers: loadData, saveData, clearData, applySafeMigration (via loadData),
 * tombstone filtering, photo-stripping in saveData.
 *
 * dataStore depends on:
 *   - mergedCustomers (large static list) — allowed to run as-is
 *   - solarEdgeSiteFilter — allowed to run as-is
 *   - db (dbSet) — mocked to avoid Supabase calls
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock db so saveData's cloud backup does not trigger real Supabase calls
vi.mock('../lib/db', () => ({
  dbSet: vi.fn().mockResolvedValue(undefined),
}));

// Mock syncEngine to avoid Supabase import at module level
vi.mock('../lib/syncEngine', () => ({
  pushToSupabase:  vi.fn().mockResolvedValue(undefined),
  pushKeyValue:    vi.fn().mockResolvedValue(undefined),
  pullFromSupabase: vi.fn().mockResolvedValue(null),
  mergeRemote:     vi.fn((local: any) => local),
  isKVSyncKey:     vi.fn(() => false),
}));

import { loadData, saveData, clearData } from '../lib/dataStore';
import type { AppState, Customer, Job } from '../types';

const STORAGE_KEY  = 'solarflow_data';
const VERSION_KEY  = 'solarflow_data_version';
const DELETED_IDS  = 'solarflow_deleted_customer_ids';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function minCustomer(id = 'c1'): Customer {
  return {
    id,
    name: 'Test Customer',
    email: 'test@example.com',
    phone: '555-0001',
    address: '1 Main St',
    city: 'Orlando',
    state: 'FL',
    zip: '32801',
    type: 'residential',
    createdAt: new Date().toISOString(),
    notes: '',
  };
}

function minJob(id = 'j1', customerId = 'c1'): Job {
  return {
    id,
    customerId,
    title: 'Test Job',
    status: 'scheduled',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: 'manual',
  } as Job;
}

function minState(overrides: Partial<AppState> = {}): AppState {
  return {
    users: [],
    customers: [minCustomer()],
    jobs: [minJob()],
    xeroConfig: { connected: false },
    solarEdgeConfig: { apiKey: '' },
    currentUser: null,
    notifications: [],
    ...overrides,
  };
}

function storeState(state: AppState, version?: string): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (version !== undefined) {
    localStorage.setItem(VERSION_KEY, version);
  }
}

// ---------------------------------------------------------------------------
// loadData
// ---------------------------------------------------------------------------

describe('loadData — first load (no localStorage)', () => {
  it('returns a valid AppState with seed customers', () => {
    const state = loadData();
    expect(state).toBeDefined();
    expect(Array.isArray(state.customers)).toBe(true);
    expect(Array.isArray(state.jobs)).toBe(true);
    expect(Array.isArray(state.users)).toBe(true);
    expect(Array.isArray(state.notifications)).toBe(true);
  });

  it('seeds at least one default user', () => {
    const state = loadData();
    expect(state.users.length).toBeGreaterThan(0);
  });

  it('sets the version key in localStorage', () => {
    loadData();
    expect(localStorage.getItem(VERSION_KEY)).toBeTruthy();
  });

  it('solarEdgeConfig has an apiKey field (even if empty)', () => {
    const state = loadData();
    expect(typeof state.solarEdgeConfig?.apiKey).toBe('string');
  });
});

describe('loadData — restoring stored state', () => {
  it('restores customers from localStorage', () => {
    const c = minCustomer('c-stored');
    const stored = minState({ customers: [c] });
    storeState(stored, '2026-04-15-fault-tolerant-v1');

    const state = loadData();
    expect(state.customers.some(c => c.id === 'c-stored')).toBe(true);
  });

  it('restores jobs from localStorage', () => {
    const j = minJob('j-stored', 'c1');
    const stored = minState({ customers: [minCustomer()], jobs: [j] });
    storeState(stored, '2026-04-15-fault-tolerant-v1');

    const state = loadData();
    expect(state.jobs.some(j => j.id === 'j-stored')).toBe(true);
  });

  it('preserves solarEdgeConfig.apiKey', () => {
    const stored = minState({ solarEdgeConfig: { apiKey: 'MY_API_KEY' } });
    storeState(stored, '2026-04-15-fault-tolerant-v1');

    const state = loadData();
    expect(state.solarEdgeConfig?.apiKey).toBe('MY_API_KEY');
  });

  it('falls back to empty array for notifications if missing', () => {
    const stored = { ...minState(), notifications: undefined } as any;
    storeState(stored, '2026-04-15-fault-tolerant-v1');

    const state = loadData();
    expect(Array.isArray(state.notifications)).toBe(true);
  });

  it('falls back to empty array for solarEdgeExtraSites if missing', () => {
    const stored = { ...minState(), solarEdgeExtraSites: undefined } as any;
    storeState(stored, '2026-04-15-fault-tolerant-v1');

    const state = loadData();
    expect(Array.isArray(state.solarEdgeExtraSites)).toBe(true);
  });
});

describe('loadData — corrupted localStorage', () => {
  it('returns seed state when stored JSON is malformed', () => {
    localStorage.setItem(STORAGE_KEY, 'NOT VALID JSON {{{{');

    const state = loadData();
    expect(state).toBeDefined();
    expect(Array.isArray(state.customers)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// loadData — tombstone filtering
// ---------------------------------------------------------------------------

describe('loadData — tombstone filtering', () => {
  it('excludes deleted customers from loaded state', () => {
    const c1 = minCustomer('c-kept');
    const c2 = minCustomer('c-deleted');
    const stored = minState({ customers: [c1, c2] });
    storeState(stored, '2026-04-15-fault-tolerant-v1');

    localStorage.setItem(DELETED_IDS, JSON.stringify(['c-deleted']));

    const state = loadData();
    expect(state.customers.map(c => c.id)).not.toContain('c-deleted');
    expect(state.customers.map(c => c.id)).toContain('c-kept');
  });
});

// ---------------------------------------------------------------------------
// loadData — safe migration (version bump)
// ---------------------------------------------------------------------------

describe('loadData — safe migration', () => {
  it('does NOT wipe user-created customers on version bump', () => {
    const userCustomer = minCustomer('c-user-created');
    // Store with an OLD version so migration is triggered
    const stored = minState({ customers: [userCustomer] });
    storeState(stored, 'OLD_VERSION_2023');

    const state = loadData();
    // User customer must survive the migration
    expect(state.customers.some(c => c.id === 'c-user-created')).toBe(true);
  });

  it('updates the version key after migration', () => {
    const stored = minState();
    storeState(stored, 'OLD_VERSION');

    loadData();
    const newVersion = localStorage.getItem(VERSION_KEY);
    expect(newVersion).not.toBe('OLD_VERSION');
  });
});

// ---------------------------------------------------------------------------
// saveData
// ---------------------------------------------------------------------------

describe('saveData', () => {
  it('persists state to localStorage', () => {
    const state = minState({ customers: [minCustomer('c-save-test')] });
    saveData(state);

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.customers.some((c: Customer) => c.id === 'c-save-test')).toBe(true);
  });

  it('strips base64 dataUrl from woPhotos', () => {
    const job = minJob('j-photo', 'c1');
    (job as any).woPhotos = [
      { storageUrl: 'https://supabase.co/storage/photo1.jpg', dataUrl: 'data:image/jpeg;base64,ABCDEF' },
    ];
    const state = minState({ jobs: [job] });
    saveData(state);

    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = JSON.parse(raw!);
    const savedJob = parsed.jobs.find((j: Job) => j.id === 'j-photo');
    // dataUrl should be stripped (empty string), storageUrl should remain
    expect(savedJob.woPhotos[0].storageUrl).toBe('https://supabase.co/storage/photo1.jpg');
    expect(savedJob.woPhotos[0].dataUrl).toBe('');
  });

  it('ST-3 FIXED: keeps in-flight photos (no storageUrl/photoStoreId) so a reload does not lose them', () => {
    const job = minJob('j-pending', 'c1');
    (job as any).woPhotos = [
      { storageUrl: null, dataUrl: 'data:image/jpeg;base64,PENDING' },
    ];
    const state = minState({ jobs: [job] });
    saveData(state);

    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = JSON.parse(raw!);
    const savedJob = parsed.jobs.find((j: Job) => j.id === 'j-pending');
    // In-flight photos are retained with their base64 intact until they upload.
    expect(savedJob.woPhotos).toHaveLength(1);
    expect(savedJob.woPhotos[0].dataUrl).toBe('data:image/jpeg;base64,PENDING');
  });

  it('saves jobs with no woPhotos without error', () => {
    const state = minState({ jobs: [minJob()] });
    expect(() => saveData(state)).not.toThrow();
  });

  it('does not throw on empty state', () => {
    const state = minState({ customers: [], jobs: [] });
    expect(() => saveData(state)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// clearData
// ---------------------------------------------------------------------------

describe('clearData', () => {
  it('removes the storage and version keys', () => {
    const state = minState();
    saveData(state);
    loadData(); // sets version key

    clearData();

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(VERSION_KEY)).toBeNull();
  });

  it('does not throw when storage is already empty', () => {
    expect(() => clearData()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Round-trip: saveData -> loadData
// ---------------------------------------------------------------------------

describe('round-trip saveData -> loadData', () => {
  it('preserves customer fields through a save/load cycle', () => {
    const c: Customer = {
      ...minCustomer('c-roundtrip'),
      name: 'Round Trip Customer',
      email: 'rt@example.com',
      notes: 'test notes',
    };
    const state = minState({ customers: [c] });

    saveData(state);
    // Set the version to current so no migration is triggered
    localStorage.setItem(VERSION_KEY, '2026-04-15-fault-tolerant-v1');
    const loaded = loadData();

    const found = loaded.customers.find(x => x.id === 'c-roundtrip');
    expect(found?.name).toBe('Round Trip Customer');
    expect(found?.email).toBe('rt@example.com');
    expect(found?.notes).toBe('test notes');
  });

  it('preserves job fields through a save/load cycle', () => {
    const j = minJob('j-roundtrip', 'c1');
    (j as any).status = 'completed';
    const state = minState({ jobs: [j] });

    saveData(state);
    localStorage.setItem(VERSION_KEY, '2026-04-15-fault-tolerant-v1');
    const loaded = loadData();

    const found = loaded.jobs.find(x => x.id === 'j-roundtrip');
    expect(found?.status).toBe('completed');
  });
});
