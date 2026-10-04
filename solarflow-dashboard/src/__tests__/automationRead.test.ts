// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import handler, { projectRecord, validAutomationToken } from '../../../api/automation-read';

const token = 'fixture-only-token';
const hash = createHash('sha256').update(token).digest('hex');
function response() {
  const res = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('rejects missing, incorrect, malformed and unconfigured credentials', () => {
  expect(validAutomationToken(`Bearer ${token}`, hash)).toBe(true);
  for (const header of [undefined, '', 'Bearer', 'Bearer wrong', ['Bearer ' + token]]) expect(validAutomationToken(header, hash)).toBe(false);
  expect(validAutomationToken(`Bearer ${token}`, '')).toBe(false);
});

it('excludes financial fields, attachments and unexpected nested data', () => {
  const record = projectRecord('jobs', { id: 'j1', totalAmount: 999, photos: ['private'], leadInfo: { private: true }, activityHistory: [{ id: 'a1', description: 'Called', attachments: ['private'], userId: 'u1' }] });
  expect(record).toEqual({ id: 'j1', activityHistory: [{ id: 'a1', description: 'Called' }] });
});

it('rejects every mutation before making upstream calls', async () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const res = response();
    await handler({ method, headers: {}, query: {} } as any, res as any);
    expect(res.status).toHaveBeenCalledWith(405);
  }
  expect(fetcher).not.toHaveBeenCalled();
});

it('requires authentication and rejects query injection', async () => {
  vi.stubEnv('SOLAROPS_AUTOMATION_TOKEN_SHA256', hash);
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  const res = response();
  await handler({ method: 'GET', headers: {}, query: { resource: 'jobs' } } as any, res as any);
  expect(res.status).toHaveBeenCalledWith(401);
  const invalid = response();
  await handler({ method: 'GET', headers: { authorization: `Bearer ${token}` }, query: { resource: 'jobs', limit: ['10', '10000'] } } as any, invalid as any);
  expect(invalid.status).toHaveBeenCalledWith(400);
  expect(fetcher).not.toHaveBeenCalled();
});

it('filters tombstones and returns only the approved projection', async () => {
  vi.stubEnv('SOLAROPS_AUTOMATION_TOKEN_SHA256', hash);
  vi.stubEnv('SUPABASE_URL', 'https://fixture.invalid');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fixture-server-key');
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([{ value: { id: 'j1', status: 'open', totalAmount: 99 } }, { value: { id: 'j2' } }]))).mockResolvedValueOnce(new Response(JSON.stringify([{ value: ['j2'] }])));
  vi.stubGlobal('fetch', fetcher);
  const res = response();
  await handler({ method: 'GET', headers: { authorization: `Bearer ${token}` }, query: { resource: 'jobs' } } as any, res as any);
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalledWith({ items: [{ id: 'j1', status: 'open', activityHistory: [] }], nextOffset: null });
  expect(fetcher.mock.calls.every(([, options]) => !options.method || options.method === 'GET')).toBe(true);
});
