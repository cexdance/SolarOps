// Isolated UI regression check. Sample data is safe for the public UI catalog.
// Shared KV requests and all review mutations are intercepted in this context.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const directory = dirname(fileURLToPath(import.meta.url)); const env = {};
for (const line of readFileSync(resolve(directory, '../.env.local'), 'utf8').split('\n')) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/); if (match) env[match[1]] = match[2].replace(/^"|"$/g, '');
}
const url = process.argv.find(a => a.startsWith('--url='))?.slice(6) || 'https://solarflow-dashboard-sooty.vercel.app';
const now = new Date().toISOString();
const review = (id, name, kind, detail) => ({ id, siteId: Number(id), name, kind, finding: { kind, detail }, openedAt: now, lastCheckedAt: now, active: true, status: 'open' });
let fixture = { recipients: ['cesar.jurado@conexsol.us'], lastRun: { startedAt: now, completedAt: now, status: 'complete', total: 248, checked: 230, insufficient: 18, unknownCommunication: 210, errors: 0 }, reviews: [
  review('1001', 'Sample Florida site A', 'communication', 'No communication for 52 hours (48-hour threshold).'),
  review('1002', 'Sample Florida site B', 'production', 'Production down 44.0%: 112.0 kWh versus 200.0 kWh prior 10-week average. Period: latest 7 completed days.'),
] };
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route('**/rest/v1/app_data**', r => r.fulfill({ json: [] }));
  await context.route('**/api/solaredge**', async route => {
    const request = route.request();
    if (new URL(request.url()).searchParams.get('action') !== 'production-reviews') return route.fulfill({ json: { sites: { count: 0, site: [] } } });
    if (request.method() === 'POST') {
      const body = request.postDataJSON(); fixture = { ...fixture, reviews: fixture.reviews.map(r => r.id === body.id ? { ...r, status: body.status, notes: body.notes, reviewer: 'Sample reviewer' } : r) };
    }
    return route.fulfill({ json: fixture });
  });
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${url}/?view=solaredge`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type=email]').fill(env.SNAP_UI_EMAIL); await page.locator('input[type=password]').fill(env.SNAP_UI_PASSWORD);
  await page.locator('button[type=submit]').click();
  await page.getByRole('heading', { name: 'Human review queue (2)' }).waitFor({ timeout: 30000 });
  await page.getByPlaceholder('Search site ID, name, address…').fill('sample-catalog-no-table-results');
  await page.getByRole('button', { name: 'Start review', exact: true }).first().click();
  await page.getByText('in review | Condition still active', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Record review', exact: true }).first().click();
  await page.getByLabel('Findings and next steps').fill('Sample review: check internet connection and inverter status.');
  const queue = page.locator('section[aria-label="Production review queue"]');
  const output = resolve(directory, '../../ui-catalog/screens/admin'); mkdirSync(output, { recursive: true });
  await queue.screenshot({ path: resolve(output, 'production-review-queue.png') });
  await page.getByRole('button', { name: 'Complete human review', exact: true }).click();
  await page.getByRole('heading', { name: 'Human review queue (1)' }).waitFor();
  await page.getByRole('button', { name: 'Show history', exact: true }).click();
  await page.getByText('Sample review: check internet connection and inverter status.', { exact: false }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await queue.screenshot({ path: '/tmp/solarops-production-review-mobile.png' });
  const sizes = await queue.evaluate(element => ({ scroll: element.scrollWidth, client: element.clientWidth, children: [...element.querySelectorAll('*')].filter(e => e.scrollWidth > e.clientWidth).map(e => ({ tag: e.tagName, class: e.className, scroll: e.scrollWidth, client: e.clientWidth })) }));
  console.log(JSON.stringify(sizes));
  if (sizes.scroll > sizes.client) throw new Error('Review queue overflows its mobile container');
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Review UI passed: start, notes, complete, history, mobile fit, no page errors. Screenshots use sample data.');
  await context.close();
} finally { await browser.close(); }
