/**
 * Regression tests for the failed-read blind-overwrite path in pushKeyValue.
 *
 * A multi-writer KV blob is merged against the current remote value before the
 * upsert, so this device never erases what another device wrote. That merge is
 * only as good as the read feeding it. fetchRemoteKV used to return `null` both
 * when the row did not exist AND when the read failed, and every merger treats a
 * non-array remote as the empty side. So a transient Supabase error turned the
 * merge into a no-op that returned the local array, and the upsert below wrote
 * that back as the whole blob, deleting every record this device had not pulled.
 *
 * The read now reports failure distinctly and the push is deferred to the
 * outbox retry. These cases pin all three outcomes apart: failed read (defer),
 * absent row (push), successful read (merge).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mock = {
  session: { user: { id: 'test-user' } } as object | null,
  // The remote read result: either a value, or an error to simulate a failure.
  readValue: null as unknown,
  readError: null as { message: string } | null,
  readThrows: false,
  upserts: [] as Array<Array<{ key: string; value: unknown }>>,
};

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: mock.session } }),
      refreshSession: async () => ({ data: { session: mock.session } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (mock.readThrows) throw new Error('network down');
            return { data: mock.readValue === null ? null : { value: mock.readValue }, error: mock.readError };
          },
        }),
      }),
      upsert: async (rows: Array<{ key: string; value: unknown }>) => {
        mock.upserts.push(rows);
        return { error: null };
      },
    }),
  },
  authedFetch: vi.fn(),
}));

import { pushKeyValue } from '../lib/syncEngine';
import { hasPendingPush } from '../lib/outbox';

const TOOLS = 'solarops_tools';
const rec = (id: string) => ({ id, createdAt: '2026-07-01T00:00:00.000Z' });

beforeEach(() => {
  localStorage.clear();
  mock.session = { user: { id: 'test-user' } };
  mock.readValue = null;
  mock.readError = null;
  mock.readThrows = false;
  mock.upserts = [];
});

describe('pushKeyValue defers instead of blind-overwriting when the remote read fails', () => {
  it('does not upsert when the read returns an error', async () => {
    mock.readError = { message: 'connection reset' };
    await pushKeyValue(TOOLS, [rec('local-only')]);
    expect(mock.upserts).toHaveLength(0);
  });

  it('does not upsert when the read throws', async () => {
    mock.readThrows = true;
    await pushKeyValue(TOOLS, [rec('local-only')]);
    expect(mock.upserts).toHaveLength(0);
  });

  it('flags the outbox as pending, which surfaces the failure to the user', async () => {
    expect(hasPendingPush()).toBe(false);
    mock.readError = { message: 'connection reset' };
    await pushKeyValue(TOOLS, [rec('local-only')]);
    expect(hasPendingPush()).toBe(true);
    // Deliberately narrow: this asserts the flag is SET, not that anything
    // retries the KV push. Nothing does. drainOutbox re-runs pushToSupabase
    // (per-record state only), and pushKeyValue is called only by dbSet on a
    // fresh edit, so this blob reaches the server on the user's next edit to
    // this key. See the ponytail note at the deferral in syncEngine.ts.
  });

  it('still pushes when the row genuinely does not exist yet', async () => {
    // The absent-row case must stay distinguishable from a failure, otherwise
    // the first device to ever write this key could never create the row.
    mock.readValue = null;
    mock.readError = null;
    await pushKeyValue(TOOLS, [rec('first-ever')]);
    expect(mock.upserts).toHaveLength(1);
    expect((mock.upserts[0][0].value as { id: string }[]).map(r => r.id)).toEqual(['first-ever']);
  });

  it('still merges local and remote when the read succeeds', async () => {
    mock.readValue = [rec('theirs')];
    await pushKeyValue(TOOLS, [rec('mine')]);
    expect(mock.upserts).toHaveLength(1);
    const pushed = (mock.upserts[0][0].value as { id: string }[]).map(r => r.id).sort();
    expect(pushed).toEqual(['mine', 'theirs']);
  });
});
