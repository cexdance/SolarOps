// The pickable label set, mirroring the "Conexsol Florida Services" Trello board
// so the app's labels match what the team already uses. Colours are the raw
// Trello colour keys; components render them through labelChipClass.
import type { JobLabel } from '../types';

export const LABEL_CATALOG: JobLabel[] = [
  { name: 'First Contact - Call Completed', color: 'lime_dark' },
  { name: 'Contacted/Waiting',              color: 'orange_dark' },
  { name: 'E-Mail Marketing',               color: 'yellow' },
  { name: 'Paid Site Transfer',             color: 'lime_dark' },
  { name: 'Site Transfer Completed',        color: 'blue' },
  { name: 'Quote Approved',                 color: 'purple_dark' },
  { name: 'Quote Sent',                     color: 'purple' },
  { name: 'S.O. Done',                      color: 'lime_light' },
  { name: 'Site Transfer Processing',       color: 'blue_dark' },
  { name: 'Invoiced',                       color: 'green' },
  { name: 'Initial Call Required',          color: 'red' },
  { name: 'S.O. Paid',                      color: 'lime_dark' },
  { name: 'Chose Another Provider',         color: 'orange' },
  { name: 'Waiting on Equipment Parts',     color: 'yellow_dark' },
  { name: 'Reroofing/Repaneling',           color: 'sky' },
  { name: 'Follow-up with Client',          color: 'red_dark' },
  { name: 'Needs Scheduling',               color: 'red_light' },
  { name: 'Needs Report',                   color: 'pink_dark' },
  { name: 'Powercare Report Sent',          color: 'pink' },
  // Both exist on the Trello board but were missing here, so they could arrive
  // by mirror yet never be picked or re-applied from the app.
  { name: 'Lost to competition',            color: 'red' },
  { name: 'Vm+txt',                         color: 'purple' },
  { name: 'Completed/Did not proceed.',     color: '' },
];

/** Normalize a label name for matching: case- and dash-insensitive, collapsed
 *  whitespace. Trello imported some names with an en-dash; the catalog uses a
 *  hyphen, so this keeps them from being treated as two different labels. */
export function labelKey(name: string): string {
  return name.toLowerCase().replace(/[‒-―]/g, '-').replace(/\s+/g, ' ').trim();
}

export function hasLabel(labels: JobLabel[] | undefined, name: string): boolean {
  const k = labelKey(name);
  return (labels ?? []).some(l => labelKey(l.name) === k);
}

/** Toggle a label on/off by normalized name. Returns a new array. */
export function toggleLabel(labels: JobLabel[] | undefined, label: JobLabel): JobLabel[] {
  const cur = labels ?? [];
  return hasLabel(cur, label.name)
    ? cur.filter(l => labelKey(l.name) !== labelKey(label.name))
    : [...cur, label];
}
