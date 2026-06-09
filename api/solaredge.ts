/**
 * SolarOps, SolarEdge API Proxy
 *
 * Proxies SolarEdge monitoring API calls server-side to:
 *   1. Keep the API key out of client-side JS bundles (uses SOLAREDGE_API_KEY env var)
 *   2. Allow CORS-free requests from the browser
 *   3. Cache responses at CDN/browser layer to minimize daily quota usage
 *
 * SolarEdge free tier: ~300 calls/day quota.
 *
 * Quota optimization strategy:
 * - Automated poller (solaredge-poller): 2×/day (9am, 1pm) = ~150 calls/day for alerts
 * - On-demand user-triggered sync: Energy graphs, equipment details, inventory
 *
 * Cache durations by endpoint:
 *   - /energy endpoints (graphs): 1 hour , production charts (on-demand via Sync button)
 *   - /overview / today stats: 15 min   , alerts and current power (automated poller)
 *   - /details, /equipment: No cache    , on-demand via Sync button
 *   - /sites/list: 6 hours              , site inventory (rarely changes)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

const SOLAREDGE_BASE = 'https://monitoringapi.solaredge.com';

// Cache durations by endpoint pattern (seconds)
function getCacheDuration(path: string): number {
  if (path.includes('/energy'))   return 3600;   // 1 hour, production charts (on-demand via Sync)
  if (path.includes('/overview')) return 21600;  // 6 hours, alerts (covered by 2x/day automated poller)
  if (path.includes('/equipment')) return 3600;  // 1 hour, equipment/inverter list (on-demand via Sync)
  if (path.includes('/sites'))    return 21600;  // 6 hours, site list (rarely changes)
  return 3600; // 1 hour default
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Use server env var first; fall back to client-supplied key (stored in app Settings)
  // .trim() strips trailing \n that Vercel env-pull can embed in quoted values
  const apiKey = (process.env.SOLAREDGE_API_KEY || (req.query['api_key'] as string) || '').trim() || undefined;
  if (!apiKey) {
    return res.status(500).json({
      error: 'SolarEdge API key not configured. Add it in Settings or set SOLAREDGE_API_KEY env var.',
    });
  }

  const { path = '/sites/list', ...queryParams } = req.query as Record<string, string>;

  // Build upstream query string, inject api_key server-side, strip client's copy
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

    // Cache successful responses to preserve daily quota.
    // SolarEdge monitoring data is org-wide (identical for every staff user), so
    // cache at the SHARED CDN edge (s-maxage), not just per-browser (private).
    // One upstream call now serves the cached response to ALL staff for the window,
    // instead of every browser burning its own quota slice. stale-while-revalidate
    // lets the edge serve slightly-stale data while it refreshes in the background.
    if (upstream.ok) {
      res.setHeader(
        'Cache-Control',
        `public, max-age=${cacheSecs}, s-maxage=${cacheSecs}, stale-while-revalidate=${cacheSecs}`,
      );
    }

    return res.status(upstream.status).json(data);
  } catch (err) {
    console.error('[SolarEdge proxy] upstream error:', err);
    return res.status(502).json({ error: 'Could not reach SolarEdge API. Check network connectivity.' });
  }
}
