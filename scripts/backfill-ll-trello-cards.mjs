// Backfill LL-board cards imported from Trello before the contact/label wiring
// landed: fills missing `leadInfo` (fix shipped 2026-08-20, 0acd3f7) and missing
// `labels` (shipped 2026-08-23).
//
// It does NOT re-implement the extraction. It replays the DEPLOYED webhook's own
// backfill path by POSTing a synthetic `addLabelToCard` action per card:
//   - no `listAfter` -> matchTargetList() returns undefined -> backfill branch
//   - type is in LABEL_ACTIONS -> labels are mirrored from Trello too
// So this script and a real Trello event go through byte-identical logic. The
// webhook's backfill is empty-only for contact fields, so a lead the team has
// edited by hand is never clobbered.
//
// Targets `job:job-trello-*` rows (the LL board). The older
// backfill-trello-leads.mjs targets the RETIRED Lead Lobby `crm.leads` blob and
// does not apply to the current model.
//
//   node scripts/backfill-ll-trello-cards.mjs             # dry run, reports gaps
//   node scripts/backfill-ll-trello-cards.mjs --apply     # replay the webhook
//   node scripts/backfill-ll-trello-cards.mjs --selftest  # pure-logic check
//
// ponytail: serial with a delay, not parallel. Each replay can trigger a Claude
// Vision call on a screenshot-only card, and hammering our own function while the
// office is working the board is not worth the seconds saved.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const BOARD_ID = '6a5a58e06fbf97144b5d96c9'; // Conexsol Florida Services (trello.com/b/eBhmHKjv)

// --- pure helpers (exercised by --selftest) ---
const cardIdOf = (jobId) => String(jobId || '').replace(/^job-trello-/, '');
const hasInfo = (j) => !!j?.leadInfo && Object.values(j.leadInfo).some(v => String(v ?? '').trim());
const hasLabels = (j) => Array.isArray(j?.labels) && j.labels.length > 0;
/** Still carrying the create-time placeholder, so the real lead text was lost. */
const hasPlaceholderNote = (j) => /^Auto-imported from Trello card "[^"]*"/.test(String(j?.notes ?? '').trim());
/** Locally visible gaps. NOT the replay gate: `pipelineStage` drift is invisible
 *  from here (it needs the card's current Trello list), and that was the biggest
 *  defect of all, so every card is replayed and this is only used for reporting. */
const needsBackfill = (j) => !hasInfo(j) || !hasLabels(j) || hasPlaceholderNote(j);

if (process.argv.includes('--selftest')) {
  const ok = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } };
  ok(cardIdOf('job-trello-6a628b16118b4729f0a1bd8b') === '6a628b16118b4729f0a1bd8b', 'card id extracted');
  ok(!hasInfo({}), 'no leadInfo');
  ok(!hasInfo({ leadInfo: { phone: '', email: '  ' } }), 'all-blank leadInfo is not seeded');
  ok(hasInfo({ leadInfo: { phone: '8138094163' } }), 'one real field counts as seeded');
  ok(!hasLabels({ labels: [] }), 'empty labels array');
  ok(hasLabels({ labels: [{ name: 'Invoiced', color: 'green' }] }), 'labels present');
  ok(needsBackfill({ leadInfo: { phone: '1' } }), 'has info but no labels -> still a gap');
  ok(!needsBackfill({ leadInfo: { phone: '1' }, labels: [{ name: 'x', color: '' }], notes: 'real text' }), 'all present -> no gap');
  ok(hasPlaceholderNote({ notes: 'Auto-imported from Trello card "image.jpeg"\n\nTrello card: https://x' }), 'placeholder note detected');
  ok(!hasPlaceholderNote({ notes: 'Hello team! You have received a new solar lead!' }), 'real lead text is not a placeholder');
  console.log('selftest: all assertions passed');
  process.exit(0);
}

// --- env ---
const env = {};
for (const p of [resolve(ROOT, 'solarflow-dashboard/.env.local'), resolve(ROOT, 'solarflow-dashboard/.env')]) {
  try {
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* absent is fine */ }
}
const SR = (process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
if (!SR) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY (solarflow-dashboard/.env).'); process.exit(1); }
const SUPABASE = 'https://cjmhfagkkayelcsprbai.supabase.co';
const PROD = (process.env.PROD_URL || 'https://solarflow-dashboard-sooty.vercel.app').replace(/\/$/, '');
const APPLY = process.argv.includes('--apply');
const h = { Authorization: `Bearer ${SR}`, apikey: SR, 'Content-Type': 'application/json' };

async function allTrelloJobs() {
  let rows = [], from = 0;
  for (;;) {
    const r = await fetch(`${SUPABASE}/rest/v1/app_data?key=like.job:job-trello-*&select=key,value`,
      { headers: { ...h, Range: `${from}-${from + 999}` } });
    if (!r.ok) throw new Error(`supabase read ${r.status}`);
    const b = await r.json();
    if (!Array.isArray(b) || b.length === 0) break;
    rows = rows.concat(b);
    if (b.length < 1000) break;
    from += 1000;
  }
  return rows.map(r => r.value).filter(Boolean);
}

const jobs = await allTrelloJobs();
// Replay ALL of them: the webhook reconciles pipelineStage against the card's
// current Trello list, and that drift cannot be seen from here.
const targets = jobs;
console.log(`${jobs.length} Trello-imported LL cards (replaying all, stage drift is only visible server-side).`);
console.log(`  locally visible gaps: leadInfo ${jobs.filter(j => !hasInfo(j)).length}, labels ${jobs.filter(j => !hasLabels(j)).length}, placeholder notes ${jobs.filter(hasPlaceholderNote).length}`);
console.log(APPLY ? `\nAPPLYING via ${PROD}/api/trello-card\n` : '\nDry run. Re-run with --apply to replay the webhook.\n');

if (!APPLY) {
  jobs.filter(needsBackfill).slice(0, 10).forEach(j =>
    console.log(`  ${j.clientName || '(no name)'}  info=${hasInfo(j) ? 'y' : 'NO'} labels=${hasLabels(j) ? j.labels.length : 'NO'} note=${hasPlaceholderNote(j) ? 'PLACEHOLDER' : 'ok'} stage=${j.pipelineStage}`));
  process.exit(0);
}

let ok = 0, failed = 0;
for (const [i, j] of targets.entries()) {
  const cardId = cardIdOf(j.id);
  try {
    const r = await fetch(`${PROD}/api/trello-card`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // Synthetic label event: hits the webhook's backfill branch (no listAfter)
      // AND its label-mirror branch. Same code a real Trello event runs.
      body: JSON.stringify({ action: { type: 'addLabelToCard', data: { card: { id: cardId }, board: { id: BOARD_ID } } } }),
    });
    const body = await r.text();
    if (!r.ok) { failed++; console.log(`  [${i + 1}/${targets.length}] ${j.clientName}: HTTP ${r.status} ${body.slice(0, 80)}`); }
    else { ok++; console.log(`  [${i + 1}/${targets.length}] ${j.clientName}: ${body.slice(0, 80)}`); }
  } catch (e) {
    failed++; console.log(`  [${i + 1}/${targets.length}] ${j.clientName}: ${e.message}`);
  }
  await new Promise(r => setTimeout(r, 900));
}

const after = await allTrelloJobs();
console.log(`\nreplayed ok=${ok} failed=${failed}`);
console.log(`still missing leadInfo: ${after.filter(j => !hasInfo(j)).length}   still missing labels: ${after.filter(j => !hasLabels(j)).length}`);
