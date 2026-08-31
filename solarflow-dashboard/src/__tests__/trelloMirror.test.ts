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
import { matchTargetList, stageForList, sameLabelSet, labelKey } from '../../../api/trello-card';
import { labelKey as clientLabelKey, LABEL_CATALOG } from '../lib/labelCatalog';
import { trelloCardIdOf } from '../lib/trelloLabelSync';

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
