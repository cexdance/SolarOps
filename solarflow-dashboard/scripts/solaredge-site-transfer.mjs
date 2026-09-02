#!/usr/bin/env node
/**
 * Automates the SolarEdge site-transfer submission end to end.
 *
 *   node scripts/solaredge-site-transfer.mjs --serial=SV0521-0730B8B06-0F --site-id=3860394
 *   node scripts/solaredge-site-transfer.mjs --serial=... --site-id=... --submit
 *
 * Without --submit it fills the form, screenshots it and stops. That is the
 * default because submitting files a real ownership transfer with SolarEdge
 * and there is no undo.
 *
 * Why a real Chrome and not fetch(): solaredge.com is behind a Cloudflare bot
 * check that a headless client never clears, and the form POSTs a per-session
 * Drupal form_build_id. A real browser profile passes on its own, so this
 * drives one rather than trying to imitate it. The profile is persistent so
 * the clearance cookie survives between runs.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const URL = 'https://www.solaredge.com/site-transfer';
// How long to wait for a person to clear a Cloudflare challenge before giving up.
const HUMAN_GATE_MS = 180000;
// Warming is an explicit sit-down task, so it waits far longer than a normal run.
const WARM_GATE_S = 900;

// Constant for every Conexsol transfer. Only the serial and site id vary.
const CONST = {
  party_number: '107077',
  customer_email: 'anthony.lopez@conexsol.us',
  phone_number: '+1 (786) 899-7191',
  first_name: 'Anthony',
  last_name: 'Lopez',
};
// Revealed only once transfer_monitoring_checkbox is ticked, so these are
// filled in a second pass rather than with the rest.
const CONST_INSTALLER = {
  new_installer_account_id: '64793',
  verify_new_installer_account_id: '64793',
};
const INSTALLER_FIELDS = Object.keys(CONST_INSTALLER);
const CHECKBOXES = [
  '#edit-transfer-monitoring-checkbox',
  '#edit-acknowledgment',
  '#edit-declaration',
  '#edit-terms-privacy',
];

const arg = (k, d) => {
  const hit = process.argv.find(a => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};
const flag = k => process.argv.includes(`--${k}`);

/**
 * The three partial-SN boxes map onto the three dash-separated groups of a
 * SolarEdge serial: SV0521-0730B8B06-0F is datecode / hex / checksum. Shorter
 * serials fill from the right, since `hex` is the required one.
 */
export function splitSerial(raw) {
  const parts = String(raw || '').trim().toUpperCase().split('-').filter(Boolean);
  if (parts.length >= 3) return { datecode: parts[0], hex: parts[1], checksum: parts.slice(2).join('-') };
  if (parts.length === 2) return { datecode: '', hex: parts[0], checksum: parts[1] };
  return { datecode: '', hex: parts[0] || '', checksum: '' };
}

/** Pull the case/reference number out of the confirmation screen. */
export function findCaseNumber(text) {
  const t = String(text || '').replace(/\s+/g, ' ');
  const m = t.match(/(?:case|reference|ticket|request)\b[^]{0,60}?\b([A-Z]{0,4}-?\d[\dA-Z-]{4,})/i);
  return m ? m[1] : null;
}

