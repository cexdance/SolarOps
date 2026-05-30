// Central role-based access control.
//
// Three access groups drive what a signed-in user can see:
//   - admin:      full access, including all financial views
//   - staff:      operations access, no financial views (the `support` role,
//                 plus coo/sales/technician which remain non-admin)
//   - contractor: handled separately via the Contractor Portal (isContractorMode)
//
// Field- and view-level financial restrictions are enforced here in the app
// layer because the Supabase store is a shared org-wide KV table (app_data):
// staff legitimately read the same job/customer records that also carry
// revenue/cost fields, so RLS cannot strip those fields per-role. Anything that
// surfaces money to a non-admin must gate on canSeeFinancials().

import type { UserRole } from '../types';

/** Views that expose revenue, cost, payouts, or margins. Admin-only. */
export const FINANCIAL_VIEWS = ['billing', 'contractor-billing', 'rates'] as const;

export function isAdmin(role: UserRole | null | undefined): boolean {
  return role === 'admin';
}

/** True only for admins. Gates every financial view and money figure. */
export function canSeeFinancials(role: UserRole | null | undefined): boolean {
  return isAdmin(role);
}

export function isFinancialView(view: string): boolean {
  return (FINANCIAL_VIEWS as readonly string[]).includes(view);
}
