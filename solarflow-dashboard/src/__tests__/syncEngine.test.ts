/**
 * Tests for src/lib/syncEngine.ts
 *
 * We test only the pure, exported functions that have no direct Supabase I/O:
 *   - mergeRemote (conflict resolution, tombstone filtering, photo preservation)
 *   - PREFIX constants
 *   - isKVSyncKey
 *
 * pushToSupabase, pullFromSupabase, syncOnLogin, pullAndMerge, and
 * subscribeToChanges all require a live Supabase client and are covered by
 * integration tests outside this file.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mergeRemote, PREFIX, isKVSyncKey, KV_SYNC_KEYS } from '../lib/syncEngine';
import type { AppState, Customer, Job } from '../types';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'c1',
    name: 'Alice Smith',
    email: 'alice@example.com',
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

// ---------------------------------------------------------------------------
// PREFIX constants
// ---------------------------------------------------------------------------

describe('PREFIX constants', () => {
  it('customer prefix is "customer:"', () => {
    expect(PREFIX.customer).toBe('customer:');
  });
  it('job prefix is "job:"', () => {
    expect(PREFIX.job).toBe('job:');
  });
});

// ---------------------------------------------------------------------------
// isKVSyncKey
// ---------------------------------------------------------------------------

describe('isKVSyncKey', () => {
  it('returns true for known KV sync keys', () => {
    for (const key of KV_SYNC_KEYS) {
      expect(isKVSyncKey(key)).toBe(true);
    }
  });

  it('returns false for unknown keys', () => {
    expect(isKVSyncKey('solarflow_data')).toBe(false);
    expect(isKVSyncKey('random_key')).toBe(false);
    expect(isKVSyncKey('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// mergeRemote: basic behavior
// ---------------------------------------------------------------------------

describe('mergeRemote, basic', () => {
  it('returns local state unchanged when remote is empty', () => {
    const local = makeState({ customers: [makeCustomer()], jobs: [makeJob()] });
    const result = mergeRemote(local, {});
    expect(result.customers).toEqual(local.customers);
    expect(result.jobs).toEqual(local.jobs);
  });

  it('adds a new customer from remote', () => {
    const local  = makeState({ customers: [makeCustomer({ id: 'c1' })] });
    const remote = { customers: [makeCustomer({ id: 'c2', name: 'Bob Jones' })] };
    const result = mergeRemote(local, remote);

    const ids = result.customers.map(c => c.id);
    expect(ids).toContain('c1');
    expect(ids).toContain('c2');
  });

  it('remote wins on conflict (same id, different name)', () => {
    const local  = makeState({ customers: [makeCustomer({ id: 'c1', name: 'Old Name' })] });
    const remote = { customers: [makeCustomer({ id: 'c1', name: 'New Name' })] };
    const result = mergeRemote(local, remote);

    const customer = result.customers.find(c => c.id === 'c1');
    expect(customer?.name).toBe('New Name');
  });

  it('preserves local-only records when remote omits them (incremental pull)', () => {
    const localOnly = makeCustomer({ id: 'c-local', name: 'Local Only' });
    const local  = makeState({ customers: [localOnly, makeCustomer({ id: 'c1' })] });
    // Remote only returns c1 (incremental, c-local not changed since last sync)
    const remote = { customers: [makeCustomer({ id: 'c1', name: 'Updated' })] };
    const result = mergeRemote(local, remote);

    const ids = result.customers.map(c => c.id);
    expect(ids).toContain('c-local');
  });
});

// ---------------------------------------------------------------------------
// mergeRemote: tombstone (deleted IDs) filtering
// ---------------------------------------------------------------------------

describe('mergeRemote, tombstone filtering', () => {
  it('filters out customers in the deleted-ids tombstone', () => {
    // Write a tombstone for c-deleted
    localStorage.setItem(
      'solarflow_deleted_customer_ids',
      JSON.stringify(['c-deleted']),
    );

    const local  = makeState({ customers: [makeCustomer({ id: 'c-deleted' })] });
    const remote = { customers: [makeCustomer({ id: 'c-deleted', name: 'Ghost' })] };
    const result = mergeRemote(local, remote);

    expect(result.customers.map(c => c.id)).not.toContain('c-deleted');
  });

  it('does not filter customers NOT in tombstone', () => {
    localStorage.setItem('solarflow_deleted_customer_ids', JSON.stringify(['c-other']));

    const local  = makeState({ customers: [makeCustomer({ id: 'c-keep' })] });
    const remote = { customers: [makeCustomer({ id: 'c-keep', name: 'Kept' })] };
    const result = mergeRemote(local, remote);

    expect(result.customers.map(c => c.id)).toContain('c-keep');
  });

  it('filters jobs whose customerId is in deleted-customer tombstone', () => {
    localStorage.setItem('solarflow_deleted_customer_ids', JSON.stringify(['c-deleted']));

    const local  = makeState({ jobs: [makeJob({ id: 'j1', customerId: 'c-deleted' })] });
    const remote = { jobs:      [makeJob({ id: 'j1', customerId: 'c-deleted' })] };
    const result = mergeRemote(local, remote);

    expect(result.jobs.map(j => j.id)).not.toContain('j1');
  });

  it('filters jobs in the deleted-job-ids tombstone', () => {
    localStorage.setItem('solarflow_deleted_job_ids', JSON.stringify(['j-gone']));

    const local  = makeState({ jobs: [makeJob({ id: 'j-gone', customerId: 'c1' })] });
    const remote = { jobs:      [makeJob({ id: 'j-gone', customerId: 'c1' })] };
    const result = mergeRemote(local, remote);

    expect(result.jobs.map(j => j.id)).not.toContain('j-gone');
  });
});

// ---------------------------------------------------------------------------
// mergeRemote: photo preservation (race condition guard)
// ---------------------------------------------------------------------------

describe('mergeRemote, photo preservation', () => {
  it('keeps local photos when local has more than remote (stale pull race)', () => {
    const localPhotos  = ['photo1.jpg', 'photo2.jpg', 'photo3.jpg'];
    const remotePhotos = ['photo1.jpg'];

    const local  = makeState({ jobs: [makeJob({ id: 'j1', woPhotos: localPhotos  as any })] });
    const remote = { jobs:          [makeJob({ id: 'j1', woPhotos: remotePhotos as any })] };

    const result = mergeRemote(local, remote);
    const job = result.jobs.find(j => j.id === 'j1');
    expect(job?.woPhotos).toEqual(localPhotos);
  });

  it('uses remote photos when remote has more (another device uploaded)', () => {
    const localPhotos  = ['photo1.jpg'];
    const remotePhotos = ['photo1.jpg', 'photo2.jpg', 'photo3.jpg'];

    const local  = makeState({ jobs: [makeJob({ id: 'j1', woPhotos: localPhotos  as any })] });
    const remote = { jobs:          [makeJob({ id: 'j1', woPhotos: remotePhotos as any })] };

    const result = mergeRemote(local, remote);
    const job = result.jobs.find(j => j.id === 'j1');
    expect(job?.woPhotos).toEqual(remotePhotos);
  });

  it('treats undefined woPhotos as empty array for comparison', () => {
    const local  = makeState({ jobs: [makeJob({ id: 'j1' })] });
    const remote = { jobs:          [makeJob({ id: 'j1', woPhotos: ['p.jpg'] as any })] };

    const result = mergeRemote(local, remote);
    const job = result.jobs.find(j => j.id === 'j1');
    // Remote has 1 photo, local has 0 (undefined), remote should win
    expect(job?.woPhotos).toEqual(['p.jpg']);
  });
});

// ---------------------------------------------------------------------------
// mergeRemote: solarEdgeConfig propagation
// ---------------------------------------------------------------------------

describe('mergeRemote, solarEdgeConfig', () => {
  it('propagates remote API key when local has none', () => {
    const local  = makeState({ solarEdgeConfig: { apiKey: '' } });
    const remote = { solarEdgeConfig: { apiKey: 'REMOTE_KEY' } };
    const result = mergeRemote(local, remote);
    expect(result.solarEdgeConfig?.apiKey).toBe('REMOTE_KEY');
  });

  it('keeps local API key when local already has one', () => {
    const local  = makeState({ solarEdgeConfig: { apiKey: 'LOCAL_KEY' } });
    const remote = { solarEdgeConfig: { apiKey: 'REMOTE_KEY' } };
    const result = mergeRemote(local, remote);
    expect(result.solarEdgeConfig?.apiKey).toBe('LOCAL_KEY');
  });

  it('keeps local API key when remote has no key', () => {
    const local  = makeState({ solarEdgeConfig: { apiKey: 'LOCAL_KEY' } });
    const remote = { solarEdgeConfig: { apiKey: '' } };
    const result = mergeRemote(local, remote);
    expect(result.solarEdgeConfig?.apiKey).toBe('LOCAL_KEY');
  });
});

// ---------------------------------------------------------------------------
// mergeRemote: edge cases
// ---------------------------------------------------------------------------

describe('mergeRemote, edge cases', () => {
  it('handles empty local and remote state without throwing', () => {
    const local  = makeState();
    expect(() => mergeRemote(local, {})).not.toThrow();
  });

  it('handles remote with null/undefined customers gracefully', () => {
    const local  = makeState({ customers: [makeCustomer()] });
    // Partial<AppState> allows missing customers
    expect(() => mergeRemote(local, { customers: undefined })).not.toThrow();
    const result = mergeRemote(local, {});
    expect(result.customers.length).toBeGreaterThan(0);
  });

  it('handles remote with empty customers array, preserves local', () => {
    const local  = makeState({ customers: [makeCustomer()] });
    // Empty array means "no changes returned by incremental pull", local preserved
    const result = mergeRemote(local, { customers: [] });
    expect(result.customers.length).toBe(1);
  });

  it('handles remote with empty jobs array, preserves local', () => {
    const local  = makeState({ jobs: [makeJob()] });
    const result = mergeRemote(local, { jobs: [] });
    expect(result.jobs.length).toBe(1);
  });

  it('deduplicates when remote returns same id twice (malformed payload)', () => {
    // Map-based merge means last writer wins for duplicate keys
    const dup = makeCustomer({ id: 'c1', name: 'Duplicate A' });
    const dup2 = makeCustomer({ id: 'c1', name: 'Duplicate B' });
    const local  = makeState({ customers: [] });
    const result = mergeRemote(local, { customers: [dup, dup2] });

    const c1s = result.customers.filter(c => c.id === 'c1');
    expect(c1s.length).toBe(1);
    // Last entry wins in Map iteration order
    expect(c1s[0].name).toBe('Duplicate B');
  });
});
