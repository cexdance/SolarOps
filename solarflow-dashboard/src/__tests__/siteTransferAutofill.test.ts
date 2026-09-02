/**
 * One runnable check on the site-transfer bookmarklet: it fills the SolarEdge
 * form from the URL fragment, and it recognises a case number on the
 * confirmation screen. Both are silent-failure paths otherwise.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

const SRC = readFileSync(resolve(process.cwd(), 'public/site-transfer-autofill.js'), 'utf8');

function run(html: string, hash = '') {
  const dom = new JSDOM(html, {
    url: 'https://www.solaredge.com/site-transfer' + hash,
    runScripts: 'outside-only',
  });
  const alerts: string[] = [];
  let copied = '';
  dom.window.alert = (m: string) => { alerts.push(String(m)); };
  Object.defineProperty(dom.window.navigator, 'clipboard', {
    value: { writeText: (t: string) => { copied = t; } },
    configurable: true,
  });
  dom.window.eval(SRC);
  return { dom, alerts, copied };
}

const FORM = `<form id="site-transfer-form">
  <input name="party_number"><input name="customer_email"><input name="phone_number">
  <input name="site_id"><input name="serial_hex"><input name="serial_checksum">
  <input name="new_installer_account_id"><input name="verify_new_installer_account_id">
  <input name="first_name"><input name="last_name">
  <input type="radio" name="serial_number_type" id="edit-serial-number-type-partialsn">
  <input type="radio" name="site_id_radio" id="edit-site-id-radio-siteidinput">
  <input type="checkbox" name="transfer_monitoring_checkbox" id="edit-transfer-monitoring-checkbox">
  <input type="checkbox" name="acknowledgment" id="edit-acknowledgment">
  <input type="checkbox" name="declaration" id="edit-declaration">
  <input type="checkbox" name="terms_privacy" id="edit-terms-privacy">
</form>`;

describe('site-transfer autofill bookmarklet', () => {
  it('fills the constants plus the two per-order values', () => {
    const payload = encodeURIComponent(JSON.stringify({ siteId: '3860394', serial: 'BF10B459-DC' }));
    const { dom } = run(FORM, '#solarops=' + payload);
    const v = (n: string) =>
      (dom.window.document.querySelector(`[name="${n}"]`) as HTMLInputElement).value;
    const on = (id: string) =>
      (dom.window.document.getElementById(id) as HTMLInputElement).checked;

    expect(v('party_number')).toBe('107077');
    expect(v('customer_email')).toBe('anthony.lopez@conexsol.us');
    expect(v('new_installer_account_id')).toBe('64793');
    expect(v('verify_new_installer_account_id')).toBe('64793');
    expect(v('first_name')).toBe('Anthony');
    expect(v('last_name')).toBe('Lopez');
    // the only two that vary per service order
    expect(v('site_id')).toBe('3860394');
    expect(v('serial_hex')).toBe('BF10B459');
    expect(v('serial_checksum')).toBe('DC');
    // partial SN and the three consent boxes
    expect(on('edit-serial-number-type-partialsn')).toBe(true);
    expect(on('edit-transfer-monitoring-checkbox')).toBe(true);
    expect(on('edit-acknowledgment')).toBe(true);
    expect(on('edit-declaration')).toBe(true);
    expect(on('edit-terms-privacy')).toBe(true);
  });

  it('is re-runnable: a second pass over a filled form changes nothing', () => {
    const payload = encodeURIComponent(JSON.stringify({ siteId: '3860394' }));
    const { dom, alerts } = run(FORM, '#solarops=' + payload);
    dom.window.eval(SRC);
    expect(alerts[1]).toContain('Filled 0 field(s)');
    expect(
      (dom.window.document.getElementById('edit-acknowledgment') as HTMLInputElement).checked,
    ).toBe(true);
  });

  it('copies the case number off the confirmation screen', () => {
    const { copied } = run('<div>Thank you. Your case number is CS-4821907 and we will be in touch.</div>');
    expect(copied).toBe('CS-4821907');
  });

  it('handles the terser phrasing too', () => {
    const { copied } = run('<div>Case #: 7162665</div>');
    expect(copied).toBe('7162665');
  });

  it('says so rather than copying junk when no case number is present', () => {
    const { copied, alerts } = run('<div>Thank you for your submission.</div>');
    expect(copied).toBe('');
    expect(alerts[0]).toContain('Copy it by hand');
  });
});
