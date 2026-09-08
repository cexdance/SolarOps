import { describe, it, expect } from 'vitest';
import {
  sessions,
  sessionMinutes,
  buildWorkload,
  formatMinutes,
  lastDays,
  dayKey,
  humanizeActor,
  LONE_MIN,
  RawEvent,
} from '../lib/activityStats';

/** Times on one local day, n minutes past 09:00. */
const at = (...mins: number[]) => mins.map(m => new Date(2026, 0, 5, 9, m));
/** A change_log row. */
const ev = (uid: string | null, email: string | null, iso: string, op = 'job.update'): RawEvent =>
  ({ actor_uid: uid, user_email: email, created_at: iso, op_type: op });

describe('sessions', () => {
  it('treats a single event as one session', () => {
    expect(sessions(at(0))).toHaveLength(1);
  });

  it('keeps events under the idle gap in one session', () => {
    expect(sessions(at(0, 10, 20))).toHaveLength(1);
  });

  it('splits when the idle gap is exceeded', () => {
    expect(sessions(at(0, 10, 60, 70))).toHaveLength(2);
  });

  it('returns nothing for no events', () => {
    expect(sessions([])).toHaveLength(0);
  });
});

describe('sessionMinutes', () => {
  it('gives a lone event the floor rather than zero', () => {
    expect(sessionMinutes(sessions(at(0)))).toBe(LONE_MIN);
  });

  it('measures a session first to last', () => {
    expect(sessionMinutes(sessions(at(0, 10, 20)))).toBe(20);
  });

  it('excludes the idle gap between sessions', () => {
    // Two 10-minute sessions with a 50-minute gap is 20 minutes of work, not 70.
    expect(sessionMinutes(sessions(at(0, 10, 60, 70)))).toBe(20);
  });

  it('does not turn two far-apart clicks into all-day work', () => {
    expect(sessionMinutes(sessions(at(0, 600)))).toBe(2 * LONE_MIN);
  });
});

describe('buildWorkload identity resolution', () => {
  it('folds a contractor slot label into the real person via actor_uid', () => {
    // The bug this guards: contractor-2 is actually Cesar's own uid. Grouping
    // by user_email would report his work as a contractor's.
    const out = buildWorkload([
      ev('uid-1', 'contractor-2', '2026-01-05T14:00:00Z'),
      ev('uid-1', 'cesar@x.com', '2026-01-05T14:05:00Z'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe('cesar@x.com');
    expect(out[0].events).toBe(2);
  });

  it('keeps two people apart even when they share a slot label', () => {
    const out = buildWorkload([
      ev('uid-1', 'contractor-4', '2026-01-05T14:00:00Z'),
      ev('uid-2', 'contractor-4', '2026-01-05T14:00:00Z'),
    ]);
    expect(out).toHaveLength(2);
  });

  it('excludes automation', () => {
    const out = buildWorkload([
      ev(null, 'system', '2026-01-05T14:00:00Z'),
      ev(null, 'recovery-script', '2026-01-05T14:01:00Z'),
      ev(null, 'a@b.com', '2026-01-05T14:02:00Z'),
    ]);
    expect(out.map(p => p.label)).toEqual(['a@b.com']);
  });

  it('falls back to the email when there is no actor_uid', () => {
    const out = buildWorkload([ev(null, 'a@b.com', '2026-01-05T14:00:00Z')]);
    expect(out[0].label).toBe('a@b.com');
  });

  it('drops rows with no identity at all', () => {
    expect(buildWorkload([ev(null, null, '2026-01-05T14:00:00Z')])).toHaveLength(0);
  });

  it('survives an unparseable timestamp instead of emitting NaN minutes', () => {
    const out = buildWorkload([
      ev(null, 'a@b.com', 'not-a-date'),
      ev(null, 'a@b.com', '2026-01-05T14:00:00Z'),
    ]);
    expect(out[0].events).toBe(1);
    expect(Number.isFinite(out[0].minutes)).toBe(true);
  });

  it('ranks the busiest person first', () => {
    const out = buildWorkload([
      ev(null, 'quiet@x.com', '2026-01-05T14:00:00Z'),
      ev(null, 'busy@x.com', '2026-01-05T14:00:00Z'),
      ev(null, 'busy@x.com', '2026-01-05T15:00:00Z'),
      ev(null, 'busy@x.com', '2026-01-05T15:20:00Z'),
    ]);
    expect(out[0].label).toBe('busy@x.com');
  });

  it('sums per-day totals rather than spanning overnight gaps', () => {
    // Two days, 10 minutes of work each. A naive first-to-last span would
    // report over 24 hours of work.
    const out = buildWorkload([
      ev(null, 'a@b.com', '2026-01-05T14:00:00Z'),
      ev(null, 'a@b.com', '2026-01-05T14:10:00Z'),
      ev(null, 'a@b.com', '2026-01-06T14:00:00Z'),
      ev(null, 'a@b.com', '2026-01-06T14:10:00Z'),
    ]);
    expect(out[0].minutes).toBe(20);
    expect(out[0].perDay.size).toBe(2);
  });

  it('applies a display name when one is supplied', () => {
    const out = buildWorkload([ev(null, 'a@b.com', '2026-01-05T14:00:00Z')], {
      displayName: e => (e === 'a@b.com' ? 'Ana B' : undefined),
    });
    expect(out[0].label).toBe('Ana B');
  });

  it('counts the busiest op types', () => {
    const out = buildWorkload([
      ev(null, 'a@b.com', '2026-01-05T14:00:00Z', 'job.update'),
      ev(null, 'a@b.com', '2026-01-05T14:01:00Z', 'job.update'),
      ev(null, 'a@b.com', '2026-01-05T14:02:00Z', 'customer.update'),
    ]);
    expect(out[0].topOps[0]).toEqual({ op: 'job.update', n: 2 });
  });
});

describe('formatMinutes', () => {
  it('drops the hour when under one', () => {
    expect(formatMinutes(38)).toBe('38m');
  });

  it('pads the minutes past an hour', () => {
    expect(formatMinutes(255)).toBe('4h 15m');
    expect(formatMinutes(65)).toBe('1h 05m');
  });
});

describe('lastDays', () => {
  it('returns n days oldest first, ending on the given day', () => {
    const out = lastDays(3, new Date(2026, 0, 5));
    expect(out).toEqual(['2026-01-03', '2026-01-04', '2026-01-05']);
  });

  it('crosses a month boundary', () => {
    expect(lastDays(2, new Date(2026, 1, 1))[0]).toBe('2026-01-31');
  });

  it('agrees with dayKey', () => {
    const d = new Date(2026, 0, 5);
    expect(lastDays(1, d)[0]).toBe(dayKey(d));
  });
});

describe('humanizeActor', () => {
  it('turns an address into a name', () => {
    expect(humanizeActor('cesar.jurado@conexsol.us')).toBe('Cesar Jurado');
  });

  it('handles underscores and hyphens', () => {
    expect(humanizeActor('ana_b-cruz@x.com')).toBe('Ana B Cruz');
  });

  it('leaves a slot label alone rather than inventing a name', () => {
    expect(humanizeActor('contractor-4')).toBe('contractor-4');
  });

  it('leaves a bare uid alone', () => {
    expect(humanizeActor('dc694b73-c717-494e-9946-a0de587cc7e5'))
      .toBe('dc694b73-c717-494e-9946-a0de587cc7e5');
  });

  it('does not crash on a leading separator', () => {
    expect(humanizeActor('.a@x.com')).toBe('A');
  });
});
