import { describe, it, expect, vi } from 'vitest';
import { customerSyncContent, linkedCardId, makeCustomerSync, mergeCustomerDescription, rmaComment, tagLine, tagAuthor, tagDate, isRetiredComment } from '../../../api/_trelloCustomerSync';
import { isSolarOpsEcho } from '../../../api/trello-card';

const cardId = '6aa4940ed25ee20fff76d045';
const job = { id: `job-trello-${cardId}`, customerId: 'customer-1', woNumber: 'SO-1', serviceType: 'Site Transfer', rmaEntries: [{ id: 'rma-1', rmaNumber: '123', status: 'pending' }], activityHistory: [{ id: 'note-1', description: 'Customer called', timestamp: '2026-09-15', userName: 'Staff' }] };
const customer = { id: 'customer-1', name: 'Serrano Lorena', clientId: 'US-15704', address: '16361 Yellow Eye Dr', city: 'Clermont', state: 'FL', zip: '34714' };

describe('converted customer Trello content', () => {
  it('supports both original lead links and explicit service-order card links', () => {
    expect(linkedCardId(job)).toBe(cardId);
    expect(linkedCardId({ id: 'manual-job', trelloCardId: cardId })).toBe(cardId);
    expect(linkedCardId({ id: 'manual-job' })).toBeUndefined();
  });
  it('includes customer number, address and stable RMA markers', () => {
    const content = customerSyncContent(job, customer);
    expect(content.name).toBe('US-15704 Serrano Lorena');
    expect(content.block).toContain('16361 Yellow Eye Dr, Clermont, FL 34714');
    expect(content.comments[0].legacyMarker).toBe('SolarOps RMA ID: rma-1');
    expect(content.comments[0].text).toContain(content.comments[0].marker);
  });
  it('unions duplicate activity IDs and excludes Trello echoes', () => {
    const content = customerSyncContent({ ...job, activityHistory: [...job.activityHistory, { id: 'trello-cmt-123', description: 'echo' }, { id: 'other', description: 'SolarOps RMA ID: rma-1' }] }, { ...customer, activityHistory: job.activityHistory });
    expect(content.comments.filter(c => c.legacyMarker.startsWith('SolarOps activity ID:'))).toHaveLength(1);
  });
  it('updates only the managed description block', () => {
    const initial = mergeCustomerDescription('Human notes\nImportant', customerSyncContent(job, customer).block);
    const block = customerSyncContent(job, { ...customer, address: 'New address' }).block;
    const updated = mergeCustomerDescription(initial, block);
    expect(updated).toContain('Human notes\nImportant');
    expect(updated).not.toContain('16361');
    expect(mergeCustomerDescription(updated, block)).toBe(updated);
  });
});

