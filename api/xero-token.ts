import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const clientSecret = process.env.XERO_CLIENT_SECRET;
  if (!clientSecret) {
    console.error('XERO_CLIENT_SECRET env var not set');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const body = typeof req.body === 'string' ? req.body : new URLSearchParams(req.body as Record<string, string>).toString();
  const params = new URLSearchParams(body);

  // Never accept client_secret from request — always use server env var
  params.delete('client_secret');
  params.set('client_secret', clientSecret);

  const upstream = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const text = await upstream.text();
  res.setHeader('Content-Type', 'application/json');
  return res.status(upstream.status).send(text);
}
