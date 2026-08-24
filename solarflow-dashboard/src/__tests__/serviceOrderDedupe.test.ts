import { describe, it, expect } from 'vitest';
import { findJobByWoNumber } from '../lib/woHelpers';

// A service order that was still unsaved used to get a FRESH number at every
// autosave, so one order landed on the board as three cards. The panel now
// freezes its number and App.handleCreateJob upserts on it.
describe('findJobByWoNumber', () => {
  const jobs = [
    { id: 'a', woNumber: 'SO-2608-58258' },
    { id: 'b', woNumber: 'SO-2608-79149' },
    { id: 'c' },
    { id: 'd', woNumber: '' },
  ];

  it('matches an existing order number', () => {
    expect(findJobByWoNumber(jobs, 'SO-2608-79149')?.id).toBe('b');
  });

  it('never matches on a missing or blank number', () => {
    expect(findJobByWoNumber(jobs, undefined)).toBeUndefined();
    expect(findJobByWoNumber(jobs, '')).toBeUndefined();
  });

  it('returns undefined for an unknown number, so it still creates', () => {
    expect(findJobByWoNumber(jobs, 'SO-2608-00000')).toBeUndefined();
  });
});
