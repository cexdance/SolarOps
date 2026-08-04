/**
 * Phase 1 dual-write: mirroring the contractor-jobs blob into per-record rows.
 *
 * The write-amplification case is the reason this file exists. saveContractorJobs
 * hands the WHOLE array to pushKeyValue on every edit, so a naive mirror rewrites
 * every row each time. Observed in production 2026-08-04: one contractor
 * completing one job produced 127 row writes. Harmless at 127, not at 10x that.
 *
 * These tests pin the mirror's contract:
 *   - it writes rows keyed by sourceJobId, alongside the authoritative blob
 *   - a second save of unchanged data writes NOTHING
 *   - a save that changes one job writes exactly that one row
 *   - a failed mirror leaves rows dirty so the next save retries them
 *   - a mirror failure never fails the push, because the blob is authoritative
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mock = {
  session: { user: { id: 'u1' } } as object | null,
  readValue: null as unknown,
  upserts: [] as Array<Array<{ key: string; value: unknown }>>,
  upsertError: null as { message: string } | null,
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
          maybeSingle: async () => ({
            data: mock.readValue === null ? null : { value: mock.readValue },
            error: null,
          }),
        }),
      }),
      upsert: async (rows: Array<{ key: string; value: unknown }>) => {
        mock.upserts.push(rows);
        // The blob write is a single row; only fail the multi-row mirror.
        if (mock.upsertError && rows.length > 0 && String(rows[0].key).startsWith('contractor_job:')) {
          return { error: mock.upsertError };
        }
        return { error: null };
      },
    }),
  },
  authedFetch: vi.fn(),
}));

import { pushKeyValue } from '../lib/syncEngine';

const KEY = 'solarflow_contractor_jobs';
const job = (n: number, over: Record<string, unknown> = {}) => ({
  id: `cj-${n}`,
  sourceJobId: `job-${n}`,
  status: 'assigned',
  updatedAt: '2026-08-01T00:00:00.000Z',
  ...over,
});

/** Only the mirror's row writes, ignoring the authoritative blob upsert. */
const mirrorWrites = () =>
  mock.upserts.filter(rows => rows.length > 0 && String(rows[0].key).startsWith('contractor_job:'));

// Each test uses its own id range. The dirty-tracking map is module-scoped and
// deliberately survives across calls (that is what makes a second save cheap in
// a real session), so it also survives across tests in this file. Sharing ids
// between tests would leak "already clean" state and mask real behaviour.
// vi.resetModules() does not help: pushKeyValue is imported statically, so the
// binding keeps pointing at the original module instance.

beforeEach(() => {
  localStorage.clear();
  mock.session = { user: { id: 'u1' } };
  mock.readValue = null;
  mock.upserts = [];
  mock.upsertError = null;
  vi.resetModules();
});

describe('the mirror writes rows keyed by sourceJobId', () => {
  it('mirrors every job on the first save of a session', async () => {
    await pushKeyValue(KEY, [job(101), job(102), job(103)]);
    const writes = mirrorWrites();
    expect(writes).toHaveLength(1);
    expect(writes[0].map(r => r.key).sort()).toEqual([
      'contractor_job:job-101', 'contractor_job:job-102', 'contractor_job:job-103',
    ]);
  });
});

describe('write amplification is bounded by what actually changed', () => {
  it('writes NOTHING on a second save of identical data', async () => {
    await pushKeyValue(KEY, [job(201), job(202), job(203)]);
    mock.upserts = [];
    // Same array, no edits. This is the case that used to rewrite all 127 rows.
    await pushKeyValue(KEY, [job(201), job(202), job(203)]);
    expect(mirrorWrites()).toHaveLength(0);
  });

  it('writes exactly ONE row when one job of three changes', async () => {
    await pushKeyValue(KEY, [job(301), job(302), job(303)]);
    mock.upserts = [];

    await pushKeyValue(KEY, [
      job(301),
      job(302, { status: 'completed', updatedAt: '2026-08-04T02:46:48.000Z' }),
      job(303),
    ]);

    const writes = mirrorWrites();
    expect(writes).toHaveLength(1);
    expect(writes[0]).toHaveLength(1);
    expect(writes[0][0].key).toBe('contractor_job:job-302');
    expect((writes[0][0].value as { status: string }).status).toBe('completed');
  });
});

describe('a failed mirror is retried and never breaks the push', () => {
  it('leaves rows dirty so the next save rewrites them', async () => {
    mock.upsertError = { message: 'row mirror boom' };
    await pushKeyValue(KEY, [job(401), job(402)]);
    expect(mirrorWrites()).toHaveLength(1); // attempted

    // Recover. The rows must NOT have been marked clean by the failed attempt.
    mock.upsertError = null;
    mock.upserts = [];
    await pushKeyValue(KEY, [job(401), job(402)]);

    const writes = mirrorWrites();
    expect(writes).toHaveLength(1);
    expect(writes[0].map(r => r.key).sort())
      .toEqual(['contractor_job:job-401', 'contractor_job:job-402']);
  });

  it('does not throw when the mirror fails, since the blob is authoritative', async () => {
    mock.upsertError = { message: 'row mirror boom' };
    await expect(pushKeyValue(KEY, [job(501)])).resolves.toBeUndefined();
  });
});
