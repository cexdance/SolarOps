/**
 * One-off registry correction, 2026-09-03.
 *
 * Two leads were converted twice (a double-click on "Move to Client"), so the
 * sheet held Grif Blackstone on two rows and Stephanie Deorta on two rows, and
 * every number below them was pushed one too far.
 *
 * BEFORE                       AFTER
 *   679  US-15693  Blackstone    679  US-15693  Grif Blackstone
 *   680  US-15694  Blackstone    680  US-15694  Stephanie Deorta
 *   681  US-15695  Deorta        681  US-15695  Bethany Powell
 *   682  US-15696  Deorta        682  US-15696  (blank)
 *   683  US-15697  Powell        683  US-15697  (blank)
 *   684  US-15698  Hicks         684  US-15698  (blank)
 *
 * Shunacee Hicks was NOT a client: she has been moved back to the `leads` stage
 * in SolarOps, so her number is released. The next "Move to Client" claims
 * US-15696.
 *
 * The SolarOps side is already done (direct Supabase repair). This is the sheet
 * half, and it exists as a function because the /exec web app refuses to write a
 * row that already holds a different name (it returns taken:true and changes
 * nothing), so it can never do a correction pass.
 *
 * HOW TO RUN
 *   1. Open the sheet > Extensions > Apps Script.
 *   2. Paste this file in as a new script file.
 *   3. Select `previewFix` in the function dropdown and Run. Read the log: it
 *      writes nothing and shows you exactly what would change.
 *   4. Only if the preview matches the table above, select `applyFix` and Run.
 *
 * Running a function needs NO new deployment. Do not redeploy the web app.
 */

var FIX_SHEET_ID = '169naSCBMVcWNU15Z-UUfKo-Ss48kPEC0AvBCPDjQcKY';
var FIX_TAB_NAME = 'MAIN LIST'; // matched trimmed: the real tab has a trailing space
var FIX_COL_ACCOUNT = 2; // B
var FIX_COL_NAME = 3;    // C

/** Target state, keyed by the US number so a shifted row cannot corrupt it. */
var FIX_TARGET = [
  { account: 'US-15693', name: 'Grif Blackstone' },
  { account: 'US-15694', name: 'Stephanie Deorta' },
  { account: 'US-15695', name: 'Bethany Powell' },
  { account: 'US-15696', name: '' },
  { account: 'US-15697', name: '' },
  { account: 'US-15698', name: '' }
];

/** What we expect to find before touching anything. Guards against a moved row. */
var FIX_EXPECTED = {
  'US-15693': 'Grif Blackstone',
  'US-15694': 'Grif Blackstone',
  'US-15695': 'Stephanie Deorta',
  'US-15696': 'Stephanie Deorta',
  'US-15697': 'Bethany Powell',
  'US-15698': 'Shunacee Hicks'
};

function fixSheet_() {
  var ss = SpreadsheetApp.openById(FIX_SHEET_ID);
  var all = ss.getSheets();
  for (var i = 0; i < all.length; i++) {
    if (String(all[i].getName()).trim() === FIX_TAB_NAME) return all[i];
  }
  throw new Error('Tab "' + FIX_TAB_NAME + '" not found.');
}

/** Row number (1-based) for each account in FIX_TARGET. */
function fixLocate_(sh) {
  var last = sh.getLastRow();
  var accounts = sh.getRange(1, FIX_COL_ACCOUNT, last, 1).getValues();
  var names = sh.getRange(1, FIX_COL_NAME, last, 1).getValues();
  var found = {};
  for (var r = 0; r < last; r++) {
    var a = String(accounts[r][0] == null ? '' : accounts[r][0]).trim().toUpperCase();
    if (a) found[a] = { row: r + 1, name: String(names[r][0] == null ? '' : names[r][0]).trim() };
  }
  return found;
}

/** Read-only. Logs what applyFix would do, and every mismatch. */
function previewFix() {
  var sh = fixSheet_();
  var found = fixLocate_(sh);
  var problems = [];
  var plan = [];

  for (var i = 0; i < FIX_TARGET.length; i++) {
    var t = FIX_TARGET[i];
    var hit = found[t.account];
    if (!hit) { problems.push(t.account + ' is not in the sheet at all.'); continue; }
    var expected = FIX_EXPECTED[t.account];
    if (hit.name !== expected) {
      problems.push(
        'row ' + hit.row + ' ' + t.account + ' holds "' + hit.name +
        '", expected "' + expected + '". The sheet has changed since this script was written.'
      );
    }
    if (hit.name !== t.name) {
      plan.push('row ' + hit.row + ' ' + t.account + ': "' + hit.name + '" -> "' + (t.name || '(blank)') + '"');
    }
  }

  Logger.log('PLAN (' + plan.length + ' cell writes):');
  for (var p = 0; p < plan.length; p++) Logger.log('  ' + plan[p]);
  if (problems.length) {
    Logger.log('');
    Logger.log('PROBLEMS (' + problems.length + '), applyFix will REFUSE to run:');
    for (var q = 0; q < problems.length; q++) Logger.log('  ' + problems[q]);
  } else {
    Logger.log('');
    Logger.log('No problems. Safe to run applyFix.');
  }
  return { plan: plan, problems: problems };
}

/**
 * Writes the correction. Refuses if the sheet does not still look like
 * FIX_EXPECTED, so a re-run (or a sheet someone edited meanwhile) cannot
 * scramble the numbering. Re-running after a successful pass is a no-op that
 * reports a mismatch, which is the safe direction to fail.
 */
function applyFix() {
  var sh = fixSheet_();
  var found = fixLocate_(sh);
  var problems = [];

  for (var i = 0; i < FIX_TARGET.length; i++) {
    var acct = FIX_TARGET[i].account;
    var hit = found[acct];
    if (!hit) { problems.push(acct + ' missing'); continue; }
    if (hit.name !== FIX_EXPECTED[acct]) {
      problems.push(acct + ' holds "' + hit.name + '", expected "' + FIX_EXPECTED[acct] + '"');
    }
  }
  if (problems.length) {
    throw new Error(
      'Refusing to write, the sheet is not in the expected before-state:\n  ' +
      problems.join('\n  ') + '\n\nRun previewFix and re-read.'
    );
  }

  var written = 0;
  for (var j = 0; j < FIX_TARGET.length; j++) {
    var t = FIX_TARGET[j];
    var row = found[t.account].row;
    sh.getRange(row, FIX_COL_NAME).setValue(t.name);
    written++;
  }
  SpreadsheetApp.flush();
  Logger.log('Wrote ' + written + ' name cells. US-15696 is now the next free number.');
  return written;
}
