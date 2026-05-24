/**
 * SolarOps — SolarEdge API Proxy
 *
 * Proxies all SolarEdge monitoring API calls server-side to:
 *   1. Keep the API key out of client-side JS bundles (uses SOLAREDGE_API_KEY env var)
 *   2. Allow CORS-free requests from the browser
 *   3. Cache responses at CDN/browser layer to minimize daily quota usage
 *
 * SolarEdge free tier: ~300 calls/day. Cache strategy:
 *   - /energy endpoints (graphs): 1 hour  — data updates ~hourly
 *   - /overview / today stats: 15 min    — more frequently updated
 *   - /sites/list: 6 hours               — rarely changes
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

const SOLAREDGE_BASE = 'https://monitoringapi.solaredge.com';

// Cache durations by endpoint pattern (seconds)
function getCacheDuration(path: string): number {
  if (path.includes('/energy'))   return 3600;  // 1 hour — graph data
  if (path.includes('/overview')) return 900;   // 15 min — today's stats
  if (path.includes('/sites'))    return 21600; // 6 hours — site list
  return 1800; // 30 min default
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Use server env var first; fall back to client-supplied key (stored in app Settings)
  const apiKey = process.env.SOLAREDGE_API_KEY || (req.query['api_key'] as string);
  if (!apiKey) {
    return res.status(500).json({
      error: 'SolarEdge API key not configured. Add it in Settings or set SOLAREDGE_API_KEY env var.',
    });
  }

  const { path = '/sites/list', ...queryParams } = req.query as Record<string, string>;

  // Build upstream query string — inject api_key server-side, strip client's copy
  const params = new URLSearchParams();
  Object.entries(queryParams).forEach(([k, v]) => {
    if (k !== 'path' && k !== 'api_key') params.set(k, v);
  });
  params.set('api_key', apiKey);

  const upstreamUrl = `${SOLAREDGE_BASE}${path}?${params.toString()}`;
  const cacheSecs = getCacheDuration(path);

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: { Accept: 'application/json' },
    });

    const data = await upstream.json();

    // Propagate SolarEdge quota errors clearly
    if (upstream.status === 429) {
      return res.status(429).json({ error: 'SolarEdge daily API quota exceeded. Try again tomorrow.' });
    }

    // Pass through auth errors from SolarEdge
    if (upstream.status === 403 || upstream.status === 401) {
      return res.status(403).json({ error: 'Invalid SolarEdge API key or access denied.' });
    }

    // Cache successful responses to preserve daily quota
    if (upstream.ok) {
      res.setHeader('Cache-Control', `private, max-age=${cacheSecs}`);
    }

    return res.status(upstream.status).json(data);
  } catch (err) {
    console.error('[SolarEdge proxy] upstream error:', err);
    return res.status(502).json({ error: 'Could not reach SolarEdge API. Check network connectivity.' });
  }
}
