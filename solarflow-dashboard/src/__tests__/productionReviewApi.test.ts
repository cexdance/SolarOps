import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../../api/_auth', () => ({ requireUser: vi.fn() }));
vi.mock('../../../api/_productionReviewStore', () => ({ readState: vi.fn(), updateState: vi.fn(), storeConfig: () => ({ url: 'https://test.invalid', headers: {} }) }));
import { requireUser } from '../../../api/_auth';
import { updateState } from '../../../api/_productionReviewStore';
import { productionReviewApi } from '../../../api/_productionReviewApi';
function response() { return { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() }; }
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });
describe('production review API access', () => {
  it('fails closed for anonymous requests', async () => {
    vi.mocked(requireUser).mockResolvedValue(null); const res = response(); await productionReviewApi({ method: 'GET' } as never, res as never); expect(updateState).not.toHaveBeenCalled();
  });
  it('blocks contractors even if profile metadata claims admin', async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: 'u', user_metadata: { role: 'admin' } }); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[{"role":"contractor"}]')));
    const res = response(); await productionReviewApi({ method: 'GET' } as never, res as never); expect(res.status).toHaveBeenCalledWith(403);
  });
  it('requires review notes and operations role for completion', async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: 'u' }); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[{"role":"support"}]')));
    const res = response(); await productionReviewApi({ method: 'POST', body: { id: 'r', status: 'reviewed', notes: ' ' } } as never, res as never); expect(res.status).toHaveBeenCalledWith(400); expect(updateState).not.toHaveBeenCalled();
  });
});