function fixture() {
  const records = new Map<string, any>([[`job:${job.id}`, structuredClone(job)], [`customer:${customer.id}`, structuredClone(customer)]]);
  const card = { id: cardId, idBoard: 'board', name: 'Serrano Lorena', desc: 'Original lead', closed: false };
  const comments: any[] = [];
  let writes = 0;
  const fetcher = vi.fn(async (input: any, init: any = {}) => {
    const url = new URL(String(input)); const method = init.method || 'GET'; const body = init.body ? JSON.parse(init.body) : undefined;
    if (url.pathname.includes('/rest/v1/app_data')) {
      const key = url.searchParams.get('key')?.replace(/^eq\./, '');
      if (method === 'GET') return Response.json(records.has(key!) ? [{ value: records.get(key!) }] : []);
      if (method === 'POST') {
        if (init.headers.Prefer.includes('ignore-duplicates') && records.has(body.key)) return Response.json([]);
        records.set(body.key, body.value);
        return init.headers.Prefer.includes('return=minimal') ? new Response(null, { status: 201 }) : Response.json([body]);
      }
      if (method === 'PATCH') {
        const old = records.get(key!);
        if (url.searchParams.has('value->>expires') && url.searchParams.get('value->>expires')!.startsWith('lt.') && old.expires > new Date().toISOString()) return Response.json([]);
        if (url.searchParams.has('value->>owner') && url.searchParams.get('value->>owner') !== `eq.${old.owner}`) return Response.json([]);
        records.set(key!, body.value); return Response.json([body]);
      }
      if (method === 'DELETE') { records.delete(key!); return new Response(null, { status: 204 }); }
    }
    if (method === 'GET' && url.pathname.endsWith('/actions')) return Response.json(comments);
    if (method === 'GET') return Response.json(card);
    writes++;
    if (method === 'DELETE' && /\/actions\/[^/]+$/.test(url.pathname)) { const id = url.pathname.split('/').at(-1); const i = comments.findIndex(c => c.id === id); if (i >= 0) comments.splice(i, 1); return Response.json({ _value: null }); }
    if (url.pathname.endsWith('/comments')) {
      if (method === 'PUT') { const id = url.pathname.split('/').at(-2); const c = comments.find(c => c.id === id); c.data.text = body.text; return Response.json(c); }
      const c = { id: String(comments.length + 1), data: { text: body.text } }; comments.push(c); return Response.json(c);
    }
    Object.assign(card, body); return Response.json(card);
  });
  const sync = makeCustomerSync({ databaseUrl: 'https://db.test', serviceKey: 'test', apiKey: 'test', token: 'test', allowedBoard: id => id === 'board', fetcher: fetcher as typeof fetch });
  return { ...sync, records, comments, card, fetcher, writes: () => writes };
}
describe('customer sync execution', () => {
  it('retries without duplicates and edits the same comment after an RMA change', async () => {
    const f = fixture();
    await f.sync(job.id); expect(f.comments).toHaveLength(2);
    const before = f.writes(); await f.sync(job.id); expect(f.writes()).toBe(before);
    f.records.get(`job:${job.id}`).rmaEntries[0].status = 'approved';
    await f.sync(job.id); expect(f.comments).toHaveLength(2); expect(f.comments[0].data.text).toMatch(/approved/i);
  });
  it('adopts an existing backfill marker instead of posting another RMA', async () => {
    const f = fixture(); f.comments.push({ id: 'old', data: { text: 'Older content\nSolarOps RMA ID: rma-1' } });
    await f.sync(job.id); expect(f.comments).toHaveLength(2); expect(f.comments[0].id).toBe('old');
  });
  it('defers a concurrent writer while another card lease is held', async () => {
    const f = fixture(); f.records.set(`trello_sync_lock:${cardId}`, { owner: 'another-worker', expires: new Date(Date.now() + 60000).toISOString() });
    expect(await f.sync(job.id)).toMatchObject({ retry: true }); expect(f.writes()).toBe(0);
  });
  it('refuses a foreign board and leaves no success state', async () => {
    const f = fixture(); f.card.idBoard = 'foreign';
    await expect(f.sync(job.id)).rejects.toThrow('board not allowed');
    expect(f.writes()).toBe(0); expect(f.records.has(`trello_customer_sync:${job.id}`)).toBe(false);
  });
  it('does not unarchive or write an archived duplicate', async () => {
    const f = fixture(); f.card.closed = true;
    expect(await f.sync(job.id)).toMatchObject({ skipped: 'archived card' }); expect(f.writes()).toBe(0);
  });
});

