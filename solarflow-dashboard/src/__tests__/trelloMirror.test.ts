// The Trello <-> LL mirror (2026-08-31). Guards the three things that were
// actually wrong or newly risky:
//
//  1. The LOST TO COMPETITION list imports at all. It was created at position 0
//     of the board ~08-29, so Trello's "Add a card" default sent every new lead
//     there, matchTargetList found nothing, and 5 leads never reached LL.
//  2. Label set equality ignores the dash class. The board spells one label
//     with an EN DASH and LABEL_CATALOG spells it with a hyphen; compared raw,
//     each side reads the other as changed and the two mirrors ping-pong
//     forever. This is the check that proves the echo terminates.
//  3. The two label-name normalizers, server and client, stay identical. They
//     live in separate files by necessity (api/ cannot import from src/), which
//     is exactly the setup where one gets fixed and the other does not.
import { describe, it, expect } from 'vitest';
import { matchTargetList, stageForList, listForStage, trustedStage, sameLabelSet, labelKey, stampMirroredFields, parseLeadDesc, parseSiteId } from '../../../api/trello-card';
import { mergeJobFields } from '../lib/syncEngine';
import { labelKey as clientLabelKey, LABEL_CATALOG } from '../lib/labelCatalog';
import { trelloCardIdOf, cardPatchFor, boardColumns, type TrelloList } from '../lib/trelloSync';
import { PIPELINE_STAGES, type Job } from '../types';

const BOARD = '6a5a58e06fbf97144b5d96c9';
const LEADS = '6a5a58e06fbf97144b5d96be';
const LOST  = '6a921054f4c77bfac810188f';

describe('LOST TO COMPETITION is an import source', () => {
  it('imports a card created in it (the 5 leads that silently vanished)', () => {
    const m = matchTargetList({
      type: 'createCard',
      data: { card: { id: 'a'.repeat(24), name: 'Willie Williams' }, list: { id: LOST }, board: { id: BOARD } },
    });
    expect(m?.label).toBe('FL: LOST TO COMPETITION');
  });

  it('imports a card MOVED into it, and maps it to its own stage', () => {
    const m = matchTargetList({
      type: 'updateCard',
      data: { card: { id: 'a'.repeat(24), name: 'x' }, listAfter: { id: LOST }, board: { id: BOARD } },
    });
    expect(m).toBeDefined();
    expect(stageForList(LOST)).toBe('lost_to_competition');
    expect(stageForList(LEADS)).toBe('leads');
  });

  // REVERSED 2026-09-10 (user: "columns on Trello, new or renamed, need to
  // reflect the LL"). An unmapped list used to be ignored, and that silently
  // swallowed every card moved into or created in a new list, three times.
  it('gives a list nobody mapped its own column, keyed by id', () => {
    const newList = '6a9c0000000000000000beef';
    expect(stageForList(newList)).toBe(`list:${newList}`);
    expect(listForStage(`list:${newList}`)).toBe(newList);
    expect(stageForList(listForStage(`list:${newList}`))).toBe(`list:${newList}`);
  });

  it('imports a card created in ANY list on the board, labelled by the list name', () => {
    const m = matchTargetList({
      type: 'createCard',
      data: { card: { id: 'a'.repeat(24), name: 'x' }, list: { id: '6a9c0000000000000000beef', name: 'Scheduled/In Process' }, board: { id: BOARD } },
    });
    expect(m?.label).toBe('FL: Scheduled/In Process');
  });

  it('still refuses a list on a board we do not import from', () => {
    expect(matchTargetList({
      type: 'createCard',
      data: { card: { id: 'a'.repeat(24), name: 'x' }, list: { id: '0'.repeat(24) }, board: { id: 'f'.repeat(24) } },
    })).toBeUndefined();
  });

  it('never invents a stage from a non-id', () => {
    expect(stageForList('not-an-id')).toBeUndefined();
    expect(listForStage('list:nope')).toBeUndefined();
    expect(listForStage('made_up_stage')).toBeUndefined();
  });
});

