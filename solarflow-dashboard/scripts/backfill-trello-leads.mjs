// One-off backfill: Trello leads that imported as "image.jpeg" (before the
// vision-import fix) get their real details read off the card's screenshot.
//
// For each broken lead-trello-* lead it: fetches the card, downloads the first
// image attachment, sends it to the DEPLOYED /api/parse-lead-image (which holds
// ANTHROPIC_API_KEY), and patches the lead + its job:job-trello-* row.
//
// Reads creds from solarflow-dashboard/.env.local + .env (Trello + Supabase
// service role). Vision runs server-side, so no local Anthropic key needed.
//
//   node scripts/backfill-trello-leads.mjs            # dry run (no writes)
//   node scripts/backfill-trello-leads.mjs --apply    # write to Supabase
//   node scripts/backfill-trello-leads.mjs --selftest # pure-logic check
//
// ponytail: disposable admin script. Whole-blob CRM write at the end is a blind
// overwrite (same as the webhook); run it when the team is idle, or a concurrent
// client push could clobber it. Upgrade path: per-record leads if this recurs.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DASH = resolve(HERE, '..');
const ROOT = resolve(HERE, '..', '..');

// --- pure helpers (also exercised by --selftest) ---
const isFilename = (s) => /^\S+\.(?:jpe?g|png|gif|webp|pdf|tiff?)$/i.test((s || '').trim());
function phoneDigits(text) {
  const m = String(text).match(/(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/);
  let p = m ? m[0].replace(/\D/g, '') : '';
  if (p.length === 11 && p.startsWith('1')) p = p.slice(1);
  return p.length === 10 ? p : '';
}

if (process.argv.includes('--selftest')) {
  const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } };
  assert(isFilename('image.jpeg'), 'image.jpeg is a filename');
  assert(isFilename('IMG_2039.PNG'), 'IMG_2039.PNG is a filename');
  assert(!isFilename('Vania Brito'), 'a real name is not a filename');
  assert(phoneDigits('call (786) 444-3784 now') === '7864443784', 'formatted phone');
  assert(phoneDigits('id 13058786934 x') === '3058786934', '11-digit phone');
  assert(phoneDigits('no phone here') === '', 'no phone');
  console.log('selftest: all assertions passed');
  process.exit(0);
}

