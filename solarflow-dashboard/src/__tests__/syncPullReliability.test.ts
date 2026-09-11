import { beforeEach, describe, expect, it, vi } from 'vitest';
const transport = vi.hoisted(() => ({ reply: vi.fn(), contractorFetch: vi.fn(), role: 'admin' }));
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { user_metadata: { role: transport.role } } } } }) },
    from: () => {
      let prefix = 'kv';
      let offset = 0;
      const query = {
        select: () => query,
        like: (_key: string, value: string) => { prefix = value; return query; },
        order: () => query,
        range: (from: number) => { offset = from; return query; },
        gt: () => query,
        in: () => query,
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve().then(() => transport.reply(prefix, offset)).then(resolve, reject),
      };
      return query;
    },
  },
  authedFetch: transport.contractorFetch,
}));
import { hasSessionPulled, markSessionPulled, pullFromSupabase } from '../lib/syncEngine';
const cursorKey = 'solarops_last_record_sync';
const oldCursor = '2026-09-01T00:00:00.000Z';
const row = (id: string) => ({ key: id, value: { id }, updated_at: '2026-09-10T12:00:00.000Z' });
const ok = (data: unknown[] = []) => ({ data, error: null });
const failure = { data: null, error: { message: 'temporary transport failure' } };
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('solarops_sync_cursor_v', '4');
  localStorage.setItem(cursorKey, oldCursor);
  markSessionPulled(false);
  transport.reply.mockReset();
  transport.contractorFetch.mockReset();
  transport.role = 'admin';
});
describe('pull completion protects the shared cursor and startup push gate', () => {
  it('retries old customers when their request fails but newer jobs succeed', async () => {
    transport.reply.mockImplementation((prefix: string) => prefix === 'customer:%' ? failure : ok([row('job:1')]));
    expect(await pullFromSupabase()).toBeNull();
    expect(localStorage.getItem(cursorKey)).toBe(oldCursor);
    expect(hasSessionPulled()).toBe(false);
    transport.reply.mockImplementation((prefix: string) => prefix === 'kv' ? ok() : ok([row(prefix)]));
    expect((await pullFromSupabase())?.customers).toHaveLength(1);
    expect(hasSessionPulled()).toBe(true);
  });
  it('does not acknowledge an incomplete paginated customer pull', async () => {
    transport.reply.mockImplementation((prefix: string, offset: number) =>
      prefix === 'customer:%' ? (offset === 0 ? ok(Array.from({ length: 200 }, (_, i) => row(`customer:${i}`))) : failure) : ok());
    expect(await pullFromSupabase()).toBeNull();
    expect(transport.reply).toHaveBeenCalledWith('customer:%', 200);
    expect(localStorage.getItem(cursorKey)).toBe(oldCursor);
    expect(hasSessionPulled()).toBe(false);
  });
  it('requires tombstone and KV fetch success before acknowledging hydration', async () => {
    transport.reply.mockImplementation((prefix: string) => prefix === 'kv' ? failure : ok([row(prefix)]));
    expect(await pullFromSupabase()).toBeNull();
    expect(localStorage.getItem(cursorKey)).toBe(oldCursor);
    expect(hasSessionPulled()).toBe(false);
  });
  it('keeps the push gate closed when the contractor API fails', async () => {
    transport.role = 'contractor';
    transport.contractorFetch.mockResolvedValue({ ok: false, status: 503 });
    transport.reply.mockReturnValue(ok());
    expect(await pullFromSupabase()).toBeNull();
    expect(localStorage.getItem(cursorKey)).toBe(oldCursor);
    expect(hasSessionPulled()).toBe(false);
  });
  it('resets legacy cursors once to recover previously skipped rows', async () => {
    localStorage.setItem('solarops_sync_cursor_v', '3');
    transport.reply.mockReturnValue(ok());
    expect(await pullFromSupabase()).toEqual({});
    expect(localStorage.getItem(cursorKey)).toBeNull();
    expect(localStorage.getItem('solarops_sync_cursor_v')).toBe('4');
  });
  it('accepts complete empty responses without advancing the cursor', async () => {
    transport.reply.mockReturnValue(ok());
    expect(await pullFromSupabase()).toEqual({});
    expect(localStorage.getItem(cursorKey)).toBe(oldCursor);
    expect(hasSessionPulled()).toBe(true);
  });
});
