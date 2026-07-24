/**
 * SolarOps, Lead Image Parser
 *
 * Accepts a screenshot of a SolarEdge leads email (base64-encoded) and uses
 * Claude Vision to extract structured lead data.
 *
 * POST /api/parse-lead-image
 * Body: { imageBase64: string, mimeType: string }
 * Returns: { firstName, lastName, email, phone, address, city, state, zip,
 *             notes, hsId, contractName }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

const ANTHROPIC_API_KEY = (process.env.ANTHROPIC_API_KEY || '').trim();

const EXTRACT_PROMPT = `You are a data extraction assistant. Extract the lead contact information from this email screenshot.

Return ONLY a valid JSON object with exactly these fields (use empty string "" if not found):
{
  "firstName": "",
  "lastName": "",
  "email": "",
  "phone": "",
  "address": "",
  "city": "",
  "state": "",
  "zip": "",
  "notes": "",
  "hsId": "",
  "contractName": ""
}

Rules:
- phone: digits only, no formatting
- address: street address only (not city/state/zip)
- notes: the "notes:" field content from the email
- hsId: the HS_ID value (numbers only, no formatting)
- contractName: the "Contract Name:" field value
- Do not include any text outside the JSON object`;

export type ParsedLead = {
  firstName: string; lastName: string; email: string; phone: string;
  address: string; city: string; state: string; zip: string;
  notes: string; hsId: string; contractName: string;
};

const VALID_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;

/**
 * Run Claude Vision on a base64 lead screenshot and return the structured
 * fields. Throws on any upstream/parse failure so callers can fall back.
 * Shared by this endpoint's handler and the Trello auto-import webhook
 * (trello-card.ts), which imports it directly to stay under the 12-function cap.
 */
export async function extractLeadFromImage(imageBase64: string, mimeType?: string): Promise<ParsedLead> {
  const safeMime = (VALID_IMAGE_MIME as readonly string[]).includes(mimeType ?? '')
    ? (mimeType as (typeof VALID_IMAGE_MIME)[number])
    : 'image/jpeg';

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: safeMime, data: imageBase64 } },
          { type: 'text', text: EXTRACT_PROMPT },
        ],
      }],
    }),
  });

  if (!upstream.ok) {
    const errBody = await upstream.text();
    throw new Error(`parse-lead-image upstream ${upstream.status}: ${errBody}`);
  }

  const result = await upstream.json() as { content: Array<{ type: string; text?: string }> };
  const raw = result.content.find(b => b.type === 'text')?.text ?? '';
  const jsonMatch = raw.match(/\{[\s\S]*\}/); // Claude sometimes wraps in markdown
  if (!jsonMatch) throw new Error(`parse-lead-image: no JSON in response: ${raw.slice(0, 200)}`);

  const parsed = JSON.parse(jsonMatch[0]) as ParsedLead;
  if (parsed.phone) parsed.phone = String(parsed.phone).replace(/\D/g, '');
  return parsed;
}

/**
 * Estimate a part's unit price from 3 live web sources via Claude's web_search
 * server tool. Returns { estimate, points }. Best-effort: on any failure it
 * returns an empty result so the UI falls back to manual entry.
 * ponytail: reuses this endpoint's Anthropic key/fetch to stay under Vercel's
 * 12-function cap; split into its own file only if it outgrows a single tool call.
 */
async function priceEstimate(body: { name?: string; partNumber?: string; manufacturer?: string }) {
  const q = [body.manufacturer, body.name, body.partNumber].filter(Boolean).join(' ').trim();
  if (!q) return { estimate: undefined, points: [] as { source: string; price: number; url?: string }[] };

  const prompt = `Find the current retail UNIT price in USD for this solar installation part from 3 different online retailers or distributors: "${q}".
Search the web, then return ONLY a JSON object, no other text:
{"estimate": <number, the average of the points>, "points": [{"source": "<store name>", "price": <number, per single unit>, "url": "<product url>"}]}
Rules: price is per single unit (not a case/box unless the item is only sold that way). Use up to 3 sources. If you cannot find a price, return {"estimate": null, "points": []}.`;

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!upstream.ok) {
    const errBody = await upstream.text();
    console.error('[price-estimate] Anthropic error:', upstream.status, errBody);
    throw new Error(`estimator upstream ${upstream.status}`);
  }

  const result = await upstream.json() as { content: Array<{ type: string; text?: string }> };
  // The final text block holds the JSON; earlier blocks are the tool calls/results.
  const raw = [...result.content].reverse().find(b => b.type === 'text' && b.text)?.text ?? '';
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { estimate: undefined, points: [] };
  const parsed = JSON.parse(match[0]) as { estimate?: number | null; points?: { source: string; price: number; url?: string }[] };
  return {
    estimate: typeof parsed.estimate === 'number' ? parsed.estimate : undefined,
    points: Array.isArray(parsed.points) ? parsed.points.filter(p => typeof p?.price === 'number') : [],
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({
      error: 'ANTHROPIC_API_KEY not configured. Add it to Vercel environment variables.',
    });
  }

  // Reroofing parts price estimator (Reroofing tab). Shares this endpoint to
  // stay under the Vercel Hobby 12-function cap.
  if ((req.body as { action?: string })?.action === 'price-estimate') {
    try {
      const out = await priceEstimate(req.body as { name?: string; partNumber?: string; manufacturer?: string });
      return res.status(200).json(out);
    } catch (err) {
      console.error('[price-estimate] error:', err);
      return res.status(502).json({ error: 'Price estimate failed', estimate: undefined, points: [] });
    }
  }

  const { imageBase64, mimeType } = req.body as {
    imageBase64?: string;
    mimeType?: string;
  };

  if (!imageBase64) {
    return res.status(400).json({ error: 'Missing imageBase64' });
  }

  try {
    const parsed = await extractLeadFromImage(imageBase64, mimeType);
    return res.status(200).json(parsed);
  } catch (err) {
    console.error('[parse-lead-image] error:', err);
    return res.status(502).json({
      error: 'Failed to parse lead image. Please try again.',
    });
  }
}
