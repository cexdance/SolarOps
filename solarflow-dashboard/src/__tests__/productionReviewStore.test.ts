import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyState } from '../../../api/_productionReview';
import { openState, sealState, updateState } from '../../../api/_productionReviewStore';
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('production review store', () => {
  it('encrypts notes and rejects tampering', () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key'); const state = emptyState();
    state.reviews.push({ id: '1', siteId: 1, name: 'Private customer', kind: 'production', finding: { kind: 'production', detail: 'Review needed' }, openedAt: '', lastCheckedAt: '', active: true, status: 'reviewed', notes: 'Private review notes' });
    const sealed = sealState(state); expect(JSON.stringify(sealed)).not.toContain('Private'); expect(openState(sealed)).toEqual(state);
    expect(() => openState({ ...sealed, data: Buffer.from('tampered').toString('base64') })).toThrow();
  });
  it('retries a lost compare-and-set and preserves a concurrent human decision', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key'); const first = emptyState(); const newer = { ...first, recipients: ['human@example.com'] };
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([{ value: sealState(first), updated_at: '2026-10-04T00:00:00Z' }])))
      .mockResolvedValueOnce(new Response('[]'))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ value: sealState(newer), updated_at: '2026-10-04T00:01:00Z' }])))
      .mockResolvedValueOnce(new Response('[{}]'));
    vi.stubGlobal('fetch', fetch); const result = await updateState(s => ({ ...s, reviews: [] })); expect(result.recipients).toEqual(['human@example.com']); expect(fetch).toHaveBeenCalledTimes(4);
    expect(fetch.mock.calls[1]![0]).toContain('updated_at=eq.');
  });
});
