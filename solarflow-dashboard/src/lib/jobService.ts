/**
 * Work Order Service, Job archiving and lifecycle management
 */

import { Job } from '../types';

/**
 * Auto-archive completed work orders older than 30 days.
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
 * Manually archive a work order.
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
