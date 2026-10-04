/** Daily fleet scan. Runs in GitHub Actions independently of browsers and Macs. */
import { createHash } from 'node:crypto';
import { evaluate, floridaSite, localDay, shiftDay, reconcile, reviewSubject, energyWindows, RECIPIENTS, type Site, type Alert, type Reading, type Evaluation, type Review } from '../api/_productionReview.ts';
import { readState, updateState } from '../api/_productionReviewStore.ts';
const dryRun = process.argv.includes('--dry-run');
const limitArg = process.argv.find(a => a.startsWith('--limit='));
if (limitArg && !dryRun) throw new Error('A limited scan must be a dry run');
const apiKey = (process.env.SOLAREDGE_API_KEY || '').trim();
if (!apiKey) throw new Error('SOLAREDGE_API_KEY is required');
const started = new Date();
let lastCall = 0;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function solar(path: string): Promise<unknown> {
  for (let attempt = 0; attempt < 4; attempt++) {
    await sleep(Math.max(0, 3100 - (Date.now() - lastCall))); lastCall = Date.now();
    const r = await fetch(`https://monitoringapi.solaredge.com/v2${path}`, { headers: { 'X-API-Key': apiKey, Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
    if (r.status === 429 || r.status >= 500) {
      if (attempt === 3) throw new Error(`SolarEdge failed (${r.status})`);
      await sleep(Math.min(120000, Math.max(30000, Number(r.headers.get('retry-after') || 60) * 1000))); continue;
    }
    if (!r.ok) throw new Error(`SolarEdge failed (${r.status})`);
    return r.json();
  }
  throw new Error('SolarEdge retry limit reached');
}
async function pages<T>(kind: 'sites' | 'alerts'): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= 100; page++) {
    const body = await solar(`/${kind}?page=${page}`) as { sites?: { site?: T[] } } | T[];
    const rows = kind === 'sites' ? (body as { sites?: { site?: T[] } }).sites?.site : body;
    if (!Array.isArray(rows)) throw new Error(`Unexpected ${kind} response`);
    out.push(...rows); if (rows.length < 50) return out;
  }
  throw new Error('Fleet pagination exceeded safety limit');
}
function escape(value: string) { return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!); }
async function sendAlerts(reviews: Review[]) {
  if (!reviews.length) return;
  const key = (process.env.RESEND_API_KEY || '').trim(); if (!key) throw new Error('RESEND_API_KEY is required for review notifications');
  const ids = reviews.map(r => r.id).sort();
  const digest = createHash('sha256').update(ids.join('\n')).digest('hex');
  const links = reviews.map(r => `<li><strong>${escape(r.name)} (site ${r.siteId})</strong><p>${escape(r.finding.detail)}</p><a href="https://monitoring.solaredge.com/one#/residential/digital-twin?siteId=${r.siteId}">Open SolarEdge site</a></li>`).join('');
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': `production-review-${digest}` }, body: JSON.stringify({ from: 'SolarOps <solar.ops@conexsol.us>', to: RECIPIENTS, subject: reviewSubject(reviews), html: `<h1>Florida sites need human online review</h1><p>Communication threshold: 48 hours. Production threshold: at least 40% below the prior 10-week average.</p><ol>${links}</ol><p><a href="https://solarflow-dashboard-sooty.vercel.app/?view=solaredge">Open SolarOps, SolarEdge Monitoring review queue</a></p><p>Please record findings and next steps in the SolarOps review queue. A production flag is a review request and may reflect weather or another cause.</p>` }), signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`Email delivery failed (${r.status}); new alerts remain pending`);
  await updateState(state => ({ ...state, reviews: state.reviews.map(review => ids.includes(review.id) ? { ...review, notifiedAt: new Date().toISOString() } : review) }));
  console.log(`Review notification accepted for ${new Set(reviews.map(r => r.siteId)).size} sites`);
}
async function main() {
  const sites = await pages<Site>('sites'); const alerts = await pages<Alert>('alerts');
  const fleet = [...new Map(sites.filter(floridaSite).map(s => [s.siteId, s])).values()];
  const selected = limitArg ? fleet.slice(0, Number(limitArg.split('=')[1])) : fleet;
  if (!selected.length) throw new Error('No Florida sites found; refusing to publish an empty fleet scan');
  console.log(`Scanning ${selected.length} Florida sites; dry run: ${dryRun}`);
  const run = { startedAt: started.toISOString(), status: 'running' as const, total: fleet.length, checked: 0, insufficient: 0, unknownCommunication: 0, errors: 0 };
  if (!dryRun) await updateState(state => ({ ...state, lastRun: run }));
  const evaluations: Evaluation[] = [];
  const cache = dryRun ? {} : (await readState()).state.energyCache || {};
  const energyCache: NonNullable<import('../api/_productionReview.ts').ReviewState['energyCache']> = { ...cache };
  for (const site of selected) {
    let readings: Reading[] | null = null; let error: string | undefined;
    try {
      const today = localDay(started, site.location?.timezone || 'America/New_York');
      const previous = energyCache[String(site.siteId)];
      const full = !previous || previous.refreshedDay <= shiftDay(today, -7);
      const start = shiftDay(today, full ? -77 : -10); const end = shiftDay(today, -1);
      const fresh: Reading[] = [];
      for (const window of energyWindows(start, end)) {
        const params = new URLSearchParams({ ...window, resolution: 'DAY' });
        const body = await solar(`/sites/${site.siteId}/energy?${params}`) as { unit?: string; values?: Reading[] };
        if (body.unit !== 'WH' || !Array.isArray(body.values)) throw new Error('Unexpected energy units or response');
        fresh.push(...body.values);
      }
      const values = new Map<string, Reading>();
      for (const r of [...(full ? [] : previous!.values), ...fresh]) {
        const day = r.timestamp.slice(0, 10);
        if (day >= shiftDay(today, -77) && day <= end) values.set(day, r);
      }
      readings = [...values.values()];
      energyCache[String(site.siteId)] = { refreshedDay: full ? today : previous!.refreshedDay, values: readings };
    } catch (e) { error = e instanceof Error ? e.message : 'Site data unavailable'; }
    const result = evaluate(site, alerts, readings, started); result.error = error; evaluations.push(result);
    if (evaluations.length % 25 === 0) {
      console.log(`Checked ${evaluations.length}/${selected.length} sites`);
      if (!dryRun) await updateState(current => ({ ...reconcile(current, evaluations), energyCache, lastRun: { ...run, checked: evaluations.filter(e => e.production === 'checked').length, insufficient: evaluations.filter(e => e.production === 'insufficient').length, unknownCommunication: evaluations.filter(e => e.communication === 'unknown').length, errors: evaluations.filter(e => e.error).length } }));
    }
  }
  const complete = { ...run, completedAt: new Date().toISOString(), status: evaluations.some(e => e.error) ? 'partial' as const : 'complete' as const, checked: evaluations.filter(e => e.production === 'checked').length, insufficient: evaluations.filter(e => e.production === 'insufficient').length, unknownCommunication: evaluations.filter(e => e.communication === 'unknown').length, errors: evaluations.filter(e => e.error).length };
  console.log(JSON.stringify({ ...complete, findings: evaluations.reduce((sum, e) => sum + e.findings.length, 0) }));
  if (dryRun) { console.log('Read errors:', evaluations.filter(e => e.error).map(e => e.error)); if (complete.errors) throw new Error('Dry run has failed reads'); return; }
  const state = await updateState(current => ({ ...reconcile(current, evaluations), energyCache, lastRun: complete }));
  // Pending incidents retry on the next run. Human-reviewed incidents do not email.
  await sendAlerts(state.reviews.filter(r => r.status !== 'reviewed' && !r.notifiedAt));
  if (complete.errors) throw new Error(`${complete.errors} site reads failed; other results were saved`);
}
main().catch(async error => {
  console.error(error instanceof Error ? error.message : 'Production monitor failed');
  if (!dryRun) {
    try { await updateState(state => ({ ...state, lastRun: { ...(state.lastRun || { total: 0, checked: 0, insufficient: 0, unknownCommunication: 0, errors: 0 }), startedAt: started.toISOString(), status: 'failed', completedAt: new Date().toISOString(), error: error instanceof Error ? error.message : 'Monitor failed' } })); } catch { console.error('Could not save monitor failure status'); }
  }
  process.exitCode = 1;
});
