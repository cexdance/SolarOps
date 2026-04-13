// Netlify Function: Xero token exchange (server-side, keeps client_secret safe)
// Handles both authorization_code and refresh_token grant types

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const clientSecret = process.env.XERO_CLIENT_SECRET;
  if (!clientSecret) {
    console.error('XERO_CLIENT_SECRET env var not set');
    return new Response('Server configuration error', { status: 500 });
  }

  const body = await req.text();
  const params = new URLSearchParams(body);

  // Never accept client_secret from the request body — always use env var
  params.delete('client_secret');
  params.set('client_secret', clientSecret);

  const resp = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const text = await resp.text();
  return new Response(text, {
    status: resp.status,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config = { path: '/api/xero-token' };
