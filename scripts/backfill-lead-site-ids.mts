// One-time: read "SITE ID:" off the lead screenshot for every Trello lead
// whose solarEdgeSiteId is EMPTY, and fill it. Dry run by default.
//
//   RECONCILE_ENV=<pulled prod env> tsx scripts/backfill-lead-site-ids.mts [--apply]
//
// Why: every SolarEdge lead email prints SITE ID, and the screenshot reader
// never extracted it (fixed 2026-09-10). It also could not run at all, because
// production has had no ANTHROPIC_API_KEY since the project rebuild on 08-28,
// so this needs that key in the pulled env file. New leads get the site id at
// import once the key exists; this covers the ones already on the board.
//
// Empty-only, like every other Trello-sourced write: a value LL holds is never
// replaced here. The one exception is a site id equal to the job's OWN
// customer id, which is ServiceOrderPanel's bug output (see realSiteId in
// woHelpers.ts), not a value anyone chose; it counts as empty. Written with
// fieldTimes stamped so no browser merge reverts it.
import fs from 'node:fs';

const APPLY = process.argv.includes('--apply');
const envFile = process.env.RECONCILE_ENV;
if (!envFile) { console.error('Set RECONCILE_ENV to a pulled prod env file'); process.exit(1); }
const env = Object.fromEntries(fs.readFileSync(envFile, 'utf8').split('\n').filter(l => l.includes('='))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
// parse-lead-image reads the key at MODULE LOAD, so it must be in process.env
// before the dynamic import below, not after.
process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY ?? '';
const { extractLeadFromImage, validSiteId } = await import('../api/parse-lead-image');

const A = `key=${env.TRELLO_API_KEY}&token=${env.TRELLO_API_TOKEN}`;
const SB = 'https://cjmhfagkkayelcsprbai.supabase.co';
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' };

const rows = await (await fetch(`${SB}/rest/v1/app_data?key=like.job:job-trello-*&select=key,value`, { headers: H })).json() as { key: string; value: any }[];
// A site id equal to the job's OWN customer id is not an office value: it is
// what ServiceOrderPanel wrote on save before realSiteId (woHelpers.ts). No
// person ever typed a `cust-...` id into a site field, so it counts as empty.
// Any other non-site value is left alone and listed.
const s = (r: { value: any }) => String(r.value.solarEdgeSiteId ?? '').trim();
const bugArtifact = (r: { value: any }) => s(r) !== '' && s(r) === String(r.value.customerId ?? '');
const blank = rows.filter(r => !s(r) || bugArtifact(r));
const other = rows.filter(r => s(r) && !bugArtifact(r) && !/^\d{5,7}$/.test(s(r)));
console.log(`${rows.length} Trello jobs | ${blank.length} candidates (${blank.filter(bugArtifact).length} of them hold their own customer id) | ${other.length} other non-site values (listed, not touched)`);
for (const r of other) console.log(`  not a site id, left alone: ${r.value.clientName} = ${s(r)}`);

if (!env.ANTHROPIC_API_KEY) {
  console.log('\nANTHROPIC_API_KEY is not in the env file, so no screenshot can be read. Add it in Vercel, re-pull, re-run.');
  process.exit(0);
}

let filled = 0, noImage = 0, noSiteId = 0;
for (const r of blank) {
  const cardId = r.value.id.slice('job-trello-'.length);
  const atts = await (await fetch(`https://api.trello.com/1/cards/${cardId}/attachments?fields=url,mimeType,name&${A}`)).json() as { url: string; mimeType?: string; name?: string }[];
  const img = Array.isArray(atts) ? atts.find(a => (a.mimeType ?? '').startsWith('image/') || /\.(jpe?g|png|webp|gif)$/i.test(a.name ?? a.url)) : undefined;
  if (!img) { noImage++; continue; }
  const bin = await fetch(img.url, { headers: { Authorization: `OAuth oauth_consumer_key="${env.TRELLO_API_KEY}", oauth_token="${env.TRELLO_API_TOKEN}"` } });
  if (!bin.ok) { noImage++; continue; }
  const b64 = Buffer.from(await bin.arrayBuffer()).toString('base64');
  let siteId: string | undefined;
  try { siteId = validSiteId((await extractLeadFromImage(b64, img.mimeType)).siteId); }
  catch (e) { console.log(`  read failed for ${r.value.clientName}: ${(e as Error).message.slice(0, 80)}`); continue; }
  if (!siteId) { noSiteId++; continue; }
  console.log(`  ${APPLY ? 'FILL' : 'would fill'} ${r.value.clientName}: ${siteId}`);
  if (!APPLY) continue;
  const now = new Date().toISOString();
  const v = { ...r.value, solarEdgeSiteId: siteId, fieldTimes: { ...(r.value.fieldTimes ?? {}), solarEdgeSiteId: now }, updatedAt: now };
  const w = await fetch(`${SB}/rest/v1/app_data?on_conflict=key`, { method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: r.key, value: v, updated_at: now }) });
  if (w.ok) filled++; else console.log(`  write failed ${r.value.clientName}: ${w.status}`);
}
console.log(`\n${APPLY ? 'APPLIED' : 'DRY RUN'}: ${APPLY ? filled + ' filled' : ''} | no image ${noImage} | image had no SITE ID ${noSiteId}`);
