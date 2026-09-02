// Regression for the keystroke-comment glitch: the field app saves the service
// note on every keystroke, and the mirrored comment id was a hash of the note
// TEXT, so each prefix appended an entry of its own. SO-2608-07213 collected
// 116 comments spelling out one sentence.
import { describe, it, expect } from 'vitest';
import { mirrorContractorNote } from '../lib/woHelpers';

const run = (typed: string[]) =>
  typed.reduce<ReturnType<typeof mirrorContractorNote>>(
    (h, text, i) => mirrorContractorNote(h, 'job-1', text, 'IMPower Marketing LLC', `2026-08-19T00:0${i}:00.000Z`),
    [],
  );

describe('mirrorContractorNote', () => {
  it('collapses a whole typing run into ONE comment holding the final text', () => {
    const h = run(['I', 'In', 'Inv', 'Inverter connected to wifi.']);
    expect(h).toHaveLength(1);
    expect(h[0]?.description).toBe('Inverter connected to wifi.');
  });

  it('survives mid-text edits, which are not prefixes of each other', () => {
    const h = run(['Cambio de inversor xx', 'Cambio de inversor x', 'Cambio de inversor ok']);
    expect(h).toHaveLength(1);
    expect(h[0]?.description).toBe('Cambio de inversor ok');
  });

  it('uses one stable id per job, so the sync union cannot keep two copies', () => {
    expect(run(['a', 'ab'])[0]?.id).toBe('cnote-job-1');
  });

  it('leaves other entries alone and keeps the note newest-first on first write', () => {
    const prior = [{ id: 'staff-1', description: 'staff comment' }];
    const h = mirrorContractorNote(prior, 'job-1', 'field note', 'X');
    expect(h).toHaveLength(2);
    expect(h[0]?.id).toBe('cnote-job-1');
    expect(h[1]?.id).toBe('staff-1');
  });

  it('ignores an empty or whitespace-only note', () => {
    expect(mirrorContractorNote([], 'job-1', '   ', 'X')).toHaveLength(0);
  });
});
