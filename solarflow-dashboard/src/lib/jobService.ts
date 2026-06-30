/**
 * Service Order Service, Job archiving and lifecycle management
 */

import { Job } from '../types';

/**
 * Stamp per-field edit times for field-level sync merge (Phase 1).
 *
 * Compares `next` against `prev` and records `fieldTimes[field] = now` for every
 * top-level field whose value changed (deep-compared by JSON). Also bumps the
 * record-level `updatedAt`. Records without `fieldTimes` fall back to record-level
 * LWW at merge time, so this is purely additive and changes NO behavior on its own
 * (the merge does not consult fieldTimes until Phase 2). See spec_job_field_level_merge.
 *
 * `prev` is the job as it existed before this edit (undefined for a brand-new job,
 * which stamps every field at `now`).
 */
export function stampJobFields(prev: Job | undefined, next: Job): Job {
  const now = new Date().toISOString();
  const fieldTimes: Record<string, string> = { ...(prev?.fieldTimes ?? {}) };
  const keys = new Set<string>([
    ...Object.keys(prev ?? {}),
    ...Object.keys(next),
  ]);
  for (const k of keys) {
    if (k === 'fieldTimes' || k === 'updatedAt') continue;
    const a = (prev as unknown as Record<string, unknown> | undefined)?.[k];
    const b = (next as unknown as Record<string, unknown>)[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) fieldTimes[k] = now;
  }
  return { ...next, fieldTimes, updatedAt: now };
}

/**
 * Auto-archive completed service orders older than 30 days.
 * Only archives jobs with status 'paid' (fully completed).
 * Returns updated jobs array if any were archived, otherwise original array.
 */
export function autoArchiveCompletedJobs(jobs: Job[]): Job[] {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  let hasChanges = false;
  const updated = jobs.map(job => {
    // Auto-archive paid (fully completed) jobs >30 days old
    if (
      job.status === 'paid' && // ← Fully completed & paid
      job.completedAt && // ← Has completion timestamp
      new Date(job.completedAt) < thirtyDaysAgo
    ) {
      hasChanges = true;
      return {
        ...job,
        status: 'archived' as const,
        archivedAt: new Date().toISOString(),
      };
    }
    return job;
  });

  return hasChanges ? updated : jobs;
}

/**
 * Check if a job is archived.
 */
export function isJobArchived(job: Job): boolean {
  return job.status === 'archived';
}

/**
 * Manually archive a service order.
 */
export function archiveJob(job: Job): Job {
  return {
    ...job,
    status: 'archived',
    archivedAt: new Date().toISOString(),
  };
}

/**
 * Count archived jobs in a list.
 */
export function countArchivedJobs(jobs: Job[]): number {
  return jobs.filter(isJobArchived).length;
}
