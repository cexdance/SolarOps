import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../../api/_productionReviewStore.ts', () => ({ readState: vi.fn(), updateState: vi.fn() }));
vi.mock('../../../scripts/production-smtp.mts', () => ({ smtpFromEnv: () => ({ from: 'sender@example.com' }), smtpTransport: vi.fn() }));
import { smtpTransport } from '../../../scripts/production-smtp.mts';
import { sendAlerts, emailApprovalDigest } from '../../../scripts/production-monitor.mts';
import { updateState } from '../../../api/_productionReviewStore';
import type { Review } from '../../../api/_productionReview';
const review: Review = { id: '1:production:test', siteId: 1, name: 'Sample <script>alert(1)</script>', kind: 'production', finding: { kind: 'production', detail: 'Production down 40%' }, openedAt: '', lastCheckedAt: '', active: true, status: 'open' };
beforeEach(() => { vi.stubEnv('SMTP_ENABLED', 'false'); });
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('review email delivery', () => {
  it('does not mark alerts notified when the provider fails', async () => {
    vi.stubEnv('RESEND_API_KEY', 'test'); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 503 })));
    await expect(sendAlerts([review], emailApprovalDigest([review]))).rejects.toThrow('remain pending'); expect(updateState).not.toHaveBeenCalled();
  });
  it('escapes site names, uses a clear subject and only acknowledges after a receipt', async () => {
    vi.stubEnv('RESEND_API_KEY', 'test'); const fetch = vi.fn().mockResolvedValue(new Response('{"id":"email-test"}')); vi.stubGlobal('fetch', fetch);
    await sendAlerts([review], emailApprovalDigest([review])); const options = fetch.mock.calls[0]![1]; const body = JSON.parse(options.body);
    expect(body.to).toEqual(['cesar.jurado@conexsol.us']); expect(body.subject).toContain('1 Florida site needs human review | 40% production drop'); expect(body.html).toContain('&lt;script&gt;'); expect(body.html).not.toContain('<script>'); expect(options.headers['Idempotency-Key']).toMatch(/^production-review-/);
    const callback = vi.mocked(updateState).mock.calls[0]![0]; expect(callback({ reviews: [review], recipients: [] }).reviews[0]).toMatchObject({ notificationId: 'email-test' });
  });
  it('keeps alerts pending if a successful response has no delivery receipt', async () => {
    vi.stubEnv('RESEND_API_KEY', 'test'); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
    await expect(sendAlerts([review], emailApprovalDigest([review]))).rejects.toThrow('receipt'); expect(updateState).not.toHaveBeenCalled();
  });
});

it('uses SMTP when enabled and records acceptance before marking notified', async () => {
  vi.stubEnv('SMTP_ENABLED', 'true');
  const sendMail = vi.fn().mockResolvedValue({ messageId: '<receipt@example.com>', accepted: ['cesar.jurado@conexsol.us'] }); const close = vi.fn();
  vi.mocked(smtpTransport).mockReturnValue({ sendMail, close } as never);
  await sendAlerts([review], emailApprovalDigest([review])); expect(close).toHaveBeenCalled(); expect(sendMail.mock.calls[0]![0].subject).toContain('40% production drop');
  const change = vi.mocked(updateState).mock.calls[0]![0]; expect(change({ reviews: [review], recipients: [] }).reviews[0]).toMatchObject({ notificationId: 'smtp:<receipt@example.com>' });
});
it('keeps SMTP rejections pending and closes the connection', async () => {
  vi.stubEnv('SMTP_ENABLED', 'true'); const close = vi.fn(); vi.mocked(smtpTransport).mockReturnValue({ sendMail: vi.fn().mockRejectedValue({ code: 'EAUTH' }), close } as never);
  await expect(sendAlerts([review], emailApprovalDigest([review]))).rejects.toThrow('SMTP EAUTH'); expect(updateState).not.toHaveBeenCalled(); expect(close).toHaveBeenCalled();
});

it('never sends without approval for the exact message', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  await sendAlerts([review]);
  await sendAlerts([review], 'stale-or-unapproved-digest');
  expect(fetch).not.toHaveBeenCalled(); expect(smtpTransport).not.toHaveBeenCalled(); expect(updateState).not.toHaveBeenCalled();
});