describe('boardColumns: LL columns follow the Trello board', () => {
  const NEW = '6a9c0000000000000000beef';
  const lists: TrelloList[] = [
    { id: '6a5a58e06fbf97144b5d96be', name: 'Leads Services SolarEdge', closed: false, stage: 'leads' },
    { id: '6a5a58e06fbf97144b5d96c1', name: 'Done', closed: false, stage: 'done' },
    { id: NEW, name: 'Scheduled/In Process', closed: false, stage: `list:${NEW}` },
    { id: '6a921054f4c77bfac810188f', name: 'LOST TO COMPETITION', closed: true, stage: 'lost_to_competition' },
  ];

  it("uses Trello's order and Trello's names, so a rename shows up in LL", () => {
    const cols = boardColumns([{ ...lists[0], name: 'New Leads (renamed)' }, lists[1], lists[2]], []);
    expect(cols.map(c => c.title)).toEqual(['New Leads (renamed)', 'Done', 'Scheduled/In Process']);
    expect(cols[2].stage).toBe(`list:${NEW}`);
  });

  it('hides an archived Trello list only while it is empty in LL', () => {
    expect(boardColumns(lists, []).some(c => c.stage === 'lost_to_competition')).toBe(false);
    const withCard = boardColumns(lists, [{ pipelineStage: 'lost_to_competition' }]);
    expect(withCard.find(c => c.stage === 'lost_to_competition')?.closed).toBe(true);
  });

  it('puts an archived list after the working columns, even when Trello has it first', () => {
    const archivedFirst = [{ ...lists[3] }, lists[0], lists[1]];
    const cols = boardColumns(archivedFirst, [{ pipelineStage: 'lost_to_competition' }]);
    expect(cols.map(c => c.stage)).toEqual(['leads', 'done', 'lost_to_competition']);
  });

  it('NEVER hides a card: a stage with no column gets a trailing bucket', () => {
    const cols = boardColumns(lists, [{ pipelineStage: 'needs_follow_up' }]); // not on this board
    expect(cols[cols.length - 1]).toEqual({ stage: 'not_on_board', title: 'Not on the Trello board' });
    expect(boardColumns(lists, [{ pipelineStage: 'leads' }]).some(c => c.stage === 'not_on_board')).toBe(false);
  });

  it('falls back to the built-in columns before Trello has ever answered', () => {
    const cols = boardColumns(null, []);
    expect(cols.map(c => c.stage)).toEqual([...PIPELINE_STAGES]);
  });
});

describe("Anthony's New Lead card template parses", () => {
  // The description the Trello template carries, as Anthony fills it in. If the
  // template on the board is ever edited, its labels must stay ones
  // parseLeadDesc knows (LABEL_TO_FIELD) or the fields silently stop arriving.
  const filled = [
    'Phone: (863) 495-5963',
    'Email: jane@example.com',
    'Address: 10401 SW 53rd St',
    'City: Cooper City',
    'State: FL',
    'Zip: 33328',
    'Site ID: 3612595',
    'Notes: inverter showing error 18xB',
  ].join('\n');

  it('every contact line lands in its field', () => {
    expect(parseLeadDesc(filled)).toMatchObject({
      phone: '8634955963', email: 'jane@example.com', address: '10401 SW 53rd St',
      city: 'Cooper City', state: 'FL', zip: '33328', notes: 'inverter showing error 18xB',
    });
  });

  it('the Site ID line lands in the site id, and an EMPTY template line yields nothing', () => {
    expect(parseSiteId(filled)).toBe('3612595');
    const blank = 'Phone:\nEmail:\nSite ID:\n';
    expect(parseSiteId(blank)).toBeUndefined();
    expect(parseLeadDesc(blank)).toEqual({});
  });

  it('refuses an unlabelled or wrong-length number, which is a phone or case id', () => {
    expect(parseSiteId('call 3612595 tomorrow')).toBeUndefined();
    expect(parseSiteId('Site ID: 12345')).toBeUndefined();
    expect(parseSiteId('SolarEdge Site ID: 451846')).toBe('451846');
  });
});

