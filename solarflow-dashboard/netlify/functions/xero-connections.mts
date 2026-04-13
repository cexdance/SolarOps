// Netlify Function: Proxy Xero /connections to avoid CORS
export default async (req: Request) => {
  const auth = req.headers.get('Authorization');
  if (!auth) return new Response('Unauthorized', { status: 401 });

  const resp = await fetch('https://api.xero.com/connections', {
    headers: { Authorization: auth },
  });

  const text = await resp.text();
  return new Response(text, {
    status: resp.status,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config = { path: '/api/xero-connections' };
