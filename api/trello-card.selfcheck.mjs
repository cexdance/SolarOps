// Minimal runnable check for the pure logic in the Lead auto-import webhook
// branch of trello-card.ts (splitName, extractContact, matchTargetList).
// No Trello/Supabase calls, no framework.
//
// Run: npx tsc --target ES2020 --module commonjs --esModuleInterop --skipLibCheck \
//        --outDir /tmp/twcheck api/trello-card.ts && node api/trello-card.selfcheck.mjs
import assert from 'node:assert/strict';
import { splitName, extractContact, matchTargetList, isFilename } from '/tmp/twcheck/trello-card.js';

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
