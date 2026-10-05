// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { emailStorageId, newMailCheckpoint, nextUidWindow } from '../../../api/_mailboxSyncPlan';
import { runMailboxSync, startNewMailSync } from '../../../api/_mailboxSync';
import syncApi, { isMailboxScheduler } from '../../../api/_mailboxSyncApi';
import { configuredMailbox, mailboxDb, mailboxRpc, requireMailboxAdmin } from '../../../api/_mailboxStore';
const fake = vi.hoisted(() => ({
  on: vi.fn(), connect: vi.fn(), close: vi.fn(), list: vi.fn(), status: vi.fn(),
  search: vi.fn(), fetchOne: vi.fn(), getMailboxLock: vi.fn(),
  mailbox: { uidValidity: 123n, uidNext: 102 },
}));
vi.mock('imapflow', () => ({ ImapFlow: class { constructor() { return fake; } } }));
vi.mock('../../../api/_mailboxStore', () => ({ configuredMailbox: vi.fn(), mailboxDb: vi.fn(), mailboxRpc: vi.fn(), requireMailboxAdmin: vi.fn() }));
const checkpoint = { uidValidity: '123', cursor: 99, direction: 'inbound' as const };
const config = { email: 'team@example.com', password: 'secret', smtpHost: 'smtp.ionos.com', smtpPort: 465, imapHost: 'imap.ionos.com' };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(configuredMailbox).mockResolvedValue(config as never);
  vi.mocked(mailboxDb).mockResolvedValue([]);
  vi.mocked(mailboxRpc).mockImplementation(async name => name === 'mailbox_sync_claim' ? [{ mailbox_email: config.email, folders: { INBOX: checkpoint } }] : null);
  vi.mocked(requireMailboxAdmin).mockResolvedValue(false);
  fake.mailbox = { uidValidity: 123n, uidNext: 102 };
  fake.connect.mockResolvedValue(undefined);
  fake.list.mockResolvedValue([{ path: 'Sent Items', specialUse: '\\Sent' }]);
  fake.status.mockResolvedValue({ uidValidity: 123n, uidNext: 100 });
  fake.getMailboxLock.mockResolvedValue({ release: vi.fn() });
  fake.search.mockResolvedValue([100,101]);
  fake.fetchOne.mockImplementation(async (uid, query) => query.source ? { source: Buffer.from(`Message-ID: <${uid}@example.com>\r\nFrom: Customer <customer@example.com>\r\nTo: team@example.com\r\nSubject: Test\r\n\r\nSample body`) } : { uid, size: 300, envelope: { messageId: `<${uid}@example.com>` }, internalDate: new Date('2026-10-05T00:00:00Z') });
});
describe('new-email-only synchronization', () => {
  it('starts at UIDNEXT minus one without downloading old mail', async () => {
    await startNewMailSync();
    expect(mailboxRpc).toHaveBeenCalledWith('mailbox_sync_start', { p_email: config.email, p_folders: { INBOX: checkpoint, 'Sent Items': { ...checkpoint, direction: 'outbound' } } });
    expect(fake.search).not.toHaveBeenCalled();
    expect(fake.fetchOne).not.toHaveBeenCalled();
  });
  it('does not connect to IONOS when paused or another worker owns the lease', async () => {
    vi.mocked(mailboxRpc).mockResolvedValue([]);
    expect(await runMailboxSync()).toEqual({ status: 'paused_or_busy', processed: 0 });
    expect(configuredMailbox).not.toHaveBeenCalled();
    expect(fake.connect).not.toHaveBeenCalled();
  });
  it('stores originals before committing messages and cursor, and uses read-only IMAP', async () => {
    expect(await runMailboxSync()).toEqual({ status: 'synced', processed: 2 });
    expect(fake.getMailboxLock).toHaveBeenCalledWith('INBOX', { readOnly: true });
    const commit = vi.mocked(mailboxRpc).mock.calls.find(([name]) => name === 'mailbox_sync_commit')![1]!;
    expect(commit.p_cursor).toBe(101);
    expect(commit.p_messages).toHaveLength(2);
    expect(JSON.stringify(commit)).not.toContain(config.password);
    expect(mailboxDb).toHaveBeenCalledTimes(2);
    expect(fake.close).toHaveBeenCalled();
  });
  it('does not advance progress if original storage fails', async () => {
    vi.mocked(mailboxDb).mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(runMailboxSync()).rejects.toThrow();
    expect(vi.mocked(mailboxRpc).mock.calls.some(([name]) => name === 'mailbox_sync_commit')).toBe(false);
    expect(mailboxRpc).toHaveBeenCalledWith('mailbox_sync_finish', expect.objectContaining({ p_pause: false, p_error: expect.any(String) }));
  });
  it('pauses instead of importing history when UIDVALIDITY changes', async () => {
    fake.mailbox.uidValidity = 456n;
    await expect(runMailboxSync()).rejects.toThrow();
    expect(fake.fetchOne).not.toHaveBeenCalled();
    expect(mailboxRpc).toHaveBeenCalledWith('mailbox_sync_finish', expect.objectContaining({ p_pause: true }));
  });
  it('records oversized messages explicitly without downloading the body', async () => {
    fake.search.mockResolvedValue([100]);
    fake.fetchOne.mockResolvedValue({ uid: 100, size: 16000000, envelope: { messageId: '<large@example.com>' } });
    await runMailboxSync();
    expect(fake.fetchOne).toHaveBeenCalledTimes(1);
    expect(mailboxDb).not.toHaveBeenCalled();
    const commit = vi.mocked(mailboxRpc).mock.calls.find(([name]) => name === 'mailbox_sync_commit')![1]!;
    expect(commit.p_messages).toEqual([expect.objectContaining({ content_status: 'too_large', raw_path: null })]);
  });
  it('advances over deleted UID gaps without using unbounded star ranges', async () => {
    fake.search.mockResolvedValue([]);
    await runMailboxSync();
    expect(fake.search).toHaveBeenCalledWith({ uid: '100:101' }, { uid: true });
    expect(mailboxRpc).toHaveBeenCalledWith('mailbox_sync_commit', expect.objectContaining({ p_cursor: 101, p_messages: [] }));
  });
});
describe('sync identity and scheduler boundary', () => {
  it('has no historical range on activation and bounds each scan', () => {
    expect(newMailCheckpoint('123', 20000, 'inbound').cursor).toBe(19999);
    expect(nextUidWindow(checkpoint, '123', 20000)).toEqual({ start: 100, end: 599 });
    expect(nextUidWindow(checkpoint, '123', 100)).toBeNull();
    expect(() => nextUidWindow(checkpoint, '456', 20000)).toThrow('FOLDER_RESET');
  });
  it('deduplicates copies of a message across folders and isolates mailboxes', () => {
    expect(emailStorageId('team@example.com','<id@example.com>','hash1')).toBe(emailStorageId('team@example.com','<id@example.com>','hash2'));
    expect(emailStorageId('other@example.com','<id@example.com>','hash1')).not.toBe(emailStorageId('team@example.com','<id@example.com>','hash1'));
    expect(emailStorageId('team@example.com',undefined,'hash1')).not.toBe(emailStorageId('team@example.com',undefined,'hash2'));
  });
  it('fails closed for missing or wrong scheduler credentials', () => {
    const digest = createHash('sha256').update('correct').digest('hex');
    expect(isMailboxScheduler('Bearer correct',digest)).toBe(true);
    expect(isMailboxScheduler('Bearer wrong',digest)).toBe(false);
    expect(isMailboxScheduler('Bearer correct','')).toBe(false);
    expect(isMailboxScheduler(['Bearer correct'],digest)).toBe(false);
  });
  it('cannot use the scheduler token to enable sync or read message summaries', async () => {
    process.env.MAILBOX_SYNC_TOKEN_SHA256 = createHash('sha256').update('correct').digest('hex');
    const res = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() };
    for (const request of [{ method: 'GET' }, { method: 'POST', body: { action: 'start-new' } }]) {
      await syncApi({ ...request, headers: { authorization: 'Bearer correct' } } as never,res as never);
    }
    expect(requireMailboxAdmin).toHaveBeenCalledTimes(2);
    expect(mailboxDb).not.toHaveBeenCalled();
    expect(mailboxRpc).not.toHaveBeenCalled();
    delete process.env.MAILBOX_SYNC_TOKEN_SHA256;
  });
});
