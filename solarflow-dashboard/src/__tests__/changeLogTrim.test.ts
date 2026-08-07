/**
 * The change log is capped by ENTRY COUNT (2000), which says nothing about bytes.
 * Measured against the live change_log table: average entry ~2 KB, `job.update`
 * averaging 9.7 KB with one at 1.43 MB. 2000 of those is ~3.9 MB of a ~5 MB
 * localStorage origin cap, which is what actually filled the device.
 *
 * These pin the byte discipline. Without them the count cap looks sufficient.
 */

import { describe, it, expect } from 'vitest';
import { slimPayload, trimLog } from '../lib/changeLog';

const MAX_LOCAL_LOG_BYTES = 512 * 1024;

function entry(payload: unknown, i = 0) {
  return {
    id: `log-${i}`,
    opType: 'job.update',
    entityType: 'job',
    entityId: `j${i}`,
    payload,
    userEmail: 'a@b.c',
    deviceId: 'dev-1',
    device: {} as never,
    durationMs: null,
    createdAt: new Date(2024, 0, 1, 0, 0, i).toISOString(),
    syncedAt: null,
  };
}

describe('slimPayload', () => {
  it('leaves a small payload untouched, so ordinary entries stay readable', () => {
    const p = { status: 'completed', jobId: 'j1' };
    expect(slimPayload(p)).toBe(p);
  });

  it('truncates a fat payload, keeping the size and a preview for triage', () => {
    const fat = { notes: 'x'.repeat(20_000) };
    const slim = slimPayload(fat) as Record<string, unknown>;

    expect(slim._truncated).toBe(true);
    expect(slim.bytes).toBeGreaterThan(20_000);
    expect(String(slim.preview).length).toBeLessThanOrEqual(200);
    expect(JSON.stringify(slim).length).toBeLessThan(600);
  });

  it('collapses a 1.4 MB payload, the real worst case seen in production', () => {
    const huge = { blob: 'x'.repeat(1_430_000) };
    expect(JSON.stringify(slimPayload(huge)).length).toBeLessThan(600);
  });

  it('survives a circular payload instead of throwing into the caller', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(slimPayload(circular)).toEqual({ _truncated: true, bytes: -1 });
  });
});

describe('trimLog', () => {
  it('keeps a small log intact', () => {
    const entries = Array.from({ length: 10 }, (_, i) => entry({ i }, i));
    expect(trimLog(entries)).toHaveLength(10);
  });

  it('caps at 2000 entries and keeps the NEWEST', () => {
    const entries = Array.from({ length: 2500 }, (_, i) => entry({ i }, i));
    const kept = trimLog(entries);

    expect(kept).toHaveLength(2000);
    expect(kept[kept.length - 1].entityId).toBe('j2499');
  });

  it('drops oldest until the serialized log fits the byte cap', () => {
    // 2000 entries of ~2 KB is ~4 MB, exactly the shape that filled the device.
    const entries = Array.from({ length: 2000 }, (_, i) => entry({ pad: 'x'.repeat(2000) }, i));
    const kept = trimLog(entries);

    expect(JSON.stringify(kept).length).toBeLessThanOrEqual(MAX_LOCAL_LOG_BYTES);
    expect(kept.length).toBeLessThan(2000);
    // newest survive: trimming must not silently discard the most recent activity
    expect(kept[kept.length - 1].entityId).toBe('j1999');
  });

  it('reclaims a device already carrying a multi-MB log from an older build', () => {
    const legacy = Array.from({ length: 1500 }, (_, i) => entry({ pad: 'x'.repeat(9_700) }, i));
    expect(JSON.stringify(legacy).length).toBeGreaterThan(4 * 1024 * 1024);

    expect(JSON.stringify(trimLog(legacy)).length).toBeLessThanOrEqual(MAX_LOCAL_LOG_BYTES);
  });

  it('never empties the log entirely, even when one entry exceeds the cap', () => {
    const kept = trimLog([entry({ pad: 'x'.repeat(MAX_LOCAL_LOG_BYTES * 2) }, 0)]);
    expect(kept).toHaveLength(1);
  });
});
