import type { VercelRequest, VercelResponse } from '@vercel/node';

const SUPABASE_URL = 'https://cjmhfagkkayelcsprbai.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const STAFF_ROLES = new Set(['admin', 'coo', 'support', 'sales', 'technician']);
const VALID_PERMISSIONS = new Set([
  'financials.view', 'workorders.edit', 'customers.delete', 'inventory.manage', 'users.manage',
]);

const adminHeaders = {
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  apikey: SERVICE_ROLE_KEY,
  'Content-Type': 'application/json',
};

/** Verified caller identity, derived from their JWT. */
interface Caller {
  id: string;
  email: string;
  role: string;
  permissions: string[];
}

interface RoleRow { user_id: string; role: string; permissions: string[] }

/** Read a user's TRUSTED role + permits from public.user_roles.
 *  Never read these from user_metadata: the user can edit that themselves
 *  (supabase.auth.updateUser), so gating a write on it lets anyone self-grant
 *  users.manage and then create admins or delete staff. */
async function fetchRoleRow(userId: string): Promise<RoleRow | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/user_roles?user_id=eq.${userId}&select=user_id,role,permissions&limit=1`,
    { headers: adminHeaders },
  );
  if (!res.ok) return null;
  const rows = await res.json() as RoleRow[];
  return rows[0] ?? null;
}

/** Mirror a role/permit change into the trusted table. The auth user_metadata
 *  copy is kept in sync for display only. */
async function upsertRoleRow(userId: string, role: string, permissions: string[]): Promise<boolean> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/user_roles?on_conflict=user_id`, {
    method: 'POST',
    headers: { ...adminHeaders, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ user_id: userId, role, permissions, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) {
    console.error(`[api/users] user_roles upsert failed ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  }
  return res.ok;
}

/** Validate the caller JWT and return their identity, or null if invalid. */
async function verifyCaller(req: VercelRequest): Promise<Caller | null> {
  const token = (req.headers.authorization ?? '').replace('Bearer ', '');
  if (!token) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SERVICE_ROLE_KEY },
  });
  if (!res.ok) return null;
  const u = await res.json() as Record<string, any>;
  const id = u.id as string;
  // Authorization comes from the trusted table, NOT from u.user_metadata.
  // A user with no row gets no role and no permits: fails closed.
  const trusted = await fetchRoleRow(id);
  return {
    id,
    email: (u.email as string) ?? '',
    role: trusted?.role ?? '',
    permissions: Array.isArray(trusted?.permissions) ? trusted!.permissions : [],
  };
}

/** Admins implicitly hold every permit. */
function canManageUsers(c: Caller): boolean {
  return c.role === 'admin' || c.permissions.includes('users.manage');
}

/** `trusted` is the public.user_roles row. Profile fields still come from
 *  user_metadata (they are cosmetic), but role and permissions come from the
 *  trusted table so the UI never shows a role the database will not honour. */
function mapUser(u: Record<string, any>, trusted?: RoleRow | null) {
  const meta = (u.user_metadata as Record<string, unknown>) ?? {};
  return {
    id: u.id as string,
    name: (meta.name as string) ?? (u.email as string) ?? 'Staff',
    email: (u.email as string) ?? '',
    phone: (meta.phone as string) ?? '',
    role: trusted?.role ?? '',
    active: true,
    username: ((meta.username as string) ?? '').replace(/^@/, ''),
    avatar: (meta.avatar_url as string | undefined) ?? undefined,
    permissions: Array.isArray(trusted?.permissions) ? trusted!.permissions : undefined,
  };
}

/** Sanitize a permissions array from the client to known keys only. */
function cleanPermissions(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) return undefined;
  return [...new Set(input.filter(p => typeof p === 'string' && VALID_PERMISSIONS.has(p)))];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const caller = await verifyCaller(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });

  // ── GET: list staff. Available to any authenticated staff member. ──────────
  if (req.method === 'GET') {
    // Paginate through ALL auth users. The GoTrue admin endpoint caps page size,
    // so a single call hid any staff member beyond the first page once the auth
    // project grew past it (staff + contractors + customers share auth.users).
    const PER_PAGE = 200;
    const MAX_PAGES = 50; // safety bound (10k users) so a bad upstream can't loop forever
    const allUsers: Record<string, any>[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const listRes = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=${PER_PAGE}`,
        { headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY } },
      );
      if (!listRes.ok) {
        // Surface the real upstream status instead of a generic 500, a 401/403
        // here means SUPABASE_SERVICE_ROLE_KEY is not a valid admin key.
        const detail = await listRes.text().catch(() => '');
        console.error(`[api/users] admin list page ${page} failed ${listRes.status}: ${detail.slice(0, 200)}`);
        return res.status(502).json({ error: `Failed to fetch users (upstream ${listRes.status})` });
      }
      const body = await listRes.json() as { users?: Record<string, any>[] };
      const pageUsers = body.users ?? [];
      allUsers.push(...pageUsers);
      if (pageUsers.length < PER_PAGE) break; // last page reached
    }
    // Staff membership is decided by public.user_roles, not by the metadata
    // copy: a contractor who sets user_metadata.role='admin' must not appear
    // in (or be actionable from) the staff directory.
    const rolesRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user_roles?select=user_id,role,permissions`,
      { headers: adminHeaders },
    );
    if (!rolesRes.ok) {
      console.error(`[api/users] user_roles fetch failed ${rolesRes.status}`);
      return res.status(502).json({ error: 'Failed to fetch roles' });
    }
    const roleBy = new Map((await rolesRes.json() as RoleRow[]).map(r => [r.user_id, r]));
    const staff = allUsers
      .filter(u => STAFF_ROLES.has(roleBy.get(u.id as string)?.role ?? ''))
      .map(u => mapUser(u, roleBy.get(u.id as string)));
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.status(200).json(staff);
  }

  // ── All writes below require the users.manage permit. ──────────────────────
  if (!canManageUsers(caller)) {
    return res.status(403).json({ error: 'Forbidden: requires users.manage' });
  }

  // ── POST: create a staff user. ─────────────────────────────────────────────
  if (req.method === 'POST') {
    const { email, name, phone, username, role, permissions } = (req.body ?? {}) as Record<string, unknown>;
    const cleanEmail = String(email ?? '').trim().toLowerCase();
    const cleanRole = String(role ?? '').trim();
    if (!cleanEmail || !/.+@.+\..+/.test(cleanEmail)) return res.status(400).json({ error: 'Valid email required' });
    if (!STAFF_ROLES.has(cleanRole)) return res.status(400).json({ error: 'Invalid role' });

    // Random temp password, the new user sets their own via the reset email
    // the client sends after this returns.
    const tempPassword = `Tmp-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
    const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        email: cleanEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          name: String(name ?? cleanEmail),
          phone: String(phone ?? ''),
          username: String(username ?? '').replace(/^@/, ''),
          role: cleanRole,
          permissions: cleanPermissions(permissions) ?? [],
          mustChangePassword: true,
        },
      }),
    });
    const created = await createRes.json() as Record<string, any>;
    if (!createRes.ok) {
      return res.status(createRes.status).json({ error: created?.msg ?? 'Failed to create user' });
    }

    // Grant the role in the trusted table. Without this row the new user can
    // sign in but RLS gives them nothing, so a failure here must not leave a
    // half-created account behind: undo the auth user and report it.
    const permits = cleanPermissions(permissions) ?? [];
    if (!await upsertRoleRow(created.id as string, cleanRole, permits)) {
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${created.id}`, {
        method: 'DELETE', headers: adminHeaders,
      }).catch(() => {});
      return res.status(500).json({ error: 'Failed to assign role, user was not created' });
    }
    return res.status(201).json(mapUser(created, { user_id: created.id as string, role: cleanRole, permissions: permits }));
  }

  // ── PATCH: update role / permits / profile fields. ─────────────────────────
  if (req.method === 'PATCH') {
    const { id, role, permissions, name, phone } = (req.body ?? {}) as Record<string, unknown>;
    const userId = String(id ?? '').trim();
    if (!userId) return res.status(400).json({ error: 'User id required' });

    // Self-protection: an admin cannot strip their own users.manage and lock
    // themselves (and possibly everyone) out of user administration.
    const nextPermits = cleanPermissions(permissions);
    if (userId === caller.id) {
      if (role !== undefined && String(role) !== 'admin' && caller.role === 'admin') {
        return res.status(400).json({ error: 'You cannot change your own admin role.' });
      }
      if (nextPermits !== undefined && caller.role !== 'admin' && !nextPermits.includes('users.manage')) {
        return res.status(400).json({ error: 'You cannot remove your own users.manage permit.' });
      }
    }

    // Read current metadata so we only patch provided fields.
    const getRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, { headers: adminHeaders });
    if (!getRes.ok) return res.status(404).json({ error: 'User not found' });
    const current = await getRes.json() as Record<string, any>;
    const meta = { ...((current.user_metadata as Record<string, unknown>) ?? {}) };

    const currentTrusted = await fetchRoleRow(userId);
    if (role !== undefined && !STAFF_ROLES.has(String(role))) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    const nextRole = role !== undefined ? String(role) : (currentTrusted?.role ?? '');
    const nextPerms = nextPermits !== undefined ? nextPermits : (currentTrusted?.permissions ?? []);

    // Trusted table first, metadata mirror second. If the mirror write fails the
    // user still has correct access; if the order were reversed a failure would
    // leave the UI showing a role the database does not grant.
    if (role !== undefined || nextPermits !== undefined) {
      if (!nextRole) return res.status(400).json({ error: 'User has no role, set one explicitly' });
      if (!await upsertRoleRow(userId, nextRole, nextPerms)) {
        return res.status(500).json({ error: 'Failed to update role' });
      }
    }

    if (role !== undefined) meta.role = nextRole;
    if (nextPermits !== undefined) meta.permissions = nextPerms;
    if (name !== undefined) meta.name = String(name);
    if (phone !== undefined) meta.phone = String(phone);

    const updRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ user_metadata: meta }),
    });
    const updated = await updRes.json() as Record<string, any>;
    if (!updRes.ok) return res.status(updRes.status).json({ error: updated?.msg ?? 'Failed to update user' });
    return res.status(200).json(mapUser(updated, { user_id: userId, role: nextRole, permissions: nextPerms }));
  }

  // ── DELETE: remove a staff user. ───────────────────────────────────────────
  if (req.method === 'DELETE') {
    const userId = String((req.query.id ?? (req.body as any)?.id) ?? '').trim();
    if (!userId) return res.status(400).json({ error: 'User id required' });
    if (userId === caller.id) return res.status(400).json({ error: 'You cannot delete your own account.' });

    const delRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: adminHeaders,
    });
    if (!delRes.ok) {
      const err = await delRes.json().catch(() => ({}));
      return res.status(delRes.status).json({ error: (err as any)?.msg ?? 'Failed to delete user' });
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