// --- env (no dotenv dependency) ---
function loadEnv(paths) {
  for (const p of paths) {
    try {
      for (const line of readFileSync(p, 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    } catch { /* file absent, fine */ }
  }
}
loadEnv([resolve(DASH, '.env.local'), resolve(DASH, '.env'), resolve(ROOT, '.env.local'), resolve(ROOT, '.env')]);

const APPLY = process.argv.includes('--apply');
const TRELLO_KEY = (process.env.TRELLO_API_KEY || process.env.VITE_TRELLO_API_KEY || '').trim();
const TRELLO_TOKEN = (process.env.TRELLO_API_TOKEN || process.env.VITE_TRELLO_TOKEN || '').trim();
const SR = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const SUPABASE = 'https://cjmhfagkkayelcsprbai.supabase.co';
const PROD = (process.env.PROD_URL || 'https://solarflow-dashboard-sooty.vercel.app').replace(/\/$/, '');
const CRM_KEY = 'solarflow_crm_data';

for (const [k, v] of Object.entries({ TRELLO_KEY, TRELLO_TOKEN, SUPABASE_SERVICE_ROLE_KEY: SR })) {
  if (!v) { console.error(`Missing ${k}. Add it to solarflow-dashboard/.env.local (or .env) and retry.`); process.exit(1); }
}

const TB = 'https://api.trello.com/1';
const sh = { Authorization: `Bearer ${SR}`, apikey: SR, 'Content-Type': 'application/json' };

async function getCard(id) {
  const r = await fetch(`${TB}/cards/${id}?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}&fields=name,desc,shortUrl`);
  if (!r.ok) throw new Error(`card ${r.status}`);
  return r.json();
}
async function firstImage(id) {
  const r = await fetch(`${TB}/cards/${id}/attachments?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}&fields=url,mimeType,name`);
  if (!r.ok) return null;
  const atts = await r.json();
  const img = atts.find((a) => (a.mimeType || '').startsWith('image/') || /\.(jpe?g|png|gif|webp)$/i.test(a.name || a.url || ''));
  if (!img?.url) return null;
  const b = await fetch(img.url, { headers: { Authorization: `OAuth oauth_consumer_key="${TRELLO_KEY}", oauth_token="${TRELLO_TOKEN}"` } });
  if (!b.ok) return null;
  const buf = Buffer.from(await b.arrayBuffer());
  if (!buf.length || buf.length > 5_000_000) return null;
  const mimeType = (img.mimeType || '').startsWith('image/') ? img.mimeType : (/\.png$/i.test(img.name || img.url) ? 'image/png' : 'image/jpeg');
  return { base64: buf.toString('base64'), mimeType };
}
async function visionParse(base64, mimeType) {
  const r = await fetch(`${PROD}/api/parse-lead-image`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ imageBase64: base64, mimeType }),
  });
  if (!r.ok) throw new Error(`parse ${r.status} ${(await r.text()).slice(0, 120)}`);
  return r.json();
}
async function getKey(key) {
  const r = await fetch(`${SUPABASE}/rest/v1/app_data?key=eq.${encodeURIComponent(key)}&select=value`, { headers: sh });
  if (!r.ok) throw new Error(`get ${key} ${r.status}`);
  return (await r.json())[0]?.value;
}
async function putKey(key, value) {
  const r = await fetch(`${SUPABASE}/rest/v1/app_data?on_conflict=key`, {
    method: 'POST', headers: { ...sh, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error(`put ${key} ${r.status} ${(await r.text()).slice(0, 120)}`);
}

const crm = (await getKey(CRM_KEY)) ?? { leads: [] };
const leads = Array.isArray(crm.leads) ? crm.leads : [];
const targets = leads.filter((l) =>
  typeof l?.id === 'string' && l.id.startsWith('lead-trello-') &&
  (isFilename(l.firstName) || (!(l.firstName || '').trim() && !(l.lastName || '').trim())));

console.log(`${targets.length} lead(s) to backfill (of ${leads.length} total). ${APPLY ? 'APPLYING.' : 'Dry run.'}\n`);

let changed = 0;
for (const lead of targets) {
  const cardId = lead.id.slice('lead-trello-'.length);
  const was = `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || '(blank)';
  try {
    const c = await getCard(cardId);
    let v = {};
    const img = await firstImage(cardId);
    if (img) v = await visionParse(img.base64, img.mimeType);

    const first = (v.firstName || '').trim();
    const last = (v.lastName || '').trim();
    const phone = (v.phone || '').trim() || phoneDigits(`${c.name}\n${c.desc || ''}`) || (lead.phone || '');
    const patch = {
      firstName: first, lastName: last,
      phone, email: (v.email || '').trim() || lead.email || '',
      address: (v.address || '').trim() || lead.address || '',
      city: (v.city || '').trim() || lead.city || '',
      state: (v.state || '').trim() || lead.state || '',
      zip: (v.zip || '').trim() || lead.zip || '',
    };
    const now = `${first} ${last}`.trim() || (phone || '(no name found)');
    console.log(`  ${cardId}: "${was}" -> "${now}"  ph:${phone || '-'}  ${[patch.city, patch.state].filter(Boolean).join(', ')}`);

    if (APPLY) {
      Object.assign(lead, patch, { updatedAt: new Date().toISOString() });
      const jkey = `job:job-trello-${cardId}`;
      const job = await getKey(jkey);
      if (job) {
        const disp = `${first} ${last}`.trim() || (phone || 'New Lead (Trello)');
        job.clientName = disp;
        if (isFilename(job.title)) job.title = disp;
        job.updatedAt = new Date().toISOString();
        await putKey(jkey, job);
      }
      changed++;
    }
  } catch (e) {
    console.log(`  ${cardId}: SKIP "${was}" (${e.message})`);
  }
}

if (APPLY && changed) {
  await putKey(CRM_KEY, { ...crm, leads });
  console.log(`\nApplied ${changed} lead update(s) + job rows.`);
} else {
  console.log(APPLY ? '\nNothing to apply.' : '\nDry run only. Re-run with --apply to write.');
}
