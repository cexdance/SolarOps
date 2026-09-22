/**
 * SolarOps, Xero quote acceptance forwarder (Google Apps Script)
 *
 * Xero sends no webhook for quotes, so the acceptance email is the signal.
 * This runs on the mailbox that receives those emails, and posts the SUBJECT
 * LINE ONLY to SolarOps, which moves the matching order from Quote Sent to
 * Approved. No message body, no attachments, no customer email addresses leave
 * the mailbox.
 *
 * Setup (about 5 minutes, once):
 *  1. In Gmail, make a filter: from `post.xero.com`, subject `has accepted quote`
 *     -> Apply label `Xero/Accepted`. (Skip the inbox if you like, the label is
 *     what this script reads.)
 *  2. Go to script.google.com, New project, paste this file in.
 *  3. Project Settings, Script Properties, add:
 *       SOLAROPS_SECRET = the same value set as XERO_MAIL_SECRET in Vercel
 *  4. Run `forwardAcceptedQuotes` once by hand and approve the permissions
 *     prompt (Gmail read + modify label, external request).
 *  5. Triggers, Add Trigger: forwardAcceptedQuotes, time-driven, every 5 minutes.
 *
 * A processed thread gets the label `Xero/Sent to SolarOps`, so nothing is ever
 * posted twice even if the script runs again or the label is re-applied.
 */

var ENDPOINT = 'https://solarflow-dashboard-sooty.vercel.app/api/notify';
var SOURCE_LABEL = 'Xero/Accepted';
var DONE_LABEL = 'Xero/Sent to SolarOps';

function forwardAcceptedQuotes() {
  var secret = PropertiesService.getScriptProperties().getProperty('SOLAROPS_SECRET');
  if (!secret) throw new Error('Set SOLAROPS_SECRET in Script Properties first.');

  var source = GmailApp.getUserLabelByName(SOURCE_LABEL);
  if (!source) throw new Error('Create the Gmail label ' + SOURCE_LABEL + ' and a filter that applies it.');
  var done = GmailApp.getUserLabelByName(DONE_LABEL) || GmailApp.createLabel(DONE_LABEL);

  // search() rather than source.getThreads(): the -label term is what keeps an
  // already-posted thread out, which is the whole idempotency story here.
  var threads = GmailApp.search('label:"' + SOURCE_LABEL + '" -label:"' + DONE_LABEL + '"', 0, 25);

  threads.forEach(function (thread) {
    var messages = thread.getMessages();
    var subject = messages[messages.length - 1].getSubject();

    var res = UrlFetchApp.fetch(ENDPOINT, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + secret },
      payload: JSON.stringify({ action: 'xero-quote-accepted', subject: subject }),
      muteHttpExceptions: true,
    });

    var code = res.getResponseCode();
    // 2xx: moved, or a no-op SolarOps already understood (re-sent email, order
    // past that stage). 400/404: nothing here matches an order, and retrying the
    // same subject forever will not change that. Both are done.
    // 401/5xx: our problem, leave the thread unlabelled so the next run retries.
    if (code < 300 || code === 400 || code === 404) {
      thread.addLabel(done);
      console.log(code + ' ' + subject + ' -> ' + res.getContentText());
    } else {
      console.error('retrying later: ' + code + ' ' + subject + ' -> ' + res.getContentText());
    }
  });
}
