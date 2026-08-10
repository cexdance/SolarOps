import { describe, it, expect } from 'vitest';
import { labelChipClass } from '../lib/trelloLabels';
import { PIPELINE_STAGES, PIPELINE_STAGE_LABEL } from '../types';

// The exact colour keys the live "Conexsol Florida Services" board uses.
const BOARD_COLORS = [
  'lime_dark', 'orange_dark', 'yellow', 'blue', 'purple_dark', 'purple', '',
  'lime_light', 'blue_dark', 'green', 'red', 'orange', 'yellow_dark', 'sky',
  'red_dark', 'red_light', 'pink_dark',
];

describe('labelChipClass', () => {
  it('returns a full static Tailwind chip class for every board colour', () => {
    for (const c of BOARD_COLORS) {
      const cls = labelChipClass(c);
      // Full literal classes only (Tailwind purges constructed ones).
      expect(cls).toMatch(/^bg-[a-z]+-100 text-[a-z]+-(700|800) border-[a-z]+-300$/);
    }
  });

  it('folds _dark/_light shades onto the base family', () => {
    expect(labelChipClass('red_dark')).toBe(labelChipClass('red'));
    expect(labelChipClass('lime_light')).toBe(labelChipClass('lime_dark'));
  });

  it('falls back to slate for empty, null, or unknown colours', () => {
    const slate = labelChipClass('slate');
    expect(labelChipClass('')).toBe(slate);
    expect(labelChipClass(null)).toBe(slate);
    expect(labelChipClass('black')).toBe(slate);
    expect(labelChipClass('chartreuse')).toBe(slate);
  });
});

describe('pipeline stages mirror the Trello board', () => {
  it('includes the two columns added to match Trello', () => {
    expect(PIPELINE_STAGES).toContain('needs_follow_up');
    expect(PIPELINE_STAGES).toContain('work_done_collect');
  });
  it('labels the new stages exactly as the Trello lists read', () => {
    expect(PIPELINE_STAGE_LABEL.needs_follow_up).toBe('Needs follow-Up Service');
    expect(PIPELINE_STAGE_LABEL.work_done_collect).toBe('Work Done - Collect Payment');
  });
  it('every stage has a non-empty label', () => {
    for (const s of PIPELINE_STAGES) expect(PIPELINE_STAGE_LABEL[s]).toBeTruthy();
  });
});
