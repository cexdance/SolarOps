/**
 * Tests for per-field LWW job merge (Phase 2 of spec_job_field_level_merge).
 *
 * The bug being pinned: whole-record LWW let a client on a stale copy edit ONE
 * field and revert every other field on the record. See gotcha_whole_record_lww_clobber.
 */

import { describe, it, expect } from 'vitest';
import { mergeJobFields, mergeFieldTimes } from '../lib/syncEngine';
import type { Job, WOPhoto } from '../types';

const T0 = '2026-01-01T00:00:00.000Z';
const T1 = '2026-01-02T00:00:00.000Z';
const T2 = '2026-01-03T00:00:00.000Z';

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'j1',
    customerId: 'c1',
    title: 'Inverter swap',
    status: 'scheduled',
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  } as Job;
}

describe('mergeJobFields', () => {
  it('resolves each field independently (the contractor-revert bug)', () => {
    // A reassigned the contractor at T2. B, holding a stale copy, changed only
    // scheduledDate at T1 and re-pushed the whole record with the OLD contractor.
    const a = makeJob({
      contractorId: 'new-guy', scheduledDate: '2026-02-01', updatedAt: T2,
      fieldTimes: { contractorId: T2, scheduledDate: T0 },
    });
    const b = makeJob({
      contractorId: 'old-guy', scheduledDate: '2026-03-15', updatedAt: T1,
      fieldTimes: { contractorId: T0, scheduledDate: T1 },
    });

    const merged = mergeJobFields(a, b);
    expect(merged.contractorId).toBe('new-guy');      // was reverted under record LWW
    expect(merged.scheduledDate).toBe('2026-03-15');  // B's real edit still lands
  });

  it('is order-independent', () => {
    const a = makeJob({ contractorId: 'new-guy', updatedAt: T2, fieldTimes: { contractorId: T2 } });
    const b = makeJob({ contractorId: 'old-guy', updatedAt: T1, fieldTimes: { contractorId: T0 } });
    expect(mergeJobFields(a, b).contractorId).toBe(mergeJobFields(b, a).contractorId);
  });

  it('falls back to record-level LWW when a side has no fieldTimes (legacy rows)', () => {
    const legacy = makeJob({ title: 'Legacy title', updatedAt: T2 });          // no fieldTimes
    const stamped = makeJob({ title: 'Newer title', updatedAt: T1, fieldTimes: { title: T1 } });
    expect(mergeJobFields(legacy, stamped).title).toBe('Legacy title');        // T2 > T1

    const older = makeJob({ title: 'Legacy title', updatedAt: T0 });
    expect(mergeJobFields(older, stamped).title).toBe('Newer title');          // T1 > T0
  });

  it('unions append-only feeds so neither side can wipe comments', () => {
    const a = makeJob({
      updatedAt: T2, fieldTimes: { activityHistory: T2 },
      activityHistory: [{ id: 'act-a', timestamp: T1, type: 'note', description: 'from A' }],
      auditLog: [{ id: 'aud-a', timestamp: T1 }],
    } as Partial<Job>);
    const b = makeJob({
      updatedAt: T0, fieldTimes: { activityHistory: T0 },
      activityHistory: [{ id: 'act-b', timestamp: T0, type: 'note', description: 'from B' }],
      auditLog: [{ id: 'aud-b', timestamp: T0 }],
    } as Partial<Job>);

    const merged = mergeJobFields(a, b);
    expect(merged.activityHistory?.map(e => e.id).sort()).toEqual(['act-a', 'act-b']);
    expect(merged.auditLog?.map(e => e.id).sort()).toEqual(['aud-a', 'aud-b']);
  });

  it('unions photo tombstones so a stale side cannot resurrect a deleted photo', () => {
    const a = makeJob({ updatedAt: T2, deletedPhotoStems: ['stem-1'] });
    const b = makeJob({ updatedAt: T0, deletedPhotoStems: ['stem-2'] });
    expect(mergeJobFields(a, b).deletedPhotoStems?.sort()).toEqual(['stem-1', 'stem-2']);
  });

  it('lets the side that last touched woPhotos win deletions, keeping in-flight uploads', () => {
    const uploaded = (id: string): WOPhoto =>
      ({ id, category: 'after', name: `${id}.jpg`, dataUrl: '', storageUrl: `https://x/${id}`, createdAt: T0 });
    const inFlight: WOPhoto =
      ({ id: 'p-new', category: 'after', name: 'new.jpg', dataUrl: 'data:,x', createdAt: T1 } as WOPhoto);

    // A deleted p2 at T2. B still holds p2 (uploaded) plus a fresh local capture.
    const a = makeJob({ updatedAt: T2, fieldTimes: { woPhotos: T2 }, woPhotos: [uploaded('p1')] });
    const b = makeJob({ updatedAt: T0, fieldTimes: { woPhotos: T0 }, woPhotos: [uploaded('p1'), uploaded('p2'), inFlight] });

    const ids = mergeJobFields(a, b).woPhotos?.map(p => p.id).sort();
    expect(ids).toEqual(['p-new', 'p1']); // p2 stays deleted, in-flight survives
  });

  it('takes the record updatedAt of the newer side', () => {
    const merged = mergeJobFields(makeJob({ updatedAt: T1 }), makeJob({ updatedAt: T2 }));
    expect(merged.updatedAt).toBe(T2);
  });
});

describe('mergeFieldTimes', () => {
  it('merges per key by max', () => {
    expect(mergeFieldTimes({ a: T2, b: T0 }, { b: T1, c: T1 })).toEqual({ a: T2, b: T1, c: T1 });
  });

  it('returns undefined when neither side has stamps', () => {
    expect(mergeFieldTimes(undefined, undefined)).toBeUndefined();
  });
});
