/**
 * CB-4: collapsing contractor jobs that share a sourceJobId.
 *
 * Why this has its own file. This is the ONE part of mergeContractorJobs that
 * does not survive splitting `solarflow_contractor_jobs` into per-record
 * `contractor_job:{id}` rows, because it is a CROSS-ROW operation: it collapses
 * two jobs with DIFFERENT ids that describe the same staff job. Per-record
 * upserts merge each key independently, so nothing would collapse them.
 *
 * Phase 1 of the contractor data boundary plan re-applies this at READ time over
 * the pulled rows. These tests pin the behaviour so the read-time path can be
 * proven identical to the blob path rather than assumed identical.
 *
 * Live state when this was written (2026-08-03): 127 contractor jobs, 127
 * distinct ids, zero duplicate sourceJobIds. The guard is not collapsing
 * anything today, which is exactly why it needs tests: there is no production
 * data that would reveal a regression.
 */
import { describe, it, expect } from 'vitest';
import { collapseBySourceJob, mergeContractorJobs, contractorJobRowKey } from '../lib/syncEngine';

type J = Parameters<typeof collapseBySourceJob>[0][number];

const job = (over: Partial<J> & { id: string }): J => ({
  assignedAt: '2026-07-01T00:00:00.000Z',
  ...over,
}) as J;

describe('collapseBySourceJob keeps one job per sourceJobId', () => {
  it('leaves jobs without a sourceJobId completely alone', () => {
    const out = collapseBySourceJob([job({ id: 'a' }), job({ id: 'b' })]);
    expect(out.map(j => j.id)).toEqual(['a', 'b']);
  });

  it('does not touch distinct sourceJobIds', () => {
    const out = collapseBySourceJob([
      job({ id: 'a', sourceJobId: 'job-1' }),
      job({ id: 'b', sourceJobId: 'job-2' }),
    ]);
    expect(out).toHaveLength(2);
  });

  it('collapses two DIFFERENT ids sharing a sourceJobId, newest winning', () => {
    // The double-assignment race: two contractor jobs created for one staff job.
    const out = collapseBySourceJob([
      job({ id: 'older', sourceJobId: 'job-1', updatedAt: '2026-07-01T00:00:00.000Z', status: 'assigned' }),
      job({ id: 'newer', sourceJobId: 'job-1', updatedAt: '2026-07-09T00:00:00.000Z', status: 'completed' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('newer');
    expect(out[0].status).toBe('completed');
  });

  it('unions photos across the collapsed pair, so no field upload is lost', () => {
    // The whole point of CB-3/CB-4: the loser's photos must survive even though
    // the winner's record is the one kept.
    const out = collapseBySourceJob([
      job({ id: 'a', sourceJobId: 'job-1', updatedAt: '2026-07-01T00:00:00.000Z', photos: { before: ['p1'] } }),
      job({ id: 'b', sourceJobId: 'job-1', updatedAt: '2026-07-09T00:00:00.000Z', photos: { after: ['p2'] } }),
    ]);
    expect(out).toHaveLength(1);
    const photos = out[0].photos as Record<string, string[]>;
    expect(photos.before).toContain('p1');
    expect(photos.after).toContain('p2');
  });

  it('holds the winner stable when order is reversed', () => {
    const pair = [
      job({ id: 'newer', sourceJobId: 'job-1', updatedAt: '2026-07-09T00:00:00.000Z' }),
      job({ id: 'older', sourceJobId: 'job-1', updatedAt: '2026-07-01T00:00:00.000Z' }),
    ];
    expect(collapseBySourceJob(pair)[0].id).toBe('newer');
    expect(collapseBySourceJob([...pair].reverse())[0].id).toBe('newer');
  });

  it('collapses three sharing one sourceJobId down to the newest', () => {
    const out = collapseBySourceJob([
      job({ id: 'a', sourceJobId: 'job-1', updatedAt: '2026-07-01T00:00:00.000Z' }),
      job({ id: 'b', sourceJobId: 'job-1', updatedAt: '2026-07-05T00:00:00.000Z' }),
      job({ id: 'c', sourceJobId: 'job-1', updatedAt: '2026-07-09T00:00:00.000Z' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('c');
  });

  it('is a no-op on the shape production actually holds today', () => {
    // 127 jobs, 127 distinct ids, all distinct sourceJobIds.
    const many = Array.from({ length: 20 }, (_, i) =>
      job({ id: `j${i}`, sourceJobId: `src-${i}` }));
    expect(collapseBySourceJob(many)).toHaveLength(20);
  });
});

describe('contractorJobRowKey makes the duplicate structurally impossible', () => {
  it('keys on sourceJobId, NOT the job id, so two devices converge on one row', () => {
    // The race: both devices mint a different cj-* id for the same staff job.
    // Keyed this way they write the same row and merge instead of duplicating.
    const a = contractorJobRowKey({ id: 'cj-1754000000000-aaaa', sourceJobId: 'job-7' });
    const b = contractorJobRowKey({ id: 'cj-1754000009999-zzzz', sourceJobId: 'job-7' });
    expect(a).toBe(b);
    expect(a).toBe('contractor_job:job-7');
  });

  it('keeps different staff jobs on different rows', () => {
    expect(contractorJobRowKey({ id: 'x', sourceJobId: 'job-1' }))
      .not.toBe(contractorJobRowKey({ id: 'y', sourceJobId: 'job-2' }));
  });

  it('falls back to the job id when there is no sourceJobId', () => {
    // ServiceOrderPanel.tsx:760 passes job?.id, which can be undefined. Those
    // were never CB-4 collapse candidates, so per-id rows are correct for them.
    expect(contractorJobRowKey({ id: 'cj-solo' })).toBe('contractor_job:cj-solo');
  });

  it('treats an empty-string sourceJobId as absent, not as a shared key', () => {
    // Guards the bug where '' would collapse every such job onto one row.
    expect(contractorJobRowKey({ id: 'cj-a', sourceJobId: '' })).toBe('contractor_job:cj-a');
    expect(contractorJobRowKey({ id: 'cj-b', sourceJobId: '' })).toBe('contractor_job:cj-b');
  });
});

describe('extracting it did not change mergeContractorJobs', () => {
  it('still collapses a cross-id duplicate through the full merge', () => {
    const merged = mergeContractorJobs(
      [job({ id: 'local', sourceJobId: 'job-1', updatedAt: '2026-07-01T00:00:00.000Z', photos: { before: ['p1'] } })],
      [job({ id: 'remote', sourceJobId: 'job-1', updatedAt: '2026-07-09T00:00:00.000Z', photos: { after: ['p2'] } })],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('remote');
    const photos = merged[0].photos as Record<string, string[]>;
    expect(photos.before).toContain('p1');
    expect(photos.after).toContain('p2');
  });

  it('still keeps one-sided jobs from both sides', () => {
    const merged = mergeContractorJobs(
      [job({ id: 'only-local', sourceJobId: 'job-1' })],
      [job({ id: 'only-remote', sourceJobId: 'job-2' })],
    );
    expect(merged.map(j => j.id).sort()).toEqual(['only-local', 'only-remote']);
  });
});
