// Minimal runnable check for the pure logic in the Lead auto-import webhook
// branch of trello-card.ts (splitName, extractContact, matchTargetList).
// No Trello/Supabase calls, no framework.
//
// Run: npx tsc --target ES2020 --module commonjs --esModuleInterop --skipLibCheck \
//        --outDir /tmp/twcheck api/trello-card.ts && node scripts/trello-card.selfcheck.mjs
//
// Lives in scripts/, NOT api/. Moved 2026-08-04: Vercel treats every non-underscore
// file in api/ as a deployable function, so this dev-only script was being shipped.
// It answered HTTP 500 in production (it imports from /tmp/twcheck, which exists
// only on a dev machine) and, worse, consumed one of the 12 function slots the
// Hobby plan allows. The repo was sitting exactly at that cap, so the next
// endpoint anyone added would have failed the deploy.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { splitName, extractContact, matchTargetList, isFilename, parseLeadDesc, displayNameFor, verifyTrelloSignature, toJobLabels, stageForList } from '/tmp/twcheck/trello-card.js';

// Trello label -> Job.labels. Must match what LabelPicker writes in-app, since
// both render through labelChipClass (raw Trello colour key, name required).
assert.deepEqual(
  toJobLabels([{ name: 'Quote Approved', color: 'purple_dark' }, { name: 'Invoiced', color: 'green' }]),
  [{ name: 'Quote Approved', color: 'purple_dark' }, { name: 'Invoiced', color: 'green' }],
);
// Colour-only labels would render as blank chips on the card, so they are dropped.
assert.deepEqual(
  toJobLabels([{ name: '', color: 'red' }, { name: '   ' }, { name: 'Needs Scheduling', color: 'red_light' }]),
  [{ name: 'Needs Scheduling', color: 'red_light' }],
);
// The live board really does carry a null-coloured label ("Completed/Did not proceed.").
assert.deepEqual(toJobLabels([{ name: 'Completed/Did not proceed.' }]), [{ name: 'Completed/Did not proceed.', color: '' }]);
assert.deepEqual(toJobLabels(undefined), []);

// stageForList is used ONLY on the create path now (which intake list a new lead
// arrives in). Trello no longer drives the column after that: the app owns
// pipelineStage, see INTAKE_STAGE in trello-card.ts.
// List -> stage. The two that a positional map gets WRONG: Trello orders
// "Work Done - Collect Payment" (index 7) before "Needs follow-Up Service"
// (index 8), while PIPELINE_STAGES has needs_follow_up first. Mapping by index
// silently swaps these two columns, which is why the map is keyed by list id.
assert.equal(stageForList('6a6b74b3042230eaca73f224'), 'work_done_collect');
assert.equal(stageForList('6a79fe57cd90d79ec1c71526'), 'needs_follow_up');
assert.equal(stageForList('6a5a58e06fbf97144b5d96be'), 'leads');
assert.equal(stageForList('6a5a58e06fbf97144b5d96c6'), 'email_follow_up');
assert.equal(stageForList('6a5a58e06fbf97144b5d96c8'), 'closed_archived');
// An unknown/untracked list must yield undefined, so the caller leaves the
// stage alone rather than dumping the card into a wrong column.
assert.equal(stageForList('not-a-real-list'), undefined);
assert.equal(stageForList(undefined), undefined);

// Webhook signature: base64(HMAC-SHA1(rawBody + callbackURL, secret)).
const BODY = '{"action":{"type":"createCard"}}';
const CB = 'https://solarflow-dashboard-sooty.vercel.app/api/trello-card';
const SECRET = 'test-secret';
const sign = (body, cb) => createHmac('sha1', SECRET).update(body + cb).digest('base64');

assert.equal(verifyTrelloSignature(BODY, CB, sign(BODY, CB), SECRET), true);
// A tampered body, a wrong callback URL, or a missing header must all fail.
assert.equal(verifyTrelloSignature('{"action":{"type":"deleteCard"}}', CB, sign(BODY, CB), SECRET), false);
assert.equal(verifyTrelloSignature(BODY, 'https://evil.example.com/api/trello-card', sign(BODY, CB), SECRET), false);
assert.equal(verifyTrelloSignature(BODY, CB, undefined, SECRET), false);
assert.equal(verifyTrelloSignature(BODY, CB, sign(BODY, CB), 'wrong-secret'), false);
// A short/garbage header must be rejected, not crash timingSafeEqual on length.
assert.equal(verifyTrelloSignature(BODY, CB, 'AAAA', SECRET), false);
// Opt-in: no secret configured means verification is skipped, pipeline keeps running.
assert.equal(verifyTrelloSignature(BODY, CB, undefined, ''), true);

