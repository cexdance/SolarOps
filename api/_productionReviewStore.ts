import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { REVIEW_KEY, emptyState, type ReviewState } from './_productionReview.ts';
export function storeConfig() {
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!key) throw new Error('Monitor storage is not configured');
  return { url: (process.env.SUPABASE_URL || 'https://cjmhfagkkayelcsprbai.supabase.co').trim(), headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } };
}
// The shared KV allows non-staff to access other namespaces. Encrypt this
// namespace so review notes and worker findings can only be read by the server.
// Authenticated encryption also rejects edits made outside the trusted API.
function encryptionKey() { return createHash('sha256').update(storeConfig().headers.apikey).update(':solarops-production-review:v1').digest(); }
export function sealState(state: ReviewState) {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(state), 'utf8'), cipher.final()]);
  return { format: 'aes-gcm-v1', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
}
export function openState(value: ReturnType<typeof sealState>): ReviewState {
  if (value.format !== 'aes-gcm-v1') throw new Error('Monitor state format is invalid');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(value.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.data, 'base64')), decipher.final()]).toString('utf8')) as ReviewState;
}
export async function readState() {
  const { url, headers } = storeConfig();
  const r = await fetch(`${url}/rest/v1/app_data?key=eq.${REVIEW_KEY}&select=value,updated_at`, { headers, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`Monitor storage read failed (${r.status})`);
  const rows = await r.json() as { value: ReturnType<typeof sealState>; updated_at: string }[];
  return { state: rows[0]?.value ? openState(rows[0].value) : emptyState(), version: rows[0]?.updated_at || null };
}
/** Compare-and-set prevents background updates from overwriting human reviews. */
export async function updateState(change: (state: ReviewState) => ReviewState): Promise<ReviewState> {
  const { url, headers } = storeConfig();
  for (let attempt = 0; attempt < 6; attempt++) {
    const { state, version } = await readState(); const next = change(state);
    const path = version ? `?key=eq.${REVIEW_KEY}&updated_at=eq.${encodeURIComponent(version)}` : '';
    const r = await fetch(`${url}/rest/v1/app_data${path}`, { method: version ? 'PATCH' : 'POST', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify(version ? { value: sealState(next) } : { key: REVIEW_KEY, value: sealState(next) }), signal: AbortSignal.timeout(20000) });
    if (r.status === 409) continue;
    if (!r.ok) throw new Error(`Monitor storage write failed (${r.status})`);
    if ((await r.json() as unknown[]).length) return next;
  }
  throw new Error('Monitor storage changed concurrently. Retry the operation.');
}