describe('trustedStage: a payload list id is only believed when Trello agrees', () => {
  const unknown = '6a9c0000000000000000beef';
  it('trusts a known list outright', () => {
    expect(trustedStage(LEADS, 'anything')).toBe('leads');
  });
  it('trusts an unknown list only when the card is really in it', () => {
    expect(trustedStage(unknown, unknown)).toBe(`list:${unknown}`);
  });
  it('refuses an unknown list the card is NOT in (forged or stale payload)', () => {
    expect(trustedStage(unknown, LEADS)).toBeUndefined();
  });
});

describe('sameLabelSet stops the mirror echo', () => {
  const enDash  = [{ name: 'First Contact – Call Completed' }]; // as Trello spells it
  const hyphen  = [{ name: 'First Contact - Call Completed' }]; // as LABEL_CATALOG spells it

  it('treats the two dash spellings as the same label', () => {
    expect(sameLabelSet(enDash, hyphen)).toBe(true);
  });

  it('ignores order and duplicates, so a reorder in Trello is not a change', () => {
    expect(sameLabelSet(
      [{ name: 'Quote Sent' }, { name: 'Invoiced' }],
      [{ name: 'Invoiced' }, { name: 'Quote Sent' }],
    )).toBe(true);
  });

  it('still sees a real add and a real removal', () => {
    expect(sameLabelSet([{ name: 'Quote Sent' }], [{ name: 'Quote Sent' }, { name: 'Invoiced' }])).toBe(false);
    expect(sameLabelSet([{ name: 'Quote Sent' }], [])).toBe(false);
  });

  it('server and client normalizers agree on every catalog label', () => {
    for (const l of LABEL_CATALOG) expect(labelKey(l.name)).toBe(clientLabelKey(l.name));
  });
});

describe('trelloCardIdOf', () => {
  it('extracts the card id only from a Trello-imported job', () => {
    expect(trelloCardIdOf({ id: 'job-trello-6a95f5edabd9190e325da4f9' })).toBe('6a95f5edabd9190e325da4f9');
  });
  it('returns undefined for a job that was never a Trello card, so nothing is pushed', () => {
    expect(trelloCardIdOf({ id: 'job-1788191664892' })).toBeUndefined();
    expect(trelloCardIdOf({ id: 'job-trello-nothex' })).toBeUndefined();
  });
});

describe('a webhook-mirrored change survives the next browser merge', () => {
  // The live Zach Ross record, 2026-09-10: the office last dragged him in LL on
  // 08-28, then he was moved to Done in Trello on 09-08. The browser that synced
  // next still held needs_first_quote.
  const stale = {
    id: 'job-trello-' + 'a'.repeat(24),
    pipelineStage: 'needs_first_quote',
    labels: [{ name: 'First Contact - Call Completed', color: 'lime_dark' }],
    fieldTimes: { pipelineStage: '2026-08-28T22:55:34.161Z', labels: '2026-08-28T22:55:34.161Z' },
    updatedAt: '2026-09-08T20:00:00.000Z',
  } as unknown as Job;

  const webhookWrite = (stamp: boolean) => {
    const j = JSON.parse(JSON.stringify(stale));
    j.pipelineStage = 'done';
    j.labels = [{ name: 'Initial Call Required', color: 'red' }];
    if (stamp) stampMirroredFields(j, ['pipelineStage', 'labels'], '2026-09-08T22:55:40.000Z');
    else j.updatedAt = '2026-09-08T22:55:40.000Z'; // what the webhook did before the fix
    return j as Job;
  };

  it('REPRODUCES the bug: without the stamp the stale browser wins, in both merge orders', () => {
    // Pins the diagnosis, so a future refactor of mergeJobFields cannot make
    // the fix below pass for the wrong reason.
    expect(mergeJobFields(stale, webhookWrite(false)).pipelineStage).toBe('needs_first_quote');
    expect(mergeJobFields(webhookWrite(false), stale).pipelineStage).toBe('done');
  });

  it('with the stamp, the Trello move wins whichever side the merge treats as local', () => {
    for (const merged of [mergeJobFields(stale, webhookWrite(true)), mergeJobFields(webhookWrite(true), stale)]) {
      expect(merged.pipelineStage).toBe('done');
      expect(merged.labels?.map(l => l.name)).toEqual(['Initial Call Required']);
    }
  });

  it('stamps only the fields it is told changed, and leaves other edit times alone', () => {
    const j = { fieldTimes: { notes: '2026-01-01T00:00:00.000Z' } } as { fieldTimes?: Record<string, string>; updatedAt?: string };
    stampMirroredFields(j, ['pipelineStage'], 'T');
    expect(j.fieldTimes).toEqual({ notes: '2026-01-01T00:00:00.000Z', pipelineStage: 'T' });
    expect(j.updatedAt).toBe('T');
  });
});

