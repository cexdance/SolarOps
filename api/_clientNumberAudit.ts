/**
 * Nightly client-number audit. Runs from the daily cron on /api/notify, beside
 * (not inside) the daily report, so switching the report off in Settings can
 * never switch this off too.
 *
 * Postgres owns client numbers (public.client_numbers); the Google Sheet is a
 * mirror the office reads and sometimes types into. Once a night this:
 *
 *   1. reads the sheet (it is link-readable, so no credentials),
 *   2. calls public.client_number_audit(sheet), which HEALS what is always safe:
 *      records any number a customer carries that the allocator never issued,
 *      imports any name typed into the sheet by hand, and binds unbound claims,
 *   3. writes allocated names into blank sheet rows (the mirror catching up
 *      after a failed write), a capped number per night,
 *   4. rings admins only for what can cause a collision: a number that reached
 *      a customer without the allocator, a name typed into the sheet by hand,
 *      and an order whose number disagrees with its customer's. Sheet spelling
 *      differences and the legacy shared pairs are logged every night.
 *
 * Module scope only declares constants and functions: Vercel bundles what it can
 * statically trace, and this file is imported statically by notify.ts.
 */

const SHEET_CSV_URL =
  'https://docs.google.com/spreadsheets/d/169naSCBMVcWNU15Z-UUfKo-Ss48kPEC0AvBCPDjQcKY/gviz/tq?tqx=out:csv&gid=71851483';

/** A bad night (say the sheet's names all shifted a row) must not rewrite hundreds of rows. */
const MAX_MIRROR_FIXES = 25;

export interface AuditEnv {
  supabaseUrl: string;
  serviceRoleKey: string;
  /** The Apps Script /exec URL; without it the mirror step is skipped. */
  registryUrl?: string;
}

export interface AuditRow { kind: string; client: string; detail: string }

export interface AuditSummary {
  status: 'ok' | 'issues' | 'error';
  counts: Record<string, number>;
  /** Blank sheet rows filled from the registry tonight. */
  mirrored: number;
  /** Human-readable lines for the kinds that need someone to look. */
  attention: string[];
  reason?: string;
}

/** Kinds that mean a human should look. Healed and routine kinds are excluded. */
// Only events that can cause a collision ring the bell. Sheet spelling
// differences (mismatch-sheet) are logged, not rung: Postgres owns the numbers,
// so a misspelled name in the mirror cannot hand a number out twice, and the
// first run found 44 of them, mostly typos. A bell that always rings is ignored.
const NEEDS_ATTENTION = new Set(['tracked-from-customer', 'imported-from-sheet', 'mismatch-job']);

/**
 * The sheet as [[clientId, name], ...]. gviz quotes every cell; column B is the
 * account number and column C the name. Rows without a US-number are skipped.
 */
export function parseSheetCsv(csv: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const line of csv.split('\n').slice(1)) {
    const cells = (line.match(/"((?:[^"]|"")*)"/g) ?? []).map(c => c.slice(1, -1).replace(/""/g, '"'));
    const cid = (cells[1] ?? '').trim().toUpperCase().replace(/\s+/g, '');
    if (!/^US-\d{5}$/.test(cid)) continue;
    out.push([cid, (cells[2] ?? '').trim()]);
  }
  return out;
}

export function summarize(rows: AuditRow[], mirrored: number): AuditSummary {
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.kind] = (counts[r.kind] ?? 0) + 1;
  const attention = rows
    .filter(r => NEEDS_ATTENTION.has(r.kind))
    .map(r => `${r.client}: ${
      r.kind === 'tracked-from-customer' ? `on "${r.detail}" but never issued by SolarOps (now recorded)`
      : r.kind === 'imported-from-sheet' ? `"${r.detail}" typed into the sheet by hand (now recorded)`
      : r.detail}`);
  return { status: attention.length ? 'issues' : 'ok', counts, mirrored, attention };
}

