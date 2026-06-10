/**
 * SolarOps — Trello Card Proxy
 *
 * GET /api/trello-card?cardId=<url-or-short-id>
 *
 * Fetches a Trello card (with attachments and comments) server-side so the
 * browser never needs CORS access to api.trello.com.
 *
 * Env vars required (set in Vercel dashboard, server-side only):
 *   TRELLO_API_KEY
 *   TRELLO_TOKEN
 * NOTE: do NOT use a VITE_ prefix for these — Vite inlines any VITE_-prefixed
 * var into the browser bundle, which would leak full Trello account access.
 * The legacy VITE_-prefixed names are still read as a fallback for transition.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireUser } from './_auth.js';

const TRELLO_BASE = 'https://api.trello.com/1';

/** Extract the short card ID from a full Trello URL or return as-is. */
function resolveCardId(urlOrId: string): string {
  // https://trello.com/c/XXXXXXXX  or  https://trello.com/c/XXXXXXXX/card-name
  const match = urlOrId.match(/trello\.com\/c\/([^/?#]+)/);
  if (match) return match[1];
  // Already a bare ID
  return urlOrId.trim();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!(await requireUser(req, res))) return;

  const raw = req.query.cardId;
  if (!raw || typeof raw !== 'string') {
    return res.status(400).json({ error: 'cardId query param required' });
  }

  // Prefer non-prefixed server-only names; fall back to legacy VITE_ names.
  const key   = process.env.TRELLO_API_KEY   || process.env.VITE_TRELLO_API_KEY;
  const token = process.env.TRELLO_TOKEN     || process.env.VITE_TRELLO_TOKEN;

  if (!key || !token) {
    console.error('[trello-card] Missing TRELLO_API_KEY or TRELLO_TOKEN env vars');
    return res.status(500).json({ error: 'Trello credentials not configured on server' });
  }

  const cardId = resolveCardId(raw);

  const fields = 'name,desc,due,shortUrl,labels';
  const url = `${TRELLO_BASE}/cards/${encodeURIComponent(cardId)}` +
    `?key=${key}&token=${token}` +
    `&fields=${fields}` +
    `&attachments=true` +
    `&attachment_fields=name,url,mimeType,bytes,previews` +
    `&actions=commentCard` +
    `&action_fields=data,date,memberCreator` +
    `&action_memberCreator_fields=fullName,username`;

  try {
    const trelloRes = await fetch(url);

    if (!trelloRes.ok) {
      const body = await trelloRes.text().catch(() => '');
      console.error(`[trello-card] Trello API ${trelloRes.status}:`, body);
      return res.status(trelloRes.status).json({
        error: `Trello returned ${trelloRes.status}`,
        detail: body,
      });
    }

    const card = await trelloRes.json();

    // Forward the raw Trello response — trelloImporter.ts maps the fields
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(card);

  } catch (err) {
    console.error('[trello-card] fetch error:', err);
    return res.status(502).json({ error: 'Failed to reach Trello API', detail: String(err) });
  }
}
