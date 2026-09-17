import { describe, it, expect } from 'vitest';
import { llColumnJobs } from '../lib/trelloSync';

const stages = new Set(['needs_first_quote', 'done', 'not_on_board']);
const jobs = [
  { id: 'palmer', pipelineStage: 'needs_first_quote', status: 'completed' },
  { id: 'open', pipelineStage: 'needs_first_quote', status: 'in_progress' },
  { id: 'stray', pipelineStage: 'list:aaaaaaaaaaaaaaaaaaaaaaaa', status: 'completed' },
  { id: 'lost', pipelineStage: 'list:bbbbbbbbbbbbbbbbbbbbbbbb', status: 'new' },
] as const;

const ids = (stage: string, s = stages) =>
  llColumnJobs(stage, jobs as never[], s).map((j: { id: string }) => j.id);

describe('llColumnJobs', () => {
  it('a completed job shows in Done only, never also in its stage column', () => {
    expect(ids('done')).toEqual(['palmer', 'stray']);
    expect(ids('needs_first_quote')).toEqual(['open']);
    expect(ids('not_on_board')).toEqual(['lost']);
  });

  it('every card lands in exactly one column', () => {
    const all = [...stages].flatMap(s => ids(s)).sort();
    expect(all).toEqual(['lost', 'open', 'palmer', 'stray']);
  });

  it('with no Done column a completed job stays in its own stage (never hidden)', () => {
    const noDone = new Set(['needs_first_quote', 'not_on_board']);
    expect(ids('needs_first_quote', noDone)).toEqual(['palmer', 'open']);
  });
});