/** The bell text, or null when nothing needs a human. */
export function attentionMessage(s: AuditSummary): { title: string; message: string } | null {
  if (s.status === 'ok') return null;
  if (s.status === 'error') {
    return { title: 'Client number check failed', message: `The nightly client number check could not run: ${s.reason ?? 'unknown error'}.` };
  }
  const shown = s.attention.slice(0, 6).join('; ');
  const more = s.attention.length > 6 ? `; and ${s.attention.length - 6} more` : '';
  return {
    title: `Client numbers: ${s.attention.length} to review`,
    message: `${shown}${more}.`,
  };
}

export async function runClientNumberAudit(env: AuditEnv, fetchImpl: typeof fetch = fetch): Promise<AuditSummary> {
  if (!env.serviceRoleKey) return { status: 'error', counts: {}, mirrored: 0, attention: [], reason: 'SUPABASE_SERVICE_ROLE_KEY not set' };

  // 1. The sheet. If it cannot be read, still run the customer-side healing,
  //    which needs no sheet, and say the sheet half was skipped.
  let sheet: Array<[string, string]> = [];
  let sheetNote = '';
  try {
    const res = await fetchImpl(`${SHEET_CSV_URL}&t=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    sheet = parseSheetCsv(await res.text());
    if (sheet.length === 0) throw new Error('no rows parsed');
  } catch (err) {
    sheet = [];
    sheetNote = `sheet unreadable (${(err as Error).message}), sheet checks skipped`;
  }

  // 2. The audit itself, in the database.
  const rpc = await fetchImpl(`${env.supabaseUrl}/rest/v1/rpc/client_number_audit`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.serviceRoleKey}`,
      apikey: env.serviceRoleKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_sheet: sheet }),
  });
  if (!rpc.ok) {
    const detail = (await rpc.text().catch(() => '')).slice(0, 200);
    return { status: 'error', counts: {}, mirrored: 0, attention: [], reason: `client_number_audit HTTP ${rpc.status} ${detail}` };
  }
  const rows = (await rpc.json()) as AuditRow[];

  // 3. The mirror catching up: registry names into blank sheet rows. The
  //    Apps Script only ever writes a blank row, so this cannot overwrite anyone.
  let mirrored = 0;
  if (env.registryUrl && sheet.length) {
    for (const r of rows.filter(x => x.kind === 'unmirrored').slice(0, MAX_MIRROR_FIXES)) {
      try {
        const res = await fetchImpl(env.registryUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ name: r.detail, clientId: r.client }),
        });
        const data = res.ok ? await res.json() : null;
        if (data && !data.error && !data.taken) mirrored++;
      } catch {
        // Next night tries again.
      }
    }
  }

  const summary = summarize(rows, mirrored);
  if (sheetNote) {
    summary.attention.push(sheetNote);
    summary.status = 'issues';
  }
  return summary;
}

/**
 * One bell per admin when the audit needs a human. Silent when clean. Returns
 * how many notifications were written.
 */
export async function alertAdmins(env: AuditEnv, s: AuditSummary, fetchImpl: typeof fetch = fetch): Promise<number> {
  const msg = attentionMessage(s);
  if (!msg || !env.serviceRoleKey) return 0;
  const headers = {
    Authorization: `Bearer ${env.serviceRoleKey}`,
    apikey: env.serviceRoleKey,
    'Content-Type': 'application/json',
  };
  const who = await fetchImpl(`${env.supabaseUrl}/rest/v1/user_roles?role=eq.admin&select=user_id`, { headers });
  if (!who.ok) throw new Error(`user_roles HTTP ${who.status}`);
  const admins = (await who.json()) as Array<{ user_id: string }>;
  if (admins.length === 0) return 0;
  const now = new Date().toISOString();
  const rows = admins.map(a => ({
    id: `notif-${a.user_id}-cnaudit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    user_id: a.user_id,
    type: 'client_number_audit',
    title: msg.title,
    message: msg.message,
    related_job_id: null,
    related_customer_id: null,
    related_activity_id: null,
    read: false,
    created_at: now,
  }));
  const ins = await fetchImpl(`${env.supabaseUrl}/rest/v1/notifications`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify(rows),
  });
  if (!ins.ok) throw new Error(`notifications HTTP ${ins.status} ${(await ins.text().catch(() => '')).slice(0, 200)}`);
  return rows.length;
}
