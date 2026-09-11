/**
 * Client number registry sheet - Google Apps Script web app (a MIRROR).
 *
 * Since 2026-09-11 SolarOps allocates client numbers in Postgres
 * (public.client_numbers). This endpoint no longer picks numbers. SolarOps calls
 * it to (a) stamp a name onto the row for a number it assigned, (b) clear a row
 * it wrote when the save never happened (op:"release"), and the nightly audit
 * calls it to fill rows the app could not write at the time.
 *
 * A row holding a DIFFERENT name is never overwritten; it comes back `taken`,
 * and SolarOps records that name as the number's owner.
 *
 * Sheet layout (tab "MAIN LIST ", row 1 is the header):
 *   A = row counter   B = Accounts (US-1XXXX)   C = Name   D = Description   E = Status
 *
 * DEPLOY: editing this file does NOT change what /exec serves. Deploy > Manage
 * deployments > pencil > Version: New version > Deploy. Same URL, new code.
 *
 * Requests are POST with a JSON body:
 *   { name, clientId }                     stamp (clientId REQUIRED)
 *   { op: "release", clientId, name }      clear, only if the row still holds `name`
 */

var SHEET_ID = '169naSCBMVcWNU15Z-UUfKo-Ss48kPEC0AvBCPDjQcKY';
// The workbook has ~10 tabs, so never guess by position. Matched on the trimmed
// name because the real tab is "MAIN LIST " with a trailing space, which
// getSheetByName would miss.
var TAB_NAME = 'MAIN LIST';
var FIRST_DATA_ROW = 2;
var COL_ACCOUNT = 2; // B
var COL_NAME = 3;    // C

function norm_(s) {
  return String(s == null ? '' : s).trim().toUpperCase();
}

/** "US-15687" -> 15687. Returns 0 for anything without digits. */
function accountNum_(s) {
  var d = String(s == null ? '' : s).replace(/\D/g, '');
  return d ? parseInt(d, 10) : 0;
}

/**
 * How far past the last row SolarOps may extend the sheet in one write. A typo
 * like US-99999 must not create eighty thousand rows.
 */
var MAX_APPEND_GAP = 50;

/**
 * Decide which row to write to. Pure, so `demo` can check it without the sheet.
 * `rows` is [[account, name], ...] in sheet order.
 * Returns { index } (0-based into rows), { appendTo, from } when SolarOps
 * assigned a number past the last pre-made row, or { error }.
 */
