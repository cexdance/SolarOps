import { describe, it, expect } from 'vitest';
import {
  reportWindow,
  renderReport,
  renderTelegram,
  fetchEvents,
  runDailyReport,
  REPORT_TZ,
} from '../../../api/_dailyReport';
import {
  normalizeConfig,
  isValidEmail,
  isValidChatId,
  hasRecipients,
  DEFAULT_DAILY_REPORT,
} from '../lib/dailyReportConfig';
import type { RawEvent } from '../lib/activityStats';

const ev = (email: string | null, iso: string, op = 'job.update'): RawEvent =>
  ({ actor_uid: null, user_email: email, created_at: iso, op_type: op });

describe('reportWindow', () => {
  it('covers the local day the 23:00 run is closing out', () => {
    // 2026-09-08 23:10 EDT is 2026-09-09 03:10 UTC.
    const w = reportWindow(new Date('2026-09-09T03:10:00Z'));
    expect(w.day).toBe('2026-09-08');
    // Midnight EDT (UTC-4) is 04:00 UTC.
    expect(w.startIso).toBe('2026-09-08T04:00:00.000Z');
    expect(w.endIso).toBe('2026-09-09T04:00:00.000Z');
  });

  it('is exactly 24 hours wide', () => {
    const w = reportWindow(new Date('2026-09-09T03:10:00Z'));
    const hours = (Date.parse(w.endIso) - Date.parse(w.startIso)) / 3600_000;
    expect(hours).toBe(24);
  });

  it('reports the previous day when the cron slips past local midnight', () => {
    // The whole reason this guard exists: a UTC schedule drifts an hour at the
    // DST change, and Hobby crons are only accurate to the hour. Firing at
    // 00:30 local must not report a day that is 23 hours empty.
    const w = reportWindow(new Date('2026-09-09T04:30:00Z')); // 00:30 EDT on the 9th
    expect(w.day).toBe('2026-09-08');
  });

  it('handles winter, when Eastern is UTC-5', () => {
    // 2026-01-15 23:10 EST is 2026-01-16 04:10 UTC.
    const w = reportWindow(new Date('2026-01-16T04:10:00Z'));
    expect(w.day).toBe('2026-01-15');
    expect(w.startIso).toBe('2026-01-15T05:00:00.000Z');
  });

  it('labels the day it actually covers', () => {
    const w = reportWindow(new Date('2026-09-09T03:10:00Z'));
    expect(w.label).toContain('September 8, 2026');
    expect(w.label).toContain('Tuesday');
  });

  it('uses Eastern', () => {
    expect(REPORT_TZ).toBe('America/New_York');
  });
});

describe('renderReport', () => {
  const w = reportWindow(new Date('2026-09-09T03:10:00Z'));

  it('ranks people and totals the day', () => {
    const r = renderReport([
      ev('a@x.com', '2026-09-08T14:00:00Z'),
      ev('a@x.com', '2026-09-08T14:20:00Z'),
      ev('b@x.com', '2026-09-08T15:00:00Z'),
    ], w);
    expect(r.people[0].label).toBe('A');
    expect(r.totalMinutes).toBe(25); // 20 for a, 5 floor for b
    expect(r.totalEvents).toBe(3);
  });

  it('says so plainly when nobody worked', () => {
    const r = renderReport([], w);
    expect(r.subject).toContain('no recorded activity');
    expect(r.text).toContain('No recorded activity');
    expect(r.html).toContain('No recorded activity');
  });

  it('always carries the estimate caveat, in both bodies', () => {
    const r = renderReport([ev('a@x.com', '2026-09-08T14:00:00Z')], w);
    expect(r.text).toContain('floor, not a timesheet');
    expect(r.html).toContain('floor, not a timesheet');
  });

  it('escapes a hostile display name instead of injecting HTML', () => {
    const r = renderReport([ev('<script>alert(1)</script>@x.com', '2026-09-08T14:00:00Z')], w);
    expect(r.html).not.toContain('<script>');
    expect(r.html).toContain('&lt;script&gt;');
  });

  it('excludes automation from the email', () => {
    const r = renderReport([
      ev('system', '2026-09-08T14:00:00Z'),
      ev('recovery-script', '2026-09-08T14:01:00Z'),
    ], w);
    expect(r.people).toHaveLength(0);
  });

  it('names the day in the subject', () => {
    const r = renderReport([ev('a@x.com', '2026-09-08T14:00:00Z')], w);
    expect(r.subject).toContain('September 8, 2026');
  });
});

