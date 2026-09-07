// Deterministic session regressions: loopback app, synthetic users, all API traffic intercepted.
import { chromium, webkit, devices } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const base = new URL(process.env.LOGIN_AUDIT_URL || 'http://127.0.0.1:5187');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)) throw Error('Loopback server required');
const out = resolve(process.env.LOGIN_SESSION_OUTPUT || '/private/tmp/solarops-login-session');
mkdirSync(out, { recursive: true });
const results = [];
const profiles = [
  { name: 'desktop-chromium', engine: chromium, options: { viewport: { width: 1440, height: 900 } } },
  { name: 'mobile-chromium', engine: chromium, options: { ...devices['Pixel 7'], viewport: { width: 393, height: 851 } } },
  { name: 'mobile-webkit', engine: webkit, options: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } } },
];
const contractor = (id, status = 'approved') => ({ id, email: `${id}@example.invalid`, role: 'contractor', status,
  createdAt: '2026-01-01T00:00:00Z', businessName: `Audit ${id}`, businessType: 'LLC', contactName: `Audit ${id}`,
  phone: '', streetAddress: '', city: '', state: '', zip: '', termsAcceptedAt: '2026-01-01T00:00:00Z',
  termsVersion: '1', serviceAreas: [], certifications: [], insurancePolicies: [], documents: [], specialties: [] });
