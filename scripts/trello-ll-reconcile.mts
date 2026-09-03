// One-time Trello <-> Lead Lobby reconciliation.
//
// Direction (user decision, 2026-09-03): LL PREVAILS. For a card that already
// has an LL job, nothing LL holds is overwritten. Trello only CONTRIBUTES what
// LL is missing:
//   - comments and card activity  -> job.activityHistory (append, deduped)
//   - address / city / state / zip -> job.leadInfo.*      (fill empty only)
//   - SolarEdge Site ID            -> job.solarEdgeSiteId (fill empty only)
//   - inverter serial              -> job.siteTransferInverterSerial (empty only)
// A card with NO LL job is imported through the live webhook endpoint, which is
// the same code path Anthony's cards take, so there is exactly one importer.
//
// Run with --apply to write. Default is a dry run that writes a report and
// touches nothing.
//
// ponytail: a script, not a feature. This runs once. If it ever needs to run
// on a schedule, that is the signal the mirror needs periodic convergence
// (see the 09-03 note), and this file is the wrong shape for that.
import fs from 'node:fs';
import path from 'node:path';
// The app's own tested address parser (src/__tests__/addressNormalize.test.ts),
// the same one lib/trelloImporter.ts uses. Reused rather than reimplemented so
// an address reconciled here parses identically to one imported normally.
import { parseUsAddress } from '../solarflow-dashboard/src/lib/addressValidator';

const APPLY = process.argv.includes('--apply');
const BOARD = '6a5a58e06fbf97144b5d96c9';
const SUPABASE_URL = 'https://cjmhfagkkayelcsprbai.supabase.co';
const WEBHOOK = 'https://solarflow-dashboard-sooty.vercel.app/api/trello-card';

const envFile = process.env.RECONCILE_ENV;
if (!envFile) { console.error('Set RECONCILE_ENV to a pulled prod env file'); process.exit(1); }
const env = Object.fromEntries(
  fs.readFileSync(envFile, 'utf8').split('\n').filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);
const KEY = env.TRELLO_API_KEY, TOKEN = env.TRELLO_API_TOKEN;
const SRK = env.SUPABASE_SERVICE_ROLE_KEY;
const sbHeaders = { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json' };
const auth = `key=${KEY}&token=${TOKEN}`;

const j = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url.split('?')[0]}`);
  return r.json();
};

// ── Extraction ─────────────────────────────────────────────────────────────
// Runs over the card's desc + every comment, because in practice the address
// and the serial are as likely to be in a comment as in the body.

// SolarEdge site ids are 6-7 digits. Requiring a label prevents matching a zip,
// a phone fragment, or a case number, all of which are the same shape.
const SITE_ID = /(?:site\s*(?:id|#|number)?|site)\s*[:#]?\s*(\d{6,7})\b/i;

// SolarEdge inverter serial, calibrated against the REAL board text, not from
// memory: SV1723-075025D68-3C, SJ0519-0731EFA2E-B9, SU1519-0BF102DF4-F0.
// The middle segment is 9 HEX characters, not 9 digits. My first pattern
// required [0-9]{9} and therefore matched 0 of the 18 serials actually on the
// board while looking like it worked. Anchored so it cannot swallow the part
// number SE7600H-USMNBBL14, which sits right next to the serial on RMA cards.
const SERIAL = /\b([A-Z]{2}\d{4}-[0-9A-F]{9}-[0-9A-F]{2})\b/g;

// A line that looks like a street address: house number, some words, a street
// suffix. This only SELECTS the line; parseUsAddress does the parsing, so the
// app has one address parser and this script is not a second one.
const ADDRESS_LINE = /\b\d{1,6}\s+[\w.'#-]+(?:\s+[\w.'#-]+){0,6}\s+(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|blvd|boulevard|ct|court|cir|circle|way|ter|terrace|pl|place|pkwy|parkway|hwy|highway|trl|trail)\b\.?/i;

function extract(text) {
  const out = {};
  const site = text.match(SITE_ID);
  if (site) out.solarEdgeSiteId = site[1];

  // ALL serials, not the first. An RMA card carries the failed one AND the
  // replacement, and guessing which is "the" inverter serial is exactly the
  // kind of coin-flip that quietly corrupts a warranty record. One serial is
  // written automatically; more than one is reported for a human to pick.
  const serials = [...new Set((text.match(SERIAL) || []))];
  if (serials.length) out.serials = serials;
  if (serials.length === 1) out.siteTransferInverterSerial = serials[0];

  for (const rawLine of text.split(/[\n\r]+/)) {
    const line = rawLine.replace(/\s+/g, ' ').trim();
    if (!ADDRESS_LINE.test(line)) continue;
    // Strip a leading label so "Address: 123 Main St, Tampa, FL 33625" parses.
    let cleaned = line.replace(/^.*?(?=\d{1,6}\s)/, '').replace(/[;|]+$/, '').trim();
    // parseUsAddress splits street from city on a COMMA, and falls back to
    // "the last word is the city" when there is none. On this board most
    // addresses are written without that comma, so the fallback produced
    // "Fort" + "Lauderdale" and "Cooper" + "City". Insert the comma the parser
    // expects, after the last street suffix, and its own comma branch gets it
    // right. Done here rather than inside parseUsAddress because that function
    // is shared with the live importer and is not what this task is changing.
    if (!cleaned.includes(',')
        || /\b(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|blvd|ct|court|cir|circle|way|ter|terrace|pl|place|pkwy|hwy|trl)\b\.?\s+[A-Za-z]/i.test(cleaned.split(',')[0])) {
      cleaned = cleaned.replace(
        /\b(st|street|ave|avenue|rd|road|dr|drive|ln|lane|blvd|boulevard|ct|court|cir|circle|way|ter|terrace|pl|place|pkwy|parkway|hwy|highway|trl|trail)\b\.?(?=\s+[A-Za-z])/i,
        '$1,',
      );
    }
    const parsed = parseUsAddress(cleaned);
    if (parsed) { Object.assign(out, parsed); break; }
    // No state+zip on the line: keep the street only. A partial address is
    // useful; a city invented from the street's tail is not.
    if (!out.address) out.address = (cleaned.match(ADDRESS_LINE) || [cleaned])[0].trim();
  }
  return out;
}

// ── Load both sides ────────────────────────────────────────────────────────
const lists = Object.fromEntries((await j(`https://api.trello.com/1/boards/${BOARD}/lists?fields=name&${auth}`)).map(l => [l.id, l.name]));
const cards = await j(`https://api.trello.com/1/boards/${BOARD}/cards?fields=name,desc,idList,shortUrl,labels&${auth}`);

