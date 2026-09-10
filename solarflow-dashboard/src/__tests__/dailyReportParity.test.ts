/**
 * api/_activityStats.ts and api/_dailyReportConfig.ts are deliberate copies of
 * their solarflow-dashboard/src/lib counterparts, because api/ must not import
 * from the app source (that crashed every branch of /api/notify at runtime
 * while the build stayed green).
 *
 * A copy nobody checks is a copy that drifts, and drift here means the nightly
 * email and the Ops Center widget quietly reporting different hours for the
 * same day. These tests fail the moment the two diverge.
 */
import { describe, it, expect } from 'vitest';
import * as appStats from '../lib/activityStats';
import * as apiStats from '../../../api/_activityStats';
import * as appCfg from '../lib/dailyReportConfig';
import * as apiCfg from '../../../api/_dailyReportConfig';
import type { RawEvent } from '../lib/activityStats';

const ev = (uid: string | null, email: string | null, iso: string, op = 'job.update'): RawEvent =>
  ({ actor_uid: uid, user_email: email, created_at: iso, op_type: op });

/** Fixtures chosen to exercise every branch the two copies share. */
const FIXTURES: RawEvent[][] = [
  [],
  [ev(null, 'a@x.com', '2026-09-08T14:00:00Z')],
  [
    ev(null, 'a@x.com', '2026-09-08T14:00:00Z'),
    ev(null, 'a@x.com', '2026-09-08T14:20:00Z'),
    ev(null, 'a@x.com', '2026-09-08T16:00:00Z'),
  ],
  [
    ev('uid-1', 'contractor-2', '2026-09-08T14:00:00Z'),
    ev('uid-1', 'cesar@x.com', '2026-09-08T14:05:00Z'),
    ev('uid-2', 'contractor-2', '2026-09-08T14:05:00Z'),
  ],
  [
    ev(null, 'system', '2026-09-08T14:00:00Z'),
    ev(null, 'recovery-script', '2026-09-08T14:01:00Z'),
    ev(null, null, '2026-09-08T14:02:00Z'),
    ev(null, 'a@x.com', 'not-a-date'),
  ],
  [
    ev(null, 'a@x.com', '2026-09-08T14:00:00Z'),
    ev(null, 'a@x.com', '2026-09-09T14:00:00Z'),
  ],
];

/** Comparable shape: Maps and Dates do not survive a naive deep-equal. */
const shape = (people: appStats.PersonWorkload[]) =>
  people.map(p => ({
    key: p.key,
    label: p.label,
    minutes: p.minutes,
    events: p.events,
    sessions: p.sessions,
    first: p.first.toISOString(),
    last: p.last.toISOString(),
    perDay: [...p.perDay.entries()].sort(),
    topOps: p.topOps,
  }));

describe('activityStats parity, api copy vs app source', () => {
  it.each(FIXTURES.map((f, i) => [i, f] as const))(
    'buildWorkload agrees on fixture %i',
    (_i, rows) => {
      expect(shape(apiStats.buildWorkload(rows))).toEqual(shape(appStats.buildWorkload(rows)));
    },
  );

  it('shares the same session thresholds', () => {
    expect(apiStats.GAP_MIN).toBe(appStats.GAP_MIN);
    expect(apiStats.LONE_MIN).toBe(appStats.LONE_MIN);
  });

  it('excludes the same bot actors', () => {
    expect([...apiStats.BOT_ACTORS].sort()).toEqual([...appStats.BOT_ACTORS].sort());
  });

  it('formats durations identically', () => {
    for (const m of [0, 5, 38, 60, 65, 255, 1228]) {
      expect(apiStats.formatMinutes(m)).toBe(appStats.formatMinutes(m));
    }
  });

  it('humanizes actors identically', () => {
    for (const s of ['cesar.jurado@conexsol.us', 'contractor-4', 'a_b-c@x.com', '.a@x.com']) {
      expect(apiStats.humanizeActor(s)).toBe(appStats.humanizeActor(s));
    }
  });

  it('splits sessions identically', () => {
    const times = [0, 10, 60, 70, 600].map(m => new Date(2026, 0, 5, 9, m));
    expect(apiStats.sessions(times).length).toBe(appStats.sessions(times).length);
    expect(apiStats.sessionMinutes(apiStats.sessions(times)))
      .toBe(appStats.sessionMinutes(appStats.sessions(times)));
  });
});

describe('dailyReportConfig parity, api copy vs app source', () => {
  const CONFIGS: unknown[] = [
    null,
    undefined,
    'nonsense',
    42,
    {},
    { enabled: true },
    { enabled: true, emails: ['a@b.com', 'bad', 'A@B.com'] },
    { enabled: 'yes', emails: ['a@b.com'] },
    { enabled: true, telegramChatIds: ['123', '-100999', '@name', 'no'] },
    { enabled: true, emails: 'a@b.com', telegramChatIds: 7 },
  ];

  it.each(CONFIGS.map((c, i) => [i, c] as const))('normalizeConfig agrees on config %i', (_i, raw) => {
    expect(apiCfg.normalizeConfig(raw)).toEqual(appCfg.normalizeConfig(raw));
  });

  it('agrees on the app_data key, so both read the same row', () => {
    expect(apiCfg.DAILY_REPORT_KEY).toBe(appCfg.DAILY_REPORT_KEY);
  });

  it('agrees on validation', () => {
    for (const s of ['a@b.com', 'a@b', 'a b@c.com', '', 'a@@b.com']) {
      expect(apiCfg.isValidEmail(s)).toBe(appCfg.isValidEmail(s));
    }
    for (const s of ['123', '-1001', '@chan', 'nope', '']) {
      expect(apiCfg.isValidChatId(s)).toBe(appCfg.isValidChatId(s));
    }
  });

  it('agrees on what counts as deliverable', () => {
    for (const raw of CONFIGS) {
      expect(apiCfg.hasRecipients(apiCfg.normalizeConfig(raw)))
        .toBe(appCfg.hasRecipients(appCfg.normalizeConfig(raw)));
    }
  });
});
