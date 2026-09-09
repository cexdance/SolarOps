/**
 * A DM must land in the recipient's bell, not just in the messages table.
 * Guards the wiring in lib/messenger.ts sendMessage -> POST /api/notify.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const insertSingle = vi.fn();
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'me' }, access_token: 'tok' } } }) },
    from: () => ({ insert: () => ({ select: () => ({ single: insertSingle }) }) }),
  },
}));

const row = {
  id: 'm1', from_user: 'me', to_user: 'her', body: 'hola', read: false,
  created_at: '2026-09-09T23:00:00Z',
};

describe('sendMessage', () => {
  beforeEach(() => {
    insertSingle.mockResolvedValue({ data: row, error: null });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('notifies the recipient', async () => {
    const { sendMessage } = await import('../lib/messenger');
    await sendMessage('her', 'hola');

    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const notify = calls.find(c => String(c[0]).includes('/api/notify'));
    expect(notify, 'sendMessage did not call /api/notify').toBeTruthy();

    const body = JSON.parse(notify![1].body as string);
    expect(body.kind).toBe('dm');
    expect(body.mentionedUserIds).toEqual(['her']);
    expect(body.message).toBe('hola');
    expect(notify![1].headers.Authorization).toBe('Bearer tok');
  });

  it('does not notify when the message never stored', async () => {
    insertSingle.mockResolvedValue({ data: null, error: { message: 'nope' } });
    const { sendMessage } = await import('../lib/messenger');
    expect(await sendMessage('her', 'hola')).toBeNull();
    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.find(c => String(c[0]).includes('/api/notify'))).toBeFalsy();
  });
});
