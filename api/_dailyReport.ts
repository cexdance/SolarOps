/**
 * SolarOps, end-of-day workload report.
 *
 * Not a route (leading underscore). Invoked by the cron branch of
 * /api/notify, which is where it lives because the Hobby plan caps `api/` at
 * 12 functions and we are at the cap.
 *
 * Everything it imports lives under api/. It must NOT reach into the dashboard
 * source: doing so crashed every branch of /api/notify at runtime while the
 * build stayed green. The duplicated modules are pinned to their dashboard
 * counterparts by dailyReportParity.test.ts.
 */
import {
  buildWorkload,
  formatMinutes,
  humanizeActor,
  GAP_MIN,
  type RawEvent,
  type PersonWorkload,
} from './_activityStats';
import {
  normalizeConfig,
  hasRecipients,
  DAILY_REPORT_KEY,
} from './_dailyReportConfig';

const SUPABASE_URL = 'https://cjmhfagkkayelcsprbai.supabase.co';
const PAGE = 1000;
const MAX_ROWS = 20000;

/** The company runs on Eastern time; the report day is an Eastern calendar day. */
export const REPORT_TZ = 'America/New_York';

export interface ReportWindow {
  /** Inclusive UTC start of the report day. */
  startIso: string;
  /** Exclusive UTC end. */
  endIso: string;
  /** Human label, e.g. "Monday, September 8, 2026". */
  label: string;
  /** YYYY-MM-DD of the covered day, in REPORT_TZ. */
  day: string;
}

/** Local YYYY-MM-DD for a date in the given zone. */
function zonedDay(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d);
}

/**
 * Offset of `tz` from UTC in minutes at instant `d`.
 * Computed rather than hardcoded so the window stays correct across the DST
 * change, when Eastern moves between UTC-4 and UTC-5.
 */
function tzOffsetMinutes(d: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p: Record<string, number> = {};
  for (const { type, value } of dtf.formatToParts(d)) {
    if (type !== 'literal') p[type] = Number(value);
  }
  // Intl gives hour 24 for midnight in some engines; normalise to 0.
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  return (asUTC - Math.floor(d.getTime() / 1000) * 1000) / 60000;
}

/**
 * The calendar day to report on, in REPORT_TZ.
 *
 * `now` is when the cron fired. Because the job runs at 23:00 Eastern, "today"
 * is the day being closed out. If it ever fires after midnight (Vercel's Hobby
 * crons are only accurate to the hour, and a UTC schedule drifts an hour at
 * each DST change), the local date has already rolled over and we would report
 * a day that is 23 hours empty, so anything before 03:00 local reports the day
 * before instead.
 */
export function reportWindow(now: Date = new Date()): ReportWindow {
  const localHour = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: REPORT_TZ, hour12: false, hour: '2-digit' })
      .format(now).replace('24', '0'),
  );
  const anchor = localHour < 3 ? new Date(now.getTime() - 6 * 3600_000) : now;
  const day = zonedDay(anchor, REPORT_TZ);

  const [y, m, d] = day.split('-').map(Number);
  // Midnight local, expressed as UTC: guess with the offset at midday, which is
  // never inside a DST transition.
  const noonUtcGuess = Date.UTC(y, m - 1, d, 12);
  const offset = tzOffsetMinutes(new Date(noonUtcGuess), REPORT_TZ);
  const startMs = Date.UTC(y, m - 1, d) - offset * 60000;

  return {
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(startMs + 24 * 3600_000).toISOString(),
    day,
    label: new Intl.DateTimeFormat('en-US', {
      timeZone: REPORT_TZ, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    }).format(new Date(noonUtcGuess)),
  };
}

/** Read one report day of change_log. Only the four columns the math needs. */
export async function fetchEvents(
  serviceRoleKey: string,
  w: ReportWindow,
  fetchImpl: typeof fetch = fetch,
): Promise<RawEvent[]> {
  const out: RawEvent[] = [];
  const headers = {
    Authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
  };
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    // NEVER select payload here: it carries whole customer records and would
    // pull megabytes per night for numbers we do not use.
    const url =
      `${SUPABASE_URL}/rest/v1/change_log` +
      `?select=user_email,actor_uid,created_at,op_type` +
      `&created_at=gte.${encodeURIComponent(w.startIso)}` +
      `&created_at=lt.${encodeURIComponent(w.endIso)}` +
      `&order=created_at.asc`;
    const res = await fetchImpl(url, {
      headers: { ...headers, Range: `${from}-${from + PAGE - 1}` },
    });
    if (!res.ok) {
      throw new Error(`change_log read failed: ${res.status} ${await res.text().catch(() => '')}`);
    }
    const page = (await res.json()) as RawEvent[];
    out.push(...page);
    if (page.length < PAGE) break;
  }
  return out;
}