const rows = await (await fetch(`${SUPABASE_URL}/rest/v1/app_data?key=like.job:*&select=key,value`, { headers: sbHeaders })).json();
const jobs = rows.map(r => r.value).filter(Boolean);
const byCardId = new Map();
for (const job of jobs) {
  const m = /^job-trello-([0-9a-f]{24})$/i.exec(job.id ?? '');
  if (m) byCardId.set(m[1], job);
}
// Name index for cards whose job was NOT created by the webhook (hand-entered,
// converted, or imported from the spreadsheet). Without this, "no job for this
// card" would be wrong for anything the office typed in by hand, and the
// import below would create a DUPLICATE of a customer already on file.
const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
const byName = new Map();
for (const job of jobs) {
  for (const n of [job.clientName, job.title?.replace(/^WO[,–-]\s*/i, '')]) {
    const k = norm(n);
    if (k && k.split(' ').length >= 2 && !byName.has(k)) byName.set(k, job);
  }
}

// ── Compare ────────────────────────────────────────────────────────────────
const report = { matchedById: [], matchedByName: [], trelloOnly: [], noData: [] };

for (const card of cards) {
  const comments = await j(`https://api.trello.com/1/cards/${card.id}/actions?filter=commentCard&limit=100&${auth}`);
  const moves = await j(`https://api.trello.com/1/cards/${card.id}/actions?filter=updateCard:idList&limit=100&${auth}`);
  const corpus = [card.desc, ...comments.map(c => c.data?.text ?? '')].join('\n');
  const found = extract(corpus);

  let job = byCardId.get(card.id);
  let how = 'id';
  if (!job) { job = byName.get(norm(card.name)); how = 'name'; }

  const entry = {
    cardId: card.id, cardName: card.name, list: lists[card.idList],
    url: card.shortUrl, comments: comments.length, moves: moves.length,
    found,
  };

  if (!job) { report.trelloOnly.push(entry); continue; }

  entry.jobId = job.id;
  entry.jobName = job.clientName;
  entry.jobStage = job.pipelineStage;
  // What LL is MISSING and Trello can supply. LL prevails, so anything LL
  // already holds is recorded as kept, never as a change.
  const gaps = {};
  if (found.solarEdgeSiteId && !job.solarEdgeSiteId) gaps.solarEdgeSiteId = found.solarEdgeSiteId;
  if (found.siteTransferInverterSerial && !job.siteTransferInverterSerial) gaps.siteTransferInverterSerial = found.siteTransferInverterSerial;
  for (const f of ['address', 'city', 'state', 'zip']) {
    if (found[f] && !job.leadInfo?.[f]) gaps[`leadInfo.${f}`] = found[f];
  }
  const have = new Set((job.activityHistory ?? []).map(a => a.id));
  const newComments = comments.filter(c => !have.has(`trello-cmt-${c.id}`));
  const newMoves = moves.filter(m => !have.has(`trello-mv-${m.id}`));
  entry.gaps = gaps;
  entry.newComments = newComments.length;
  entry.newMoves = newMoves.length;
  entry.wouldChange = Object.keys(gaps).length > 0 || newComments.length > 0 || newMoves.length > 0;
  entry._comments = newComments;
  entry._moves = newMoves;
  entry._job = job;

  (how === 'id' ? report.matchedById : report.matchedByName).push(entry);
}

