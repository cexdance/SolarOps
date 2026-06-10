// Shared adapter types for the multi-view job surfaces (List / Board / Calendar
// / Map). Both the contractor portal (ContractorJob) and the staff dispatch
// view (operations Job) map their records into a ViewJob so the Board, Calendar
// and Map components can be reused across both placements.

export type ViewJobPriority = 'critical' | 'high' | 'normal' | 'low';

export interface ViewJob {
  id: string;
  /** Primary line, usually the customer name. */
  title: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  /** Raw status key used to bucket the board columns. */
  status: string;
  /** Human label for the status. */
  statusLabel: string;
  priority: ViewJobPriority;
  /** ISO date (YYYY-MM-DD) the job is scheduled for. */
  scheduledDate?: string;
  scheduledTime?: string;
  serviceType?: string;
  /** Optional money figure (contractor pay or revenue), formatting is caller's job. */
  pay?: number;
  /** Optional short badge, e.g. the work/service order number. */
  badge?: string;
}

/** A board column definition: a status bucket plus its display label/accent. */
export interface BoardColumn {
  id: string;
  label: string;
  /** Tailwind classes for the column header accent (text + bg). */
  accent: string;
}

export const PRIORITY_DOT: Record<ViewJobPriority, string> = {
  critical: 'bg-red-500',
  high:     'bg-amber-500',
  normal:   'bg-blue-500',
  low:      'bg-slate-400',
};

/** Full single-line address used for geocoding and display. */
export function fullAddress(j: Pick<ViewJob, 'address' | 'city' | 'state' | 'zip'>): string {
  return [j.address, j.city, j.state, j.zip].filter(Boolean).join(', ');
}