// The 2026-10-01 cleanup: Trello gets only what someone on the card needs, in a
// short format the owner can read at a glance.
describe('short Trello comment format', () => {
  it('a note is its text plus ONE tag line: SolarOps, author, date', () => {
    const c = customerSyncContent({ ...job, rmaEntries: [], activityHistory: [
      { id: 'n1', type: 'note_added', description: 'Sent Mail to get the info', userName: 'Cesar Jurado (Admin)', timestamp: '2026-09-30T15:12:58.555Z' },
    ] }, customer).comments[0];
    const lines = c.text.split('\n');
    expect(lines[0]).toBe('Sent Mail to get the info');
    expect(lines.at(-1)).toMatch(/^\[SolarOps\]\(https:\/\/\S+#so-activity-n1\) · Cesar Jurado · Sep 30, 2026$/);
    expect(c.text).not.toMatch(/Original date|Author:|Type:|US-15704/);   // the old 5-line header is gone
  });

  it('posts notes and RMAs only, never internal bookkeeping', () => {
    const c = customerSyncContent({ ...job, notes: 'lead email copy', auditLog: [{ id: 'a1', details: 'Fields updated' }],
      activityHistory: [
        { id: 'w1', type: 'job_updated', description: 'Work order SO-1 updated, Inverter Change · new' },
        { id: 'i1', type: 'info_updated', description: 'Updated: Address: "-" -> "x"' },
        { id: 's1', type: 'status_changed', description: 'Stage draft -> draft' },
        { id: 'n1', type: 'note_added', description: 'Called, left voicemail' },
      ] }, { ...customer, notes: 'another copy' });
    expect(c.comments.map(x => x.legacyMarker)).toEqual(['SolarOps RMA ID: rma-1', 'SolarOps activity ID: n1']);
  });

  it('an RMA is one readable line, case number only when it differs, no money', () => {
    const r = { id: 'r9', rmaNumber: '7278902', caseNumber: '7278902', partDescription: 'Site Transfer', manufacturer: 'SolarEdge',
      status: 'pending', compensationAmount: 250, createdBy: 'Cesar Jurado (Admin)', createdAt: '2026-09-25T15:14:09.036Z' };
    expect(rmaComment(r).split('\n')[0]).toBe('RMA 7278902 · Site Transfer · SolarEdge · Pending');
    expect(rmaComment(r)).not.toMatch(/Case|250|Address|Customer:/);
    expect(rmaComment({ ...r, caseNumber: 'C-1' })).toContain('\nCase C-1\n');
    expect(rmaComment({ ...r, rmaNumber: '' })).toMatch(/^RMA \(number pending\)/);
  });

  it('cleans the tag: placeholder author dropped, date in the office time zone', () => {
    expect(tagAuthor('Not recorded')).toBeUndefined();
    expect(tagAuthor('Daniel Matos (Admin)')).toBe('Daniel Matos');
    // 01:30 UTC on Oct 1 is still the evening of Sep 30 in Florida.
    expect(tagDate('2026-10-01T01:30:00Z')).toBe('Sep 30, 2026');
    expect(tagLine('activity', 'x', 'Not recorded', 'bad date')).toBe('[SolarOps](https://solarflow-dashboard-sooty.vercel.app/#so-activity-x)');
  });

  it('rewrites a pre-cleanup comment IN PLACE, never posting a duplicate', async () => {
    const f = fixture();
    f.comments.push({ id: 'old', data: { text: 'SolarOps activity — US-15704 Serrano Lorena\nOriginal date: 2026-09-15\nAuthor: Staff\nType: activity\n\nCustomer called\nSolarOps activity ID: note-1' } });
    await f.sync(job.id);
    const note = f.comments.find(c => c.id === 'old');
    expect(note.data.text).toMatch(/^Customer called\n\n\[SolarOps\]/);
    expect(f.comments.filter(c => c.data.text.includes('Customer called'))).toHaveLength(1);
    // and a second run with nothing changed writes nothing
    const before = f.writes(); await f.sync(job.id); expect(f.writes()).toBe(before);
  });

  it('the import side still recognises the new format as our own echo', () => {
    expect(isSolarOpsEcho('Called\n\n[SolarOps](https://solarflow-dashboard-sooty.vercel.app/#so-activity-n1) · Cesar Jurado · Sep 30, 2026')).toBe(true);
    expect(isSolarOpsEcho('First call, no answer')).toBe(false);
  });
});

describe('retiring old bookkeeping comments (server side, 2026-10-01)', () => {
  const legacy = (type: string, body: string, id: string) =>
    `SolarOps activity — US-1 X\nOriginal date: 2026-09-30\nAuthor: Not recorded\nType: ${type}\n\n${body}\nSolarOps activity ID: ${id}`;

  it('retires exactly the categories no longer posted', () => {
    expect(isRetiredComment(legacy('job_updated', 'Work order SO-1 updated', 'w1'))).toBe(true);
    expect(isRetiredComment(legacy('info_updated', 'Updated: Address', 'i1'))).toBe(true);
    expect(isRetiredComment('SolarOps audit — SO-1\n\nFields updated\nSolarOps audit ID: a1')).toBe(true);
    expect(isRetiredComment('SolarOps service-order audit — SO-1\n\n{...}\n\nSolarOps audit import: j1')).toBe(true);
    expect(isRetiredComment('SolarOps record notes — X\n\nlead email\n\nSolarOps record notes: c1')).toBe(true);
  });

  it('never retires a note, an RMA, the new format, or anything a person wrote', () => {
    expect(isRetiredComment(legacy('note_added', 'Called her', 'n1'))).toBe(false);
    expect(isRetiredComment('RMA imported from SolarOps service order SO-1\nSolarOps RMA ID: r1')).toBe(false);
    expect(isRetiredComment('Called\n\n[SolarOps](https://x/#so-activity-n1) · A · Sep 30, 2026')).toBe(false);
    expect(isRetiredComment('First call, no answer. Type: job_updated')).toBe(false);   // a person typing similar words
    // Even a person's comment laid out like ours, without OUR marker line, stays.
    expect(isRetiredComment('Notes from the visit\nType: job_updated\nAuthor: Not recorded')).toBe(false);
    expect(isRetiredComment('Fields updated')).toBe(false);
  });

  it('one sync rewrites the note, deletes the bookkeeping, leaves the human comment', async () => {
    const f = fixture();
    f.comments.push(
      { id: 'human', data: { text: 'First call, no answer, vm sent' } },
      { id: 'w1', data: { text: legacy('job_updated', 'Work order SO-1 updated', 'w1') } },
      { id: 'a1', data: { text: 'SolarOps audit — SO-1\n\nFields updated\nSolarOps audit ID: a1' } },
      { id: 'old', data: { text: legacy('activity', 'Customer called', 'note-1') } },
    );
    const r = await f.sync(job.id);
    expect(r).toMatchObject({ removed: 2 });
    const ids = f.comments.map(c => c.id);
    expect(ids).toContain('human');
    expect(ids).not.toContain('w1');
    expect(ids).not.toContain('a1');
    expect(f.comments.find(c => c.id === 'old').data.text).toMatch(/^Customer called\n\n\[SolarOps\]/);
    // converged: a second pass deletes nothing more and writes nothing
    const before = f.writes(); await f.sync(job.id); expect(f.writes()).toBe(before);
  });
});

// 2026-10-09: one Trello card per client, every order and visit on it.
describe('one client card for every order', () => {
  const so1 = { ...job, createdAt: '2026-09-01', woStatus: 'paid', rmaEntries: [], activityHistory: [{ id: 'n1', type: 'note_added', description: 'Called client' }],
    visits: [{ id: 'j1:visit:1', number: 1, date: '2026-09-02', serviceType: 'Diagnostic', workDone: 'Found bad optimizer', labor: [{ id: 'l1', description: 'Diagnose', hours: 2 }], nextSteps: 'Replace optimizer', finishedAt: '2026-09-03T15:00:00Z', billing: { totalAmount: 900 } }],
    currentVisit: { id: 'j1:visit:2', number: 2 } };
  const so2 = { id: 'job-2', customerId: 'customer-1', woNumber: 'SO-2', serviceType: 'Inverter Change', woStatus: 'draft', createdAt: '2026-10-01' };
  const c = customerSyncContent(so2, customer, [so2, so1]);
  it('lists every order in the description, oldest first', () => {
    expect(c.block).toContain('Service orders:\n- SO-1 · Site Transfer · Visit 2 of 2 · Paid\n- SO-2 · Inverter Change · Draft');
  });
  it('posts a finished visit as its own comment with order, visit, date, work and hours, no money', () => {
    const v = c.comments.find(x => x.marker.includes('#so-visit-'))!;
    expect(v.text.split('\n')[0]).toBe('SO-1 · Visit 1 · Sep 2, 2026');
    expect(v.text).toContain('Work done: Found bad optimizer\n- Diagnose, 2 h\nLeft to do: Replace optimizer');
    expect(v.text).not.toMatch(/900|\$/);
  });
  it('prefixes notes with their order number when the client has several orders', () => {
    expect(c.comments.find(x => x.legacyMarker === 'SolarOps activity ID: n1')!.text).toMatch(/^SO-1 · Called client/);
  });
  it('treats the visit marker as a SolarOps echo', () => {
    expect(isSolarOpsEcho(c.comments.find(x => x.marker.includes('#so-visit-'))!.text)).toBe(true);
  });
});
