import type { VercelRequest, VercelResponse } from '@vercel/node';

const SOLAREDGE_BASE = 'https://monitoringapi.solaredge.com';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Use server env var first; fall back to client-supplied key (stored in app Settings)
  const apiKey = process.env.SOLAREDGE_API_KEY || (req.query['api_key'] as string);
  if (!apiKey) {
    return res.status(500).json({ error: 'SolarEdge API key not configured. Add it in Settings or set SOLAREDGE_API_KEY env var.' });
  }

  // Forward the path and query, inject api_key server-side
  const { path = '/sites/list', ...queryParams } = req.query as Record<string, string>;

  // Build query string from client params, add api_key server-side
  const params = new URLSearchParams();
  Object.entries(queryParams).forEach(([k, v]) => {
    if (k !== 'path' && k !== 'api_key') params.set(k, v);
  });
  params.set('api_key', apiKey);

  const upstreamUrl = `${SOLAREDGE_BASE}${path}?${params.toString()}`;

  try {
    const upstream = await fetch(upstreamUrl);
    const data = await upstream.json();
    res.setHeader('Cache-Control', 'private, max-age=60');
    return res.status(upstream.status).json(data);
  } catch (err) {
    console.error('SolarEdge proxy error:', err);
    return res.status(502).json({ error: 'Upstream error' });
  }
}
