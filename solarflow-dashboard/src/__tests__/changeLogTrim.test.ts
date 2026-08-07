/**
 * The change log is capped by ENTRY COUNT (2000), which says nothing about bytes.
 * Measured against the live change_log table: average entry ~2 KB, `job.update`
 * averaging 9.7 KB with one at 1.43 MB. 2000 of those is ~3.9 MB of a ~5 MB
 * localStorage origin cap, which is what actually filled the device.
 *
 * These pin the byte discipline. Without them the count cap looks sufficient.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { slimPayload, trimLog, diffEntity, describeUrl, reclaimLocalStorage } from '../lib/changeLog';

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

describe('reclaimLocalStorage (boot-time recovery)', () => {
  const LOG_KEY = 'solarops_change_log';
  beforeEach(() => localStorage.clear());

  it('frees a device already carrying a multi-MB log', () => {
    const fat = Array.from({ length: 1500 }, (_, i) => entry({ pad: 'x'.repeat(9_700) }, i));
    localStorage.setItem(LOG_KEY, JSON.stringify(fat));
    expect(localStorage.getItem(LOG_KEY)!.length).toBeGreaterThan(4 * 1024 * 1024);

    const { before, after } = reclaimLocalStorage();

    expect(before).toBeGreaterThan(4 * 1024 * 1024);
    expect(after).toBeLessThanOrEqual(512 * 1024);
    expect(localStorage.getItem(LOG_KEY)!.length).toBe(after);
  });

  it('leaves a healthy log untouched, no cost on a normal boot', () => {
    const small = JSON.stringify([entry({ ok: true }, 0)]);
    localStorage.setItem(LOG_KEY, small);

    const { before, after } = reclaimLocalStorage();

    expect(before).toBe(after);
    expect(localStorage.getItem(LOG_KEY)).toBe(small);
  });

  it('drops an unparseable oversized log rather than leaving the device wedged', () => {
    localStorage.setItem(LOG_KEY, 'x'.repeat(600 * 1024)); // corrupt, not JSON
    const { after } = reclaimLocalStorage();

    expect(after).toBe(0);
    expect(localStorage.getItem(LOG_KEY)).toBeNull();
  });

  it('does not throw when there is no log at all', () => {
    expect(() => reclaimLocalStorage()).not.toThrow();
    expect(reclaimLocalStorage().before).toBe(0);
  });
});

describe('describeUrl', () => {
  it('passes an uploaded https URL through, identity is what an audit needs', () => {
    expect(describeUrl('https://cdn.example.com/a.jpg')).toBe('https://cdn.example.com/a.jpg');
  });

  it('collapses a data: URL instead of embedding the image', () => {
    const dataUrl = 'data:image/jpeg;base64,' + 'A'.repeat(600_000);
    const out = describeUrl(dataUrl);

    expect(out).toBe(`[data:image/jpeg ${dataUrl.length} bytes]`);
    expect(out.length).toBeLessThan(80);
  });

  it('handles a data: URL with no mime section without producing junk', () => {
    expect(describeUrl('data:,hello')).toMatch(/^\[data:\w+ \d+ bytes\]$/);
  });

  it('does not throw on a non-string', () => {
    expect(describeUrl(undefined)).toBe('undefined');
  });
});

describe('diffEntity heavy fields', () => {
  it('summarizes auditLog and fieldTimes by count, they were 3.97 MB of live diffs', () => {
    const before = {
      auditLog:   Array.from({ length: 40 }, (_, i) => ({ i, note: 'x'.repeat(200) })),
      fieldTimes: { a: 'x'.repeat(2000) },
      status:     'assigned',
    };
    const after = {
      auditLog:   Array.from({ length: 41 }, (_, i) => ({ i, note: 'x'.repeat(200) })),
      fieldTimes: { a: 'y'.repeat(2000) },
      status:     'completed',
    };

    const diff = diffEntity(before, after);

    expect(diff.auditLog).toEqual({ before: '40', after: '41' });
    expect(diff.status).toEqual({ before: 'assigned', after: 'completed' });
    // The whole diff must stay small even though both heavy fields changed.
    expect(JSON.stringify(diff).length).toBeLessThan(300);
  });

  it('still reports ordinary field changes in full', () => {
    const diff = diffEntity({ notes: 'old' }, { notes: 'new' });
    expect(diff.notes).toEqual({ before: 'old', after: 'new' });
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
