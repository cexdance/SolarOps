import { describe, it, expect } from 'vitest';
import { buildVisit, startNewBillingCycle, allVisits, mergeVisits } from '../lib/visits';
import { mergeJobFields } from '../lib/syncEngine';
import type { Job, WOVisit } from '../types';
import type { ContractorJob } from '../types/contractor';

const photos = (urls: string[]) => ({ before: urls, after: [] }) as unknown as ContractorJob['photos'];
const visit = (n: number, extra: Partial<WOVisit> = {}): WOVisit => ({
  id: `v${n}`, number: n, date: '2026-09-01', finishedAt: '2026-09-01T18:00:00Z',
  workDone: `visit ${n}`, photoUrls: [], updatedAt: '2026-09-01T18:00:00Z', ...extra,
});

describe('multi-visit service orders', () => {
  it('a new visit owns only the photos and parts it added', () => {
    const cj = {
      scheduledDate: '2026-09-10', contractorId: 'c1', operationalNotes: ' swapped optimizer ',
      photos: photos(['https://x/a.jpg', 'https://x/b.jpg', 'data:image/png;base64,zz']),
      parts: [{ id: 'p1', name: 'Opt' }, { id: 'p2', name: 'MC4' }],
      visits: [visit(1, { photoUrls: ['https://x/a.jpg'], parts: [{ id: 'p1' } as never] })],
    } as unknown as ContractorJob;
    const v = buildVisit(cj, '2026-09-10T20:00:00Z');
    expect(v.number).toBe(2);
    expect(v.date).toBe('2026-09-10');
    expect(v.workDone).toBe('swapped optimizer');
    expect(v.photoUrls).toEqual(['https://x/b.jpg']);
    expect(v.parts?.map(p => p.id)).toEqual(['p2']);
  });

  it('starting a new billing cycle archives quote + invoice onto the last visit and clears them', () => {
    const job = {
      id: 'j', quoteAmount: 400, quoteSentAt: 'q', invoicedAt: 'i', xeroInvoiceId: 'X1',
      lineItems: [{ id: 'l1' }], completedAt: 'c', visits: [visit(1)],
    } as unknown as Job;
    const patch = startNewBillingCycle(job, 'now')!;
    expect(patch.quoteAmount).toBeUndefined();
    expect(patch.xeroInvoiceId).toBeUndefined();
    expect(patch.completedAt).toBeUndefined();
    expect(patch.visits![0].billing).toMatchObject({ quoteAmount: 400, invoicedAt: 'i', xeroInvoiceId: 'X1', archivedAt: 'now' });
    expect(patch.visits![0].updatedAt).toBe('now');
    // Second start on the same visit is a no-op, and legacy single-visit orders never archive.
    expect(startNewBillingCycle({ ...job, ...patch } as Job)).toBeNull();
    expect(startNewBillingCycle({ ...job, visits: undefined } as Job)).toBeNull();
  });

  it('merge keeps every visit and the newest edit of each', () => {
    const office = [visit(1, { billing: { archivedAt: 'z' }, updatedAt: '2026-09-02' })];
    const phone = [visit(1), visit(2)];
    const merged = mergeVisits(phone, office)!;
    expect(merged.map(v => v.id)).toEqual(['v1', 'v2']);
    expect(merged[0].billing).toBeDefined();
    // Through the job field merge too, regardless of which side is newer.
    const a = { id: 'j', updatedAt: '2026-09-05', visits: office } as unknown as Job;
    const b = { id: 'j', updatedAt: '2026-09-01', visits: phone } as unknown as Job;
    expect(mergeJobFields(a, b).visits?.length).toBe(2);
    expect(mergeJobFields(b, a).visits?.find(v => v.id === 'v1')?.billing).toBeDefined();
  });

  it('report visits = finished visits + the current one', () => {
    const job = {
      scheduledDate: '2026-09-12', serviceReport: 'fixed', completedAt: 'c',
      woPhotos: [{ storageUrl: 'https://x/a.jpg' }, { storageUrl: 'https://x/c.jpg' }],
      visits: [visit(1, { photoUrls: ['https://x/a.jpg'] })],
    } as unknown as Job;
    const all = allVisits(job);
    expect(all.map(v => v.number)).toEqual([1, 2]);
    expect(all[1].photoUrls).toEqual(['https://x/c.jpg']);
    expect(allVisits({ scheduledDate: 'd' } as Job)).toHaveLength(1);
  });
});
