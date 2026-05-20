import type { VercelRequest, VercelResponse } from '@vercel/node';

// Proxy for all Xero API calls — strips /api/xero-api prefix and forwards to api.xero.com
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  // req.url will be something like /api.xro/2.0/Invoices
  const upstreamPath = (req.url ?? '').replace(/^\/?/, '/');
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
