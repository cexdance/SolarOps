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

import type { UserRole, Permission, User } from '../types';

/** Views that expose revenue, cost, payouts, or margins. Admin-only. */
export const FINANCIAL_VIEWS = ['billing', 'contractor-billing', 'rates'] as const;

export function isAdmin(role: UserRole | null | undefined): boolean {
  return role === 'admin';
}

export function isFinancialView(view: string): boolean {
  return (FINANCIAL_VIEWS as readonly string[]).includes(view);
}

// ── Granular permits ─────────────────────────────────────────────────────────
// Permits are layered on role. A user whose `permissions` array is undefined
// (not yet migrated) falls back to the role-derived defaults below, so existing
// accounts keep working with no backfill.

/** Default permits granted by each role when a user has no explicit array. */
export function defaultPermitsForRole(role: UserRole | null | undefined): Permission[] {
  if (role === 'admin') {
    return ['financials.view', 'workorders.edit', 'customers.delete', 'inventory.manage', 'users.manage'];
  }
  if (role === 'coo' || role === 'support') {
    // Operations staff: edit work orders and inventory, no money, no user admin.
    return ['workorders.edit', 'inventory.manage'];
  }
  if (role === 'technician') {
    return ['workorders.edit'];
  }
  // sales and anything else: no gated permits by default.
  return [];
}

/** Resolve the effective permits for a user (explicit array, else role default). */
export function effectivePermits(user: User | null | undefined): Permission[] {
  if (!user) return [];
  if (Array.isArray(user.permissions)) return user.permissions;
  return defaultPermitsForRole(user.role);
}

/** True if the user holds the given permit. Admins implicitly hold every permit. */
export function hasPermit(user: User | null | undefined, permit: Permission): boolean {
  if (!user) return false;
  if (isAdmin(user.role)) return true; // admin is a superuser regardless of array
  return effectivePermits(user).includes(permit);
}

/** Gates every financial view and money figure. */
export function canSeeFinancials(user: User | null | undefined): boolean {
  return hasPermit(user, 'financials.view');
}

/** True if the user may open the User Permissions panel and manage staff. */
export function canManageUsers(user: User | null | undefined): boolean {
  return hasPermit(user, 'users.manage');
}
