import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Consolidated Xero proxy.
 *
 * Three previously-separate serverless functions (xero-token, xero-connections,
 * xero-api) are merged here behind a `?action=` selector to stay under the
 * Vercel Hobby 12-function limit. Behavior of each branch is preserved 1:1.
 *
 *   POST /api/xero?action=token        -> OAuth token exchange (identity.xero.com)
 *   GET  /api/xero?action=connections  -> tenant connections (api.xero.com/connections)
 *   *    /api/xero?action=api&path=... -> generic authenticated Xero API proxy
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = (req.query['action'] as string | undefined) ?? 'api';

  if (action === 'token') return handleToken(req, res);
  if (action === 'connections') return handleConnections(req, res);
  return handleApi(req, res);
}

// ── OAuth token exchange (was api/xero-token.ts) ─────────────────────────────
async function handleToken(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const clientSecret = process.env.XERO_CLIENT_SECRET;
  if (!clientSecret) {
    console.error('XERO_CLIENT_SECRET env var not set');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const body = typeof req.body === 'string' ? req.body : new URLSearchParams(req.body as Record<string, string>).toString();
  const params = new URLSearchParams(body);

  // Never accept client_secret from request, always use server env var
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

// ── Tenant connections (was api/xero-connections.ts) ─────────────────────────
async function handleConnections(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const upstream = await fetch('https://api.xero.com/connections', {
    headers: { Authorization: auth },
  });

  const text = await upstream.text();
  res.setHeader('Content-Type', 'application/json');
  return res.status(upstream.status).send(text);
}

// ── Generic Xero API proxy (was api/xero-api.ts) ─────────────────────────────
async function handleApi(req: VercelRequest, res: VercelResponse) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  // Forward the upstream Xero path supplied via ?path= (e.g. /api.xro/2.0/Invoices)
  const rawPath = (req.query['path'] as string | undefined) ?? '';
  const upstreamPath = rawPath.replace(/^\/?/, '/');
  const upstreamUrl = `https://api.xero.com${upstreamPath}`;

  const tenantId = req.headers['xero-tenant-id'] as string | undefined;

  const forwardHeaders: Record<string, string> = {
    Authorization: auth,
    Accept: 'application/json',
  };
  if (tenantId) forwardHeaders['xero-tenant-id'] = tenantId;
  if (req.headers['content-type']) forwardHeaders['Content-Type'] = req.headers['content-type'] as string;

  const body = req.method !== 'GET' && req.method !== 'HEAD'
    ? JSON.stringify(req.body)
    : undefined;

  const upstream = await fetch(upstreamUrl, {
    method: req.method,
    headers: forwardHeaders,
    body,
  });

  const text = await upstream.text();
  res.setHeader('Content-Type', 'application/json');
  return res.status(upstream.status).send(text);
}
