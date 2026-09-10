// SolarOps, end-of-day workload report configuration.
//
// Lives in app_data (a KV_SYNC_KEYS key) rather than localStorage because the
// nightly cron reads it SERVER-SIDE. A browser-only setting would be invisible
// to the job that actually sends the mail.
//
// Single-writer by nature (an admin edits it in Settings), so it needs no
// KV_MERGERS entry: last write wins is the correct behaviour here.

/** The app_data key. Must also appear in KV_SYNC_KEYS or it never syncs. */
export const DAILY_REPORT_KEY = 'solarops_daily_report';

export interface DailyReportConfig {
  enabled: boolean;
  /** Email recipients. Empty means nobody is mailed. */
  emails: string[];
  /** Telegram chat ids. Empty means Telegram is skipped. */
  telegramChatIds: string[];
}

export const DEFAULT_DAILY_REPORT: DailyReportConfig = {
  enabled: false,
  emails: [],
  telegramChatIds: [],
};

/**
 * Deliberately permissive: this only stops obvious typos reaching Resend, it is
 * not an RFC 5322 parser. A bad address costs one bounced send, so the cheap
 * check is the right one.
 */
export function isValidEmail(value: string): boolean {
  const v = value.trim();
  if (v.length === 0 || v.length > 254) return false;
  if (/\s/.test(v)) return false;
  const at = v.indexOf('@');
  if (at <= 0 || at !== v.lastIndexOf('@')) return false;
  const domain = v.slice(at + 1);
  return domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.');
}

/** Telegram chat ids are integers, negative for groups, or an @channelname. */
export function isValidChatId(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (/^-?\d{1,20}$/.test(v)) return true;
  return /^@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(v);
}

/**
 * Coerce whatever is in app_data into a usable config.
 *
 * This runs on data that a nightly job will act on unattended, so it never
 * throws and never trusts the shape: a half-written or hand-edited row degrades
 * to "send nothing" rather than crashing the cron or mailing a garbage list.
 */
export function normalizeConfig(raw: unknown): DailyReportConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_DAILY_REPORT };
  const o = raw as Record<string, unknown>;

  const clean = (v: unknown, ok: (s: string) => boolean): string[] => {
    if (!Array.isArray(v)) return [];
    const out: string[] = [];
    for (const item of v) {
      if (typeof item !== 'string') continue;
      const t = item.trim();
      // Case-insensitive dedupe: two spellings of one address is two emails.
      if (ok(t) && !out.some(x => x.toLowerCase() === t.toLowerCase())) out.push(t);
    }
    return out;
  };

  return {
    enabled: o['enabled'] === true,
    emails: clean(o['emails'], isValidEmail),
    telegramChatIds: clean(o['telegramChatIds'], isValidChatId),
  };
}

/** True if this config would actually deliver anything. */
export function hasRecipients(c: DailyReportConfig): boolean {
  return c.emails.length > 0 || c.telegramChatIds.length > 0;
}