export interface Report {
  window: ReportWindow;
  people: PersonWorkload[];
  totalMinutes: number;
  totalEvents: number;
  subject: string;
  html: string;
  text: string;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const CAVEAT =
  `Estimated from change_log: events are grouped into sessions with a ${GAP_MIN}-minute idle gap ` +
  `and each session counts its first-to-last span. This measures time spent writing to SolarOps, ` +
  `so calls, site visits and reading do not appear. It is a floor, not a timesheet.`;

/** Build the report body. Pure, so it is testable without network or env. */
export function renderReport(rows: RawEvent[], w: ReportWindow): Report {
  const people = buildWorkload(rows, { displayName: humanizeActor });
  const totalMinutes = people.reduce((a, p) => a + p.minutes, 0);
  const totalEvents = people.reduce((a, p) => a + p.events, 0);
  const peak = people[0]?.minutes ?? 0;

  const subject = people.length
    ? `SolarOps daily workload, ${w.label}: ${formatMinutes(totalMinutes)} across ${people.length}`
    : `SolarOps daily workload, ${w.label}: no recorded activity`;

  const hhmm = (d: Date) =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: REPORT_TZ, hour: '2-digit', minute: '2-digit',
    }).format(d);

  const textLines = [
    `SolarOps daily workload`,
    w.label,
    '',
  ];
  if (!people.length) {
    textLines.push('No recorded activity for this day.');
  } else {
    for (const p of people) {
      textLines.push(
        `${p.label}: ${formatMinutes(p.minutes)}  (${p.events} edits, ` +
        `${p.sessions} sessions, ${hhmm(p.first)} to ${hhmm(p.last)}, top: ${p.topOps[0]?.op ?? 'n/a'})`,
      );
    }
    textLines.push('', `Total: ${formatMinutes(totalMinutes)} across ${people.length} people, ${totalEvents} edits.`);
  }
  textLines.push('', CAVEAT);

  const rowsHtml = people.map(p => {
    const pct = peak > 0 ? Math.max((p.minutes / peak) * 100, 2) : 0;
    return `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;color:#0f172a;font-size:13px">${esc(p.label)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;width:45%">
          <div style="background:#f1f5f9;border-radius:3px;height:10px">
            <div style="background:#f97316;width:${pct.toFixed(1)}%;height:10px;border-radius:3px"></div>
          </div>
        </td>
        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600;color:#0f172a;font-size:13px;white-space:nowrap">${esc(formatMinutes(p.minutes))}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;text-align:right;color:#64748b;font-size:12px;white-space:nowrap">${p.events} edits</td>
      </tr>`;
  }).join('');

  const body = people.length
    ? `<table style="width:100%;border-collapse:collapse;margin:0 0 16px">${rowsHtml}</table>
       <p style="color:#334155;font-size:13px;margin:0 0 16px">
         Total <strong>${esc(formatMinutes(totalMinutes))}</strong> across ${people.length}
         ${people.length === 1 ? 'person' : 'people'}, ${totalEvents} edits.
       </p>`
    : `<p style="color:#64748b;font-size:14px">No recorded activity for this day.</p>`;

  const html = `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:640px;margin:0 auto;padding:24px">
    <h2 style="color:#f97316;margin:0 0 2px;font-size:18px">SolarOps daily workload</h2>
    <p style="color:#64748b;margin:0 0 18px;font-size:13px">${esc(w.label)}</p>
    ${body}
    <p style="color:#94a3b8;font-size:11px;line-height:1.5;border-top:1px solid #e2e8f0;padding-top:12px;margin:0">
      ${esc(CAVEAT)}
    </p>
  </div>`;

  return { window: w, people, totalMinutes, totalEvents, subject, html, text: textLines.join('\n') };
}

/** Telegram wants short plain text, not the HTML email body. */
export function renderTelegram(r: Report): string {
  if (!r.people.length) return `SolarOps daily workload\n${r.window.label}\n\nNo recorded activity.`;
  const lines = r.people.map(p => `${p.label}: ${formatMinutes(p.minutes)} (${p.events} edits)`);
  return [
    'SolarOps daily workload',
    r.window.label,
    '',
    ...lines,
    '',
    `Total ${formatMinutes(r.totalMinutes)} across ${r.people.length}.`,
    'Estimated from app activity, a floor not a timesheet.',
  ].join('\n');
}

// ── Delivery ─────────────────────────────────────────────────────────────────

