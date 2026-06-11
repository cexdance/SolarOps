// Single source of truth for deciding whether an authenticated Supabase session
// belongs in the STAFF app or the CONTRACTOR portal. Role is authoritative: a
// pure contractor (user_metadata.role === 'contractor') must NEVER reach the
// staff workspace, on first login OR on a durable-session restore after the
// fragile sessionStorage contractor flag is gone (mobile Safari drops it).
//
// Dual-role staff (a staff role + isContractor flag) keep role !== 'contractor'
// and route to staff as before.

export interface SessionContractor {
  id: string;
  email: string;
  altEmails?: string[];
  status: string;
}

export type SessionRoute =
  | { route: 'staff' }
  | { route: 'contractor'; contractorId: string }
  | { route: 'deny' };

/** True when the auth metadata identifies a pure contractor account. */
export function isContractorAccount(
  meta: Record<string, unknown> | null | undefined,
): boolean {
  return ((meta?.['role'] as string | undefined) ?? '') === 'contractor';
}

/**
 * Decide where an authenticated session goes.
 * - Non-contractor role -> 'staff'.
 * - Contractor role with an APPROVED matching contractor record -> 'contractor'.
 * - Contractor role with no match / not approved -> 'deny' (sign them out; never
 *   fall through to staff).
 */
export function resolveSessionRoute(
  meta: Record<string, unknown> | null | undefined,
  email: string,
  contractors: SessionContractor[],
): SessionRoute {
  if (!isContractorAccount(meta)) return { route: 'staff' };
  const e = (email ?? '').toLowerCase();
  const linked = contractors.find(
    c =>
      (c.email ?? '').toLowerCase() === e ||
      (c.altEmails ?? []).some(a => (a ?? '').toLowerCase() === e),
  );
  if (linked && linked.status === 'approved') {
    return { route: 'contractor', contractorId: linked.id };
  }
  return { route: 'deny' };
}
