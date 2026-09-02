/*
 * SolarEdge site-transfer autofill bookmarklet.
 *
 * Why a bookmarklet and not a server call: solaredge.com/site-transfer sits
 * behind a Cloudflare bot check that never clears for a headless client, and
 * the form is a Drupal wizard carrying a per-session form_build_id. So the
 * fill has to happen inside a real browser the user is already driving.
 *
 * It is idempotent and re-runnable on purpose. The form reveals its later
 * fields only after the Customer Number validates, so rather than detect the
 * wizard step, this fills every field it can currently see and you click it
 * again once more of the form appears.
 *
 * On the confirmation screen it switches modes and copies the case number to
 * the clipboard instead.
 */
(function () {
  // Constant for every Conexsol transfer. Only Site ID and inverter SN vary.
  var CONST = {
    party_number: '107077',
    customer_email: 'anthony.lopez@conexsol.us',
    phone_number: '+1 (786) 899-7191',
    new_installer_account_id: '64793',
    verify_new_installer_account_id: '64793',
    first_name: 'Anthony',
    last_name: 'Lopez'
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

  // Clicking the button on the install page instead of dragging it is the
  // obvious mistake, and the generic "no form here" message does not explain
  // it. Detect that page and say what to do.
  if (document.getElementById('se-transfer-install-page')) {
    alert('This is the install page, not the SolarEdge form.\n\n' +
      'Drag the "SE Transfer Fill" button UP to your bookmarks bar. ' +
      'If you cannot see the bar, press Cmd+Shift+B to show it.\n\n' +
      'Then click the bookmark while the SolarEdge site-transfer form is open.');
    return;
  }

  var form = document.getElementById('site-transfer-form');

  // Confirmation screen: no form left, just a case number to harvest.
  // ponytail: the pattern is a guess until one real submission is seen; if it
  // misses, the alert still shows the surrounding text so you can copy by hand.
  if (!form) {
    var txt = (document.body.innerText || document.body.textContent || '').replace(/\s+/g, ' ');
    // Deliberately loose: match the first id-shaped token within ~40 chars
    // after "case" or "reference", whatever filler words sit between.
    var m = txt.match(/(?:case|reference|ticket)\b[^]{0,40}?\b([A-Z]{0,4}-?\d[\dA-Z-]{4,})/i);
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

  function fire(el) {
    ['input', 'change', 'keyup', 'blur'].forEach(function (t) {
      el.dispatchEvent(new Event(t, { bubbles: true }));
    });
  }
  function set(name, val) {
    var el = form.querySelector('[name="' + name + '"]');
    if (!el || !val || el.value === val) return 0;
    var setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
    setter.call(el, val);
    fire(el);
    return 1;
  }
  function pick(id) {
    var el = document.getElementById(id);
    if (!el || el.checked) return 0;
    el.click();
    return 1;
  }

  var n = 0;
  RADIO.forEach(function (id) { n += pick(id); });
  Object.keys(CONST).forEach(function (k) { n += set(k, CONST[k]); });
  if (vars.siteId) n += set('site_id', vars.siteId);

  // Partial SN is three boxes. A SolarEdge serial reads like BF10B459-DC:
  // body before the dash, checksum after.
  // ponytail: datecode is left for the user until one real serial confirms the
  // split; the form validates inline so a wrong guess would be worse than blank.
  if (vars.serial) {
    var parts = String(vars.serial).trim().toUpperCase().split('-');
    n += set('serial_hex', parts[0]);
    if (parts[1]) n += set('serial_checksum', parts[1]);
  }
  CHECK.forEach(function (id) { n += pick(id); });

  alert('Filled ' + n + ' field(s).\n\nIf the form just expanded, click this bookmarklet again to fill the rest, then review and submit.');
})();
