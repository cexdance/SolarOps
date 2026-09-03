import { describe, it, expect } from 'vitest';
import { applyRmaCaseNumber } from '../lib/woHelpers';

const slot = 'rma-sitetransfer-job-2';
const entry = (id: string) => ({
  id,
  manufacturer: 'SolarEdge',
  partDescription: 'Site Transfer',
  rmaNumber: '',
  status: 'pending' as const,
  createdAt: '2026-09-03T00:00:00.000Z',
  createdBy: 'tester',
});

describe('applyRmaCaseNumber', () => {
  it('writes the case number onto the matching slot only', () => {
    const jobs = [
      { id: 'job-1', rmaEntries: [entry('rma-sitetransfer-job-1')] },
      { id: 'job-2', rmaEntries: [entry('other'), entry(slot)] },
    ];
    const hit = applyRmaCaseNumber(jobs, slot, '7203551');
    expect(hit?.jobId).toBe('job-2');
    expect(hit!.jobs[1].rmaEntries[1].rmaNumber).toBe('7203551');
    expect(hit!.jobs[1].rmaEntries[0].rmaNumber).toBe('');
    expect(hit!.jobs[0].rmaEntries[0].rmaNumber).toBe('');
  });

  it('does not mutate the input', () => {
    const jobs = [{ id: 'job-2', rmaEntries: [entry(slot)] }];
    applyRmaCaseNumber(jobs, slot, '7203551');
    expect(jobs[0].rmaEntries[0].rmaNumber).toBe('');
  });

  it('returns null when no job holds the slot, an unsaved order has nowhere to land', () => {
    expect(applyRmaCaseNumber([{ id: 'job-1', rmaEntries: [entry('nope')] }], slot, '7203551')).toBeNull();
  });

  it('survives jobs with no rmaEntries at all', () => {
    const jobs = [{ id: 'job-1' }, { id: 'job-2', rmaEntries: [entry(slot)] }];
    expect(applyRmaCaseNumber(jobs, slot, '7203551')?.jobId).toBe('job-2');
  });
});
