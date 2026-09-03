/**
 * One-off backfill: add the PowerCare case number to 13 rows of the client
 * registry sheet, using the convention the sheet already uses:
 *   <Name> POWERCARE: <case#>
 *
 * Why this exists: the web app's /exec endpoint refuses any row that already
 * holds a different name (it answers {taken:true} and leaves the sheet alone),
 * which is correct for lead conversion and useless for a correction pass.
 *
 * HOW TO RUN. No deployment needed, running a function from the editor does not
 * touch what /exec serves:
 *   1. Sheet -> Extensions -> Apps Script
 *   2. Paste this file in as a new script file
 *   3. Select `dryRunPowerCareBackfill` in the function dropdown, press Run,
 *      and read the Execution log. It writes NOTHING.
 *   4. If the log looks right, run `backfillPowerCareCases`.
 *
 * Safe to run twice: a row already ending in the target text is skipped.
 * It also refuses to write if the name on the row is not the name it expects,
 * so a row someone edited in the meantime is reported, not overwritten.
 */

// [ sheet row, accepted current name (string, or array of alternatives), new name ]
//
// "Sheet row" is the spreadsheet's own row number, NOT column A. Column A is a
// running counter that sits one behind the row (US-15689 is column A 675 and
// sheet row 676), so reading a position off column A shifts every edit up one
// row and writes each case number onto the wrong client. All 15 rows below were
// verified against a live read on 2026-09-01.
var PC_BACKFILL = [
  [446, 'Michael Fitzi',        'Michael Fitzi POWERCARE: 6083080'],
  [461, 'George Rohling',       'George Rohling POWERCARE: 6020784'],
  [464, 'Liuba Medina',         'Liuba Medina POWERCARE: 6200992'],
  [495, 'Dayami Pantoja',       'Dayami Pantoja POWERCARE: 6226749'],
  [506, 'Sylvia Fox',           'Sylvia Fox POWERCARE: 6083050'],
  [516, 'Osama Abuadieh',       'Osama Abuadieh POWERCARE: 6429730'],
  [537, 'Lee Duerr',            'Lee Duerr POWERCARE: 6517658'],
  [566, "Liliane Grand'Bois - [Enhanced Service] S440 (11)  Optimizer RMA",
                                "Liliane Grand'Bois POWERCARE: 6537090"],
  [616, 'Elijah Hopkins',       'Elijah Hopkins POWERCARE: 6871714'],
  [617, 'Pete Zittere',         'Pete Zittere POWERCARE: 6887843'],
  [629, 'Ernesto Velazquez',    'Ernesto Velazquez POWERCARE: 6866663'],
  [653, 'Charles Bingham POWERCARE', 'Charles Bingham POWERCARE: 7021729'],
  [654, 'Todd Farley POWERCARE',     'Todd Farley POWERCARE: 6995588'],
  // Claimed 2026-09-01 without a case number, because the CRM had none. The
  // numbers were in the source file all along: "Cases for Conexsol 8.31.26.xlsx".
  // Row 676's Name cell was overwritten by hand with the literal text "US-15689"
  // after it had been set to "CARLOS DIAZ POWERCARE", so accept either.
  [676, ['CARLOS DIAZ POWERCARE', 'US-15689'], 'CARLOS DIAZ POWERCARE: 7162665'],
  [677, 'Wilber Vega POWERCARE',  'Wilber Vega POWERCARE: 7099775']
];

var PC_NAME_COL = 3; // column C, "Name"

function pcSheet_() {
  var all = SpreadsheetApp.getActiveSpreadsheet().getSheets();
  for (var i = 0; i < all.length; i++) {
    // The tab's real name carries a trailing space; match on the trimmed value.
    if (all[i].getName().trim().toUpperCase() === 'MAIN LIST') return all[i];
  }
  throw new Error('MAIN LIST tab not found');
}

function pcRun_(write) {
  var sh = pcSheet_(), done = 0, skipped = 0, blocked = 0;
  for (var i = 0; i < PC_BACKFILL.length; i++) {
    var row = PC_BACKFILL[i][0], want = PC_BACKFILL[i][1], next = PC_BACKFILL[i][2];
    var accepted = (typeof want === 'string' ? [want] : want).map(function (w) { return w.trim(); });
    var cell = sh.getRange(row, PC_NAME_COL);
    var cur = String(cell.getValue()).trim();
    if (cur === next) { Logger.log('row %s already done', row); skipped++; continue; }
    if (accepted.indexOf(cur) === -1) {
      Logger.log('row %s BLOCKED, expected %s but found "%s"',
                 row, JSON.stringify(accepted), cur);
      blocked++; continue;
    }
    Logger.log('row %s: "%s" -> "%s"%s', row, cur, next, write ? '' : '  (dry run)');
    if (write) cell.setValue(next);
    done++;
  }
  Logger.log('--- %s: %s changed, %s already done, %s blocked',
             write ? 'WROTE' : 'DRY RUN', done, skipped, blocked);
}

function dryRunPowerCareBackfill() { pcRun_(false); }
function backfillPowerCareCases()  { pcRun_(true); }
