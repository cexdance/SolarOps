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
import { matchTargetList, stageForList, listForStage, sameLabelSet, labelKey } from '../../../api/trello-card';
import { labelKey as clientLabelKey, LABEL_CATALOG } from '../lib/labelCatalog';
import { trelloCardIdOf, cardPatchFor } from '../lib/trelloSync';
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

  it('still ignores a list nobody mapped, rather than defaulting it somewhere', () => {
    expect(stageForList('0'.repeat(24))).toBeUndefined();
    expect(matchTargetList({
      type: 'updateCard',
      data: { card: { id: 'a'.repeat(24), name: 'x' }, listAfter: { id: '0'.repeat(24) }, board: { id: BOARD } },
    })).toBeUndefined();
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