function pickRow_(rows, clientId) {
  var i, target, max = 0;
  if (!clientId) {
    // Since 2026-09-11 SolarOps allocates client numbers (Postgres) and this
    // sheet only mirrors them. Refusing to pick one here makes a stale tab still
    // running the old code fail loudly, instead of handing out a number the
    // database never heard of (which is how Cherrington and US-15703 happened).
    return { error: 'Client numbers are assigned by SolarOps now. Refresh the page and try again.' };
  }
  target = norm_(clientId);
  for (i = 0; i < rows.length; i++) {
    if (norm_(rows[i][0]) === target) return { index: i };
    if (accountNum_(rows[i][0]) > max) max = accountNum_(rows[i][0]);
  }
  var want = accountNum_(clientId);
  if (max && want > max && want - max <= MAX_APPEND_GAP) return { appendTo: want, from: max + 1 };
  return { error: 'Client number ' + clientId + ' is not in the registry sheet.' };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ error: 'Bad request body.' });
  }
  var name = String(req.name || '').trim();
  if (!name) return json_({ error: 'A client name is required.' });
  // A claim is a WRITE, and the caller can still abort after it (its own checks
  // run on the number we just handed back). Without a way to give the number
  // back, every such abort burns one and the operator's retry claims another,
  // which is one lead holding two rows. Taylor Williams, 2026-09-08: claimed at
  // 18:06:56, aborted, retried at 18:07:48 and claimed again.
  var releasing = String(req.op || '') === 'release';

  // Serialized so two people converting leads at the same second cannot claim
  // the same number. Without this the "first blank row" read is a race.
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return json_({ error: 'Registry is busy, try again in a moment.' });
  }

  try {
    var all = SpreadsheetApp.openById(SHEET_ID).getSheets();
    var sh = null;
    for (var s = 0; s < all.length; s++) {
      if (norm_(all[s].getName()) === norm_(TAB_NAME)) { sh = all[s]; break; }
    }
    if (!sh) return json_({ error: 'Registry tab "' + TAB_NAME + '" not found.' });
    var last = sh.getLastRow();
    if (last < FIRST_DATA_ROW) return json_({ error: 'Registry sheet is empty.' });
    var rows = sh.getRange(FIRST_DATA_ROW, COL_ACCOUNT, last - FIRST_DATA_ROW + 1, 2).getValues();

    // Giving a number back. Only ever clears a cell that still holds exactly the
    // name we were told to expect, so a release that arrives late (after someone
    // else legitimately took the row) is a no-op instead of a wipe.
    if (releasing) {
      var want = norm_(req.clientId);
      if (!want) return json_({ error: 'release needs a clientId.' });
      for (var r = 0; r < rows.length; r++) {
        if (norm_(rows[r][0]) !== want) continue;
        var held = String(rows[r][1]).trim();
        if (norm_(held) !== norm_(name)) {
          return json_({ clientId: String(rows[r][0]).trim(), name: held, released: false, reason: 'row no longer holds that name' });
        }
        sh.getRange(r + FIRST_DATA_ROW, COL_NAME).clearContent();
        return json_({ clientId: String(rows[r][0]).trim(), name: '', released: true });
      }
      return json_({ error: 'Client number ' + req.clientId + ' is not in the registry sheet.' });
    }

    var pick = pickRow_(rows, req.clientId);
    if (pick.error) return json_({ error: pick.error });

    if (pick.appendTo) {
      // SolarOps assigned a number past the last pre-made row. Extend the run up
      // to it, keeping column A's counter going, so the row exists to be named.
      var counter = Number(sh.getRange(last, 1).getValue()) || (last - FIRST_DATA_ROW + 1);
      var add = [];
      for (var n = pick.from; n <= pick.appendTo; n++) {
        counter++;
        add.push([counter, 'US-' + n, n === pick.appendTo ? name : '']);
      }
      sh.getRange(last + 1, 1, add.length, 3).setValues(add);
      return json_({ clientId: 'US-' + pick.appendTo, name: name, appended: true });
    }

    var account = String(rows[pick.index][0]).trim();
    var existing = String(rows[pick.index][1]).trim();

    // Never overwrite a name that is already there under a different client.
    // The caller decides what to do; the sheet is left untouched.
    if (existing && norm_(existing) !== norm_(name)) {
      return json_({ clientId: account, name: existing, taken: true });
    }

    sh.getRange(pick.index + FIRST_DATA_ROW, COL_NAME).setValue(name);
    return json_({ clientId: account, name: name });
  } catch (err) {
    return json_({ error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/** Self-check. Run from the Apps Script editor; throws if pickRow_ regresses. */
function demo() {
  var rows = [['US-15015', 'Daniel Matos'], ['US-15016', ''], ['US-15017', '']];
  if (pickRow_(rows, 'us-15015 ').index !== 0) throw new Error('lookup should be trim/case insensitive');
  if (pickRow_(rows, 'US-15016').index !== 1) throw new Error('should find a blank row by number');
  if (!pickRow_(rows, null).error) throw new Error('the sheet must refuse to pick a number itself');
  var ext = pickRow_([['US-15686', 'a'], ['US-15687', 'b']], 'US-15689');
  if (ext.appendTo !== 15689 || ext.from !== 15688) throw new Error('should extend the run up to a number SolarOps assigned');
  if (!pickRow_([['US-15687', 'b']], 'US-99999').error) throw new Error('a far-off typo must not append thousands of rows');
  if (!pickRow_([['', '']], 'US-15015').error) throw new Error('an empty sheet must not invent rows');
  Logger.log('ok');
}
