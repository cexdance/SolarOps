import { describe, it, expect } from 'vitest';
import { findDuplicateCard } from '../../../api/trello-card';

describe('findDuplicateCard', () => {
  const cards = [{ name: 'US-15707 Martin Palmer' }, { name: 'Jane Roe' }];
  it('matches on client number regardless of name spelling', () => {
    expect(findDuplicateCard('US-15707 Martin  Palmer', cards)).toBe(cards[0]);
    expect(findDuplicateCard('us-15707 M. Palmer', cards)).toBe(cards[0]);
  });
  it('falls back to the name when there is no number', () => {
    expect(findDuplicateCard('jane roe', cards)).toBe(cards[1]);
  });
  it('does not match a different client', () => {
    expect(findDuplicateCard('US-15708 Martin Palmer', cards)).toBeUndefined();
  });
});
