#!/usr/bin/env node
/**
 * Repair broken WO photo links in app_data.
 *
 * Two historical upload paths wrote the SAME contractor photo under two storage
 * keys: `wo-photos/<jobId>/<photoId>.jpg` and `<jobId>/<category>/<photoId>.jpeg`.
 * A later cleanup deleted the redundant object but never rewrote the records, and
 * dedupeWoPhotos() keeps the FIRST-seen twin by URL stem with no idea whether that
 * twin still resolves. Result: a job can hold the dead twin and have dropped the
 * live one.
 *
 * Pass 1 (rewrite): storageUrl's object is gone but a same-stem object exists.
 *   Point the photo at the live object. Non-destructive, always safe.
 * Pass 2 (drop, --drop-dead): the photo cannot render on any device. Either the
 *   storageUrl's object is gone with no live twin, or there is no storageUrl,
 *   no dataUrl and no photoStoreId at all. Removes the entry and records its URL
 *   stem in job.deletedPhotoStems so the contractor-job reconcile pass in App.tsx
 *   cannot re-import it. Only stems with NO live object are ever added to that
 *   ledger, so a rewritten photo from pass 1 is never blocked.
 *
 * Dry run by default. `--apply` writes. `--drop-dead` enables pass 2.
 *
 * ponytail: one-off remediation, not a scheduled job. The dual-write that caused
 * this is gone from the current code (uploads are content-addressed and single
 * path), so there is nothing left to re-break. Delete this script once run.
 *
 *   node scripts/photo-link-repair.mjs                      # dry run, pass 1 only
 *   node scripts/photo-link-repair.mjs --drop-dead          # dry run, both passes
 *   node scripts/photo-link-repair.mjs --drop-dead --apply  # write
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const APPLY = process.argv.includes('--apply');
const DROP_DEAD = process.argv.includes('--drop-dead');
const BUCKET = 'customer-files';

function envFromFile(name) {
  for (const f of ['.env.vercel.prod', '.env.vercel.local', '.env.local']) {
    try {
      const line = readFileSync(f, 'utf8').split('\n').find(l => l.startsWith(`${name}=`));
      // `vercel env pull` quotes values and escapes the trailing newline as a
      // literal backslash-n, which silently becomes part of the key otherwise.
      if (line) return line.slice(name.length + 1).trim().replace(/^["']|["']$/g, '').replace(/\\n$/, '');
    } catch { /* file absent, try the next one */ }
  }
  return undefined;
}

const SUPABASE_URL = process.env.SUPABASE_URL || envFromFile('SUPABASE_URL') || envFromFile('VITE_SUPABASE_URL');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || envFromFile('SUPABASE_SERVICE_ROLE_KEY');
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (env or .env.vercel.prod).');
  process.exit(1);
}
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

/** Same identity rule as woHelpers.photoUrlStem: last segment, no extension, no query. */
function urlStem(url) {
  if (!url) return '';
  const noQuery = url.split('?')[0];
  const seg = noQuery.slice(noQuery.lastIndexOf('/') + 1);
  const dot = seg.lastIndexOf('.');
  return dot > 0 ? seg.slice(0, dot) : seg;
}

function objectPath(url) {
  const marker = `/${BUCKET}/`;
  const i = url.indexOf(marker);
  return i < 0 ? null : url.slice(i + marker.length).split('?')[0];
}

/** Every object key in the bucket, keyed by stem -> [paths]. Paginated: list() caps out. */
async function loadBucketIndex() {
  const byStem = new Map();
  const all = new Set();
  const walk = async (prefix) => {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await db.storage.from(BUCKET).list(prefix, { limit: 1000, offset });
      if (error) throw new Error(`list ${prefix}: ${error.message}`);
      if (!data.length) break;
      for (const e of data) {
        const path = prefix ? `${prefix}/${e.name}` : e.name;
        // A folder entry has no id; recurse into it.
        if (!e.id) await walk(path);
        else {
          all.add(path);
          const stem = urlStem(path);
          if (!byStem.has(stem)) byStem.set(stem, []);
          byStem.get(stem).push(path);
        }
      }
      if (data.length < 1000) break;
    }
  };
  await walk('');
  return { byStem, all };
}

const { byStem, all } = await loadBucketIndex();
console.log(`bucket: ${all.size} objects, ${byStem.size} distinct stems\n`);

const { data: rows, error } = await db.from('app_data').select('key, value').like('key', 'job:%');
if (error) throw new Error(error.message);

let rewritten = 0, dropped = 0, touchedJobs = 0;

for (const row of rows) {
  const job = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
  const photos = job?.woPhotos;
  if (!Array.isArray(photos) || !photos.length) continue;

  const kept = [];
  const newStems = [];
  let changed = false;

  for (const p of photos) {
    const path = p.storageUrl ? objectPath(p.storageUrl) : null;
    const live = path ? all.has(path) : false;

    if (live) { kept.push(p); continue; }

    // Pass 1: dead URL, but the same photo survives under the other key shape.
    if (path) {
      const twin = (byStem.get(urlStem(path)) || []).find(t => t !== path);
      if (twin) {
        const url = db.storage.from(BUCKET).getPublicUrl(twin).data.publicUrl;
        console.log(`REWRITE ${row.key} ${p.id}\n    ${path}\n -> ${twin}`);
        kept.push({ ...p, storageUrl: url });
        rewritten++; changed = true;
        continue;
      }
    }

    // Anything still renderable on some device is left strictly alone.
    const recoverable = !!p.dataUrl || !!p.photoStoreId;
    if (recoverable || !DROP_DEAD) {
      if (!recoverable) console.log(`DEAD    ${row.key} ${p.id} ${path ?? '(no storageUrl)'}`);
      kept.push(p);
      continue;
    }

    console.log(`DROP    ${row.key} ${p.id} ${path ?? '(no storageUrl, no dataUrl, no photoStoreId)'}`);
    // Only ledger a stem that resolves nowhere, or the reconcile pass would also
    // block the live twin a pass-1 rewrite just restored.
    const stem = urlStem(p.storageUrl || '');
    if (stem && !byStem.has(stem)) newStems.push(stem);
    dropped++; changed = true;
  }

  if (!changed) continue;
  touchedJobs++;
  if (!APPLY) continue;

  const next = {
    ...job,
    woPhotos: kept,
    deletedPhotoStems: [...new Set([...(job.deletedPhotoStems ?? []), ...newStems])],
    // Must win the per-record LWW merge, or a stale tab re-pushes the broken list.
    updatedAt: new Date().toISOString(),
  };
  const { error: upErr } = await db.from('app_data').update({ value: next }).eq('key', row.key);
  if (upErr) { console.error(`FAILED ${row.key}: ${upErr.message}`); process.exitCode = 1; }
}

console.log(`\n${APPLY ? 'APPLIED' : 'DRY RUN'}: ${rewritten} rewritten, ${dropped} dropped, ${touchedJobs} jobs touched`);
if (!APPLY) console.log('Re-run with --apply to write.');