const primary = contractor('session-fixture');
const other = contractor('other-fixture');
const password = 'Synthetic-regression-password-47!';
async function fixture(browser, profile, options = {}) {
  const context = await browser.newContext({ ...profile.options, serviceWorkers: 'block' });
  let user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated',
    email: options.staff ? 'staff-fixture@example.invalid' : primary.email,
    user_metadata: { role: options.staff ? 'admin' : 'contractor', name: 'Audit Staff', mustChangePassword: !!options.force },
    app_metadata: { provider: 'email', providers: ['email'] }, created_at: '2026-01-01T00:00:00Z' };
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const jwt = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, exp: expires, aud: 'authenticated', role: 'authenticated' })).toString('base64url')}.synthetic-signature`;
  const session = { access_token: jwt, refresh_token: 'synthetic-refresh-token', expires_at: expires, expires_in: 3600, token_type: 'bearer', user };
  const calls = { logout: 0, updates: [], mutations: [], errors: [] };
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname;
    if (path.includes('/auth/v1/logout')) { calls.logout++; return route.fulfill({ status: 204, body: '' }); }
    if (path.includes('/auth/v1/user')) {
      if (req.method() === 'PUT') {
        const body = req.postDataJSON(); calls.updates.push(body);
        if (options.rejectUpdate) return route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ msg: 'Synthetic password update rejected', code: 'weak_password' }) });
        user = { ...user, user_metadata: { ...user.user_metadata, ...body.data } };
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) });
    }
    const staticResource = ['document', 'script', 'stylesheet', 'image', 'font', 'media'].includes(req.resourceType());
    const publicMetadata = ['/version.json', '/manifest.json', '/manifest.webmanifest'].includes(path);
    if (url.origin === base.origin && req.method() === 'GET' && !path.startsWith('/api/') && (staticResource || publicMetadata)) return route.continue();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) calls.mutations.push({ path, body: req.postData() });
    if (/^\/(api|rest|auth)\//.test(path)) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    return route.abort('blockedbyclient');
  });
  await context.routeWebSocket('**/*', ws => ws.close());
  await context.addInitScript(({ session, contractors, authenticated, cachedId }) => {
    Object.defineProperty(window, 'PublicKeyCredential', { value: undefined, configurable: true });
    if (localStorage.getItem('audit_session_seeded')) return;
    localStorage.setItem('audit_session_seeded', 'true');
    localStorage.setItem('solarflow_contractors', JSON.stringify(contractors));
    if (authenticated) localStorage.setItem('solarflow_auth', JSON.stringify(session));
    if (cachedId) {
      sessionStorage.setItem('solarflow_contractor_mode', 'true');
      sessionStorage.setItem('solarflow_contractor_id', cachedId);
    }
  }, { session, contractors: [{ ...primary, status: options.suspended ? 'suspended' : 'approved', mustChangePassword: !!options.force }, other], authenticated: options.authenticated !== false, cachedId: options.cachedId });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', e => calls.errors.push(e.message));
  await page.goto(base.href, { waitUntil: 'domcontentloaded' });
  return { page, context, calls };
}
const prompt = page => page.getByRole('heading', { name: 'Set your password', exact: true });
const login = page => page.getByRole('heading', { name: /^(Staff Login|Contractor Portal)$/ });
const portal = page => page.locator('button:has(svg.lucide-log-out)');
async function settled(page) { await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); }
async function submitPassword(page) {
  await page.getByPlaceholder('At least 8 characters').fill(password);
  await page.getByPlaceholder('Repeat your password').fill(password);
  await page.getByRole('button', { name: 'Set password & continue', exact: true }).click();
}
const scenarios = [
  { id: 'cached-contractor-needs-auth', options: { authenticated: false, cachedId: primary.id }, run: async ({ page }) => {
    await page.waitForFunction(() => sessionStorage.getItem('solarflow_contractor_mode') === null);
    await login(page).waitFor(); assert.equal(await portal(page).isVisible(), false);
  } },
  { id: 'approved-session-restore', options: {}, run: async ({ page }) => {
    await portal(page).waitFor(); assert.equal(await page.getByText(primary.contactName, { exact: true }).first().isVisible(), true);
  } },
  { id: 'cached-id-cannot-change-identity', options: { cachedId: other.id }, run: async ({ page }) => {
    await portal(page).waitFor(); assert.equal(await page.getByText(primary.contactName, { exact: true }).first().isVisible(), true);
    assert.equal(await page.getByText(other.contactName, { exact: true }).first().isVisible(), false);
  } },
  { id: 'suspended-session-denied', options: { suspended: true, cachedId: primary.id }, run: async ({ page }) => {
    await page.waitForFunction(() => sessionStorage.getItem('solarflow_contractor_mode') === null);
    await login(page).waitFor(); assert.equal(await portal(page).isVisible(), false);
  } },
  { id: 'contractor-logout-survives-reload', options: {}, run: async ({ page, calls }) => {
    await portal(page).waitFor(); await portal(page).click(); await login(page).waitFor();
    assert.ok(calls.logout > 0, 'No auth logout request');
    await page.reload({ waitUntil: 'domcontentloaded' }); await login(page).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('solarflow_auth')), null);
  } },
  ...[false, true].flatMap(staff => [
    { id: `${staff ? 'staff' : 'contractor'}-forced-password-survives-reload`, options: { staff, force: true }, run: async ({ page }) => {
      await prompt(page).waitFor(); await page.reload({ waitUntil: 'domcontentloaded' }); await prompt(page).waitFor();
    } },
    { id: `${staff ? 'staff' : 'contractor'}-rejected-password-retains-gate`, options: { staff, force: true, rejectUpdate: true }, run: async ({ page, calls }) => {
      await prompt(page).waitFor(); await submitPassword(page);
      await page.getByText(/Synthetic password update rejected|Unable to update your password/).waitFor();
      assert.equal(await prompt(page).isVisible(), true); assert.equal(calls.updates.length, 1);
      await page.reload({ waitUntil: 'domcontentloaded' }); await prompt(page).waitFor();
    } },
    { id: `${staff ? 'staff' : 'contractor'}-successful-password-auth-only`, options: { staff, force: true }, run: async ({ page, calls }) => {
      await prompt(page).waitFor(); await submitPassword(page); await prompt(page).waitFor({ state: 'hidden' }); await settled(page);
      assert.equal(calls.updates.length, 1);
      assert.equal(calls.updates[0].password, password);
      assert.deepEqual(calls.updates[0].data, { mustChangePassword: false });
      assert.ok(!calls.mutations.some(x => x.body?.includes(password)), 'Password leaked to a non-auth API');
      const stored = await page.evaluate(value => Object.keys(localStorage).filter(k => localStorage.getItem(k)?.includes(value)), password);
      assert.deepEqual(stored, [], 'Password persisted in browser localStorage');
      await page.reload({ waitUntil: 'domcontentloaded' });
      if (!staff) await portal(page).waitFor();
      else await page.waitForFunction(() => !!document.querySelector('button') && !document.body.textContent.includes('Set your password') && !document.body.textContent.includes('Staff Login'));
      assert.equal(await prompt(page).isVisible(), false);
    } },
  ]),
];
for (const profile of profiles) {
  let browser;
  try { browser = await profile.engine.launch({ headless: true }); }
  catch (error) { results.push({ profile: profile.name, id: 'SETUP', status: 'BLOCKED', detail: error.message.split('\n')[0] }); continue; }
  for (const scenario of scenarios) {
    let f;
    try {
      f = await fixture(browser, profile, scenario.options);
      await scenario.run(f);
      assert.deepEqual(f.calls.errors, [], 'Uncaught browser errors');
      results.push({ profile: profile.name, id: scenario.id, status: 'PASS' });
    } catch (error) {
      results.push({ profile: profile.name, id: scenario.id, status: f ? 'FAIL' : 'BLOCKED', detail: error.message.split('\n').slice(0, 4).join(' ') });
    } finally {
      if (f) { await f.page.screenshot({ path: resolve(out, `${profile.name}-${scenario.id}.png`), fullPage: true }).catch(() => {}); await f.context.close(); }
    }
  }
  await browser.close();
}
const summary = Object.fromEntries(['PASS', 'FAIL', 'BLOCKED'].map(s => [s, results.filter(r => r.status === s).length]));
writeFileSync(resolve(out, 'results.json'), JSON.stringify({ base: base.origin, capturedAt: new Date().toISOString(), mode: 'Synthetic session/browser UI regression only; no server authorization proof or real account access', summary, results }, null, 2));
console.log(JSON.stringify({ out, summary, failures: results.filter(r => r.status !== 'PASS') }, null, 2));
process.exitCode = summary.FAIL || summary.BLOCKED ? 1 : 0;
