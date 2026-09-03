#!/usr/bin/env node
// Per-user workload report from change_log. Usage:
//   node scripts/activity-report.mjs daily  [YYYY-MM-DD]   (default: today)
//   node scripts/activity-report.mjs weekly [YYYY-MM-DD]   (default: last 7 days ending today)
// Writes reports/activity-<kind>-<date>.md
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const env = Object.fromEntries(
  readFileSync(resolve(ROOT, '.env.vercel.prod'), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.trimStart().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);
const URL_ = env.VITE_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error('Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.vercel.prod'); process.exit(1); }

// Automation, not people. Excluded from workload.
const BOTS = new Set(['system', 'unknown', 'recovery-script', 'claude-repair-script', '']);
const GAP_MIN = 30;   // idle gap that ends a session; gap curve is flat 15-60min so this is insensitive
const LONE_MIN = 5;   // credit for a session with a single event: one save is still work, not 0 minutes
const TZ = 'America/New_York'; // ponytail: company is Miami-based; change here if that stops being true

const [, , kindArg, dateArg] = process.argv;
const kind = kindArg === 'weekly' ? 'weekly' : 'daily';
const end = dateArg ? new Date(`${dateArg}T12:00:00Z`) : new Date();
const days = kind === 'weekly' ? 7 : 1;

const dayKey = d => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
const endDay = dayKey(end);
const startDay = dayKey(new Date(end.getTime() - (days - 1) * 864e5));

async function fetchRows() {
  const cols = 'user_email,actor_uid,created_at,op_type,entity_type,entity_id';
  const lo = `${startDay}T00:00:00-05:00`, hi = `${endDay}T23:59:59.999-05:00`;
  const out = [];
  for (let from = 0; ; from += 1000) {
    const url = `${URL_}/rest/v1/change_log?select=${cols}&created_at=gte.${lo}&created_at=lte.${hi}&order=created_at.asc`;
    const r = await fetch(url, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Range: `${from}-${from + 999}` } });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    const page = await r.json();
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

// contractor-N is a SLOT label that collides across people (contractor-2 is Cesar's uid),
// and one person writes several labels. Identity is actor_uid when we have it.
function identify(rows) {
  const uidLabel = new Map();
  for (const r of rows) {
    if (!r.actor_uid) continue;
    const cur = uidLabel.get(r.actor_uid);
    const better = r.user_email?.includes('@') && !cur?.includes('@');
    if (!cur || better) uidLabel.set(r.actor_uid, r.user_email || r.actor_uid);
  }
  return rows.map(r => ({
    ...r,
    who: r.actor_uid ? (uidLabel.get(r.actor_uid) || r.actor_uid) : (r.user_email || 'unknown'),
    t: new Date(r.created_at),
  })).filter(r => !BOTS.has(r.who) && r.who);
}

// Wall-clock is unknowable from an event log. Estimate: cluster events into sessions
// and sum their spans. ponytail: undercounts reading/phone time with no writes; if that
// matters, log a heartbeat event and this same math gets truer with no rewrite.
function sessions(times) {
  const out = [];
  let s = times[0], p = times[0];
  for (const t of times.slice(1)) {
    if ((t - p) / 6e4 > GAP_MIN) { out.push([s, p]); s = t; }
    p = t;
  }
  out.push([s, p]);
  return out;
}
const minutes = ss => ss.reduce((a, [s, e]) => a + Math.max((e - s) / 6e4, LONE_MIN), 0);
const hm = m => `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m`;
const hhmm = d => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(d);

if (process.argv.includes('--selftest')) {
  const at = (...mins) => mins.map(m => new Date(2026, 0, 1, 9, m));
  const eq = (a, b, msg) => { if (Math.abs(a - b) > 1e-9) throw new Error(`${msg}: got ${a}, want ${b}`); };
  eq(sessions(at(0)).length, 1, 'one event is one session');
  eq(minutes(sessions(at(0))), LONE_MIN, 'lone event gets the floor, not 0');
  eq(sessions(at(0, 10, 20)).length, 1, 'gaps under threshold stay one session');
  eq(minutes(sessions(at(0, 10, 20))), 20, 'session span is first to last');
  eq(sessions(at(0, 10, 60, 70)).length, 2, 'a 50-min gap splits the session');
  eq(minutes(sessions(at(0, 10, 60, 70))), 20, 'split sessions sum their spans, idle time excluded');
  eq(minutes(sessions(at(0, 600))), 2 * LONE_MIN, 'two far-apart lone events get 2 floors, not 10 hours');
  eq(identify([{ actor_uid: 'u1', user_email: 'contractor-2', created_at: '2026-01-01T00:00:00Z' },
               { actor_uid: 'u1', user_email: 'a@b.com', created_at: '2026-01-01T00:01:00Z' }])
     .filter(r => r.who === 'a@b.com').length, 2, 'a slot label folds into the real email via actor_uid');
  console.log('selftest ok');
  process.exit(0);
}

