/*
 * SolarEdge site-transfer autofill bookmarklet.
 *
 * Why a bookmarklet and not a script on a server or a headless browser:
 * solaredge.com is behind Cloudflare, and it detects a CDP-driven Chrome. A
 * Playwright version of this was built and reliably got stuck on "Verifying
 * you are human" with no box to tick. A bookmarklet has no automation
 * signature at all, because it IS the person's own browser. That is the whole
 * reason this shape was chosen; do not replace it with a driver.
 *
 * On the form it fills everything in one click. On the confirmation screen it
 * copies the case number instead.
 */
(function () {
  // Constant for every Conexsol transfer. Only the serial and site id vary.
  var CONST = {
    party_number: '107077',
    customer_email: 'anthony.lopez@conexsol.us',
    phone_number: '+1 (786) 899-7191',
    first_name: 'Anthony',
    last_name: 'Lopez'
  };
  // Hidden until transfer_monitoring_checkbox is ticked, so filled afterwards.
  var INSTALLER = {
    new_installer_account_id: '64793',
    verify_new_installer_account_id: '64793'
  };
  var CHECK = [
    'edit-transfer-monitoring-checkbox',
    'edit-acknowledgment',
    'edit-declaration',
    'edit-terms-privacy'
  ];
  var RADIO = ['edit-serial-number-type-partialsn', 'edit-site-id-radio-siteidinput'];

  function copy(t) {
    try { navigator.clipboard.writeText(t); return true; } catch (e) {}
    var a = document.createElement('textarea');
    a.value = t; document.body.appendChild(a); a.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(a);
    return true;
  }

  if (document.getElementById('se-transfer-install-page')) {
    alert('This is the install page, not the SolarEdge form.\n\n' +
      'Drag the "SE Transfer Fill" button UP to your bookmarks bar. ' +
      'If you cannot see the bar, press Cmd+Shift+B to show it.\n\n' +
      'Then click the bookmark while the SolarEdge site-transfer form is open.');
    return;
  }

  var form = document.getElementById('site-transfer-form');

  // Confirmation screen: no form left, just a case number to harvest.
  if (!form) {
    var txt = (document.body.innerText || document.body.textContent || '').replace(/\s+/g, ' ');
    var m = txt.match(/(?:case|reference|ticket|request)\b[^]{0,60}?\b([A-Z]{0,4}-?\d[\dA-Z-]{4,})/i);
    if (m) {
      copy(m[1]);
      alert('Case number ' + m[1] + ' copied.\nPaste it into the RMA entry in SolarOps.');
    } else {
      alert('No site-transfer form and no case number found. Copy it by hand from:\n\n' + txt.slice(0, 400));
    }
    return;
  }

  var vars = {};
  try {
    vars = JSON.parse(decodeURIComponent((location.hash.match(/solarops=([^&]*)/) || [])[1] || '{}'));
  } catch (e) {}

  // SolarEdge needs both: serial_hex is a required field, and the site id is
  // what says which site to move.
  if (!vars.siteId || !vars.serial) {
    alert('A site transfer needs BOTH the inverter serial and the Site ID.\n\nMissing: ' +
      [!vars.serial && 'inverter serial', !vars.siteId && 'Site ID'].filter(Boolean).join(' and ') +
      '\n\nAdd it on the service order, then reopen this form from there.');
    return;
  }

  function fire(el) {
    ['input', 'change', 'keyup', 'blur'].forEach(function (t) {
      el.dispatchEvent(new Event(t, { bubbles: true }));
    });
  }
  function set(name, val) {
    var el = form.querySelector('[name="' + name + '"]');
    if (!el || !val || el.value === val) return 0;
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, val);
    fire(el);
    return 1;
  }
  function pick(id) {
    var el = document.getElementById(id);
    if (!el || el.checked) return 0;
    el.click();
    return 1;
  }

  /*
   * The three partial-SN boxes map onto the three dash-separated groups of a
   * SolarEdge serial: SV0521-0730B8B06-0F is datecode / hex / checksum.
   * Verified against live serials in the RMA tracker. Shorter serials fill
   * from the right, because `hex` is the required box.
   */
  var p = String(vars.serial).trim().toUpperCase().split('-').filter(Boolean);
  var sn = p.length >= 3 ? { d: p[0], h: p[1], c: p.slice(2).join('-') }
    : p.length === 2 ? { d: '', h: p[0], c: p[1] }
    : { d: '', h: p[0] || '', c: '' };

  var n = 0;
  RADIO.forEach(function (id) { n += pick(id); });
  Object.keys(CONST).forEach(function (k) { n += set(k, CONST[k]); });
  n += set('site_id', vars.siteId);
  n += set('serial_hex', sn.h);
  n += set('serial_datecode', sn.d);
  n += set('serial_checksum', sn.c);
  CHECK.forEach(function (id) { n += pick(id); });
  // Only reachable once the monitoring box above is ticked.
  Object.keys(INSTALLER).forEach(function (k) { n += set(k, INSTALLER[k]); });

  var empty = ['party_number', 'customer_email', 'serial_hex', 'site_id', 'phone_number',
    'new_installer_account_id', 'first_name', 'last_name'].filter(function (k) {
    var el = form.querySelector('[name="' + k + '"]');
    return !el || !el.value;
  });
  if (empty.length) {
    alert('Filled ' + n + ' field(s), but these are still empty:\n\n' + empty.join(', ') +
      '\n\nFill them in by hand before submitting.');
    return;
  }

  var go = document.getElementById('edit-submit-form-test');
  if (go && confirm('All ' + n + ' fields filled.\n\nSubmit the transfer to SolarEdge now?\n\n' +
      'OK submits it. Cancel leaves it filled so you can review first.')) {
    go.click();
    return;
  }
  alert('Filled and left for review. Click Proceed when you are ready.\n\n' +
    'After it submits, click this bookmark again to copy the case number.');
})();
