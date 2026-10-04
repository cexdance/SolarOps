import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireUser } from './_auth';
import { readState, updateState, storeConfig } from './_productionReviewStore';
export async function productionReviewApi(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method || '')) return res.status(405).json({ error: 'Method not allowed' });
  const user = await requireUser(req, res); if (!user) return;
  try {
    const { url, headers } = storeConfig();
    const roleResponse = await fetch(`${url}/rest/v1/user_roles?user_id=eq.${encodeURIComponent(user.id)}&select=role&limit=1`, { headers, signal: AbortSignal.timeout(10000) });
    if (!roleResponse.ok) throw new Error('Role verification unavailable');
    const rows = await roleResponse.json() as { role: string }[];
    if (!['admin', 'coo', 'support', 'technician', 'sales'].includes(rows[0]?.role || '')) return res.status(403).json({ error: 'Staff access required' });
    if (req.method === 'GET') { const { energyCache: _cache, ...publicState } = (await readState()).state; return res.status(200).json(publicState); }
    if (!['admin', 'coo', 'support'].includes(rows[0]?.role || '')) return res.status(403).json({ error: 'Operations review access required' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!body || typeof body.id !== 'string' || !['in_review', 'reviewed', 'open'].includes(body.status)) return res.status(400).json({ error: 'Review ID and valid status are required' });
    const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 2000) : '';
    if (body.status === 'reviewed' && !notes) return res.status(400).json({ error: 'Add findings or next steps before completing the review' });
    const state = await updateState(current => {
      if (!current.reviews.some(r => r.id === body.id)) throw new Error('Review not found');
      return { ...current, reviews: current.reviews.map(r => r.id === body.id ? { ...r, status: body.status, reviewer: user.email || user.id, reviewedAt: new Date().toISOString(), notes } : r) };
    });
    const { energyCache: _cache, ...publicState } = state;
    return res.status(200).json(publicState);
  } catch (error) { return res.status(503).json({ error: error instanceof Error ? error.message : 'Review queue unavailable' }); }
}
