import { describe, it, expect, vi } from 'vitest';
import { customerSyncContent, linkedCardId, makeCustomerSync, mergeCustomerDescription } from '../../../api/_trelloCustomerSync';

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
    expect(content.comments[0].marker).toBe('SolarOps RMA ID: rma-1');
  });
  it('unions duplicate activity IDs and excludes Trello echoes', () => {
    const content = customerSyncContent({ ...job, activityHistory: [...job.activityHistory, { id: 'trello-cmt-123', description: 'echo' }, { id: 'other', description: 'SolarOps RMA ID: rma-1' }] }, { ...customer, activityHistory: job.activityHistory });
    expect(content.comments.filter(c => c.marker.startsWith('SolarOps activity ID:'))).toHaveLength(1);
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
    await f.sync(job.id); expect(f.comments).toHaveLength(2); expect(f.comments[0].data.text).toContain('approved');
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
