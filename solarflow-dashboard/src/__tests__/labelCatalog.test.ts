import { describe, it, expect } from 'vitest';
import { LABEL_CATALOG, labelKey, hasLabel, toggleLabel } from '../lib/labelCatalog';
import { labelChipClass } from '../lib/trelloLabels';

describe('LABEL_CATALOG', () => {
  it('every catalog label renders to a valid chip class', () => {
    for (const l of LABEL_CATALOG) {
      expect(labelChipClass(l.color)).toMatch(/^bg-[a-z]+-100 /);
    }
  });
  it('has no duplicate names', () => {
    const keys = LABEL_CATALOG.map(l => labelKey(l.name));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('labelKey (matching)', () => {
  it('treats an imported en-dash label as the same as the hyphen catalog entry', () => {
    expect(labelKey('First Contact – Call Completed')).toBe(labelKey('First Contact - Call Completed'));
  });
  it('is case and whitespace insensitive', () => {
    expect(labelKey('  QUOTE   sent ')).toBe(labelKey('Quote Sent'));
  });
});

describe('hasLabel / toggleLabel', () => {
  const QA = { name: 'Quote Approved', color: 'purple_dark' };
  it('detects an en-dash imported label as already selected', () => {
    const cur = [{ name: 'First Contact – Call Completed', color: 'lime_dark' }];
    expect(hasLabel(cur, 'First Contact - Call Completed')).toBe(true);
  });
  it('adds a label when absent', () => {
    const next = toggleLabel([], QA);
    expect(next.map(l => l.name)).toEqual(['Quote Approved']);
  });
  it('removes a label when present, matching across dash variants', () => {
    const cur = [{ name: 'First Contact – Call Completed', color: 'lime_dark' }];
    const next = toggleLabel(cur, { name: 'First Contact - Call Completed', color: 'lime_dark' });
    expect(next).toEqual([]);
  });
  it('does not duplicate an already-present label', () => {
    const next = toggleLabel([QA], { name: 'quote approved', color: 'purple_dark' });
    expect(next).toEqual([]); // toggled off, not duplicated
  });
});
