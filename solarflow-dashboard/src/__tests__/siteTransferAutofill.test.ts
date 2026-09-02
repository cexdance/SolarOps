/**
 * Checks on the site-transfer bookmarklet. It runs in the operator's own
 * browser and every failure mode is silent, so the fill, the serial split,
 * the both-identifiers gate and the case-number capture each get a check.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

const SRC = readFileSync(resolve(process.cwd(), 'public/site-transfer-autofill.js'), 'utf8');

function run(html: string, hash = '', confirmResult = false) {
  const dom = new JSDOM(html, {
    url: 'https://www.solaredge.com/site-transfer' + hash,
    runScripts: 'outside-only',
  });
  const alerts: string[] = [];
  let copied = '';
  dom.window.alert = (m: string) => { alerts.push(String(m)); };
  dom.window.confirm = () => confirmResult;
  Object.defineProperty(dom.window.navigator, 'clipboard', {
    value: { writeText: (t: string) => { copied = t; } },
    configurable: true,
  });
  dom.window.eval(SRC);
  const v = (n: string) =>
    (dom.window.document.querySelector(`[name="${n}"]`) as HTMLInputElement | null)?.value ?? null;
  const on = (id: string) =>
    (dom.window.document.getElementById(id) as HTMLInputElement | null)?.checked ?? null;
  return { dom, alerts, copied, v, on };
}

const FORM = `<form id="site-transfer-form">
  <input name="party_number"><input name="customer_email"><input name="phone_number">
  <input name="site_id"><input name="serial_hex"><input name="serial_datecode"><input name="serial_checksum">
  <input name="new_installer_account_id"><input name="verify_new_installer_account_id">
  <input name="first_name"><input name="last_name">
  <input type="radio" name="serial_number_type" id="edit-serial-number-type-partialsn">
  <input type="radio" name="site_id_radio" id="edit-site-id-radio-siteidinput">
  <input type="checkbox" name="transfer_monitoring_checkbox" id="edit-transfer-monitoring-checkbox">
  <input type="checkbox" name="acknowledgment" id="edit-acknowledgment">
  <input type="checkbox" name="declaration" id="edit-declaration">
  <input type="checkbox" name="terms_privacy" id="edit-terms-privacy">
  <button type="submit" id="edit-submit-form-test">Proceed</button>
</form>`;

const payload = (o: Record<string, string>) => '#solarops=' + encodeURIComponent(JSON.stringify(o));
const BOTH = { siteId: '3860394', serial: 'SV0521-0730B8B06-0F' };

describe('site-transfer autofill bookmarklet', () => {
  it('fills the constants, the installer ids and the two per-order values', () => {
    const { v, on } = run(FORM, payload(BOTH));
    expect(v('party_number')).toBe('107077');
    expect(v('customer_email')).toBe('anthony.lopez@conexsol.us');
    expect(v('phone_number')).toBe('+1 (786) 899-7191');
    expect(v('first_name')).toBe('Anthony');
    expect(v('last_name')).toBe('Lopez');
    expect(v('site_id')).toBe('3860394');
    // Installer ids sit behind the monitoring checkbox, so this also proves
    // the fill happens after the box is ticked, not before.
    expect(v('new_installer_account_id')).toBe('64793');
    expect(v('verify_new_installer_account_id')).toBe('64793');
    expect(on('edit-serial-number-type-partialsn')).toBe(true);
    expect(on('edit-site-id-radio-siteidinput')).toBe(true);
    expect(on('edit-acknowledgment')).toBe(true);
    expect(on('edit-declaration')).toBe(true);
    expect(on('edit-terms-privacy')).toBe(true);
  });

  it('splits a three-part serial across datecode / hex / checksum', () => {
    const { v } = run(FORM, payload(BOTH));
    expect(v('serial_datecode')).toBe('SV0521');
    expect(v('serial_hex')).toBe('0730B8B06');
    expect(v('serial_checksum')).toBe('0F');
  });

  it('puts a two-part serial in hex + checksum, never in datecode', () => {
    const { v } = run(FORM, payload({ siteId: '3860394', serial: 'BF10B459-DC' }));
    expect(v('serial_datecode')).toBe('');
    expect(v('serial_hex')).toBe('BF10B459');
    expect(v('serial_checksum')).toBe('DC');
  });

  it('normalises a lowercase serial', () => {
    const { v } = run(FORM, payload({ siteId: '1', serial: ' sj3620-074003fa2-55 ' }));
    expect(v('serial_hex')).toBe('074003FA2');
  });

  it('refuses to fill when either identifier is missing', () => {
    for (const p of [{ siteId: '3860394' }, { serial: 'SV0521-0730B8B06-0F' }, {}]) {
      const { alerts, v } = run(FORM, payload(p as Record<string, string>));
      expect(alerts[0]).toContain('BOTH');
      expect(v('party_number')).toBe('');
    }
  });

  it('leaves the form for review when the submit confirm is declined', () => {
    const { alerts } = run(FORM, payload(BOTH), false);
    expect(alerts.pop()).toContain('left for review');
  });

  it('submits without a review message when the confirm is accepted', () => {
    const { alerts } = run(FORM, payload(BOTH), true);
    expect(alerts.filter(a => a.includes('left for review'))).toHaveLength(0);
  });

  it('explains the drag instead of running when clicked on the install page', () => {
    const { alerts, copied } = run('<h1 id="se-transfer-install-page">x</h1>');
    expect(alerts[0]).toContain('bookmarks bar');
    expect(copied).toBe('');
  });

  it('copies the case number off the confirmation screen', () => {
    expect(run('<div>Thank you. Your case number is CS-4821907.</div>').copied).toBe('CS-4821907');
    expect(run('<div>Case #: 7162665</div>').copied).toBe('7162665');
  });

  it('says so rather than copying junk when no case number is present', () => {
    const { copied, alerts } = run('<div>Thank you for your submission.</div>');
    expect(copied).toBe('');
    expect(alerts[0]).toContain('Copy it by hand');
  });
});
