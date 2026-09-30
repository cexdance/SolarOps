// Backfill: every Trello comment on the Conexsol Florida Services board lands in
// the matching SolarOps record's activity log (owner decision 2026-09-30).
//
// Comments used to reach SolarOps only through two one-off scripts, the last on
// 09-01, so every comment since then was missing: leads worked entirely in
// Trello looked untouched in LL and got called twice.
//
// It does NOT re-implement the import. It replays each missing comment through
// the DEPLOYED webhook (`?commentsOnly`), so the verification, dedupe and clock
// stamping live in exactly one place (importCommentEvent in api/trello-card.ts).
// The dry run is computed locally and writes nothing.
//
//   node scripts/backfill-trello-comments.mjs            # dry run
//   node scripts/backfill-trello-comments.mjs --apply    # replay the missing ones
//
// Serial with a delay: this runs against the live function while the office
// is working, and Trello rate-limits per token.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BOARD = '6a5a58e06fbf97144b5d96c9';
const APPLY = process.argv.includes('--apply');
const PROD = (process.env.PROD_URL || 'https://solarflow-dashboard-sooty.vercel.app').replace(/\/$/, '');

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
if (!KEY || !TOK || !SR) { console.error('Missing Trello or Supabase credentials in solarflow-dashboard/.env(.local)'); process.exit(1); }
const sb = { Authorization: `Bearer ${SR}`, apikey: SR };

// Same two prefixes importedCommentIds() recognises in the webhook.
// Same markers isSolarOpsEcho() refuses (comments SolarOps posted itself). The
// webhook enforces this on every write; mirrored here only so the dry-run counts
// are honest.
const isEcho = (t) => /SolarOps (?:RMA ID|activity ID|audit ID|audit import|record notes):/.test(t ?? '');
const idsFor = (c) => [`trello-cmt-${c}`, `trello-comment-${c}`];

// 1. Every comment on the board, oldest first.
let comments = [], before = '';
for (;;) {
  const r = await fetch(`https://api.trello.com/1/boards/${BOARD}/actions?filter=commentCard&limit=1000${before}&key=${KEY}&token=${TOK}`);
  if (!r.ok) throw new Error(`Trello ${r.status}`);
  const page = await r.json();
  comments = comments.concat(page);
  if (page.length < 1000) break;
  before = `&before=${page[page.length - 1].id}`;
}
comments.sort((a, b) => a.date.localeCompare(b.date));

// 2. Every job row, to map cards to records and see what is already imported.
let rows = [], from = 0;
for (;;) {
  const r = await fetch('https://cjmhfagkkayelcsprbai.supabase.co/rest/v1/app_data?key=like.job:*&select=key,value',
    { headers: { ...sb, Range: `${from}-${from + 999}` } });
  const page = await r.json();
  if (!Array.isArray(page) || page.length === 0) break;
  rows = rows.concat(page);
  if (page.length < 1000) break;
  from += 1000;
}
const byCard = new Map();
for (const { key, value } of rows) {
  const m = /^job:job-trello-([0-9a-f]{24})$/i.exec(key);
  if (m) byCard.set(m[1], value);
  else if (value?.trelloCardId && !byCard.has(value.trelloCardId)) byCard.set(value.trelloCardId, value);
}

// 3. Classify.
const toImport = [], present = { 'trello-cmt': 0, 'trello-comment': 0 }, noRecord = [], echoes = [];
for (const a of comments) {
  if (isEcho(a.data?.text)) { echoes.push(a); continue; }
  const job = byCard.get(a.data?.card?.id);
  if (!job) { noRecord.push(a); continue; }
  const have = new Set((job.activityHistory ?? []).map(e => e.id));
  const hit = idsFor(a.id).find(id => have.has(id));
  if (hit) present[hit.startsWith('trello-cmt-') ? 'trello-cmt' : 'trello-comment']++;
  else toImport.push({ a, job });
}
const authors = {};
for (const { a } of toImport) { const n = a.memberCreator?.fullName || '?'; authors[n] = (authors[n] || 0) + 1; }
const leadsGaining = new Set(toImport.map(t => t.job.id));

console.log(`Board comments: ${comments.length} (${comments[0]?.date.slice(0, 10)} .. ${comments.at(-1)?.date.slice(0, 10)})`);
console.log(`  already imported:   ${present['trello-cmt'] + present['trello-comment']}  (trello-cmt ${present['trello-cmt']}, trello-comment ${present['trello-comment']})`);
console.log(`  TO IMPORT:          ${toImport.length}  onto ${leadsGaining.size} records`);
console.log(`  SolarOps echoes:    ${echoes.length}  (posted BY SolarOps, never imported back)`);
console.log(`  no SolarOps record: ${noRecord.length}  (card not a lead/order here; skipped)`);
console.log('  to import, by author:', JSON.stringify(authors));
const aless = toImport.filter(t => /alessandra/i.test(t.a.memberCreator?.fullName || t.a.memberCreator?.username || ''));
console.log(`  of which alessandra: ${aless.length}, onto ${new Set(aless.map(t => t.job.id)).size} records`);

if (!APPLY) {
  console.log('\nSample (first 8):');
  toImport.slice(0, 8).forEach(({ a, job }) =>
    console.log(`  ${a.date.slice(0, 16)}  ${(a.memberCreator?.fullName || '?').padEnd(18)} -> ${job.clientName || job.id}: "${(a.data?.text || '').replace(/\s+/g, ' ').slice(0, 60)}"`));
  console.log('\nDry run, nothing written. Re-run with --apply.');
  process.exit(0);
}

console.log(`\nAPPLYING via ${PROD}/api/trello-card?commentsOnly\n`);
const results = {};
for (const [i, { a }] of toImport.entries()) {
  let out;
  try {
    const r = await fetch(`${PROD}/api/trello-card?commentsOnly=1`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: { type: 'commentCard', id: a.id, data: { card: { id: a.data.card.id }, board: { id: BOARD } } } }),
    });
    out = r.ok ? (await r.json()).comment : `HTTP ${r.status}`;
  } catch (e) { out = `error ${e.message}`; }
  results[out] = (results[out] || 0) + 1;
  if ((i + 1) % 25 === 0 || i === toImport.length - 1) console.log(`  ${i + 1}/${toImport.length}  ${JSON.stringify(results)}`);
  await new Promise(r => setTimeout(r, 350));
}
console.log('\nDone:', JSON.stringify(results));
