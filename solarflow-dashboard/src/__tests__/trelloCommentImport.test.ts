/**
 * Trello comments -> SolarOps activity log (owner decision 2026-09-30).
 *
 * Before this, comments reached the app only through two one-off scripts, the
 * last on 09-01, so leads worked entirely in Trello looked untouched in LL and
 * were called twice. These pin the import rules and, above all, the guards: the
 * webhook fails open on signature and the repo is public, so nothing in a
 * payload may be trusted.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  commentActivityFor, importedCommentIds, appendActivityOnce, importCommentEvent,
} from '../../../api/trello-card';

const BOARD = '6a5a58e06fbf97144b5d96c9';
const CARD = '6aa440809d40470da3f5e4dc';
const COMMENT = '6aa440809d40470da3f5e4aa';

describe('commentActivityFor', () => {
  it('imports a comment with its own author and date', () => {
    expect(commentActivityFor({
      kind: 'commentCard', commentId: COMMENT, text: 'First call, no answer, vm sent',
      date: '2026-09-29T19:02:00.000Z', author: 'alessandra',
    })).toEqual({
      id: `trello-cmt-${COMMENT}`, type: 'note_added', description: 'First call, no answer, vm sent',
      timestamp: '2026-09-29T19:02:00.000Z', userName: 'alessandra',
    });
  });

  it('skips an empty comment', () => {
    expect(commentActivityFor({ kind: 'commentCard', commentId: COMMENT, text: '   ', date: 'x' })).toBeUndefined();
  });

  it('records an edit as a NEW entry keyed on the comment and its text', () => {
    const a = commentActivityFor({ kind: 'updateComment', commentId: COMMENT, text: 'called back', date: 'd' })!;
    const b = commentActivityFor({ kind: 'updateComment', commentId: COMMENT, text: 'called back', date: 'd2' })!;
    const c = commentActivityFor({ kind: 'updateComment', commentId: COMMENT, text: 'called back twice', date: 'd' })!;
    expect(a.id).not.toBe(`trello-cmt-${COMMENT}`);   // never rewrites the original
    expect(a.id).toBe(b.id);                          // same text: one entry however many events
    expect(a.id).not.toBe(c.id);                      // a real second edit is kept
    expect(a.description).toBe('Edited in Trello: called back');
  });

  it('records a delete as one note per comment, keeping the original', () => {
    const d = commentActivityFor({
      kind: 'deleteComment', commentId: COMMENT, date: 'now',
      original: { userName: 'alessandra', timestamp: '2026-09-29T19:02:00.000Z' },
    })!;
    expect(d.id).toBe(`trello-cmtdel-${COMMENT}`);
    expect(d.description).toContain('by alessandra from 2026-09-29');
  });
});

describe('dedupe', () => {
  it('treats both legacy script prefixes as already imported', () => {
    expect(importedCommentIds(COMMENT)).toEqual([`trello-cmt-${COMMENT}`, `trello-comment-${COMMENT}`]);
    const legacy = [{ id: `trello-comment-${COMMENT}` }];
    expect(appendActivityOnce(legacy, { id: `trello-cmt-${COMMENT}` }, importedCommentIds(COMMENT))).toBeUndefined();
  });

  it('appends when absent and leaves the existing history intact', () => {
    const next = appendActivityOnce([{ id: 'lead-log-1' }], { id: 'new' }, ['new']);
    expect(next).toEqual([{ id: 'lead-log-1' }, { id: 'new' }]);
    expect(appendActivityOnce(undefined, { id: 'new' }, ['new'])).toEqual([{ id: 'new' }]);
  });
});

// ── importCommentEvent: the guards ─────────────────────────────────────────

type Route = (url: string, init?: RequestInit) => Response | undefined;
function mockFetch(route: Route) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return route(url, init) ?? new Response('not found', { status: 404 });
  }));
  return calls;
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
const writes = (calls: { url: string; init?: RequestInit }[]) =>
  calls.filter(c => c.init?.method === 'POST' && c.url.includes('/app_data'));

const trelloComment = (board = BOARD) => json({
  type: 'commentCard', date: '2026-09-29T19:02:00.000Z',
  data: { text: 'First call, no answer', card: { id: CARD }, board: { id: board } },
  memberCreator: { fullName: 'alessandra' },
});
const leadRow = (activityHistory: unknown[] = []) =>
  json([{ key: `job:job-trello-${CARD}`, value: { id: `job-trello-${CARD}`, activityHistory, fieldTimes: {} } }]);

afterEach(() => vi.unstubAllGlobals());

describe('importCommentEvent', () => {
  it('imports a verified comment and stamps the field clock', async () => {
    const calls = mockFetch(url => {
      if (url.includes(`/actions/${COMMENT}`)) return trelloComment();
      if (url.includes('app_data?key=eq.') && url.includes('select=key')) return json([{ key: 'x' }]);
      if (url.includes('app_data?key=eq.') && url.includes('select=value')) return leadRow();
      if (url.includes('on_conflict=key')) return new Response(null, { status: 201 });
      return undefined;
    });
    const out = await importCommentEvent({ type: 'commentCard', id: COMMENT, data: { card: { id: CARD, name: 'x' } } });
    expect(out).toBe('imported');
    const body = JSON.parse(String(writes(calls)[0].init!.body));
    expect(body.value.activityHistory[0]).toMatchObject({ id: `trello-cmt-${COMMENT}`, userName: 'alessandra' });
    expect(body.value.fieldTimes.activityHistory).toBe(body.value.updatedAt);
  });

  it('trusts Trello, not the payload: a comment on another board is refused', async () => {
    const calls = mockFetch(url => (url.includes(`/actions/${COMMENT}`) ? trelloComment('bbbbbbbbbbbbbbbbbbbbbbbb') : undefined));
    // The payload claims OUR card; Trello says the comment lives elsewhere.
    expect(await importCommentEvent({ type: 'commentCard', id: COMMENT, data: { card: { id: CARD, name: 'x' } } }))
      .toBe('comment is not on an allowed board');
    expect(writes(calls)).toHaveLength(0);
  });

  it('a redelivered comment writes nothing', async () => {
    const calls = mockFetch(url => {
      if (url.includes(`/actions/${COMMENT}`)) return trelloComment();
      if (url.includes('select=key')) return json([{ key: 'x' }]);
      if (url.includes('select=value')) return leadRow([{ id: `trello-cmt-${COMMENT}`, description: 'First call, no answer' }]);
      return undefined;
    });
    expect(await importCommentEvent({ type: 'commentCard', id: COMMENT, data: { card: { id: CARD, name: 'x' } } }))
      .toBe('already imported');
    expect(writes(calls)).toHaveLength(0);
  });

  it('refuses a delete for a comment that still exists', async () => {
    const calls = mockFetch(url => (url.includes(`/actions/${COMMENT}`) ? trelloComment() : undefined));
    const out = await importCommentEvent({ type: 'deleteComment', data: { action: { id: COMMENT }, card: { id: CARD, name: 'x' } } });
    expect(out).toMatch(/still exists/);
    expect(writes(calls)).toHaveLength(0);
  });

  it('refuses a delete aimed at a record that never held that comment', async () => {
    const calls = mockFetch(url => {
      if (url.includes('select=key')) return json([{ key: 'x' }]);
      if (url.includes('select=value')) return leadRow([{ id: 'lead-log-1', description: 'hi' }]);
      return undefined;   // the comment itself 404s
    });
    expect(await importCommentEvent({ type: 'deleteComment', data: { action: { id: COMMENT }, card: { id: CARD, name: 'x' } } }))
      .toBe('unknown comment for this record');
    expect(writes(calls)).toHaveLength(0);
  });

  it('a malformed id never reaches a URL', async () => {
    const calls = mockFetch(() => undefined);
    expect(await importCommentEvent({ type: 'commentCard', id: '../../x', data: { card: { id: CARD, name: 'x' } } }))
      .toBe('malformed comment id');
    expect(calls).toHaveLength(0);
  });
});

describe('echo guard', () => {
  it('recognises every marker SolarOps writes when it posts to Trello', async () => {
    const { isSolarOpsEcho } = await import('../../../api/trello-card');
    for (const m of ['SolarOps activity ID: a1', 'SolarOps audit ID: a1', 'SolarOps RMA ID: r1',
      'SolarOps audit import: j1', 'SolarOps record notes: c1']) {
      expect(isSolarOpsEcho(`SolarOps activity — US-1 X\n\nbody\n${m}`)).toBe(true);
    }
    expect(isSolarOpsEcho('First call, no answer, vm and email sent')).toBe(false);
    expect(isSolarOpsEcho(undefined)).toBe(false);
  });

  it('never writes a comment SolarOps posted itself', async () => {
    const calls = mockFetch(url => (url.includes(`/actions/${COMMENT}`)
      ? json({ type: 'commentCard', date: 'd', data: { text: 'SolarOps activity — US-1 X\n\nnote\nSolarOps activity ID: lead-log-1', card: { id: CARD }, board: { id: BOARD } } })
      : undefined));
    expect(await importCommentEvent({ type: 'commentCard', id: COMMENT, data: { card: { id: CARD, name: 'x' } } }))
      .toBe('SolarOps echo, not imported');
    expect(writes(calls)).toHaveLength(0);
  });
});
