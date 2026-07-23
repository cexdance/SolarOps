import { describe, it, expect } from 'vitest';
import { toContractorJobView } from '../lib/woHelpers';
import type { Job } from '../types';
import type { ContractorJob } from '../types/contractor';

const job = (over: Record<string, unknown> = {}) => ({
  id: 'j1', status: 'in_progress', ...over,
}) as unknown as Job;

const cj = (over: Record<string, unknown> = {}) => ({
  id: 'cj1', status: 'in_progress', photos: {}, ...over,
}) as unknown as ContractorJob;

// Regression guard: the admin mirror write (setData -> saveData) can fail to
// persist on a contractor's phone when localStorage is full, while the
// contractor's own saveContractorJobs write succeeds. A reload then re-hydrates
// the stale admin job, and toContractorJobView must not let that regress a
// completion the contractor already saved.
describe('toContractorJobView status', () => {
  it('keeps the contractor-completed status when the admin mirror is stale', () => {
    const view = toContractorJobView(job({ status: 'in_progress' }), cj({ status: 'completed' }));
    expect(view.status).toBe('completed');
  });

  it('adopts the admin status once it catches up (no existingCj lag)', () => {
    const view = toContractorJobView(job({ status: 'completed' }), cj({ status: 'completed' }));
    expect(view.status).toBe('completed');
  });

  it('still prefers admin status when it is further along than the contractor copy', () => {
    const view = toContractorJobView(job({ status: 'invoiced' }), cj({ status: 'completed' }));
    expect(view.status).toBe('invoiced');
  });

  it('on_hold always overrides regardless of pipeline stage', () => {
    const view = toContractorJobView(job({ status: 'in_progress', onHold: true }), cj({ status: 'completed' }));
    expect(view.status).toBe('on_hold');
  });
});
