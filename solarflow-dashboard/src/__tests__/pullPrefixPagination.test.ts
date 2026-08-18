import { describe, it, expect, vi, beforeEach } from 'vitest';

// A fake app_data table plus the sliver of the PostgREST builder pullPrefix uses.
// Records every .range() it is handed so the test can assert the offsets walked.
const ranges: Array<[number, number]> = [];
let rows: Array<{ key: string; value: unknown; updated_at: string }> = [];
let failAtOffset: number | null = null;

vi.mock('../lib/supabase', () => {
  const builder = () => {
    let from = 0;
    let to = Infinity;
    const q: Record<string, unknown> = {
      select: () => q,
      like:   () => q,
      gt:     () => q,
      order:  () => q,
      range:  (a: number, b: number) => { from = a; to = b; ranges.push([a, b]); return q; },
      then:   (resolve: (r: unknown) => unknown) => {
        if (failAtOffset !== null && from === failAtOffset) {
          return Promise.resolve({ data: null, error: { message: 'boom' } }).then(resolve);
        }
        return Promise.resolve({ data: rows.slice(from, to + 1), error: null }).then(resolve);
      },
    };
    return q;
  };
  return {
    supabase: { from: builder },
    authedFetch: vi.fn(),
  };
});

const { pullPrefix } = await import('../lib/syncEngine');

const PAGE = 200;
const makeRows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    key: `customer:cust-${i}`,
    value: { id: `cust-${i}` },
    updated_at: '2026-08-18T00:00:00Z',
  }));

describe('pullPrefix pagination', () => {
  beforeEach(() => { ranges.length = 0; failAtOffset = null; });

  it('walks every page when the table is larger than one page', async () => {
    // 328 is the live customer count. Before pagination this was one unbounded
    // request that PostgREST can truncate with error === null, i.e. silently.
    rows = makeRows(328);
    const out = await pullPrefix<{ id: string }>('customer:', null);
    expect(out).toHaveLength(328);
    expect(ranges).toEqual([[0, 199], [200, 399]]);
  });

  it('stops after one request when the first page is short', async () => {
    rows = makeRows(12);
    const out = await pullPrefix<{ id: string }>('customer:', null);
    expect(out).toHaveLength(12);
    expect(ranges).toEqual([[0, 199]]);
  });

  it('does not loop forever on an exact page-size multiple', async () => {
    rows = makeRows(PAGE);
    const out = await pullPrefix<{ id: string }>('customer:', null);
    expect(out).toHaveLength(PAGE);
    // Needs the second request to learn it is done, but must not go past it.
    expect(ranges).toEqual([[0, 199], [200, 399]]);
  });

  it('keeps the pages it already fetched when a later page errors', async () => {
    // A partial reconcile beats none: the merge is additive, so the next pull
    // fills the rest. Returning [] here would look like "no records exist".
    rows = makeRows(328);
    failAtOffset = 200;
    const out = await pullPrefix<{ id: string }>('customer:', null);
    expect(out).toHaveLength(200);
  });

  it('stamps the server updated_at onto each value for the merge to compare', async () => {
    rows = makeRows(3);
    const out = await pullPrefix<{ id: string; updatedAt?: string }>('customer:', null);
    expect(out.every(v => v.updatedAt === '2026-08-18T00:00:00Z')).toBe(true);
  });
});