export interface DeliveryResult {
  channel: 'email' | 'telegram';
  ok: boolean;
  detail: string;
}

/** One email to the whole list. Resend takes an array for `to`. */
export async function sendEmail(
  apiKey: string,
  to: string[],
  r: Report,
  fetchImpl: typeof fetch = fetch,
): Promise<DeliveryResult> {
  try {
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'SolarOps <solar.ops@conexsol.us>',
        reply_to: 'solar.ops@conexsol.us',
        to,
        subject: r.subject,
        html: r.html,
        text: r.text,
      }),
    });
    if (!res.ok) {
      return { channel: 'email', ok: false, detail: `${res.status} ${await res.text().catch(() => '')}`.slice(0, 200) };
    }
    return { channel: 'email', ok: true, detail: `sent to ${to.length}` };
  } catch (e) {
    return { channel: 'email', ok: false, detail: (e as Error).message };
  }
}

/** One Telegram message per chat id. */
export async function sendTelegram(
  botToken: string,
  chatIds: string[],
  body: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DeliveryResult[]> {
  const out: DeliveryResult[] = [];
  for (const chat_id of chatIds) {
    try {
      const res = await fetchImpl(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // No parse_mode: the body carries user-controlled display names, and
        // unescaped Markdown would break the send or mangle the text.
        body: JSON.stringify({ chat_id, text: body, disable_web_page_preview: true }),
      });
      out.push({
        channel: 'telegram',
        ok: res.ok,
        detail: res.ok ? `sent to ${chat_id}` : `${chat_id}: ${res.status}`,
      });
    } catch (e) {
      out.push({ channel: 'telegram', ok: false, detail: `${chat_id}: ${(e as Error).message}` });
    }
  }
  return out;
}

/** Read the admin-managed config out of app_data. */
export async function loadConfig(
  serviceRoleKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const res = await fetchImpl(
    `${SUPABASE_URL}/rest/v1/app_data?select=value&key=eq.${DAILY_REPORT_KEY}`,
    { headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey } },
  );
  if (!res.ok) throw new Error(`config read failed: ${res.status}`);
  const rows = (await res.json()) as Array<{ value: unknown }>;
  return rows[0]?.value ?? null;
}

export interface RunEnv {
  serviceRoleKey: string;
  resendApiKey?: string;
  telegramBotToken?: string;
}

export interface RunResult {
  status: 'sent' | 'skipped' | 'error';
  reason?: string;
  day?: string;
  people?: number;
  totalMinutes?: number;
  deliveries?: DeliveryResult[];
}

/**
 * The whole nightly job. Returns a result rather than writing a response, so
 * the HTTP layer in notify.ts stays a thin wrapper and this stays testable.
 *
 * Skips (rather than fails) when it is switched off or has no recipients: an
 * unconfigured cron should be quiet, not a nightly error.
 */
export async function runDailyReport(
  env: RunEnv,
  now: Date = new Date(),
  fetchImpl: typeof fetch = fetch,
): Promise<RunResult> {
  if (!env.serviceRoleKey) return { status: 'error', reason: 'SUPABASE_SERVICE_ROLE_KEY not set' };

  const cfg = normalizeConfig(await loadConfig(env.serviceRoleKey, fetchImpl));
  if (!cfg.enabled) return { status: 'skipped', reason: 'disabled in Settings' };
  if (!hasRecipients(cfg)) return { status: 'skipped', reason: 'no recipients configured' };

  const w = reportWindow(now);
  const rows = await fetchEvents(env.serviceRoleKey, w, fetchImpl);
  const report = renderReport(rows, w);

  const deliveries: DeliveryResult[] = [];

  if (cfg.emails.length) {
    if (env.resendApiKey) {
      deliveries.push(await sendEmail(env.resendApiKey, cfg.emails, report, fetchImpl));
    } else {
      deliveries.push({ channel: 'email', ok: false, detail: 'RESEND_API_KEY not set' });
    }
  }

  if (cfg.telegramChatIds.length) {
    if (env.telegramBotToken) {
      deliveries.push(...await sendTelegram(env.telegramBotToken, cfg.telegramChatIds, renderTelegram(report), fetchImpl));
    } else {
      // Self-activating, like the VAPID and Vercel-token guards: stays inert
      // until the token exists rather than failing the whole run.
      deliveries.push({ channel: 'telegram', ok: false, detail: 'TELEGRAM_BOT_TOKEN not set' });
    }
  }

  return {
    status: 'sent',
    day: w.day,
    people: report.people.length,
    totalMinutes: Math.round(report.totalMinutes),
    deliveries,
  };
}
