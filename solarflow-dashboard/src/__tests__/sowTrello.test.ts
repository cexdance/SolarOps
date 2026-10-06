// SOW report -> Trello card as a PDF (2026-10-05).
// pickBreaks decides where the PDF's pages end; the server route attaches the
// stored PDF to the order's own card and replaces only that order's old copy.
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { Readable } from 'node:stream';
import { pickBreaks } from '../lib/sowPdf';

describe('pickBreaks', () => {
  it('ends each page at the lowest block top that fits', () => {
    // page height 1000; blocks start at 400, 900, 1300, 1950
    expect(pickBreaks([400, 900, 1300, 1950], 2500, 1000)).toEqual([900, 1300, 1950]);
  });

  it('cuts at the full page height when no block top fits past 30%', () => {
    expect(pickBreaks([100, 200], 2500, 1000)).toEqual([1000, 2000]);
  });

  it('a short report is one page', () => {
    expect(pickBreaks([300, 600], 900, 1000)).toEqual([]);
  });
});

vi.mock('../../../api/_auth', () => ({ requireUser: async () => ({ id: 'u1' }) }));

const JOB = 'job-1790862465567-hnpadq';
const CARD = '6aa1d93d17258a6b5682fe86';
const BOARD = '6a5a58e06fbf97144b5d96c9';
type Handler = (req: unknown, res: unknown) => Promise<unknown>;
let handler: Handler;

beforeAll(async () => {
  vi.stubEnv('TRELLO_API_KEY', 'k');
  vi.stubEnv('TRELLO_API_TOKEN', 't');
  vi.resetModules();
  handler = (await import('../../../api/trello-card')).default as Handler;
});
afterEach(() => vi.unstubAllGlobals());

function call(body: object) {
  const req = Object.assign(Readable.from([JSON.stringify(body)]), { method: 'POST', query: { sowPdf: '1' }, headers: {} });
  let status = 0; let json: Record<string, unknown> = {};
  const res = { status(s: number) { status = s; return res; }, json(j: Record<string, unknown>) { json = j; return res; }, setHeader() { return res; } };
  return handler(req, res).then(() => ({ status, json }));
}

describe('POST /api/trello-card?sowPdf', () => {
  it("attaches the stored PDF to the order's card and removes only that order's older copy", async () => {
    const calls: { url: string; method: string }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { method?: string }) => {
      const method = init?.method ?? 'GET';
      calls.push({ url, method });
      const ok = (j: unknown) => ({ ok: true, status: 200, json: async () => j });
      if (url.includes('/rest/v1/app_data')) return ok([{ trelloCardId: CARD, woNumber: 'SO-2610-62845' }]);
      if (url.includes(`/cards/${CARD}?fields=idBoard`)) return ok({ idBoard: BOARD });
      if (url.includes('/storage/v1/object/customer-files/sow-reports/')) return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode('%PDF-1.7 test').buffer };
      if (url.includes('/attachments?key=') && method === 'POST') return ok({ id: 'new', url: 'https://trello.com/att/new' });
      if (url.includes('/attachments?fields=name')) return ok([
        { id: 'new', name: 'SOW SO-2610-62845.pdf' },
        { id: 'old', name: 'SOW SO-2610-62845.pdf' },
        { id: 'other', name: 'SOW SO-2609-95542.pdf' },
      ]);
      return ok({});
    }));
    const { status, json } = await call({ jobId: JOB });
    expect(status).toBe(200);
    expect(json.cardUrl).toBe(`https://trello.com/c/${CARD}`);
    // The server built the storage path from the job id itself.
    expect(calls.some(c => c.url.endsWith(`/sow-reports/${JOB}/sow.pdf`))).toBe(true);
    const deletes = calls.filter(c => c.method === 'DELETE').map(c => c.url);
    expect(deletes).toHaveLength(1);
    expect(deletes[0]).toContain('/attachments/old?');
  });

  it('refuses an order with no Trello card', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [{ woNumber: 'SO-1' }] })));
    const { status } = await call({ jobId: 'job-123' });
    expect(status).toBe(409);
  });

  it('rejects a malformed job id before touching anything', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const { status } = await call({ jobId: '../../etc' });
    expect(status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });
});
