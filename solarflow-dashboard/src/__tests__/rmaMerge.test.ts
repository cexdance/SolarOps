import { describe, it, expect } from 'vitest';
import { mergeRmaEntries } from '../lib/woHelpers';

const e = (id: string, over: Record<string, unknown> = {}) => ({
  id, manufacturer: 'SolarEdge', partDescription: '', rmaNumber: '',
  status: 'pending' as const, createdAt: '2026-07-01T00:00:00.000Z', createdBy: 'u', ...over,
});

describe('mergeRmaEntries', () => {
  // The reason this is a union and not an assignment: the contractor's copy of a
  // job only carries what the field app knows. Replacing would delete the RMAs
  // the office filed, and vice versa.
  it('keeps entries present on only one side', () => {
    const merged = mergeRmaEntries([e('office')], [e('field')]);
    expect(merged!.map(x => x.id).sort()).toEqual(['field', 'office']);
  });

  it('newest updatedAt wins for the same entry', () => {
    const merged = mergeRmaEntries(
      [e('a', { caseNumber: 'OLD', updatedAt: '2026-07-01T00:00:00.000Z' })],
      [e('a', { caseNumber: 'NEW', updatedAt: '2026-07-02T00:00:00.000Z' })],
    );
    expect(merged!).toHaveLength(1);
    expect(merged![0].caseNumber).toBe('NEW');
  });

  it('an unstamped legacy entry never beats a stamped edit', () => {
    const merged = mergeRmaEntries(
      [e('a', { caseNumber: 'STAMPED', updatedAt: '2026-07-02T00:00:00.000Z' })],
      [e('a', { caseNumber: 'LEGACY' })],
    );
    expect(merged![0].caseNumber).toBe('STAMPED');
  });

  it('handles empty and undefined sides without inventing an array', () => {
    expect(mergeRmaEntries(undefined, undefined)).toBeUndefined();
    expect(mergeRmaEntries([e('a')], undefined)!.map(x => x.id)).toEqual(['a']);
    expect(mergeRmaEntries(undefined, [e('b')])!.map(x => x.id)).toEqual(['b']);
  });
});
