// Client routing policy, not backend authorization. Protected user_roles/RLS
// remain authoritative for access. Decide whether an authenticated Supabase session
// belongs in the STAFF app or the CONTRACTOR portal. A
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
  const e = (email ?? '').trim().toLowerCase();
  if (!e) return { route: 'deny' };
  const linked = contractors.find(
    c =>
      (c.email ?? '').trim().toLowerCase() === e ||
      (c.altEmails ?? []).some(a => (a ?? '').trim().toLowerCase() === e),
  );
  if (linked && linked.status === 'approved') {
    return { route: 'contractor', contractorId: linked.id };
  }
  return { route: 'deny' };
}

/** Auth owns completion; a legacy contractor flag is used only when absent. */
export function requiresPasswordChange(
  meta: Record<string, unknown> | null | undefined,
  legacyFlag = false,
): boolean {
  return typeof meta?.['mustChangePassword'] === 'boolean'
    ? meta['mustChangePassword']
    : legacyFlag;
}