// The SolarEdge lead email body, as Trello stores it in card.desc. This arrives a
// beat AFTER createCard fires, which is why the backfill path re-reads it.
const DESC = `Hello  team! You've received a new solar lead!


First Name: Gil
Last Name: Hyatt
Email: gil4@gilhyatt.com
Phone: 9546050226

Address:
City:
State:
Zip Code: 33060

notes: Repair existing system currently not working
`;
const d = parseLeadDesc(DESC);
assert.equal(d.firstName, 'Gil');
assert.equal(d.lastName, 'Hyatt');
assert.equal(d.email, 'gil4@gilhyatt.com');
assert.equal(d.phone, '9546050226');
assert.equal(d.zip, '33060');
assert.equal(d.address, undefined);            // blank labels must not become ""-shaped truthy junk
assert.equal(parseLeadDesc('').firstName, undefined);
assert.equal(parseLeadDesc('Phone: +1 (954) 605-0226').phone, '9546050226');
assert.equal(parseLeadDesc('Phone: 12345').phone, undefined); // not a real number, drop it

// A nameless lead must never display as "image.jpeg"; phone is the fallback.
assert.equal(displayNameFor({ firstName: 'Gil', lastName: 'Hyatt', phone: '9546050226' }), 'Gil Hyatt');
assert.equal(displayNameFor({ firstName: '', lastName: '', phone: '9546050226' }), '(954) 605-0226');
assert.equal(displayNameFor({ firstName: '', lastName: '', phone: '' }), 'New Lead (Trello)');

// Filename card names (the "image.jpeg" bug) must be recognised, real names must not.
assert.equal(isFilename('image.jpeg'), true);
assert.equal(isFilename('IMG_2039.PNG'), true);
assert.equal(isFilename('scan.pdf'), true);
assert.equal(isFilename('Alisa Schlueter'), false);
assert.equal(isFilename('David'), false);

assert.deepEqual(splitName('Alisa Schlueter'), { firstName: 'Alisa', lastName: 'Schlueter' });
assert.deepEqual(splitName('David'), { firstName: 'David', lastName: '' });
assert.deepEqual(splitName('Maria De La Cruz'), { firstName: 'Maria', lastName: 'De La Cruz' });

assert.deepEqual(extractContact('Call me at (305) 878-6934 or a@b.com'), { phone: '3058786934', email: 'a@b.com' });
assert.deepEqual(extractContact('no contact info here'), { phone: '', email: '' });
assert.deepEqual(extractContact('11-digit 13058786934 works too'), { phone: '3058786934', email: '' });

const TARGET = { type: 'a', data: { board: { id: '6a5a58e06fbf97144b5d96c9' }, card: { id: 'c1', name: 'x' } } };
assert.deepEqual(
  matchTargetList({ ...TARGET, type: 'createCard', data: { ...TARGET.data, list: { id: '6a5a58e06fbf97144b5d96be' } } }),
  { boardId: '6a5a58e06fbf97144b5d96c9', listId: '6a5a58e06fbf97144b5d96be', label: 'FL: Leads Services SolarEdge' },
);
assert.equal(
  matchTargetList({ ...TARGET, type: 'updateCard', data: { ...TARGET.data, listAfter: { id: '6a5a58e06fbf97144b5d96be' } } })?.listId,
  '6a5a58e06fbf97144b5d96be',
);
// A card edited in place (desc change, label change) has no listAfter, must NOT match.
assert.equal(matchTargetList({ ...TARGET, type: 'updateCard', data: { ...TARGET.data } }), undefined);
// Wrong list on the right board must NOT match.
assert.equal(
  matchTargetList({ ...TARGET, type: 'createCard', data: { ...TARGET.data, list: { id: 'someOtherList' } } }),
  undefined,
);
// commentCard (or any other action type) must NOT match, even with a card present.
assert.equal(matchTargetList({ ...TARGET, type: 'commentCard' }), undefined);

console.log('trello-webhook self-check: all assertions passed');