describe('renderTelegram', () => {
  const w = reportWindow(new Date('2026-09-09T03:10:00Z'));

  it('is plain text with no HTML', () => {
    const t = renderTelegram(renderReport([ev('a@x.com', '2026-09-08T14:00:00Z')], w));
    expect(t).not.toContain('<');
    expect(t).toContain('A: 5m');
  });

  it('handles an empty day', () => {
    expect(renderTelegram(renderReport([], w))).toContain('No recorded activity');
  });
});

describe('fetchEvents', () => {
  const w = reportWindow(new Date('2026-09-09T03:10:00Z'));

  it('never requests the payload column', async () => {
    const urls: string[] = [];
    const fake = (async (url: string) => {
      urls.push(String(url));
      return { ok: true, json: async () => [] } as unknown as Response;
    }) as unknown as typeof fetch;
    await fetchEvents('key', w, fake);
    expect(urls[0]).toContain('select=user_email,actor_uid,created_at,op_type');
    expect(urls[0]).not.toContain('payload');
  });

  it('bounds the query to the report day', async () => {
    const urls: string[] = [];
    const fake = (async (url: string) => {
      urls.push(String(url));
      return { ok: true, json: async () => [] } as unknown as Response;
    }) as unknown as typeof fetch;
    await fetchEvents('key', w, fake);
    expect(urls[0]).toContain(encodeURIComponent(w.startIso));
    expect(urls[0]).toContain(encodeURIComponent(w.endIso));
  });

  it('throws a legible error rather than mailing an empty report', async () => {
    const fake = (async () => ({
      ok: false, status: 401, text: async () => 'Invalid API key',
    } as unknown as Response)) as unknown as typeof fetch;
    await expect(fetchEvents('stale', w, fake)).rejects.toThrow(/401/);
  });
});

describe('dailyReportConfig', () => {
  it('defaults to off with nobody on the list', () => {
    expect(DEFAULT_DAILY_REPORT.enabled).toBe(false);
    expect(hasRecipients(DEFAULT_DAILY_REPORT)).toBe(false);
  });

  it('degrades garbage to send-nothing instead of throwing', () => {
    for (const bad of [null, undefined, 'x', 42, [], { emails: 'a@b.com' }]) {
      const c = normalizeConfig(bad);
      expect(c.enabled).toBe(false);
      expect(c.emails).toEqual([]);
    }
  });

  it('drops invalid addresses rather than handing them to Resend', () => {
    const c = normalizeConfig({ enabled: true, emails: ['a@b.com', 'nope', '', 'x @y.com', 'c@d'] });
    expect(c.emails).toEqual(['a@b.com']);
  });

  it('dedupes addresses case-insensitively', () => {
    const c = normalizeConfig({ emails: ['A@B.com', 'a@b.com'] });
    expect(c.emails).toHaveLength(1);
  });

  it('accepts numeric and @name telegram chat ids, including negative groups', () => {
    expect(isValidChatId('12345')).toBe(true);
    expect(isValidChatId('-1001234567890')).toBe(true);
    expect(isValidChatId('@solaropsfeed')).toBe(true);
    expect(isValidChatId('not a chat')).toBe(false);
    expect(isValidChatId('')).toBe(false);
  });

  it('validates emails without pretending to be an RFC parser', () => {
    expect(isValidEmail('cesar.jurado@conexsol.us')).toBe(true);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('a@@b.com')).toBe(false);
    expect(isValidEmail('a b@c.com')).toBe(false);
  });

  it('enabled with an empty list is not a deliverable config', () => {
    expect(hasRecipients(normalizeConfig({ enabled: true, emails: [] }))).toBe(false);
  });
});

