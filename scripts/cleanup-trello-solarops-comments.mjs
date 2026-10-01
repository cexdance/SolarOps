// Status report for the cleanup of the comments SolarOps posted to the Conexsol
// Florida Services Trello board (owner decision 2026-10-01: keep real notes and
// RMAs in a short format, remove internal bookkeeping).
//
// REPORT ONLY. The work itself is done SERVER-side by the customer sync
// (api/_trelloCustomerSync.ts): it rewrites old notes/RMAs in place and retires
// the bookkeeping comments (isRetiredComment) on every card it syncs. It runs
// on every save of a linked order and in the daily 10:00 UTC sweep (30 orders
// per run). It has to be server-side: the only Trello token with WRITE access
// lives in Vercel; the local one is read-only (Board:r), which is why the first
// local --apply on 2026-10-01 got 401 on every request and changed nothing.
//
//   node scripts/cleanup-trello-solarops-comments.mjs    # what is left to do

import { readFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BOARD = '6a5a58e06fbf97144b5d96c9';

const env = {};
for (const p of ['solarflow-dashboard/.env.local', 'solarflow-dashboard/.env']) {
  try {
    for (const line of readFileSync(resolve(ROOT, p), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* absent is fine */ }
}
const KEY = (env.TRELLO_API_KEY || env.VITE_TRELLO_API_KEY || '').trim();
const TOK = (env.TRELLO_API_TOKEN || env.VITE_TRELLO_TOKEN || '').trim();
const SR = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
if (!KEY || !TOK || !SR) { console.error('Missing Trello or Supabase credentials'); process.exit(1); }

// Compile the sync module so this script runs the production code path.
const out = resolve(tmpdir(), 'so-trello-sync-build');
mkdirSync(out, { recursive: true });
execSync(`npx tsc --target ES2022 --module es2022 --moduleResolution node --skipLibCheck --outDir ${out} ${resolve(ROOT, 'api/_trelloCustomerSync.ts')}`, { stdio: 'ignore' });
const { makeCustomerSync, customerSyncContent, linkedCardId } = await import(pathToFileURL(resolve(out, '_trelloCustomerSync.js')).href);

// Trello allows 100 requests / 10 s per token. Space every call out.
let last = 0;
const throttled = async (url, init) => {
  const wait = last + 130 - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  last = Date.now();
  return fetch(url, init);
};
const T = (path, init) => throttled(`https://api.trello.com/1/${path}${path.includes('?') ? '&' : '?'}key=${KEY}&token=${TOK}`, init);

async function boardComments() {
  let all = [], before = '';
  for (;;) {
    const page = await (await T(`boards/${BOARD}/actions?filter=commentCard&limit=1000${before}`)).json();
    all = all.concat(page);
    if (page.length < 1000) return all;
    before = `&before=${page[page.length - 1].id}`;
  }
}

/** keep | delete | clean | other, from a comment's text. */
function classify(text) {
  if (/#so-(?:activity|rma)-/.test(text)) return { action: 'clean', why: 'already in the new format' };
  if (/^SolarOps RMA ID:/m.test(text)) return { action: 'keep', why: 'RMA' };
  if (/^SolarOps activity ID:/m.test(text)) {
    const type = (text.match(/^Type: (.*)$/m) || [])[1];
    return type === 'note_added' || type === 'activity' || !type
      ? { action: 'keep', why: 'note' }
      : { action: 'delete', why: `automatic ${type}` };
  }
  if (/^SolarOps audit ID:/m.test(text)) return { action: 'delete', why: 'audit entry' };
  if (/SolarOps audit import:/.test(text)) return { action: 'delete', why: 'raw JSON audit dump' };
  if (/^SolarOps record notes:/m.test(text)) return { action: 'delete', why: 'record notes copy' };
  return { action: 'other', why: 'not a SolarOps comment' };
}

const before = await boardComments();
const tally = {};
for (const a of before) {
  const c = classify(a.data?.text || '');
  if (c.action === 'other') continue;
  const k = `${c.action}: ${c.why}`;
  tally[k] = (tally[k] || 0) + 1;
}
console.log(`Board comments: ${before.length}`);
Object.entries(tally).sort().forEach(([k, n]) => console.log(`  ${String(n).padStart(4)}  ${k}`));

// Linked customer jobs the sync covers.
let rows = [], from = 0;
for (;;) {
  const r = await fetch('https://cjmhfagkkayelcsprbai.supabase.co/rest/v1/app_data?key=like.job:*&select=value',
    { headers: { apikey: SR, Authorization: `Bearer ${SR}`, Range: `${from}-${from + 999}` } });
  const page = await r.json();
  if (!Array.isArray(page) || !page.length) break;
  rows = rows.concat(page);
  if (page.length < 1000) break;
  from += 1000;
}
const jobs = rows.map(r => r.value).filter(j => j && j.customerId && linkedCardId(j));
console.log(`\nLinked customer service orders the sync will rewrite: ${jobs.length}`);

// Show a real before/after for one card that still has an old-format note.
{
  const sample = before.find(a => classify(a.data?.text || '').why === 'note');
  if (sample) {
    const job = jobs.find(j => linkedCardId(j) === sample.data.card.id);
    const id = (sample.data.text.match(/^SolarOps activity ID: (.*)$/m) || [])[1];
    const cust = job && (await (await fetch(`https://cjmhfagkkayelcsprbai.supabase.co/rest/v1/app_data?key=eq.customer:${encodeURIComponent(job.customerId)}&select=value`, { headers: { apikey: SR, Authorization: `Bearer ${SR}` } })).json())[0]?.value;
    const after = job && cust && customerSyncContent(job, cust).comments.find(c => c.legacyMarker === `SolarOps activity ID: ${id}`);
    if (after) console.log('\nNext rewrite, e.g.:\n' + after.text.slice(-200));
  }
}
const left = Object.entries(tally).filter(([k]) => !k.startsWith('clean')).reduce((n, [, v]) => n + v, 0);
console.log(left ? `\n${left} comments still to clean. The server finishes them on the next sweep(s) or saves.` : '\nAll clean.');