const rows = identify(await fetchRows());
if (!rows.length) { console.log(`No activity between ${startDay} and ${endDay}.`); process.exit(0); }

const byUser = new Map();
for (const r of rows) {
  if (!byUser.has(r.who)) byUser.set(r.who, []);
  byUser.get(r.who).push(r);
}

const stats = [...byUser].map(([who, rs]) => {
  const ss = sessions(rs.map(r => r.t));
  const perDay = new Map();
  for (const r of rs) {
    const k = dayKey(r.t);
    if (!perDay.has(k)) perDay.set(k, []);
    perDay.get(k).push(r.t);
  }
  const dayMin = new Map([...perDay].map(([k, ts]) => [k, minutes(sessions(ts))]));
  const top = [...rs.reduce((m, r) => m.set(r.op_type, (m.get(r.op_type) || 0) + 1), new Map())]
    .sort((a, b) => b[1] - a[1]).slice(0, 3);
  return {
    who, events: rs.length, mins: minutes(ss), sessions: ss.length,
    first: rs[0].t, last: rs.at(-1).t, dayMin, top,
    touched: new Set(rs.map(r => `${r.entity_type}:${r.entity_id}`)).size,
    activeDays: perDay.size,
  };
}).sort((a, b) => b.mins - a.mins);

const dayList = [...Array(days)].map((_, i) => dayKey(new Date(end.getTime() - (days - 1 - i) * 864e5)));
const L = [];
L.push(`# Activity report (${kind})`);
L.push('');
L.push(`Window: **${startDay}${days > 1 ? ` to ${endDay}` : ''}** (${TZ}). Source: \`change_log\`, ${rows.length} events, ${stats.length} people.`);
L.push('');
L.push('## Workload by person');
L.push('');
L.push('| Person | Est. active time | Events | Sessions | Records touched | First | Last |');
L.push('|---|---:|---:|---:|---:|---:|---:|');
for (const s of stats)
  L.push(`| ${s.who} | ${hm(s.mins)} | ${s.events} | ${s.sessions} | ${s.touched} | ${hhmm(s.first)} | ${hhmm(s.last)} |`);
L.push(`| **Total** | **${hm(stats.reduce((a, s) => a + s.mins, 0))}** | **${rows.length}** | | | | |`);
L.push('');

if (days > 1) {
  L.push('## Active time per day');
  L.push('');
  L.push(`| Person | ${dayList.join(' | ')} | Total | Days worked |`);
  L.push(`|---|${dayList.map(() => '---:').join('|')}|---:|---:|`);
  for (const s of stats)
    L.push(`| ${s.who} | ${dayList.map(d => s.dayMin.has(d) ? hm(s.dayMin.get(d)) : '-').join(' | ')} | ${hm(s.mins)} | ${s.activeDays}/${days} |`);
  L.push('');
}

L.push('## What they worked on');
L.push('');
for (const s of stats) L.push(`- **${s.who}**: ${s.top.map(([o, n]) => `${o} (${n})`).join(', ')}`);
L.push('');
L.push('---');
L.push('');
L.push(`_Active time is estimated: events are grouped into sessions with a ${GAP_MIN}-minute idle gap and each session counts its first-to-last span (a lone event counts ${LONE_MIN} min). It measures time spent **writing** to SolarOps, so it undercounts calls, reading, and field travel, and is a floor, not a timesheet._`);

mkdirSync(resolve(ROOT, 'reports'), { recursive: true });
const out = resolve(ROOT, 'reports', `activity-${kind}-${endDay}.md`);
writeFileSync(out, L.join('\n') + '\n');
console.log(out);