describe('runDailyReport orchestration', () => {
  const NOW = new Date('2026-09-09T03:10:00Z');

  /** Fake PostgREST + Resend + Telegram. Records every outbound call. */
  function harness(cfg: unknown, events: RawEvent[] = [], opts: { resendOk?: boolean } = {}) {
    const calls: Array<{ url: string; body?: unknown }> = [];
    const fake = (async (url: string, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (u.includes('/rest/v1/app_data')) {
        return { ok: true, json: async () => (cfg === undefined ? [] : [{ value: cfg }]) } as unknown as Response;
      }
      if (u.includes('/rest/v1/change_log')) {
        return { ok: true, json: async () => events } as unknown as Response;
      }
      if (u.includes('api.resend.com')) {
        return { ok: opts.resendOk !== false, status: opts.resendOk === false ? 422 : 200,
                 text: async () => 'bad', json: async () => ({}) } as unknown as Response;
      }
      if (u.includes('api.telegram.org')) {
        return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
      }
      throw new Error('unexpected url ' + u);
    }) as unknown as typeof fetch;
    return { fake, calls };
  }

  it('errors clearly when the service key is missing', async () => {
    const { fake } = harness({ enabled: true, emails: ['a@b.com'] });
    const r = await runDailyReport({ serviceRoleKey: '' }, NOW, fake);
    expect(r.status).toBe('error');
    expect(r.reason).toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('stays quiet when switched off', async () => {
    const { fake, calls } = harness({ enabled: false, emails: ['a@b.com'] });
    const r = await runDailyReport({ serviceRoleKey: 'k', resendApiKey: 'r' }, NOW, fake);
    expect(r.status).toBe('skipped');
    expect(calls.some(c => c.url.includes('resend'))).toBe(false);
  });

  it('stays quiet when there are no recipients', async () => {
    const { fake, calls } = harness({ enabled: true, emails: [] });
    const r = await runDailyReport({ serviceRoleKey: 'k', resendApiKey: 'r' }, NOW, fake);
    expect(r.status).toBe('skipped');
    expect(r.reason).toContain('no recipients');
    expect(calls.some(c => c.url.includes('change_log'))).toBe(false);
  });

  it('treats a missing config row as off, rather than crashing', async () => {
    const { fake } = harness(undefined);
    const r = await runDailyReport({ serviceRoleKey: 'k' }, NOW, fake);
    expect(r.status).toBe('skipped');
  });

  it('sends one email to the whole list with the report body', async () => {
    const { fake, calls } = harness(
      { enabled: true, emails: ['a@b.com', 'c@d.com'] },
      [ev('worker@x.com', '2026-09-08T14:00:00Z'), ev('worker@x.com', '2026-09-08T14:30:00Z')],
    );
    const r = await runDailyReport({ serviceRoleKey: 'k', resendApiKey: 'r' }, NOW, fake);
    expect(r.status).toBe('sent');
    expect(r.people).toBe(1);
    expect(r.totalMinutes).toBe(30);
    const mail = calls.find(c => c.url.includes('resend'))!.body as Record<string, unknown>;
    expect(mail.to).toEqual(['a@b.com', 'c@d.com']);
    expect(String(mail.subject)).toContain('September 8, 2026');
    expect(String(mail.text)).toContain('floor, not a timesheet');
  });

  it('reports a Resend failure instead of claiming it sent', async () => {
    const { fake } = harness({ enabled: true, emails: ['a@b.com'] }, [], { resendOk: false });
    const r = await runDailyReport({ serviceRoleKey: 'k', resendApiKey: 'r' }, NOW, fake);
    expect(r.deliveries?.find(d => d.channel === 'email')?.ok).toBe(false);
  });

  it('says the key is missing rather than silently dropping the email', async () => {
    const { fake } = harness({ enabled: true, emails: ['a@b.com'] });
    const r = await runDailyReport({ serviceRoleKey: 'k' }, NOW, fake);
    expect(r.deliveries?.[0]).toMatchObject({ channel: 'email', ok: false });
    expect(r.deliveries?.[0].detail).toContain('RESEND_API_KEY');
  });

  it('stays inert on Telegram until a bot token exists', async () => {
    const { fake, calls } = harness({ enabled: true, telegramChatIds: ['123'] });
    const r = await runDailyReport({ serviceRoleKey: 'k' }, NOW, fake);
    expect(calls.some(c => c.url.includes('telegram'))).toBe(false);
    expect(r.deliveries?.[0].detail).toContain('TELEGRAM_BOT_TOKEN');
  });

  it('sends one Telegram message per chat id, as plain text', async () => {
    const { fake, calls } = harness(
      { enabled: true, telegramChatIds: ['123', '-100999'] },
      [ev('worker@x.com', '2026-09-08T14:00:00Z')],
    );
    const r = await runDailyReport({ serviceRoleKey: 'k', telegramBotToken: 't' }, NOW, fake);
    const tg = calls.filter(c => c.url.includes('telegram'));
    expect(tg).toHaveLength(2);
    expect((tg[0].body as Record<string, unknown>).chat_id).toBe('123');
    // parse_mode must stay unset: display names are user-controlled and would
    // break or mangle a Markdown send.
    expect((tg[0].body as Record<string, unknown>).parse_mode).toBeUndefined();
    expect(r.deliveries?.every(d => d.ok)).toBe(true);
  });

  it('delivers to both channels when both are configured', async () => {
    const { fake, calls } = harness({ enabled: true, emails: ['a@b.com'], telegramChatIds: ['9'] });
    await runDailyReport({ serviceRoleKey: 'k', resendApiKey: 'r', telegramBotToken: 't' }, NOW, fake);
    expect(calls.some(c => c.url.includes('resend'))).toBe(true);
    expect(calls.some(c => c.url.includes('telegram'))).toBe(true);
  });

  it('still sends the email when Telegram is misconfigured', async () => {
    const { fake } = harness({ enabled: true, emails: ['a@b.com'], telegramChatIds: ['9'] });
    const r = await runDailyReport({ serviceRoleKey: 'k', resendApiKey: 'r' }, NOW, fake);
    expect(r.deliveries?.find(d => d.channel === 'email')?.ok).toBe(true);
    expect(r.deliveries?.find(d => d.channel === 'telegram')?.ok).toBe(false);
  });
});

describe('sender override', () => {
  const NOW = new Date('2026-09-09T03:10:00Z');

  function harness(cfg: unknown) {
    const calls: Array<{ url: string; body?: Record<string, unknown> }> = [];
    const fake = (async (url: string, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (u.includes('app_data')) return { ok: true, json: async () => [{ value: cfg }] } as unknown as Response;
      if (u.includes('change_log')) return { ok: true, json: async () => [] } as unknown as Response;
      return { ok: true, status: 200, text: async () => '', json: async () => ({}) } as unknown as Response;
    }) as unknown as typeof fetch;
    return { fake, calls };
  }

  it('sends from the conexsol address by default', async () => {
    const { fake, calls } = harness({ enabled: true, emails: ['a@b.com'] });
    await runDailyReport({ serviceRoleKey: 'k', resendApiKey: 'r' }, NOW, fake);
    const mail = calls.find(c => c.url.includes('resend'))!.body!;
    expect(mail.from).toBe('SolarOps <solar.ops@conexsol.us>');
  });

  it('honours an override, so it can be tested before the domain verifies', async () => {
    const { fake, calls } = harness({ enabled: true, emails: ['a@b.com'] });
    await runDailyReport(
      { serviceRoleKey: 'k', resendApiKey: 'r', from: 'X <onboarding@resend.dev>' }, NOW, fake,
    );
    const mail = calls.find(c => c.url.includes('resend'))!.body!;
    expect(mail.from).toBe('X <onboarding@resend.dev>');
    // reply_to stays on the real address regardless
    expect(mail.reply_to).toBe('solar.ops@conexsol.us');
  });
});

describe('text body grammar', () => {
  const w = reportWindow(new Date('2026-09-09T03:10:00Z'));
  it('says person for one and people for many', () => {
    const one = renderReport([ev('a@x.com', '2026-09-08T14:00:00Z')], w);
    expect(one.text).toContain('across 1 person,');
    const two = renderReport([
      ev('a@x.com', '2026-09-08T14:00:00Z'),
      ev('b@x.com', '2026-09-08T14:00:00Z'),
    ], w);
    expect(two.text).toContain('across 2 people,');
  });
});
