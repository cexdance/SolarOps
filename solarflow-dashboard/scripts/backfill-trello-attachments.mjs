#!/usr/bin/env node
/**
 * One-time backfill: copy Trello-hosted customer attachments into our own
 * customer-files bucket and rewrite the URL on the customer record.
 *
 * Why: the Trello importer stored the raw trello.com attachment URL on the
 * Customer. Those URLs are not public, they need a Trello session with access to
 * the board, so only the importing user could ever open them. Audited 2026-09-07:
 * 189 files across 54 customers. The importer itself is fixed separately; this
 * script repairs the rows that were already written.
 *
 * Safe by default. Prints a plan and changes nothing unless --apply is passed.
 * Idempotent: a file whose URL is already on Supabase Storage is skipped, so a
 * re-run after a partial failure only picks up what is left.
 *
 * Usage:
 *   node scripts/backfill-trello-attachments.mjs              # dry run
 *   node scripts/backfill-trello-attachments.mjs --apply      # do it
 *   node scripts/backfill-trello-attachments.mjs --apply --limit 5
 *
 * Required env (not committed, pull with `vercel env pull` and strip the quotes):
 *   SUPABASE_SERVICE_ROLE_KEY
 *   TRELLO_API_KEY   (or VITE_TRELLO_API_KEY)
 *   TRELLO_API_TOKEN (or VITE_TRELLO_TOKEN)
 */

import { readFileSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SUPABASE_URL = 'https://cjmhfagkkayelcsprbai.supabase.co';
const BUCKET = 'customer-files';
const MAX_SIZE = 10 * 1024 * 1024; // matches the bucket's own file_size_limit

const APPLY = process.argv.includes('--apply');
const LIMIT = (() => {
  const i = process.argv.indexOf('--limit');
  return i > -1 ? parseInt(process.argv[i + 1], 10) : Infinity;
})();
const LOG = resolve(HERE, `../../backfill-trello-attachments-${new Date().toISOString().slice(0, 10)}.log`);

// `vercel env pull` writes values QUOTED. Carrying a stray quote into a URL or an
// auth header produces errors that blame the wrong system, so strip them here.
function loadEnvFile(path) {
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch { /* file is optional */ }
}
loadEnvFile(resolve(HERE, '../.env.local'));
loadEnvFile(resolve(HERE, '../../.env.local'));

const SERVICE_ROLE = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim().replace(/^["']|["']$/g, '');
const TRELLO_KEY = (process.env.TRELLO_API_KEY || process.env.VITE_TRELLO_API_KEY || '').trim().replace(/^["']|["']$/g, '');
const TRELLO_TOKEN = (process.env.TRELLO_API_TOKEN || process.env.VITE_TRELLO_TOKEN || '').trim().replace(/^["']|["']$/g, '');

const missing = [
  !SERVICE_ROLE && 'SUPABASE_SERVICE_ROLE_KEY',
  !TRELLO_KEY && 'TRELLO_API_KEY',
  !TRELLO_TOKEN && 'TRELLO_API_TOKEN',
].filter(Boolean);
if (missing.length) {
  console.error(`Missing required env: ${missing.join(', ')}`);
  process.exit(1);
}

const sbHeaders = {
  Authorization: `Bearer ${SERVICE_ROLE}`,
  apikey: SERVICE_ROLE,
};

const log = (line) => {
  console.log(line);
  try { appendFileSync(LOG, line + '\n'); } catch { /* logging is best effort */ }
};

const isTrello = (u) => typeof u === 'string' && /^https:\/\/([a-z0-9-]+\.)*(trello\.com|trello-attachments\.s3\.amazonaws\.com)\//i.test(u);

/** Every customer:* row, paginated. PostgREST truncates at max-rows with error === null. */
async function fetchCustomerRows() {
  const rows = [];
  const PAGE = 500;
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/app_data?key=like.customer:*&select=key,value&order=key.asc`,
      { headers: { ...sbHeaders, Range: `${from}-${from + PAGE - 1}`, 'Range-Unit': 'items' } },
    );
    if (!res.ok) throw new Error(`app_data fetch failed: ${res.status} ${await res.text()}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

async function mirrorOne(url, customerId, fileName) {
  const att = await fetch(url, {
    headers: { Authorization: `OAuth oauth_consumer_key="${TRELLO_KEY}", oauth_token="${TRELLO_TOKEN}"` },
  });
  if (!att.ok) throw new Error(`Trello download ${att.status}`);

  const contentType = att.headers.get('content-type') ?? 'application/octet-stream';
  // Trello answers an unauthorized download with a 200 HTML login page. Storing
  // that would swap the file for a web page, which is worse than failing loudly.
  if (/^text\/html/i.test(contentType)) throw new Error('Trello returned an HTML page, not the file');

  const bytes = Buffer.from(await att.arrayBuffer());
  if (bytes.byteLength === 0) throw new Error('empty file');
  if (bytes.byteLength > MAX_SIZE) throw new Error(`too large (${Math.round(bytes.byteLength / 1024 / 1024)}MB)`);

  const safeName = String(fileName || 'trello-file').replace(/[^a-zA-Z0-9.-]/g, '_').slice(-120);
  const path = `${customerId}/backfill/${Date.now()}-${safeName}`;

  const up = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURI(path)}`, {
    method: 'POST',
    headers: { ...sbHeaders, 'Content-Type': contentType, 'x-upsert': 'true' },
    body: bytes,
  });
  if (!up.ok) throw new Error(`storage upload ${up.status} ${(await up.text()).slice(0, 200)}`);

  return {
    url: `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${encodeURI(path)}`,
    size: bytes.byteLength,
    mimeType: contentType,
  };
}

/**
 * Write back only the `files` array. A whole-record PUT here would be a
 * blind overwrite: this script holds a snapshot read minutes ago, and jobs and
 * customers sync whole-record last-write-wins, so re-sending every field would
 * revert anything edited in the browser in the meantime.
 */
async function writeFiles(key, files) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/rpc/jsonb_set_files`,
    { method: 'POST', headers: { ...sbHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_key: key, p_files: files }) },
  );
  if (res.status === 404) {
    // No helper RPC deployed. Fall back to a targeted PATCH of the files key
    // only, which PostgREST expresses as a merge on the jsonb column.
    const cur = await fetch(`${SUPABASE_URL}/rest/v1/app_data?key=eq.${encodeURIComponent(key)}&select=value`, { headers: sbHeaders });
    const [row] = await cur.json();
    if (!row) throw new Error('row vanished mid-run');
    const merged = { ...row.value, files };
    const patch = await fetch(`${SUPABASE_URL}/rest/v1/app_data?key=eq.${encodeURIComponent(key)}`, {
      method: 'PATCH',
      headers: { ...sbHeaders, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ value: merged, updated_at: new Date().toISOString() }),
    });
    if (!patch.ok) throw new Error(`patch ${patch.status} ${(await patch.text()).slice(0, 200)}`);
    // RLS returns 200 with zero rows affected when a write is blocked, so an
    // ok status is not proof. Count the rows.
    const affected = await patch.json();
    if (!Array.isArray(affected) || affected.length === 0) throw new Error('write affected 0 rows (RLS?)');
    return;
  }
  if (!res.ok) throw new Error(`rpc ${res.status}`);
}

const main = async () => {
  log(`\n=== Trello attachment backfill ${new Date().toISOString()} ${APPLY ? '(APPLY)' : '(dry run)'} ===`);

  const rows = await fetchCustomerRows();
  const targets = [];
  for (const row of rows) {
    const files = row.value?.files;
    if (!Array.isArray(files)) continue;
    const stale = files.filter(f => isTrello(f?.url));
    if (stale.length) targets.push({ key: row.key, name: row.value?.name ?? '(unnamed)', id: row.value?.id, files, stale });
  }

  const totalFiles = targets.reduce((n, t) => n + t.stale.length, 0);
  log(`${rows.length} customer rows, ${targets.length} with Trello-hosted files, ${totalFiles} files to copy.`);
  if (!APPLY) {
    for (const t of targets.slice(0, 20)) log(`  would copy ${t.stale.length} file(s) for ${t.name}`);
    if (targets.length > 20) log(`  ... and ${targets.length - 20} more customers`);
    log('\nDry run only. Re-run with --apply to perform the copy.');
    return;
  }

  let ok = 0, failed = 0, done = 0;
  for (const t of targets) {
    if (done >= LIMIT) { log(`\nStopped at --limit ${LIMIT}.`); break; }
    const rewritten = [];
    let changed = false;
    for (const f of t.files) {
      if (!isTrello(f?.url)) { rewritten.push(f); continue; }
      try {
        const stored = await mirrorOne(f.url, t.id ?? t.key.replace('customer:', ''), f.name);
        rewritten.push({ ...f, url: stored.url, size: stored.size ?? f.size, mimeType: stored.mimeType || f.mimeType });
        changed = true;
        ok++;
        log(`  ok   ${t.name} :: ${f.name}`);
      } catch (err) {
        // Keep the original entry. A file we could not copy is still a broken
        // link, but dropping it would destroy the only record that it existed.
        rewritten.push(f);
        failed++;
        log(`  FAIL ${t.name} :: ${f.name} :: ${err.message}`);
      }
    }
    if (changed) {
      try {
        await writeFiles(t.key, rewritten);
        done++;
      } catch (err) {
        log(`  WRITE FAILED ${t.name} :: ${err.message}`);
      }
    }
  }

  log(`\nDone. ${ok} files copied, ${failed} failed, ${done} customer rows updated.`);
  log('Hard-refresh every open tab: a stale tab is a live sync client and will re-push the old URLs.');
};

main().catch(err => { console.error(err); process.exit(1); });
