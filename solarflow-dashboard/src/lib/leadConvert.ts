// Pure helpers for the lead workflow on the LL board: seed a lead's editable
// contact fields, and build the Customer payload when the lead is converted to a
// client. Kept pure (no React) so the mapping is testable in isolation.
import type { Job, LeadInfo, Customer } from '../types';

const PHONE = /(?:phone|tel|call)\s*[:#-]?\s*(\+?1?[\s.()-]*\d{3}[\s.()-]*\d{3}[\s.()-]*\d{4})/i;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

function normPhone(raw: string): string {
  const d = raw.replace(/\D/g, '');
  return d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
}

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') };
}

/**
 * Initial contact fields for the lead panel. Prefers an already-edited
 * `job.leadInfo`; otherwise derives a starting point from `clientName` and any
 * "Phone:"/"Email:" lines the Trello import left in the notes, so the team isn't
 * retyping what already arrived.
 */
export function seedLeadInfo(job: Pick<Job, 'leadInfo' | 'clientName' | 'notes'>): LeadInfo {
  if (job.leadInfo && Object.values(job.leadInfo).some(Boolean)) return { ...job.leadInfo };
  const { firstName, lastName } = splitName(job.clientName ?? '');
  const notes = job.notes ?? '';
  const phoneM = notes.match(PHONE);
  const emailM = notes.match(EMAIL);
  const info: LeadInfo = { firstName, lastName };
  if (phoneM) info.phone = normPhone(phoneM[1]);
  if (emailM) info.email = emailM[0];
  return info;
}

/** Display name for a lead card/panel. */
export function leadDisplayName(job: Pick<Job, 'leadInfo' | 'clientName'>): string {
  const li = job.leadInfo;
  const fromInfo = li ? [li.firstName, li.lastName].filter(Boolean).join(' ').trim() : '';
  return fromInfo || (job.clientName ?? '').trim() || 'Unnamed lead';
}

/**
 * Build the Customer payload when converting a lead to a client. Carries the
 * lead's logged call/email activity onto the customer so the history survives.
 * State defaults to FL (the company's market) when the lead never captured one.
 */
export function leadToCustomer(job: Job): Partial<Customer> {
  const li = job.leadInfo ?? {};
  const { firstName, lastName } = li.firstName || li.lastName
    ? { firstName: li.firstName ?? '', lastName: li.lastName ?? '' }
    : splitName(job.clientName ?? '');
  const name = [firstName, lastName].filter(Boolean).join(' ').trim() || (job.clientName ?? '').trim() || 'New Client';
  return {
    name, firstName, lastName,
    phone: li.phone ?? '',
    email: li.email ?? '',
    address: li.address ?? '',
    city: li.city ?? '',
    state: li.state || 'FL',
    zip: li.zip ?? '',
    clientId: job.clientId,
    clientStatus: 'Contacted',
    referralSource: 'SolarEdge Leads',
    notes: job.notes ?? '',
    activityHistory: job.activityHistory,
    createdAt: new Date().toISOString(),
  };
}
