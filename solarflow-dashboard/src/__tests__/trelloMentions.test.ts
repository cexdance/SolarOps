import { describe, it, expect } from 'vitest';
import { toTrelloMentions, fromTrelloMentions } from '../../../api/_trelloMentions';

describe('trello mention translation', () => {
  it('maps SolarOps handles to Trello handles', () => {
    expect(toTrelloMentions('@alopez please call, cc @dmatos')).toBe('@anthonylopez28 please call, cc @danielmatos71');
  });
  it('maps Trello handles back', () => {
    expect(fromTrelloMentions('@anthonylopez28 done. @danielmatos71 ok')).toBe('@alopez done. @dmatos ok');
  });
  it('leaves longer handles, emails and other people alone', () => {
    expect(toTrelloMentions('@alopez2 a@alopez.com @jsmith')).toBe('@alopez2 a@alopez.com @jsmith');
  });
  it('handles a mention at the start, mid-line and in different case', () => {
    expect(toTrelloMentions('@ALopez hi\n@dmatos')).toBe('@anthonylopez28 hi\n@danielmatos71');
  });
});
