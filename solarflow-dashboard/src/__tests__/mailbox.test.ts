// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkMailbox, decryptMailbox, encryptMailbox, mailboxFromEnv, validateMailbox } from '../../../api/_mailbox';
import handler from '../../../api/_mailboxHandler';
import { requireUser } from '../../../api/_auth';
vi.mock('../../../api/_auth', () => ({ requireUser: vi.fn() }));
vi.mock('../../../api/_mailbox', async importOriginal => ({
  ...await importOriginal<typeof import('../../../api/_mailbox')>(),
  checkMailbox: vi.fn(),
}));

const config = { email: 'office@example.com', password: 'secret-password', smtpHost: 'smtp.ionos.com', smtpPort: 465 as const, imapHost: 'imap.ionos.com' };
const key = 'ab'.repeat(32);
describe('mailbox credential protection', () => {
  it('uses authenticated randomized encryption and rejects tampering or the wrong key', () => {
    const first = encryptMailbox(config, key);
    expect(first).not.toContain(config.password);
    expect(encryptMailbox(config, key)).not.toBe(first);
    expect(decryptMailbox(first, key)).toEqual(config);
    expect(() => decryptMailbox(first, 'cd'.repeat(32))).toThrow();
    const parts = first.split('.');
    parts[3] = Buffer.from('tampered').toString('base64');
    expect(() => decryptMailbox(parts.join('.'), key)).toThrow();
    expect(() => encryptMailbox(config, 'short-key')).toThrow();
  });
  it('rejects arbitrary SMTP/IMAP targets and insecure ports', () => {
    for (const override of [{ smtpHost: '127.0.0.1' }, { imapHost: '169.254.169.254' }, { smtpPort: 25 }, { smtpHost: 'smtp.ionos.com.attacker.com' }, { email: 'a@example.com\r\nBcc: b@example.com' }]) {
      expect(() => validateMailbox({ ...config, ...override })).toThrow();
    }
  });
  it('reuses server SMTP credentials with matching IONOS IMAP host', () => {
    expect(mailboxFromEnv({ SMTP_USER: config.email, SMTP_PASSWORD: config.password, SMTP_HOST: config.smtpHost, SMTP_PORT: '465' })).toEqual(config);
    expect(mailboxFromEnv({})).toBeNull();
  });
});

function response() {
  return { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
}
beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(requireUser).mockResolvedValue({ id: 'admin-id', user_metadata: { role: 'admin' } });
  process.env.MAILBOX_ENCRYPTION_KEY = key;
  vi.mocked(checkMailbox).mockReset();
});
describe('mailbox endpoint authorization and redaction', () => {
  it('does not access storage or providers for unauthenticated requests', async () => {
    vi.mocked(requireUser).mockResolvedValue(null);
    const fetcher = vi.spyOn(globalThis, 'fetch');
    await handler({ method: 'GET' } as never, response() as never);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects a metadata admin without the trusted database admin role', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([{ role: 'support' }])));
    const res = response();
    await handler({ method: 'GET' } as never, res as never);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('returns mailbox metadata without credentials or ciphertext', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify([{ role: 'admin' }])))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ encrypted_config: encryptMailbox(config, key) }])));
    const res = response();
    await handler({ method: 'GET' } as never, res as never);
    expect(res.json).toHaveBeenCalledWith({ configured: true, source: 'database', email: config.email, smtpHost: config.smtpHost, smtpPort: 465, imapHost: config.imapHost });
    expect(JSON.stringify(res.json.mock.calls)).not.toContain(config.password);
  });
  it('fails closed when role lookup fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('unavailable', { status: 500 }));
    const res = response();
    await handler({ method: 'GET' } as never, res as never);
    expect(res.status).toHaveBeenCalledWith(503);
  });
  it('rejects invalid configuration before connecting or saving', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([{ role: 'admin' }])));
    const res = response();
    await handler({ method: 'POST', body: { action: 'save', config: { ...config, imapHost: 'localhost' } } } as never, res as never);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('keeps the old mailbox when either connection check fails', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([{ role: 'admin' }])));
    vi.mocked(checkMailbox).mockResolvedValue({ smtp: { ok: true }, imap: { ok: false }, checkedAt: '2026-10-04T00:00:00Z' });
    const res = response();
    await handler({ method: 'POST', body: { action: 'save', config } } as never, res as never);
    expect(res.status).toHaveBeenCalledWith(422);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('writes only ciphertext after both checks pass', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify([{ role: 'admin' }])))
      .mockResolvedValueOnce(new Response(null, { status: 201 }));
    vi.mocked(checkMailbox).mockResolvedValue({ smtp: { ok: true }, imap: { ok: true }, checkedAt: '2026-10-04T00:00:00Z' });
    const res = response();
    await handler({ method: 'POST', body: { action: 'save', config } } as never, res as never);
    const body = String(fetcher.mock.calls[1]?.[1]?.body);
    expect(body).not.toContain(config.password);
    expect(decryptMailbox(JSON.parse(body).encrypted_config, key)).toEqual(config);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
