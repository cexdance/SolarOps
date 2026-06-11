/**
 * SolarOps, Trello Card Proxy
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
  // Top-level safety net: if ANYTHING below throws, return a clean 500 instead
  // of Vercel's FUNCTION_INVOCATION_FAILED page (the previous behavior, an
  // un-stringifiable cardId array crashed before the inner try/catch ran).
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // req.query values are string | string[] | undefined, normalize to string.
    // Previously typed as `string` and used directly with .match()/.trim(); if a
    // caller (or a duplicated query param) made it an array, the function
    // crashed with "cardId.match is not a function" → FUNCTION_INVOCATION_FAILED.
    const raw = req.query.cardId;
    const cardId = Array.isArray(raw) ? raw[0] : raw;
    if (!cardId || typeof cardId !== 'string') {
      return res.status(400).json({ error: 'Missing cardId parameter' });
    }

    // Extract card ID from full URL if needed
    const idMatch = cardId.match(/trello\.com\/c\/([a-zA-Z0-9]+)/);
    const finalCardId = (idMatch ? idMatch[1] : cardId).trim();
    if (!/^[a-zA-Z0-9]+$/.test(finalCardId)) {
      return res.status(400).json({ error: 'Invalid cardId, expected an alphanumeric Trello card id or URL.' });
    }

    if (!API_KEY || !API_TOKEN) {
      return res.status(500).json({
        error: 'Trello credentials not configured. Set TRELLO_API_KEY and TRELLO_API_TOKEN (or VITE_TRELLO_API_KEY/VITE_TRELLO_TOKEN) in Vercel env vars.',
        debug: { hasKey: !!API_KEY, hasToken: !!API_TOKEN },
      });
    }

    const url =
      `${TRELLO_BASE}/cards/${finalCardId}` +
      `?key=${API_KEY}&token=${API_TOKEN}` +
      `&fields=name,desc,due,shortUrl,labels` +
      `&attachments=true&attachment_fields=all` +
      // checklists + custom fields often hold the phone number and address;
      // actions unfiltered so desc edits (updateCard) are mined too, not just comments
      `&checklists=all` +
      `&customFieldItems=true` +
      `&actions=commentCard,updateCard&actions_limit=1000`;

    let upstream: Response;
    try {
      upstream = await fetch(url, { headers: { Accept: 'application/json' } });
    } catch (err) {
      console.error('[Trello proxy] fetch failed:', err);
      return res.status(502).json({ error: 'Could not reach Trello API. Check network connectivity.' });
    }

    // Read body as text first so a non-JSON response (HTML error page, empty
    // body on 429/504) doesn't crash json() and turn into a 500.
    const bodyText = await upstream.text().catch(() => '');
    let data: any = null;
    if (bodyText) {
      try { data = JSON.parse(bodyText); } catch { /* leave as null */ }
    }

    if (!upstream.ok) {
      const msg = (data && (data.error || data.message)) || upstream.statusText || bodyText.slice(0, 200) || 'unknown error';
      return res.status(upstream.status).json({ error: `Trello API ${upstream.status}: ${msg}` });
    }
    if (data == null) {
      return res.status(502).json({ error: 'Trello API returned an unreadable response.' });
    }

    // Cache successful responses for 1 hour to reduce API load
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.status(200).json(data);
  } catch (err) {
    console.error('[Trello proxy] unhandled error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Trello proxy crashed unexpectedly.',
    });
  }
}
