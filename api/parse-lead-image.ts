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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({
      error: 'ANTHROPIC_API_KEY not configured. Add it to Vercel environment variables.',
    });
  }

  const { imageBase64, mimeType } = req.body as {
    imageBase64?: string;
    mimeType?: string;
  };

  if (!imageBase64) {
    return res.status(400).json({ error: 'Missing imageBase64' });
  }

  const validMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const safeMime = validMimeTypes.includes(mimeType ?? '')
    ? (mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp')
    : 'image/jpeg';

  try {
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
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: safeMime,
                  data: imageBase64,
                },
              },
              {
                type: 'text',
                text: EXTRACT_PROMPT,
              },
            ],
          },
        ],
      }),
    });

    if (!upstream.ok) {
      const errBody = await upstream.text();
      console.error('[parse-lead-image] Anthropic error:', upstream.status, errBody);
      return res.status(502).json({
        error: `AI service error ${upstream.status}. Check ANTHROPIC_API_KEY.`,
      });
    }

    const result = await upstream.json() as {
      content: Array<{ type: string; text?: string }>;
    };

    const textBlock = result.content.find(b => b.type === 'text');
    const raw = textBlock?.text ?? '';

    // Extract JSON from the response (Claude sometimes wraps in markdown)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(422).json({ error: 'Could not extract structured data from image', raw });
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Normalize phone, digits only
    if (parsed.phone) {
      parsed.phone = parsed.phone.replace(/\D/g, '');
    }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error('[parse-lead-image] error:', err);
    return res.status(500).json({
      error: 'Failed to parse lead image. Please try again.',
    });
  }
}