async function main() {
  const serial = arg('serial');
  const siteId = arg('site-id', '');
  if (!serial && !flag('warm')) {
    console.error('--serial is required: SolarEdge marks the inverter serial required and the site id optional.');
    process.exit(2);
  }

  const sn = splitSerial(serial);
  const outDir = arg('out', join(homedir(), '.solarops-site-transfers'));
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');

  const ctx = await chromium.launchPersistentContext(
    arg('profile', join(homedir(), '.solarops-chrome-profile')),
    { channel: 'chrome', headless: false, viewport: { width: 1280, height: 1000 } },
  );
  const page = ctx.pages()[0] || (await ctx.newPage());
  // Set when the run should leave Chrome up for the user to finish something.
  let keepOpen = false;

  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // SolarEdge is behind a Cloudflare check. It usually clears on its own in
    // a few seconds. When it does not, the answer is a person ticking the box
    // in the window that is already open, not a workaround: this waits for
    // that instead of failing, and the persistent profile keeps the clearance
    // so later runs go straight through.
    try {
      await page.waitForSelector('#site-transfer-form', { timeout: 20000 });
    } catch {
      const secs = Number(arg('wait', flag('warm') ? String(WARM_GATE_S) : String(HUMAN_GATE_MS / 1000)));
      console.error(
        `\nCloudflare is challenging this visit.\n` +
        `Tick the "Verify you are human" box in the Chrome window that just opened.\n` +
        `Waiting up to ${secs}s...\n`,
      );
      try {
        await page.waitForSelector('#site-transfer-form', { timeout: secs * 1000 });
      } catch {
        // Not a crash, just nobody at the keyboard. Say so plainly, and leave
        // the window open so the check can still be cleared: the profile keeps
        // the clearance, which is the whole point of warming it.
        console.error(
          `\nThe check was not cleared in time. Nothing was filled or submitted.\n\n` +
          `Run this once while you are at the keyboard, then re-run normally:\n` +
          `  node scripts/solaredge-site-transfer.mjs --warm\n`,
        );
        keepOpen = flag('warm');
        process.exitCode = 1;
        return;
      }
      console.error('Check cleared, continuing.\n');
    }

    if (flag('warm')) {
      console.log(JSON.stringify({ ok: true, warmed: true, note: 'Cloudflare clearance stored in the profile.' }, null, 1));
      return;
    }

    await page.check('#edit-serial-number-type-partialsn');
    await page.check('#edit-site-id-radio-siteidinput');
    for (const [name, value] of Object.entries(CONST)) {
      await page.fill(`#site-transfer-form [name="${name}"]`, value);
    }
    await page.fill('[name="serial_hex"]', sn.hex);
    if (sn.datecode) await page.fill('[name="serial_datecode"]', sn.datecode);
    if (sn.checksum) await page.fill('[name="serial_checksum"]', sn.checksum);
    if (siteId) await page.fill('[name="site_id"]', siteId);

    // The installer-id pair is revealed by the monitoring checkbox, so it has
    // to be ticked before those fields can be filled.
    for (const sel of CHECKBOXES) await page.check(sel);
    for (const name of INSTALLER_FIELDS) {
      const field = page.locator(`#site-transfer-form [name="${name}"]`);
      await field.waitFor({ state: 'visible', timeout: 15000 });
      await field.fill(CONST_INSTALLER[name]);
    }

    // Read back what the form actually holds. Filling is not the same as the
    // form accepting it: Drupal rewrites and masks some of these on blur.
    const filled = await page.evaluate(() => {
      const f = document.getElementById('site-transfer-form');
      const out = {};
      for (const e of f.querySelectorAll('input')) {
        if (!e.name || e.type === 'hidden') continue;
        out[e.name] = e.type === 'checkbox' || e.type === 'radio' ? e.checked : e.value;
      }
      return out;
    });
    const missing = ['party_number', 'customer_email', 'serial_hex', 'phone_number', 'first_name', 'last_name']
      .filter(k => !filled[k]);
    const shot = join(outDir, `${stamp}-filled.png`);
    await page.screenshot({ path: shot, fullPage: true });

    if (missing.length) {
      console.error(JSON.stringify({ ok: false, reason: 'required fields empty after fill', missing, screenshot: shot }, null, 1));
      process.exitCode = 1;
      return;
    }

    if (!flag('submit')) {
      console.log(JSON.stringify({
        ok: true, submitted: false, serial: sn, siteId, screenshot: shot,
        note: 'Filled only. Re-run with --submit to file the transfer.',
      }, null, 1));
      return;
    }

    await page.click('#edit-submit-form-test');
    await page.waitForLoadState('networkidle', { timeout: 90000 }).catch(() => {});
    await page.waitForTimeout(2500);

    const body = await page.evaluate(() => document.body.innerText || '');
    const errors = await page.evaluate(() =>
      [...document.querySelectorAll('.error, .form-item--error-message, [role=alert]')]
        .map(e => e.innerText.trim()).filter(Boolean).slice(0, 10));
    const after = join(outDir, `${stamp}-result.png`);
    await page.screenshot({ path: after, fullPage: true });

    const caseNumber = findCaseNumber(body);
    console.log(JSON.stringify({
      ok: !!caseNumber && errors.length === 0,
      submitted: true,
      caseNumber,
      errors,
      serial: sn,
      siteId,
      screenshot: after,
      // Always carried so a missed regex never loses the number.
      confirmationText: body.replace(/\s+/g, ' ').slice(0, 1200),
    }, null, 1));
  } finally {
    if (keepOpen) {
      console.error('Leaving Chrome open. Clear the check, then close the window.');
    } else {
      await ctx.close();
    }
  }
}

// The repo path contains a non-ASCII character, so compare encoded URLs, not a
// hand-built file:// string.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
