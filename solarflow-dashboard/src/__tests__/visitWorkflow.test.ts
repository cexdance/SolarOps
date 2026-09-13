import { describe, it, expect } from 'vitest';
import { requestVisit, decideVisit, visitId, recordVisitPayment } from '../../../api/_serviceVisits';
import { mergeJobFields } from '../lib/syncEngine';
import { mergeVisitRecords, pickupJobsForContractor, toContractorJobView } from '../lib/woHelpers';
import { allVisits } from '../lib/visits';
import { getBillingColumn } from '../components/Billing';
import type { Job } from '../types';
const now = '2026-09-12T18:00:00.000Z';
const job = (patch: Partial<Job> = {}): Job => ({ id: 'j1', customerId: 'c1', contractorId: 'crew1', serviceType: 'Diagnostic', scheduledDate: '2026-09-11', scheduledTime: '09:00', status: 'in_progress', woStatus: 'in_progress', serviceReport: 'Diagnosed optimizer failure', quoteAmount: 120, quoteSentAt: '2026-09-10', clientPaidAt: '2026-09-11', xeroInvoiceId: 'invoice-1', laborHours: 2, totalAmount: 120, ...patch } as Job);
const input = { expectedVisitId: 'j1:visit:1', date: '2026-09-15', time: '10:00', serviceType: 'Optimizer replacement', reason: 'Bring replacement optimizer' };
const next = () => requestVisit(job(), input, 'tech', now);
describe('follow-up lifecycle', () => {
  it('archives paid visit and requests quote review without booking or closing', () => {
    const n = next(); expect(n.id).toBe('j1'); expect(n.visits).toHaveLength(1);
    expect(n.visits![0]).toMatchObject({ serviceType: 'Diagnostic', workDone: 'Diagnosed optimizer failure', billing: { quoteAmount: 120, xeroInvoiceId: 'invoice-1', clientPaidAt: '2026-09-11' } });
    expect(n.currentVisit).toMatchObject({ number: 2, serviceType: input.serviceType, approval: 'pending', proposedDate: input.date });
    for (const k of ['quoteSentAt','clientPaidAt','xeroInvoiceId','completedAt'] as const) expect(n[k]).toBeUndefined();
    expect(n.woStatus).toBe('draft'); expect(getBillingColumn(n)).toBe('new');
  });
  it('retries against same visit are idempotent', () => { const n = next(); expect(requestVisit(n, input, 'tech', now)).toBe(n); });
  it('requires valid date, time, service type and remaining work', () => {
    for (const p of [{ date: '' }, { date: '2026-02-30' }, { date: '2026-09-01' }, { time: '25:00' }, { serviceType: '' }, { reason: ' ' }]) expect(() => requestVisit(job(), { ...input, ...p }, 'tech', now)).toThrow();
  });
  it('prevents requesting another visit while approval is pending', () => { const n = next(); expect(() => requestVisit(n, { ...input, expectedVisitId: visitId(n) }, 'tech', now)).toThrow(/awaiting approval/); });
  it('allows 10 follow-ups and rejects visit 12', () => {
    let n = job(); for (let i = 0; i < 10; i++) { n = requestVisit(n, { ...input, expectedVisitId: visitId(n) }, 'tech', now); n = decideVisit(n, 'included', 'Service agreement', 'admin', now); }
    expect(n.currentVisit?.number).toBe(11); expect(() => requestVisit(n, { ...input, expectedVisitId: visitId(n) }, 'tech', now)).toThrow(/limit/);
  });
  it('included approval records actor, date and coverage', () => { const n = decideVisit(next(), 'included', 'Original quote Q1', 'admin', now); expect(n.currentVisit).toMatchObject({ approval: 'included', decidedBy: 'admin', decidedAt: now, decisionReason: 'Original quote Q1' }); expect(n.woStatus).toBe('quote_approved'); expect(n.xeroInvoiceId).toBeUndefined(); });
  it('quote approval requires sent quote, reference and usable date', () => {
    expect(() => decideVisit(next(), 'approved', 'Client accepted', 'admin', now)).toThrow(/quote/);
    expect(() => decideVisit(next(), 'included', '', 'admin', now)).toThrow(/reference/);
    expect(() => decideVisit({ ...next(), scheduledDate: '2026-09-01' }, 'included', 'covered', 'admin', now)).toThrow(/date/);
    expect(decideVisit({ ...next(), quoteSentAt: now }, 'approved', 'Customer email acceptance', 'admin', now).currentVisit?.approval).toBe('approved');
  });
  it('keeps pending follow-ups visible but unstartable', () => { const n = next(); expect(pickupJobsForContractor('crew1', [n])).toHaveLength(1); const view = toContractorJobView(n, { id: 'cj', status: 'completed', completedAt: now, operationalNotes: 'old work' } as never); expect(view.status).toBe('on_hold'); expect(view.completedAt).toBeUndefined(); expect(view.operationalNotes).toBe(''); });
  it('new visit beats a newer timestamp on stale previous-visit save', () => { const n = next(), stale = job({ updatedAt: '2026-09-20', woStatus: 'paid', status: 'paid' }); for (const m of [mergeJobFields(n, stale), mergeJobFields(stale, n)]) { expect(m.woStatus).toBe('draft'); expect(m.clientPaidAt).toBeUndefined(); expect(m.currentVisit?.number).toBe(2); } });
  it('late photos retain their visit and do not remove billing', () => { const n = next(), old = n.visits![0]; const merged = mergeVisitRecords([old], [{ ...old, billing: undefined, photoUrls: ['https://photo/late'], updatedAt: '2026-09-15' }])!; expect(merged[0].billing?.xeroInvoiceId).toBe('invoice-1'); const v = allVisits({ ...n, visits: merged, woPhotos: [{ id: 'p', storageUrl: 'https://photo/late', dataUrl: '', visitId: old.id } as never] }); expect(v[0].photoUrls).toContain('https://photo/late'); expect(v[1].photoUrls).not.toContain('https://photo/late'); });
  it('records parts and labor per visit', () => { const n = next(), id = visitId(n); const approved = decideVisit(n, 'included', 'Covered', 'admin', now); const snapshot = { parts: [{ id: 'usage2', visitId: id, inventoryItemId: 'optimizer', name: 'Optimizer', quantity: 1 }], visitLabor: [{ id: 'l2', visitId: id, description: 'Install', hours: 2, updatedAt: now }] }; const n3 = requestVisit(approved, { ...input, expectedVisitId: id, snapshot: snapshot as never }, 'tech', now); expect(n3.visits![1].parts?.[0].id).toBe('usage2'); expect(n3.visits![1].labor?.[0].hours).toBe(2); });
  it('keeps legacy single visit and displays empty planned follow-up', () => { expect(allVisits(job())).toHaveLength(1); expect(allVisits(next())).toHaveLength(2); });
  it('records an earlier invoice payment without changing the active visit', () => {
    const n = next(); const paid = recordVisitPayment({ ...n, visits: n.visits!.map(v => ({ ...v, billing: { ...v.billing!, clientPaidAt: undefined } })) }, 'j1:visit:1', 'Bank reference 123', 'admin', now);
    expect(paid.visits![0].billing?.paymentReference).toBe('Bank reference 123'); expect(paid.currentVisit).toEqual(n.currentVisit); expect(paid.clientPaidAt).toBeUndefined();
  });
  it('included approval sets no additional customer charge', () => {
    const n = decideVisit({ ...next(), totalAmount: 500, quoteAmount: 500 }, 'included', 'Covered', 'admin', now); expect(n.totalAmount).toBe(0); expect(n.quoteAmount).toBe(0);
  });

});
