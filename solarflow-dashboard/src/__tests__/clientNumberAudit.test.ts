// The nightly client-number audit (api/_clientNumberAudit.ts), driven through a
// fake fetch: the sheet CSV, the database audit call, the mirror writes and the
// admin bell are all recorded and asserted on.
import { describe, it, expect } from 'vitest';
import {
  parseSheetCsv, summarize, attentionMessage, runClientNumberAudit, alertAdmins, type AuditRow,
} from '../../../api/_clientNumberAudit';

const CSV = [
  '"","Accounts","Name","DESCRIPTION","STATUS "',
  '"1","US-15015","Daniel Matos Residence","","SALES"',
  '"2","US-15019 ","rbi BK","",""',
  '"3","US-15703","Cherrington","",""',
  '"4","US-15704","","",""',
  '"5","","stray row with no number","",""',
  '"6","US-15705","Say ""Hi"" Co","",""',
].join('\n');

const env = { supabaseUrl: 'https://db.example', serviceRoleKey: 'service-key', registryUrl: 'https://sheet.example/exec' };

function fakeFetch(auditRows: AuditRow[], opts: { sheetDown?: boolean; auditStatus?: number } = {}) {
  const calls: Array<{ url: string; body?: string }> = [];
  const impl = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, body: init?.body as string | undefined });
    const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });
    if (u.includes('docs.google.com')) return opts.sheetDown ? new Response('nope', { status: 503 }) : new Response(CSV);
    if (u.endsWith('/rpc/client_number_audit')) return json(auditRows, opts.auditStatus ?? 200);
    if (u.startsWith(env.registryUrl)) {
      const b = JSON.parse(String(init?.body));
      return json({ clientId: b.clientId, name: b.name });
    }
    if (u.includes('/user_roles')) return json([{ user_id: 'admin-1' }, { user_id: 'admin-2' }]);
    if (u.includes('/notifications')) return new Response(null, { status: 201 });
    return new Response('unexpected', { status: 500 });
  }) as typeof fetch;
  return { impl, calls };
}

describe('parseSheetCsv', () => {
  it('reads account + name, trims stray spaces, skips rows without a number, unescapes quotes', () => {
    expect(parseSheetCsv(CSV)).toEqual([
      ['US-15015', 'Daniel Matos Residence'],
      ['US-15019', 'rbi BK'],
      ['US-15703', 'Cherrington'],
      ['US-15704', ''],
      ['US-15705', 'Say "Hi" Co'],
    ]);
  });
});

describe('summarize / attentionMessage', () => {
  it('is silent when only routine kinds come back', () => {
    const s = summarize([
      { kind: 'shared', client: 'US-15655', detail: 'a | b' },  // 13 known legacy pairs: logged, no bell
      { kind: 'bound', client: 'US-15704', detail: 'cust-1' },
      { kind: 'unmirrored', client: 'US-15704', detail: 'Arlyn Pabon' },
    ], 1);
    expect(s.status).toBe('ok');
    expect(attentionMessage(s)).toBeNull();
    expect(s.counts).toEqual({ shared: 1, bound: 1, unmirrored: 1 });
  });

  it('rings for a leak, a hand-typed sheet name, and an ownership disagreement', () => {
    const s = summarize([
      { kind: 'tracked-from-customer', client: 'US-15706', detail: 'Leaky Customer' },
      { kind: 'imported-from-sheet', client: 'US-15707', detail: 'Joe Manual' },
      { kind: 'mismatch-sheet', client: 'US-15682', detail: 'registry: Travis Fullenkamp / sheet: Carlos Bernal' },
    ], 0);
    expect(s.status).toBe('issues');
    const m = attentionMessage(s)!;
    expect(m.title).toBe('Client numbers: 3 to review');
    expect(m.message).toContain('never issued by SolarOps');
    expect(m.message).toContain('typed into the sheet by hand');
    expect(m.message).toContain('Carlos Bernal');
  });
});

describe('runClientNumberAudit', () => {
  it('sends the parsed sheet to the database and mirrors blank rows', async () => {
    const f = fakeFetch([{ kind: 'unmirrored', client: 'US-15704', detail: 'Arlyn Pabon' }]);
    const s = await runClientNumberAudit(env, f.impl);
    const audit = f.calls.find(c => c.url.endsWith('/rpc/client_number_audit'))!;
    expect(JSON.parse(audit.body!).p_sheet).toHaveLength(5);
    const mirror = f.calls.find(c => c.url === env.registryUrl)!;
    expect(JSON.parse(mirror.body!)).toEqual({ name: 'Arlyn Pabon', clientId: 'US-15704' });
    expect(s).toMatchObject({ status: 'ok', mirrored: 1 });
  });

  it('caps the mirror writes per night', async () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({ kind: 'unmirrored', client: `US-${15704 + i}`, detail: `N${i}` }));
    const f = fakeFetch(rows);
    await runClientNumberAudit(env, f.impl);
    expect(f.calls.filter(c => c.url === env.registryUrl)).toHaveLength(25);
  });

  it('still heals the customer side when the sheet is down, and says the sheet half was skipped', async () => {
    const f = fakeFetch([]);
    const down = fakeFetch([], { sheetDown: true });
    const s = await runClientNumberAudit(env, down.impl);
    expect(JSON.parse(down.calls.find(c => c.url.endsWith('/rpc/client_number_audit'))!.body!).p_sheet).toEqual([]);
    expect(down.calls.some(c => c.url === env.registryUrl)).toBe(false);
    expect(s.status).toBe('issues');
    expect(s.attention.join(' ')).toMatch(/sheet unreadable/);
    void f;
  });

  it('reports a database failure instead of pretending all is well', async () => {
    const f = fakeFetch([], { auditStatus: 500 });
    const s = await runClientNumberAudit(env, f.impl);
    expect(s.status).toBe('error');
    expect(attentionMessage(s)?.title).toBe('Client number check failed');
  });

  it('refuses to run without the service key', async () => {
    const s = await runClientNumberAudit({ ...env, serviceRoleKey: '' }, fakeFetch([]).impl);
    expect(s).toMatchObject({ status: 'error', reason: 'SUPABASE_SERVICE_ROLE_KEY not set' });
  });
});

describe('alertAdmins', () => {
  it('writes one bell per admin when something needs a human', async () => {
    const f = fakeFetch([]);
    const n = await alertAdmins(env, summarize([{ kind: 'mismatch-sheet', client: 'US-15682', detail: 'x' }], 0), f.impl);
    expect(n).toBe(2);
    const body = JSON.parse(f.calls.find(c => c.url.includes('/notifications'))!.body!);
    expect(body.map((r: { user_id: string }) => r.user_id)).toEqual(['admin-1', 'admin-2']);
    expect(body[0]).toMatchObject({ type: 'client_number_audit', read: false });
  });

  it('stays silent when clean', async () => {
    const f = fakeFetch([]);
    expect(await alertAdmins(env, summarize([], 0), f.impl)).toBe(0);
    expect(f.calls).toHaveLength(0);
  });
});
