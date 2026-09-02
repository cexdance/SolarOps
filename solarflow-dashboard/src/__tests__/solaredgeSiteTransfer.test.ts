/**
 * Checks on the two pure helpers in scripts/solaredge-site-transfer.mjs.
 * The serial split is the risky one: SolarEdge marks serial_hex required, so
 * putting the wrong group in that box fails the submission.
 */
import { describe, it, expect } from 'vitest';
// @ts-expect-error plain .mjs script, no types
import { splitSerial, findCaseNumber } from '../../scripts/solaredge-site-transfer.mjs';

describe('splitSerial', () => {
  // Real serials copied out of the live RMA tracker.
  it('maps the three dash groups onto datecode / hex / checksum', () => {
    expect(splitSerial('SV0521-0730B8B06-0F')).toEqual({ datecode: 'SV0521', hex: '0730B8B06', checksum: '0F' });
    expect(splitSerial('SJ3620-074003FA2-55')).toEqual({ datecode: 'SJ3620', hex: '074003FA2', checksum: '55' });
    expect(splitSerial('ST0121-073044B49-0B')).toEqual({ datecode: 'ST0121', hex: '073044B49', checksum: '0B' });
  });

  it('puts a two-group serial in hex + checksum, never in datecode', () => {
    expect(splitSerial('BF10B459-DC')).toEqual({ datecode: '', hex: 'BF10B459', checksum: 'DC' });
  });

  it('normalises case and whitespace', () => {
    expect(splitSerial('  sv0521-0730b8b06-0f ')).toEqual({ datecode: 'SV0521', hex: '0730B8B06', checksum: '0F' });
  });

  it('puts a bare serial in the required box', () => {
    expect(splitSerial('7162665').hex).toBe('7162665');
  });

  it('does not throw on empty input', () => {
    expect(splitSerial('')).toEqual({ datecode: '', hex: '', checksum: '' });
  });
});

describe('findCaseNumber', () => {
  it('reads the number out of a sentence', () => {
    expect(findCaseNumber('Thank you. Your case number is CS-4821907.')).toBe('CS-4821907');
  });

  it('reads the terse form', () => {
    expect(findCaseNumber('Case #: 7162665')).toBe('7162665');
  });

  it('returns null rather than guessing when nothing matches', () => {
    expect(findCaseNumber('Thank you for your submission.')).toBeNull();
  });
});
