/**
 * The Trello webhook's board guard.
 *
 * `verifyTrelloSignature` fails OPEN when TRELLO_API_SECRET is unset (deliberate:
 * failing closed would kill the lead pipeline on a deploy missing the var), and
 * it has been unset in production. `matchTargetList` reads the board id out of
 * `action.data.board.id`, which is just whatever the caller POSTed, and this
 * repo is PUBLIC so the real board and list ids are readable in the source.
 *
 * The attack that closed: create a card on your OWN board, POST a payload naming
 * our board and list but YOUR card id. The server fetches your card (our token
 * reads any public card) and imports its contents as a lead, notifying ~13
 * office users.
 *
 * isAllowedBoard() is checked against the idBoard TRELLO returns, not the
 * payload, so it holds even with the signature failing open.
 *
 * Note the import path: `../../../api/` is the repo-root tree, the one that
 * actually deploys.
 */
import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { isAllowedBoard, boardDecision, matchTargetList, verifyTrelloSignature } from '../../../api/trello-card';

// The real FL board/list, as they appear in TARGET_LISTS.
const BOARD = '6a5a58e06fbf97144b5d96c9';
const LIST  = '6a5a58e06fbf97144b5d96be';

describe('isAllowedBoard', () => {
  it('accepts a card Trello reports on the import board', () => {
    expect(isAllowedBoard(BOARD)).toBe(true);
  });

  it("rejects a card on somebody else's board", () => {
    expect(isAllowedBoard('1111111111111111111111aa')).toBe(false);
  });

  it('is strict about a missing idBoard', () => {
    expect(isAllowedBoard(undefined)).toBe(false);
    expect(isAllowedBoard('')).toBe(false);
  });
});

describe('boardDecision', () => {
  it('allows our board and rejects a foreign one', () => {
    expect(boardDecision(BOARD)).toBe('allow');
    expect(boardDecision('1111111111111111111111aa')).toBe('reject');
  });

  it("treats an ABSENT idBoard as unverified, not as a rejection", () => {
    // An attacker cannot cause this: the fetch is ours and asks for the field,
    // and every Trello card has a board. Absence means a bug, and rejecting on
    // a bug would 403 every real lead and take the pipeline down. It is allowed
    // through with a loud log instead.
    expect(boardDecision(undefined)).toBe('unverified');
    expect(boardDecision('')).toBe('unverified');
  });
});

describe('the payload alone cannot be trusted', () => {
  it('matchTargetList happily accepts a FORGED board/list, which is why the idBoard check exists', () => {
    // Exactly what an attacker sends: our board and list ids, their card.
    const forged = {
      type: 'createCard',
      data: {
        board: { id: BOARD },
        list:  { id: LIST },
        card:  { id: 'attacker-card-id' },
      },
    };
    // matchTargetList is satisfied. Nothing here proves the card is ours.
    expect(matchTargetList(forged as never)).toBeTruthy();
    // The authoritative check is what stops it, using Trello's own idBoard.
    expect(isAllowedBoard('attacker-board-id')).toBe(false);
  });
});

describe('verifyTrelloSignature', () => {
  it('fails OPEN with no secret (documented tradeoff, guarded by isAllowedBoard)', () => {
    expect(verifyTrelloSignature('{}', 'https://x/api/trello-card', undefined, '')).toBe(true);
  });

  it('rejects a missing signature header once a secret IS configured', () => {
    expect(verifyTrelloSignature('{}', 'https://x/api/trello-card', undefined, 's3cret')).toBe(false);
  });

  it('rejects a wrong signature once a secret IS configured', () => {
    const bad = Buffer.from('not-the-right-digest').toString('base64');
    expect(verifyTrelloSignature('{}', 'https://x/api/trello-card', bad, 's3cret')).toBe(false);
  });

  it('ACCEPTS a correctly signed body', () => {
    // Without this, a bug that made the HMAC always mismatch would pass every
    // test above while silently failing the webhook CLOSED and killing the lead
    // pipeline, which is the exact outcome the fail-open branch exists to avoid.
    const body = '{"action":{"type":"createCard"}}';
    const url  = 'https://x/api/trello-card';
    const good = createHmac('sha1', 's3cret').update(body + url).digest('base64');
    expect(verifyTrelloSignature(body, url, good, 's3cret')).toBe(true);
  });
});
