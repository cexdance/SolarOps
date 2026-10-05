import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
/** Daily fleet scan. Runs in GitHub Actions independently of browsers and Macs. */
import { createHash } from 'node:crypto';
import { evaluate, floridaSite, localDay, shiftDay, reconcile, reviewSubject, energyWindows, RECIPIENTS, type Site, type Alert, type Reading, type Evaluation, type Review } from '../api/_productionReview.ts';
import { readState, updateState } from '../api/_productionReviewStore.ts';
const dryRun = process.argv.includes('--dry-run');
const limitArg = process.argv.find(a => a.startsWith('--limit='));
if (limitArg && !dryRun) throw new Error('A limited scan must be a dry run');
const apiKey = (process.env.SOLAREDGE_API_KEY || '').trim();
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
export function reviewEmail(reviews: Review[]) {
  const subject = reviewSubject(reviews);
  const count = new Set(reviews.map(r => r.siteId)).size;
  const subtitle = `Florida · ${count} ${count === 1 ? 'site' : 'sites'}`;
  const queueUrl = 'https://solarflow-dashboard-sooty.vercel.app/?view=solaredge';
  const siteUrl = (id: number) => `https://monitoring.solaredge.com/one#/residential/digital-twin?siteId=${id}`;
  const rows = reviews.map(r => `<tr><td style="padding:20px 0;border-bottom:1px solid #e2e8f0"><p style="margin:0 0 6px;font-size:16px;font-weight:600;color:#0D1B2A">${escape(r.name)}</p><p style="margin:0 0 10px;font-size:12px;color:#64748b">Site ${r.siteId} · ${r.kind === 'communication' ? 'Communication' : 'Production'}</p><p style="margin:0 0 12px;line-height:1.6">${escape(r.finding.detail)}</p><a style="color:#087f91" href="${siteUrl(r.siteId)}">Open in SolarEdge</a></td></tr>`).join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(subject)}</title></head><body style="margin:0;background:#f1f5f9;color:#334155;font:14px Arial,sans-serif"><table role="presentation" style="width:100%;max-width:680px;margin:24px auto;border-collapse:collapse;background:#fff"><tr><td style="padding:24px;background:#0D1B2A;border-bottom:4px solid #F5A623"><p style="margin:0 0 16px;color:#F5A623;font-size:13px;font-weight:700">SolarOps</p><h1 style="margin:0;font-size:24px;line-height:1.3;color:#fff">O&amp;M: Current sites to review</h1><p style="margin:12px 0 0;color:#A8BDD0">${subtitle}</p></td></tr><tr><td style="padding:24px"><p style="margin:0 0 18px;line-height:1.6">Check the sites below in SolarEdge and record findings and next steps in SolarOps.</p><a style="display:inline-block;padding:12px 16px;border-radius:6px;background:#F5A623;color:#0D1B2A;font-weight:700;text-decoration:none" href="${queueUrl}">Open O&amp;M review list</a><table role="presentation" style="width:100%;border-collapse:collapse;margin-top:8px">${rows}</table><p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#64748b">Review criteria: no communication for 48 hours, or production at least 40% below the prior 10-week weekly average. Production uses the latest 7 completed local days. Check weather and site conditions before scheduling service.</p></td></tr></table></body></html>`;
  const text = `${subject}\n${subtitle}\n\nCheck the sites below in SolarEdge and record findings and next steps in SolarOps.\n\n` + reviews.map(r => `${r.name} (site ${r.siteId})\n${r.finding.detail}\n${siteUrl(r.siteId)}`).join('\n\n') + `\n\nOpen O&M review list: ${queueUrl}\n\nReview criteria: no communication for 48 hours, or production at least 40% below the prior 10-week weekly average. Production uses the latest 7 completed local days. Check weather and site conditions before scheduling service.`;
  return { subject, html, text };
}
export function emailApprovalDigest(reviews: Review[]) {
  return createHash('sha256').update(JSON.stringify({ to: RECIPIENTS, ...reviewEmail(reviews) })).digest('hex');
}
export async function sendAlerts(reviews: Review[], approvedDigest?: string) {
  if (!reviews.length) return;
  if (approvedDigest !== emailApprovalDigest(reviews)) {
    console.log(`Email held for explicit approval: ${reviews.length} incidents. Approval digest: ${emailApprovalDigest(reviews)}`);
    return;
  }
  const key = (process.env.RESEND_API_KEY || '').trim(); const useSmtp = process.env.SMTP_ENABLED === 'true';
  if (!key && !useSmtp) throw new Error('Email delivery is not configured');
  const ids = reviews.map(r => r.id).sort();
  const digest = createHash('sha256').update(ids.join('\n')).digest('hex');
  const { subject, html, text } = reviewEmail(reviews);
  let receiptId: string;
  if (useSmtp) {
    const { smtpTransport, smtpFromEnv } = await import('./production-smtp.mts');
    const config = smtpFromEnv(); const transport = smtpTransport(config);
    try {
      const info = await transport.sendMail({ from: { name: 'SolarOps', address: config.from }, to: RECIPIENTS, subject, html, text, messageId: `<solarops.production.${digest}@${config.from.split('@')[1]}>` });
      if (!info.messageId || !RECIPIENTS.every(recipient => info.accepted?.some(address => address.toLowerCase() === recipient.toLowerCase()))) throw new Error('Recipient was not accepted');
      receiptId = `smtp:${info.messageId}`;
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'REJECTED';
      throw new Error(`Email delivery failed (SMTP ${code}); new alerts remain pending`);
    } finally { transport.close(); }
  } else {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'User-Agent': 'SolarOps/1.0', 'Content-Type': 'application/json', 'Idempotency-Key': `production-review-${digest}` }, body: JSON.stringify({ from: (process.env.PRODUCTION_MONITOR_FROM || 'SolarOps <solar.ops@conexsol.us>').trim(), to: RECIPIENTS, subject, html, text }), signal: AbortSignal.timeout(30000) });
    if (!r.ok) { const detail = await r.json().catch(() => ({})) as { message?: string }; throw new Error(`Email delivery failed (${r.status}): ${detail.message?.slice(0, 200) || 'Provider rejected the request'}; new alerts remain pending`); }
    const receipt = await r.json() as { id?: string };
    if (!receipt.id) throw new Error('Email provider did not return a receipt; alerts remain pending');
    receiptId = receipt.id;
  }
  await updateState(state => ({ ...state, lastRun: state.lastRun?.error?.startsWith('Email delivery failed') ? { ...state.lastRun, status: state.lastRun.errors ? 'partial' : 'complete', error: undefined } : state.lastRun, reviews: state.reviews.map(review => ids.includes(review.id) ? { ...review, notifiedAt: new Date().toISOString(), notificationId: receiptId } : review) }));
  console.log(`Review notification accepted for ${new Set(reviews.map(r => r.siteId)).size} sites`);
}
async function main() {
  if (process.argv.includes('--notify-only')) { const { state } = await readState(); const pending = state.reviews.filter(r => r.status !== 'reviewed' && !r.notifiedAt); if (dryRun) console.log(`Dry run: ${pending.length} pending email incidents`); else await sendAlerts(pending, process.env.EMAIL_APPROVED_DIGEST); return; }
  if (!apiKey) throw new Error('SOLAREDGE_API_KEY is required');
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
  // Daily runs hold email for explicit approval of the exact pending message.
  await sendAlerts(state.reviews.filter(r => r.status !== 'reviewed' && !r.notifiedAt));
  if (complete.errors) throw new Error(`${complete.errors} site reads failed; other results were saved`);
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(async error => {
  console.error(error instanceof Error ? error.message : 'Production monitor failed');
  if (!dryRun && !process.argv.includes('--notify-only')) {
    try { await updateState(state => ({ ...state, lastRun: { ...(state.lastRun || { total: 0, checked: 0, insufficient: 0, unknownCommunication: 0, errors: 0 }), startedAt: started.toISOString(), status: 'failed', completedAt: new Date().toISOString(), error: error instanceof Error ? error.message : 'Monitor failed' } })); } catch { console.error('Could not save monitor failure status'); }
  }
  process.exitCode = 1;
});
