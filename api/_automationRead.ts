import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash, timingSafeEqual } from 'node:crypto';

const fields = {
  customers: ['id', 'clientId', 'name', 'firstName', 'lastName', 'clientStatus', 'type', 'createdAt', 'updatedAt', 'trelloBackupUrl'],
  jobs: ['id', 'customerId', 'title', 'serviceType', 'status', 'scheduledDate', 'createdAt', 'updatedAt', 'trelloCardId', 'trelloCardUrl'],
};
type Resource = keyof typeof fields;

export function validAutomationToken(header: unknown, expectedHash: string): boolean {
  if (typeof header !== 'string' || !/^Bearer\s+\S+$/i.test(header) || !/^[a-f0-9]{64}$/i.test(expectedHash)) return false;
  const actual = createHash('sha256').update(header.replace(/^Bearer\s+/i, '')).digest();
  return timingSafeEqual(actual, Buffer.from(expectedHash, 'hex'));
}

export function projectRecord(resource: Resource, value: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const field of fields[resource]) {
    if (typeof value[field] === 'string' || typeof value[field] === 'boolean') out[field] = value[field];
  }
  out.activityHistory = Array.isArray(value.activityHistory)
    ? value.activityHistory.filter(a => a && typeof a === 'object').map(a => {
        const entry: Record<string, unknown> = {};
        for (const key of ['id', 'type', 'description', 'timestamp', 'userName']) {
          if (typeof a[key] === 'string') entry[key] = a[key];
        }
        return entry;
      }) : [];
  return out;
}

// Dedicated credential, independent of staff login and staff write permissions.
// Only its SHA-256 hash is configured on the server. No database credentials
// or raw app_data payloads are returned to callers.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Read operations only' });
  }
  const hash = (process.env.SOLAROPS_AUTOMATION_TOKEN_SHA256 ?? '').trim();
  if (!validAutomationToken(req.headers.authorization, hash)) return res.status(401).json({ error: 'Unauthorized' });
  const resource = req.query.resource;
  if (resource !== 'customers' && resource !== 'jobs') return res.status(400).json({ error: 'Invalid resource' });
  const limit = req.query.limit === undefined ? 50 : Number(req.query.limit);
  const offset = req.query.offset === undefined ? 0 : Number(req.query.offset);
  if (Array.isArray(req.query.limit) || Array.isArray(req.query.offset) || !Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 100000) {
    return res.status(400).json({ error: 'Invalid pagination' });
  }
  const url = (process.env.SUPABASE_URL ?? '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !key) return res.status(503).json({ error: 'Connection unavailable' });
  const prefix = resource === 'customers' ? 'customer:' : 'job:';
  const query = new URLSearchParams({ key: `like.${prefix}*`, select: 'value', order: 'key.asc', limit: String(limit), offset: String(offset) });
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  try {
    // Honor the same shared deletion markers as the application.
    const tombstoneKey = resource === 'customers' ? 'deleted_customer_ids' : 'deleted_job_ids';
    const tombQuery = new URLSearchParams({ key: `eq.${tombstoneKey}`, select: 'value' });
    const [records, tombstones] = await Promise.all([
      fetch(`${url}/rest/v1/app_data?${query}`, { headers, signal: AbortSignal.timeout(10000) }),
      fetch(`${url}/rest/v1/app_data?${tombQuery}`, { headers, signal: AbortSignal.timeout(10000) }),
    ]);
    if (!records.ok || !tombstones.ok) return res.status(502).json({ error: 'Read failed' });
    const rows = await records.json() as { value: Record<string, unknown> }[];
    const tombRows = await tombstones.json() as { value: unknown }[];
    const tombValue = tombRows[0]?.value;
    if (tombValue !== undefined && (!Array.isArray(tombValue) || tombValue.some(id => typeof id !== 'string'))) return res.status(502).json({ error: 'Invalid deletion markers' });
    const deleted = new Set(Array.isArray(tombValue) ? tombValue : []);
    const items = rows.filter(row => row.value && typeof row.value === 'object' && !Array.isArray(row.value) && !deleted.has(row.value.id) && !row.value.deletedAt).map(row => projectRecord(resource, row.value));
    return res.status(200).json({ items, nextOffset: rows.length === limit ? offset + limit : null });
  } catch {
    return res.status(502).json({ error: 'Read unavailable' });
  }
}