// ── Report ─────────────────────────────────────────────────────────────────
const out = path.resolve('reports', `trello-ll-reconcile-${new Date().toISOString().slice(0, 10)}.md`);
fs.mkdirSync('reports', { recursive: true });
const strip = e => { const { _comments, _moves, _job, ...rest } = e; return rest; };
const L = [];
L.push(`# Trello <-> LL reconciliation ${APPLY ? '(APPLIED)' : '(DRY RUN)'}`, '');
L.push(`Board cards: ${cards.length} | LL jobs: ${jobs.length} | webhook-created: ${byCardId.size}`, '');
L.push(`- matched by card id: ${report.matchedById.length}`);
L.push(`- matched by NAME only (job exists but was not webhook-created): ${report.matchedByName.length}`);
L.push(`- on Trello with NO LL job (would import): ${report.trelloOnly.length}`, '');
const changing = [...report.matchedById, ...report.matchedByName].filter(e => e.wouldChange);
L.push(`## Matched cards with data LL is missing (${changing.length})`, '');
for (const e of changing) {
  L.push(`### ${e.cardName}  ·  ${e.list}`);
  L.push(`job \`${e.jobId}\` (${e.jobName}, stage ${e.jobStage}) · ${e.url}`);
  if (Object.keys(e.gaps).length) L.push('', '```json', JSON.stringify(e.gaps, null, 1), '```');
  if (e.newComments || e.newMoves) L.push(`+${e.newComments} comment(s), +${e.newMoves} list move(s)`);
  L.push('');
}
L.push(`## Cards with no LL job, would be imported (${report.trelloOnly.length})`, '');
for (const e of report.trelloOnly) L.push(`- **${e.cardName}** · ${e.list} · ${e.comments} comment(s) · ${JSON.stringify(e.found)} · ${e.url}`);
L.push('', `## Matched by name only, VERIFY THESE (${report.matchedByName.length})`, '');
for (const e of report.matchedByName) L.push(`- card "${e.cardName}" -> job \`${e.jobId}\` "${e.jobName}"`);
fs.writeFileSync(out, L.join('\n') + '\n');
fs.writeFileSync(out.replace('.md', '.json'), JSON.stringify({
  matchedById: report.matchedById.map(strip), matchedByName: report.matchedByName.map(strip),
  trelloOnly: report.trelloOnly,
}, null, 1));
console.log(`cards ${cards.length} | matched-id ${report.matchedById.length} | matched-name ${report.matchedByName.length} | trello-only ${report.trelloOnly.length} | with-gaps ${changing.length}`);
console.log('report:', out);

if (!APPLY) { console.log('\nDRY RUN, nothing written. Re-run with --apply.'); process.exit(0); }

// ── Apply ──────────────────────────────────────────────────────────────────
let patched = 0, imported = 0;
for (const e of changing) {
  const job = e._job;
  const acts = [...(job.activityHistory ?? [])];
  for (const c of e._comments) {
    acts.push({
      id: `trello-cmt-${c.id}`, type: 'note_added',
      description: c.data.text,
      timestamp: c.date,
      userName: c.memberCreator?.fullName ?? 'Trello',
    });
  }
  for (const m of e._moves) {
    acts.push({
      id: `trello-mv-${m.id}`, type: 'status_changed',
      description: `Trello: ${m.data.listBefore?.name ?? '?'} -> ${m.data.listAfter?.name ?? '?'}`,
      timestamp: m.date,
      userName: m.memberCreator?.fullName ?? 'Trello',
    });
  }
  acts.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  const next = { ...job, activityHistory: acts };
  for (const [k, v] of Object.entries(e.gaps)) {
    if (k.startsWith('leadInfo.')) next.leadInfo = { ...(next.leadInfo ?? {}), [k.slice(9)]: v };
    else next[k] = v;
  }
  next.updatedAt = new Date().toISOString();
  const r = await fetch(`${SUPABASE_URL}/rest/v1/app_data?on_conflict=key`, {
    method: 'POST',
    headers: { ...sbHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ key: `job:${job.id}`, value: next, updated_at: next.updatedAt }),
  });
  if (r.ok) patched++; else console.error('patch failed', job.id, r.status, await r.text());
}
// Import the orphans through the live webhook: same path as Anthony's cards,
// so there is one importer and one set of parsing rules, not two.
for (const e of report.trelloOnly) {
  const r = await fetch(WEBHOOK, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: { type: 'createCard', data: { card: { id: e.cardId, name: e.cardName }, list: { id: cards.find(c => c.id === e.cardId).idList }, board: { id: BOARD } } } }),
  });
  const body = await r.json().catch(() => ({}));
  if (body?.job?.result === 'created') imported++;
  else console.error('import skipped', e.cardName, r.status, JSON.stringify(body).slice(0, 120));
}
console.log(`APPLIED: ${patched} job(s) enriched, ${imported} card(s) imported.`);
