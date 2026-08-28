/**
 * Client number registry - Google Apps Script web app.
 *
 * Backs "Move to Client" in SolarOps. The sheet is the source of truth for the
 * consecutive US-1XXXX numbers; this endpoint either (a) stamps a name onto the
 * number a lead already carries, or (b) claims the first pre-allocated number
 * whose Name cell is still blank and returns it.
 *
 * Sheet layout (first tab, row 1 is the header):
 *   A = row counter   B = Accounts (US-1XXXX)   C = Name   D = Description   E = Status
 *
 * SETUP
 *   1. Open the sheet > Extensions > Apps Script, paste this file, Save.
 *   2. Run `demo` once: it self-checks the pick logic and grants the sheet scope.
 *   3. Deploy > New deployment > Web app.
 *        Execute as: Me.   Who has access: Anyone.
 *      Copy the /exec URL.
 *   4. Put it in the dashboard's .env / Vercel env as VITE_CLIENT_REGISTRY_URL
 *      and redeploy (VITE_* vars are baked in at build time).
 *
 * Requests are POST with a JSON body: { name: "Jane Doe", clientId: "US-15683" }
 * clientId is optional - omit it to claim the next free number.
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
 * Decide which row to write to. Pure, so `demo` can check it without the sheet.
 * `rows` is [[account, name], ...] in sheet order.
 * Returns { index } (0-based into rows), { append, clientId } when the
 * pre-allocated numbers are used up, or { error }.
 */
function pickRow_(rows, clientId) {
  var i, target, max = 0;
  if (clientId) {
    target = norm_(clientId);
    for (i = 0; i < rows.length; i++) {
      if (norm_(rows[i][0]) === target) return { index: i };
    }
    return { error: 'Client number ' + clientId + ' is not in the registry sheet.' };
  }
  for (i = 0; i < rows.length; i++) {
    if (!norm_(rows[i][0])) continue;
    if (!String(rows[i][1]).trim()) return { index: i };
    if (accountNum_(rows[i][0]) > max) max = accountNum_(rows[i][0]);
  }
  // Every pre-allocated number is taken: extend the run by one. Numbering stays
  // consecutive because max is the highest account in the sheet, not a count.
  if (!max) return { error: 'Registry sheet has no US-1XXXX numbers to continue from.' };
  return { append: true, clientId: 'US-' + (max + 1) };
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

    var pick = pickRow_(rows, req.clientId);
    if (pick.error) return json_({ error: pick.error });

    if (pick.append) {
      // Column A is the sheet's own row counter; keep it running so the new row
      // looks like every other one.
      var counter = Number(sh.getRange(last, 1).getValue()) || (last - FIRST_DATA_ROW + 1);
      sh.getRange(last + 1, 1, 1, 3).setValues([[counter + 1, pick.clientId, name]]);
      return json_({ clientId: pick.clientId, name: name, appended: true });
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
  if (pickRow_(rows, null).index !== 1) throw new Error('should claim the first blank name');
  if (!pickRow_(rows, 'US-99999').error) throw new Error('unknown number must error, not fall through');
  var full = pickRow_([['US-15686', 'a'], ['US-15687', 'b']], null);
  if (full.clientId !== 'US-15688') throw new Error('exhausted registry must append the next number, got ' + full.clientId);
  if (pickRow_([['', '']], null).clientId) throw new Error('empty registry must not invent a number');
  Logger.log('ok');
}
