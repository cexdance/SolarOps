/**
 * SolarOps — Trello Card Proxy
 *
 * Proxies Trello API calls server-side to:
 *   1. Bypass CORS restrictions (browser cannot fetch Trello API directly)
 *   2. Keep API credentials (key + token) secure server-side
 *   3. Provide a consistent interface for card fetching
 *
 * Credentials required:
 *   - TRELLO_API_KEY (set via Vercel env)
 *   - TRELLO_API_TOKEN (set via Vercel env)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

const TRELLO_BASE = 'https://api.trello.com/1';
// Support both server-side (TRELLO_*) and client-side legacy (VITE_TRELLO_*) names.
// .trim() strips trailing \n that Vercel env-pull can embed in quoted values.
const API_KEY = (process.env.TRELLO_API_KEY || process.env.VITE_TRELLO_API_KEY || '').trim();
const API_TOKEN = (process.env.TRELLO_API_TOKEN || process.env.VITE_TRELLO_TOKEN || '').trim();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Extract card ID or URL from query
  const { cardId } = req.query as { cardId: string };

  if (!cardId) {
    return res.status(400).json({ error: 'Missing cardId parameter' });
  }

  // Extract card ID from full URL if needed
  const idMatch = cardId.match(/trello\.com\/c\/([a-zA-Z0-9]+)/);
  const finalCardId = idMatch ? idMatch[1] : cardId.trim();

  if (!API_KEY || !API_TOKEN) {
    return res.status(500).json({
      error: 'Trello credentials not configured. Set TRELLO_API_KEY and TRELLO_API_TOKEN (or VITE_TRELLO_API_KEY/VITE_TRELLO_TOKEN) in Vercel env vars.',
      debug: {
        hasKey: !!API_KEY,
        hasToken: !!API_TOKEN,
      },
    });
  }

  const url =
    `${TRELLO_BASE}/cards/${finalCardId}` +
    `?key=${API_KEY}&token=${API_TOKEN}` +
    `&fields=name,desc,due,shortUrl,labels` +
    `&attachments=true&attachment_fields=all` +
    `&actions=commentCard&actions_limit=50`;

  try {
    const upstream = await fetch(url, {
      headers: { Accept: 'application/json' },
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: `Trello API ${upstream.status}: ${data.error || upstream.statusText}`,
      });
    }

    // Cache successful responses for 1 hour to reduce API load
    res.setHeader('Cache-Control', 'private, max-age=3600');

    return res.status(200).json(data);
  } catch (err) {
    console.error('[Trello proxy] upstream error:', err);
    return res.status(502).json({
      error: 'Could not reach Trello API. Check network connectivity.',
    });
  }
}
