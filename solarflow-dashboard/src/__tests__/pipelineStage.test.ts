import { describe, it, expect } from 'vitest';
import { pipelineDropPatch } from '../lib/woHelpers';
import { PIPELINE_STAGES, PIPELINE_STAGE_LABEL } from '../types';

describe('pipelineDropPatch', () => {
  it('moves an unstaged order onto a stage', () => {
    expect(pipelineDropPatch({}, 'needs_scheduling')).toEqual({ pipelineStage: 'needs_scheduling' });
  });

  it('clears the stage when dropped on Unstaged', () => {
    expect(pipelineDropPatch({ pipelineStage: 'done' }, 'unstaged')).toEqual({ pipelineStage: undefined });
  });

  it('returns null for a no-op drop, so no needless write bumps updatedAt', () => {
    expect(pipelineDropPatch({ pipelineStage: 'done' }, 'done')).toBeNull();
    expect(pipelineDropPatch({}, 'unstaged')).toBeNull();
  });

  // The whole point of the orthogonal field: a Tryout drag must never mutate
  // execution state, which drives billing and contractor visibility.
  it('never emits status or woStatus', () => {
    for (const target of [...PIPELINE_STAGES, 'unstaged' as const]) {
      const patch = pipelineDropPatch({ pipelineStage: 'leads' }, target);
      if (patch) expect(Object.keys(patch)).toEqual(['pipelineStage']);
    }
  });

  it('every stage has a label', () => {
    for (const s of PIPELINE_STAGES) expect(PIPELINE_STAGE_LABEL[s]).toBeTruthy();
  });
});
