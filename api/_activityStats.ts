/**
 * SolarOps, workload session math for the serverless layer.
 *
 * DUPLICATED, deliberately, from
 * solarflow-dashboard/src/lib/activityStats.ts.
 *
 * api/ does not import from the app source: that boundary is the house
 * convention here (see the labelCatalog note in trello-card.ts), and reaching
 * across it in the notify function produced a runtime
 * FUNCTION_INVOCATION_FAILED that took EVERY branch of /api/notify down,
 * @mentions included, even though the build passed.
 *
 * `dailyReportParity.test.ts` pins this file and the dashboard one to identical
 * output, so the copy cannot silently drift.
 */

/** Idle gap that ends a session. */
export const GAP_MIN = 30;
/** Credit for a session holding a single event. One save is still work, not zero minutes. */
export const LONE_MIN = 5;

/** Automation, not people. These never count toward anyone's workload. */
export const BOT_ACTORS = new Set([
  'system',
  'unknown',
  'recovery-script',
  'claude-repair-script',
]);

export interface RawEvent {
  user_email: string | null;
  actor_uid: string | null;
  created_at: string;
  op_type: string | null;
}

export interface PersonWorkload {
  /** Stable key: the actor_uid when we have one, else the raw email. */
  key: string;
  /** Best display label we could resolve for this person. */
  label: string;
  minutes: number;
  events: number;
  sessions: number;
  first: Date;
  last: Date;
  /** Local YYYY-MM-DD to estimated minutes. */
  perDay: Map<string, number>;
  /** Most frequent op_types, busiest first. */
  topOps: Array<{ op: string; n: number }>;
}

/** Local calendar day for a date, as YYYY-MM-DD. */
export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Split ascending timestamps into sessions.
 * ponytail: a plain linear scan. change_log is a few thousand rows a week, so
 * there is nothing here worth indexing.
 */
export function sessions(times: Date[]): Array<[Date, Date]> {
  if (times.length === 0) return [];
  const out: Array<[Date, Date]> = [];
  let start = times[0];
  let prev = times[0];
  for (const t of times.slice(1)) {
    if ((t.getTime() - prev.getTime()) / 60000 > GAP_MIN) {
      out.push([start, prev]);
      start = t;
    }
    prev = t;
  }
  out.push([start, prev]);
  return out;
}

/** Sum session spans, giving a lone-event session the floor rather than zero. */
export function sessionMinutes(ss: Array<[Date, Date]>): number {
  return ss.reduce(
    (a, [s, e]) => a + Math.max((e.getTime() - s.getTime()) / 60000, LONE_MIN),
    0,
  );
}

/**
 * Resolve who each event belongs to.
 *
 * user_email cannot be trusted on its own: "contractor-N" is a reusable SLOT
 * label, not a person. contractor-4 and "Jaime Mendez" are one human, and
 * contractor-2 is actually Cesar's own account. Grouping by the email string
 * therefore credits one person's work to somebody else. actor_uid is the real
 * identity, so we key on it and only fall back to the email when it is absent.
 */
function identityMap(rows: RawEvent[]): Map<string, string> {
  const byUid = new Map<string, string>();
  for (const r of rows) {
    if (!r.actor_uid) continue;
    const current = byUid.get(r.actor_uid);
    const email = r.user_email || '';
    // An address beats a slot label like "contractor-4".
    const better = email.includes('@') && !current?.includes('@');
    if (!current || better) byUid.set(r.actor_uid, email || r.actor_uid);
  }
  return byUid;
}

export interface BuildOptions {
  /** Maps a resolved email to a friendly display name. */
  displayName?: (email: string) => string | undefined;
}

/** Group raw change_log rows into per-person workload, busiest first. */
export function buildWorkload(rows: RawEvent[], opts: BuildOptions = {}): PersonWorkload[] {
  const byUid = identityMap(rows);
  const grouped = new Map<string, { label: string; evs: Array<{ t: Date; op: string }> }>();

  for (const r of rows) {
    const resolved = r.actor_uid ? byUid.get(r.actor_uid) || r.actor_uid : r.user_email;
    if (!resolved || BOT_ACTORS.has(resolved)) continue;
    const key = r.actor_uid || resolved;
    const t = new Date(r.created_at);
    if (Number.isNaN(t.getTime())) continue;
    if (!grouped.has(key)) grouped.set(key, { label: resolved, evs: [] });
    grouped.get(key)!.evs.push({ t, op: r.op_type || 'unknown' });
  }

  const out: PersonWorkload[] = [];
  for (const [key, { label, evs }] of grouped) {
    evs.sort((a, b) => a.t.getTime() - b.t.getTime());
    const times = evs.map(e => e.t);

    const perDay = new Map<string, number>();
    const dayBuckets = new Map<string, Date[]>();
    for (const t of times) {
      const k = dayKey(t);
      if (!dayBuckets.has(k)) dayBuckets.set(k, []);
      dayBuckets.get(k)!.push(t);
    }
    for (const [k, ts] of dayBuckets) perDay.set(k, sessionMinutes(sessions(ts)));

    const opCounts = new Map<string, number>();
    for (const e of evs) opCounts.set(e.op, (opCounts.get(e.op) || 0) + 1);

    // Day totals, not one span across the whole window, so a week does not
    // absorb the overnight gaps into somebody's working time.
    const minutes = [...perDay.values()].reduce((a, b) => a + b, 0);

    out.push({
      key,
      label: opts.displayName?.(label) || label,
      minutes,
      events: evs.length,
      sessions: [...dayBuckets.values()].reduce((a, ts) => a + sessions(ts).length, 0),
      first: times[0],
      last: times[times.length - 1],
      perDay,
      topOps: [...opCounts]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([op, n]) => ({ op, n })),
    });
  }

  return out.sort((a, b) => b.minutes - a.minutes);
}

/**
 * Turn an actor label into something readable when we have no matching User
 * record. "cesar.jurado@conexsol.us" becomes "Cesar Jurado". Anything that is
 * not an address (a slot label, a bare uid) is left exactly as it is, because
 * inventing a name for it would be worse than showing the raw value.
 */
export function humanizeActor(label: string): string {
  if (!label.includes('@')) return label;
  const local = label.split('@')[0];
  const words = local.split(/[._\-+]+/).filter(Boolean);
  if (words.length === 0) return label;
  return words.map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}

/** "4h 15m", or "38m" under an hour. */
export function formatMinutes(m: number): string {
  const total = Math.round(m);
  const h = Math.floor(total / 60);
  const min = total % 60;
  return h > 0 ? `${h}h ${String(min).padStart(2, '0')}m` : `${min}m`;
}

/** The last n local calendar days, oldest first, ending today. */
export function lastDays(n: number, end: Date = new Date()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    out.push(dayKey(d));
  }
  return out;
}