describe('listForStage round-trips every LL column', () => {
  // The push is only "headless" if EVERY column the user can drag a card into
  // resolves to a Trello list. A stage with no list silently stops mirroring,
  // and the user finds out by noticing Trello is wrong days later.
  it('maps every PIPELINE_STAGES entry back to a list, and back again', () => {
    for (const stage of PIPELINE_STAGES) {
      const listId = listForStage(stage);
      expect(listId, `no Trello list for stage "${stage}"`).toBeDefined();
      expect(stageForList(listId)).toBe(stage);
    }
  });
});

describe('cardPatchFor: what a save actually pushes', () => {
  const base = { id: 'job-trello-' + 'a'.repeat(24), clientName: 'Willie Williams' } as Job;

  it('pushes nothing when the save touched nothing Trello represents', () => {
    // The common case by far: this runs on EVERY job save, and most saves are
    // costs, photos or scheduling, which have no card representation.
    expect(cardPatchFor(base, { ...base, laborHours: 4, scheduledDate: '2026-09-02' } as Job)).toBeUndefined();
  });

  it('pushes only the column on a kanban drag', () => {
    const next = { ...base, pipelineStage: 'needs_first_quote' } as Job;
    expect(cardPatchFor(base, next)).toEqual({ stage: 'needs_first_quote' });
  });

  it('pushes labels as a whole set, including emptying them', () => {
    const prev = { ...base, labels: [{ name: 'Quote Sent', color: 'purple' }] } as Job;
    expect(cardPatchFor(prev, { ...prev, labels: [] } as Job)).toEqual({ labels: [] });
  });

  it('ignores label reordering, which is not a change', () => {
    const l = [{ name: 'Quote Sent', color: 'purple' }, { name: 'Invoiced', color: 'green' }];
    const prev = { ...base, labels: l } as Job;
    expect(cardPatchFor(prev, { ...prev, labels: [...l].reverse() } as Job)).toBeUndefined();
  });

  it('sends clientName, never title, as the card name', () => {
    // title becomes "WO, <name>" once a lead is converted; pushing it would
    // rename Anthony's card to internal jargon.
    const next = { ...base, clientName: 'Willie J Williams', title: 'WO, Willie J Williams' } as Job;
    expect(cardPatchFor(base, next)).toEqual({ name: 'Willie J Williams' });
  });

  it('batches a drag plus a relabel into one patch, so Trello sees one event', () => {
    const next = { ...base, pipelineStage: 'done', labels: [{ name: 'Invoiced', color: 'green' }] } as Job;
    expect(cardPatchFor(base, next)).toEqual({
      stage: 'done',
      labels: [{ name: 'Invoiced', color: 'green' }],
    });
  });

  it('treats a first-ever save (no prev) as a full push, not a crash', () => {
    expect(cardPatchFor(undefined, { ...base, pipelineStage: 'leads' } as Job))
      .toEqual({ stage: 'leads', name: 'Willie Williams' });
  });
});
