import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { requestVisit, decideVisit } from '../../api/_serviceVisits.ts';
const base = process.env.VISIT_TEST_URL || 'http://127.0.0.1:5197';
const out = '/tmp/solarops-visit-browser'; mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
for (const width of [1440, 390]) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block' });
  const page = await context.newPage(); const errors = []; const requests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.dismiss());
  const user = { id: '00000000-0000-4000-8000-000000000001', email: 'fixture@example.invalid', aud: 'authenticated', role: 'authenticated', user_metadata: { name: 'Fixture', role: 'admin' } };
  await context.addInitScript(({ user }) => {
    const jwt = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })) + '.' + btoa(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now()/1000)+3600 })) + '.fixture';
    localStorage.setItem('solarflow_auth', JSON.stringify({ access_token: jwt, refresh_token: 'fixture', expires_at: Math.floor(Date.now()/1000)+3600, expires_in: 3600, token_type: 'bearer', user }));
    localStorage.setItem('solarflow_service_rates', JSON.stringify([{ id: 'diagnostic', serviceCode: 'DIAG', serviceName: 'Diagnostic', active: true }, { id: 'optimizer', serviceCode: 'OPT-CHANGE', serviceName: 'Optimizer replacement', active: true }]));
  }, { user });
  await context.route('**/*', async route => {
    const req = route.request(); const u = new URL(req.url());
    if (u.pathname === '/api/service-visits') {
      const b = req.postDataJSON(); requests.push(b);
      const job = await page.evaluate(() => window.__visitJob);
      try { const next = b.action === 'request' ? requestVisit(job, b, 'fixture', new Date().toISOString()) : decideVisit(job, b.action, b.reason, 'fixture-admin', new Date().toISOString()); return route.fulfill({ json: { job: next } }); }
      catch(e) { return route.fulfill({ status: 400, json: { error: e.message } }); }
    }
    if (u.pathname.startsWith('/auth/')) return route.fulfill({ json: user });
    if (u.pathname.startsWith('/rest/') || u.pathname.startsWith('/api/')) return route.fulfill({ json: [] });
    if (u.origin === base) return route.continue();
    return route.fulfill({ status: 200, body: '' });
  });
  await context.routeWebSocket('**/*', ws => ws.close());
  await page.goto(base + '/visit-fixture.html');
  await page.getByRole('button', { name: 'Finish Visit, Return Needed', exact: true }).click();
  await page.getByLabel('Follow-up service type').selectOption('Optimizer replacement');
  await page.locator('input[type=date]').last().fill('2099-09-15');
  await page.getByRole('dialog').locator('textarea').fill('Bring replacement optimizer');
  await page.screenshot({ path: `${out}/${width}-request.png`, fullPage: true });
  await page.getByRole('button', { name: 'Send follow-up to quote review' }).click();
  await page.getByRole('button', { name: 'Awaiting quote / admin approval' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Awaiting quote / admin approval' }).isDisabled(), true);
  assert.equal(await page.evaluate(() => window.__scheduleCalls || 0), 0);
  assert.equal(requests[0].serviceType, 'Optimizer replacement');
  await page.evaluate(() => window.__setRole('admin'));
  await page.getByLabel('Approval or coverage reference').fill('Original agreement includes the return');
  await page.screenshot({ path: `${out}/${width}-quote-review.png`, fullPage: true });
  await page.getByRole('button', { name: 'Included, no additional charge', exact: true }).click();
  await page.getByText('Approval record: Original agreement includes the return').waitFor();
  await page.getByLabel('Select visit').selectOption('visit-fixture:visit:1');
  await page.getByText('No work notes recorded.').count();
  assert.equal(await page.getByText('Visit 1', { exact: true }).count() > 0, true);
  await page.screenshot({ path: `${out}/${width}-history.png`, fullPage: true });
  await page.evaluate(() => window.__setRole('contractor'));
  await page.getByRole('button', { name: 'Start Work Order', exact: true }).click();
  await page.getByLabel('Work performed', { exact: true }).fill('Installed replacement optimizer');
  await page.getByLabel('Hours', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Add labor', exact: true }).click();
  await page.getByText('Installed replacement optimizer: 2 hours').waitFor();
  await page.screenshot({ path: `${out}/${width}-visit2.png`, fullPage: true });
  // A second return exercises the quote-required path through the real quote UI.
  await page.getByRole('button', { name: 'Finish Visit, Return Needed', exact: true }).click();
  await page.getByLabel('Follow-up service type').selectOption('Diagnostic');
  await page.locator('input[type=date]').last().fill('2099-09-20');
  await page.getByRole('dialog').locator('textarea').fill('Final diagnostic verification');
  await page.getByRole('button', { name: 'Send follow-up to quote review' }).click();
  await page.getByRole('button', { name: 'Awaiting quote / admin approval' }).waitFor();
  await page.evaluate(() => window.__setRole('admin'));
  await page.getByRole('button', { name: 'Send Quote', exact: true }).click();
  await page.getByRole('button', { name: /Save Quote & Notify/ }).click();
  await page.waitForFunction(() => !!window.__visitJob.quoteSentAt);
  await page.getByLabel('Approval or coverage reference').fill('Customer accepted quote Q3 by email');
  await page.getByRole('button', { name: 'Record quote approval', exact: true }).click();
  await page.getByText('Approval record: Customer accepted quote Q3 by email').waitFor();
  await page.screenshot({ path: `${out}/${width}-quote-approved.png`, fullPage: true });
  assert.equal(await page.evaluate(() => window.__visitJob.currentVisit.number), 3);
  assert.deepEqual(errors, []);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Horizontal overflow');
  results.push({ width, passed: true, actions: requests.map(r => r.action), errors });
  await context.close();
}
await browser.close(); writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2)); console.log(JSON.stringify(results));
