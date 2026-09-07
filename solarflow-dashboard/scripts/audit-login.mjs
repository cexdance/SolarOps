// Browser login audit. Local-only, synthetic auth, no live data or credentials.
import { chromium, webkit, devices } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const base = new URL(process.env.LOGIN_AUDIT_URL || 'http://127.0.0.1:5187');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)) throw new Error('Local test server required');
const out = resolve(process.env.LOGIN_AUDIT_OUTPUT || '/private/tmp/solarops-login-audit');
mkdirSync(out, { recursive: true });
const results = [], observations = [];
const profiles = [
  { name: 'desktop-chromium', engine: chromium, options: { viewport: { width: 1440, height: 900 } } },
  { name: 'mobile-chromium', engine: chromium, options: { ...devices['Pixel 7'], viewport: { width: 393, height: 851 } } },
  { name: 'mobile-webkit', engine: webkit, options: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } } },
];
async function check(profile, id, expectation, fn) {
  try { const detail = await fn(); results.push({ profile, id, expectation, status: 'PASS', detail }); }
  catch (e) { results.push({ profile, id, expectation, status: 'FAIL', detail: String(e.message).split('\n').slice(0, 3).join(' ') }); }
}
for (const profile of profiles) {
  let browser;
  try { browser = await profile.engine.launch({ headless: true }); }
  catch (e) { results.push({ profile: profile.name, id: 'SETUP', status: 'BLOCKED', detail: String(e.message).split('\n')[0] }); continue; }
  const context = await browser.newContext({ ...profile.options, serviceWorkers: 'block' });
  let authRequests = 0, recoveryRequests = 0;
  const pageErrors = [];
  // No local application proxy or external integration can receive a mutation.
  await context.route('**/*', async route => {
    const req = route.request(), u = new URL(req.url());
    if (u.pathname.includes('/auth/v1/token')) {
      authRequests++;
      return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'invalid_credentials', msg: 'Invalid login credentials' }) });
    }
    if (u.pathname.includes('/auth/v1/recover')) {
      recoveryRequests++;
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'unexpected_failure', msg: 'Synthetic recovery service failure' }) });
    }
    if (u.origin === base.origin && req.method() === 'GET' &&
        !/^\/(api|xero-api|xero-token)(\/|$)/.test(u.pathname) &&
        (['document', 'script', 'stylesheet', 'image', 'font', 'media'].includes(req.resourceType()) ||
         ['/version.json', '/manifest.json', '/manifest.webmanifest'].includes(u.pathname))) return route.continue();
    if (u.pathname.startsWith('/api/') || u.pathname.startsWith('/rest/') || u.pathname.startsWith('/auth/')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    return route.abort('blockedbyclient');
  });
  // Disable cross-service sockets and biometric prompts in this deterministic UI pass.
  await context.routeWebSocket('**/*', ws => ws.close());
  await context.addInitScript(() => {
    Object.defineProperty(window, 'PublicKeyCredential', { value: undefined, configurable: true });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', e => pageErrors.push(e.message));
  try {
    await page.goto(base.href, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Staff Login', exact: true }).waitFor({ timeout: 30000 });
    for (const portal of ['staff', 'contractor']) {
      if (portal === 'contractor') await page.getByRole('button', { name: /Contractor Portal/ }).click();
      const heading = portal === 'staff' ? 'Staff Login' : 'Contractor Portal';
      await check(profile.name, `${portal}-render`, 'Login screen renders', async () => {
        assert.equal(await page.getByRole('heading', { name: heading, exact: true }).isVisible(), true);
        await page.screenshot({ path: resolve(out, `${profile.name}-${portal}.png`), fullPage: true });
      });
      await check(profile.name, `${portal}-overflow`, 'No horizontal page overflow', async () => {
        const size = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
        assert.ok(size.document <= size.viewport + 1, JSON.stringify(size)); return size;
      });
      await check(profile.name, `${portal}-labels`, 'Email/password have associated accessible labels', async () => {
        const inputLabels = await page.locator('form input').evaluateAll(els => els.map(el => ({ type: el.type, labels: el.labels?.length || 0, aria: el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') })));
        assert.ok(inputLabels.every(x => x.labels || x.aria), JSON.stringify(inputLabels));
      });
      await check(profile.name, `${portal}-autocomplete`, 'Credential autofill semantics and masking', async () => {
        assert.equal(await page.locator('input[type=email]').getAttribute('autocomplete'), 'email');
        assert.equal(await page.locator('input[type=password]').getAttribute('autocomplete'), 'current-password');
      });
      await check(profile.name, `${portal}-empty`, 'Empty submit stays on login without an auth request', async () => {
        const before = authRequests;
        await page.locator('button[type=submit]').click();
        assert.equal(await page.locator('form').evaluate(el => el.checkValidity()), false);
        assert.equal(authRequests, before);
      });
      await check(profile.name, `${portal}-invalid-email`, 'Malformed email rejected before auth request', async () => {
        const before = authRequests;
        await page.locator('input[type=email]').fill('not-an-email');
        await page.locator('input[type=password]').fill('synthetic-invalid-password');
        await page.locator('button[type=submit]').click();
        assert.equal(await page.locator('input[type=email]').evaluate(el => el.validity.typeMismatch), true);
        assert.equal(authRequests, before);
      });
      await check(profile.name, `${portal}-invalid-auth`, 'Rejected credentials show error and restore submit', async () => {
        const before = authRequests;
        await page.locator('input[type=email]').fill('login-audit@example.com');
        await page.locator('input[type=password]').fill('synthetic-invalid-password');
        await page.locator('input[type=password]').press('Enter');
        await page.getByText('Invalid email or password.', { exact: true }).waitFor();
        assert.equal(authRequests, before + 1);
        assert.equal(await page.locator('button[type=submit]').isEnabled(), true);
      });
      await check(profile.name, `${portal}-error-announcement`, 'Authentication error announced to assistive technology', async () => {
        const announced = await page.getByText('Invalid email or password.', { exact: true }).evaluate(el => !!el.closest('[role=alert],[aria-live=polite],[aria-live=assertive]'));
        assert.equal(announced, true, 'Visible error has no live region or alert role');
      });
      const targets = await page.locator('button').evaluateAll(els => els.filter(el => el.getBoundingClientRect().width && !el.disabled).map(el => {
        const b = el.getBoundingClientRect(); return { name: el.getAttribute('aria-label') || el.textContent.trim() || '(unnamed)', width: Math.round(b.width), height: Math.round(b.height) };
      }));
      observations.push({ profile: profile.name, portal, buttonTargets: targets });
      if (profile.name.startsWith('mobile')) await check(profile.name, `${portal}-touch-targets`, 'Active buttons meet project 44 by 44 target', async () => {
        const small = targets.filter(x => x.width < 44 || x.height < 44); assert.equal(small.length, 0, JSON.stringify(small));
      });
      if (portal === 'contractor') await check(profile.name, 'contractor-password-toggle', 'Show/hide password is accessible and functional', async () => {
        const toggle = page.locator('input[autocomplete=current-password]').locator('..').locator('button');
        await toggle.click();
        assert.equal(await page.locator('input[autocomplete=current-password]').getAttribute('type'), 'text');
        await toggle.click();
        assert.equal(await page.locator('input[autocomplete=current-password]').getAttribute('type'), 'password');
        const name = await toggle.evaluate(el => el.getAttribute('aria-label') || el.textContent.trim());
        assert.ok(name, 'Password toggle has no accessible name');
      });
      await page.getByRole('button', { name: 'Forgot password?' }).click();
      await check(profile.name, `${portal}-reset-navigation`, 'Forgot password screen reachable', async () => {
        assert.equal(await page.locator('input[type=email]').isVisible(), true);
        await page.screenshot({ path: resolve(out, `${profile.name}-${portal}-reset.png`), fullPage: true });
      });
      await check(profile.name, `${portal}-reset-label`, 'Reset email field has an accessible label', async () => {
        assert.equal(await page.locator('input[type=email]').evaluate(el => !!(el.labels?.length || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby'))), true);
      });
      await check(profile.name, `${portal}-reset-failure`, 'Recovery outage must not falsely claim a link was sent', async () => {
        const before = recoveryRequests;
        await page.locator('input[type=email]').fill('login-audit@example.com');
        const response = page.waitForResponse(r => new URL(r.url()).pathname.includes('/auth/v1/recover'));
        await page.locator('button[type=submit]').click();
        await response;
        await page.waitForFunction(() => ![...document.querySelectorAll('button')].some(b => b.disabled && /sending/i.test(b.textContent)));
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.ok(recoveryRequests > before, 'Mock recovery endpoint was not reached');
        // Capture the settled recovery result, whether confirmation or retry/error UI.
        await page.screenshot({ path: resolve(out, `${profile.name}-${portal}-reset-outage.png`), fullPage: true });
        assert.equal(await page.getByText(/Check your inbox/).first().isVisible(), false, 'Shows sent confirmation after synthetic HTTP 503');
      });
      await page.getByRole('button', { name: /Back to login/i }).click();
    }
    await check(profile.name, 'portal-return', 'Contractor page returns to staff login', async () => {
      await page.getByRole('button', { name: 'Staff / Admin login' }).click();
      await page.getByRole('heading', { name: 'Staff Login', exact: true }).waitFor();
    });
    await check(profile.name, 'uncaught-errors', 'No uncaught page errors during covered flows', () => assert.deepEqual(pageErrors, []));
  } catch (e) { results.push({ profile: profile.name, id: 'FLOW', status: 'BLOCKED', detail: String(e.message).split('\n')[0] }); }
  finally { await context.close(); await browser.close(); }
}
const summary = Object.fromEntries(['PASS','FAIL','BLOCKED'].map(s => [s, results.filter(r => r.status === s).length]));
writeFileSync(resolve(out, 'results.json'), JSON.stringify({ base: base.origin, mode: 'local UI + synthetic auth/recovery responses; no live auth or data', capturedAt: new Date().toISOString(), summary, results, observations }, null, 2));
console.log(JSON.stringify({ output: out, summary, failures: results.filter(r => r.status !== 'PASS') }, null, 2));
process.exitCode = summary.FAIL || summary.BLOCKED ? 1 : 0;
