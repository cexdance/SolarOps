// Board sort, shared by the Service Orders kanban/list (Jobs.tsx) and the
// Billing kanban (Billing.tsx). Lives here rather than in Jobs.tsx so Billing
// can reuse it without pulling the whole Jobs component into its chunk.
import type { Job, UrgencyLevel } from '../types';
import type { Contractor } from '../types/contractor';

// Single seam for priority display. Manual-only today (job.urgency, default low).
// Any future escalation logic must go here, guarded by resolvePriority.test.ts.
export function resolvePriority(job: Job): UrgencyLevel {
  return job.urgency ?? 'low';
}

export type JobSortOption = 'none' | 'priority_desc' | 'date_desc' | 'date_asc' | 'service_type' | 'contractor';

const PRIORITY_RANK: Record<UrgencyLevel, number> = { critical: 4, high: 3, medium: 2, low: 1 };

export function sortJobsBy(list: Job[], sortBy: JobSortOption, contractors: Contractor[]): Job[] {
  if (sortBy === 'none') return list;
  const sorted = [...list];
  switch (sortBy) {
    case 'priority_desc':
      sorted.sort((a, b) => PRIORITY_RANK[resolvePriority(b)] - PRIORITY_RANK[resolvePriority(a)]);
      break;
    case 'date_desc':
      sorted.sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
      break;
    case 'date_asc':
      sorted.sort((a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime());
      break;
    case 'service_type':
      sorted.sort((a, b) => String(a.serviceType ?? '').localeCompare(String(b.serviceType ?? '')));
      break;
    case 'contractor': {
      // Unassigned sorts to the end regardless of direction, "￿" is after any real name.
      const nameOf = (j: Job) => contractors.find(c => c.id === j.contractorId)?.contactName ?? '￿';
      sorted.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
      break;
    }
  }
  return sorted;
}

// The option list, so both boards offer identical choices.
export const JOB_SORT_OPTIONS: { value: JobSortOption; label: string }[] = [
  { value: 'none', label: 'Sort: Default' },
  { value: 'priority_desc', label: 'Priority, High to Low' },
  { value: 'date_desc', label: 'Date Added, Newest First' },
  { value: 'date_asc', label: 'Date Added, Oldest First' },
  { value: 'service_type', label: 'Service Type, A-Z' },
  { value: 'contractor', label: 'Contractor, A-Z' },
];
