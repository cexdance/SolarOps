// SOW report emailed to the office as a PDF (2026-10-06).
//
// The twin of sowTrello: the browser has already put the PDF in Storage, and
// this route mails that stored file through the shared IONOS mailbox. Resend is
// deliberately not used here because conexsol.us is unverified there.
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';

vi.mock('../../../api/_auth', () => ({ requireUser: async () => ({ id: 'u1' }) }));

const sent: { to: string; subject: string; attachments?: { filename: string; content: Buffer }[] }[] = [];
let sendShouldThrow = false;
vi.mock('../../../api/_mailbox', () => ({
  decryptMailbox: () => ({
    email: 'ops@conexsol.us', password: 'p',
    smtpHost: 'smtp.ionos.com', smtpPort: 465, imapHost: 'imap.ionos.com',
  }),
  mailboxFromEnv: () => null,
  sendMailboxMessage: async (_cfg: unknown, msg: { to: string; subject: string; attachments?: { filename: string; content: Buffer }[] }) => {
    if (sendShouldThrow) throw new Error('535 auth failed for ops@conexsol.us');
    sent.push(msg);
  },
}));

type Handler = (req: unknown, res: unknown) => Promise<unknown>;
let handler: Handler;
const JOB = 'job-1790862465567-hnpadq';

beforeAll(async () => {
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'svc');
  vi.resetModules();
  handler = (await import('../../../api/_sowEmail')).default as Handler;
});
afterEach(() => { vi.unstubAllGlobals(); sent.length = 0; sendShouldThrow = false; });

function call(body: object, method = 'POST') {
  const req = { method, body, query: {}, headers: {} };
  let status = 0; let json: Record<string, unknown> = {};
  const res = {
    status(s: number) { status = s; return res; },
    json(j: Record<string, unknown>) { json = j; return res; },
    setHeader() { return res; },
  };
  return handler(req, res).then(() => ({ status, json }));
}

/** PostgREST + Storage + shared_mailbox, with the PDF bytes swappable. */
function stubBackend(opts: { pdf?: string; job?: object | null; mailboxRow?: boolean } = {}) {
  const calls: string[] = [];
  const pdfBody = opts.pdf ?? '%PDF-1.7 report';
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    calls.push(url);
    const ok = (j: unknown) => ({ ok: true, status: 200, json: async () => j });
    if (url.includes('/rest/v1/app_data')) {
      return ok(opts.job === null ? [] : [opts.job ?? { woNumber: 'SO-2610-62845', clientName: 'Jim Bowen', siteAddress: '1 Main St' }]);
    }
    if (url.includes('/storage/v1/object/customer-files/sow-reports/')) {
      return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode(pdfBody).buffer };
    }
    if (url.includes('/rest/v1/shared_mailbox')) {
      return ok(opts.mailboxRow === false ? [] : [{ encrypted_config: 'enc' }]);
    }
    return ok({});
  }));
  return calls;
}

describe('POST /api/users?sowEmail=1', () => {
  it('mails the stored PDF to the configured office address', async () => {
    const calls = stubBackend();
    const { status, json } = await call({ jobId: JOB });
    expect(status).toBe(200);
    expect(json.to).toBe('anthony.lopez@conexsol.us');
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('anthony.lopez@conexsol.us');
    expect(sent[0].subject).toContain('SO-2610-62845');
    // The path is built from the job id, so a request can only mail its own report.
    expect(calls.some(u => u.endsWith(`/sow-reports/${JOB}/sow.pdf`))).toBe(true);
  });

  it('attaches the report as a PDF named after the order', async () => {
    stubBackend();
    await call({ jobId: JOB });
    const att = sent[0].attachments?.[0];
    expect(att?.filename).toBe('SOW SO-2610-62845.pdf');
    expect(att?.content.subarray(0, 4).toString('latin1')).toBe('%PDF');
  });

  it('rejects a malformed job id before touching anything', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const { status } = await call({ jobId: '../../etc/passwd' });
    expect(status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });

  it('404s an unknown order', async () => {
    stubBackend({ job: null });
    const { status } = await call({ jobId: JOB });
    expect(status).toBe(404);
    expect(sent).toHaveLength(0);
  });

  it('refuses to mail a stored file that is not a PDF', async () => {
    // The upload is a plain Storage PUT, so the bytes are checked before the
    // company mailbox sends them anywhere.
    stubBackend({ pdf: '<html>nope' });
    const { status } = await call({ jobId: JOB });
    expect(status).toBe(400);
    expect(sent).toHaveLength(0);
  });

  it('explains itself when no mailbox is configured', async () => {
    stubBackend({ mailboxRow: false });
    const { status, json } = await call({ jobId: JOB });
    expect(status).toBe(503);
    expect(String(json.error)).toMatch(/mailbox/i);
  });

  it('never leaks the provider error, which can echo the mailbox address', async () => {
    stubBackend();
    sendShouldThrow = true;
    const { status, json } = await call({ jobId: JOB });
    expect(status).toBe(502);
    expect(String(json.error)).not.toContain('ops@conexsol.us');
    expect(String(json.error)).not.toContain('535');
  });

  it('rejects a non-POST', async () => {
    const { status } = await call({ jobId: JOB }, 'GET');
    expect(status).toBe(405);
  });
});

describe('SOW email subject', () => {
  it('carries client number, name, service type and order, on one line', async () => {
    const { sowSubject } = await import('../../../api/_sowEmail');
    expect(sowSubject('SO-2610-98331', 'US-15715', 'Ron Devilliers ', 'Inverter Commissioning Only'))
      .toBe('SOW Completion Report, US-15715 Ron Devilliers, Inverter Commissioning Only, SO-2610-98331');
    expect(sowSubject('SO-1', undefined, 'A\r\nBcc: x@y.z')).toBe('SOW Completion Report, A Bcc: x@y.z, SO-1');
  });
});
