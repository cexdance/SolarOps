/**
 * UserPermissionsPanel, Admin-only staff & permits management (Settings page).
 *
 * Lists every staff user, lets an admin grant/revoke granular permits, change
 * roles, create and delete users, and send a set-password / reset email. A
 * "View log" quick link opens that user's full audit history. Every mutation is
 * recorded to change_log so the trail shows who changed what.
 *
 * Writes go through /api/users, which enforces the users.manage permit
 * server-side (the UI gating here is convenience, not the security boundary).
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  Users, UserPlus, Trash2, KeyRound, ScrollText, Loader2, Check, X, AlertCircle,
  ChevronDown, ChevronRight,
} from 'lucide-react';
import { authedFetch, supabase } from '../../lib/supabase';
import { logChange } from '../../lib/changeLog';
import { effectivePermits } from '../../lib/access';
import { ALL_PERMISSIONS } from '../../types';
import type { User, UserRole, Permission } from '../../types';
import { Avatar } from '../ui/Avatar';
import { UserActivityLog } from './UserActivityLog';

const ROLES: UserRole[] = ['admin', 'coo', 'support', 'sales', 'technician'];

const PERMIT_LABELS: Record<Permission, string> = {
  'financials.view':  'See financials',
  'workorders.edit':  'Edit work orders',
  'customers.delete': 'Delete customers',
  'inventory.manage': 'Manage inventory',
  'users.manage':     'Manage users',
};

interface UserPermissionsPanelProps {
  currentUser: User | null;
  onNavigate?: (entityType: string, entityId: string) => void;
}

export const UserPermissionsPanel: React.FC<UserPermissionsPanelProps> = ({ currentUser, onNavigate }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [logUser, setLogUser] = useState<User | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [sectionOpen, setSectionOpen] = useState(true);

  const actor = currentUser?.email ?? 'unknown';

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    authedFetch('/api/users')
      .then(async r => {
        if (!r.ok) throw new Error(`Failed to load users (${r.status})`);
        return r.json() as Promise<User[]>;
      })
      .then(list => setUsers(list.map(u => ({ ...u, username: u.username?.replace(/^@/, '') }))))
      .catch(e => setError(e.message ?? 'Failed to load users'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Toggle a single permit on a user ────────────────────────────────────────
  const togglePermit = async (user: User, permit: Permission, grant: boolean) => {
    if (user.role === 'admin') return; // admins implicitly hold every permit
    const current = effectivePermits(user);
    const next = grant
      ? [...new Set([...current, permit])]
      : current.filter(p => p !== permit);

    // Mirror the server self-protection so the UI fails fast.
    if (user.id === currentUser?.id && permit === 'users.manage' && !grant && currentUser?.role !== 'admin') {
      flash('You cannot remove your own Manage users permit.');
      return;
    }

    setBusyId(user.id);
    try {
      const res = await authedFetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, permissions: next }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? 'Update failed'); }
      const updated = await res.json() as User;
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, permissions: updated.permissions } : u));
      logChange('user.permits_changed', 'user', user.id,
        { email: user.email, permit, granted: grant, permissions: next }, actor);
      flash(`${grant ? 'Granted' : 'Revoked'} "${PERMIT_LABELS[permit]}" for ${user.name}`);
    } catch (e: any) {
      flash(e.message ?? 'Update failed');
    } finally {
      setBusyId(null);
    }
  };

  // ── Change a user's role ─────────────────────────────────────────────────────
  const changeRole = async (user: User, role: UserRole) => {
    if (role === user.role) return;
    if (user.id === currentUser?.id && user.role === 'admin' && role !== 'admin') {
      flash('You cannot change your own admin role.');
      return;
    }
    setBusyId(user.id);
    try {
      const res = await authedFetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, role }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? 'Update failed'); }
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, role } : u));
      logChange('user.update', 'user', user.id, { email: user.email, field: 'role', from: user.role, to: role }, actor);
      flash(`${user.name} is now ${role}`);
    } catch (e: any) {
      flash(e.message ?? 'Update failed');
    } finally {
      setBusyId(null);
    }
  };

  // ── Send reset / set-password email ─────────────────────────────────────────
  const sendReset = async (user: User) => {
    setBusyId(user.id);
    try {
      const redirectTo = `${window.location.origin}/reset-password`;
      const { error: err } = await supabase.auth.resetPasswordForEmail(user.email, { redirectTo });
      if (err) throw err;
      logChange('user.password_reset', 'user', user.id, { email: user.email }, actor);
      flash(`Password email sent to ${user.email}`);
    } catch (e: any) {
      flash(e.message ?? 'Failed to send email');
    } finally {
      setBusyId(null);
    }
  };

  // ── Delete a user ────────────────────────────────────────────────────────────
  const deleteUser = async (user: User) => {
    if (user.id === currentUser?.id) { flash('You cannot delete your own account.'); return; }
    if (!window.confirm(`Delete ${user.name} (${user.email})? This cannot be undone.`)) return;
    setBusyId(user.id);
    try {
      const res = await authedFetch(`/api/users?id=${encodeURIComponent(user.id)}`, { method: 'DELETE' });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? 'Delete failed'); }
      setUsers(prev => prev.filter(u => u.id !== user.id));
      logChange('user.delete', 'user', user.id, { email: user.email, name: user.name, role: user.role }, actor);
      flash(`Deleted ${user.name}`);
    } catch (e: any) {
      flash(e.message ?? 'Delete failed');
    } finally {
      setBusyId(null);
    }
  };

  const handleCreated = (user: User) => {
    setUsers(prev => [...prev, user]);
    logChange('user.create', 'user', user.id, { email: user.email, name: user.name, role: user.role }, actor);
    flash(`Created ${user.name}. A set-password email was sent.`);
    setShowCreate(false);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 mb-6">
      {/* Header */}
      <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setSectionOpen(o => !o)}
          aria-expanded={sectionOpen}
          title={sectionOpen ? 'Collapse section' : 'Expand section'}
          className="flex items-center gap-2 text-left -m-1 p-1 rounded-lg hover:bg-slate-50 transition-colors min-w-0"
        >
          {sectionOpen
            ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
            : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
          <Users className="w-5 h-5 text-slate-500 shrink-0" />
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-900">
              User Permissions
              {!loading && !error && <span className="text-slate-400 font-normal"> ({users.length})</span>}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 truncate">Manage staff, permits, and passwords</p>
          </div>
        </button>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 transition-colors"
        >
          <UserPlus className="w-4 h-4" /> New user
        </button>
      </div>

      {toast && (
        <div className="mx-4 mt-3 px-3 py-2 rounded-lg bg-slate-800 text-white text-xs">{toast}</div>
      )}

      {sectionOpen && (
      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-slate-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading users…
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 py-6 text-red-600 text-sm">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        ) : (
          <div className="space-y-3">
            {users.map(user => {
              const permits = effectivePermits(user);
              const isAdminUser = user.role === 'admin';
              const isSelf = user.id === currentUser?.id;
              const busy = busyId === user.id;
              return (
                <div key={user.id} className="border border-slate-200 rounded-xl p-3">
                  {/* Identity row */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <Avatar user={user} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900 text-sm truncate">
                        {user.name}{isSelf && <span className="text-slate-400 font-normal"> (you)</span>}
                      </p>
                      <p className="text-xs text-slate-500 truncate">{user.email}</p>
                    </div>

                    <select
                      value={user.role}
                      disabled={busy || (isSelf && isAdminUser)}
                      onChange={e => changeRole(user, e.target.value as UserRole)}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white disabled:opacity-50"
                    >
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>

                    <button
                      onClick={() => setLogUser(user)}
                      title="View activity log"
                      className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-slate-600 hover:bg-slate-100"
                    >
                      <ScrollText className="w-3.5 h-3.5" /> Log
                    </button>
                    <button
                      onClick={() => sendReset(user)}
                      disabled={busy}
                      title="Send set-password / reset email"
                      className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                    >
                      <KeyRound className="w-3.5 h-3.5" /> Reset
                    </button>
                    <button
                      onClick={() => deleteUser(user)}
                      disabled={busy || isSelf}
                      title={isSelf ? 'You cannot delete yourself' : 'Delete user'}
                      className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-red-600 hover:bg-red-50 disabled:opacity-40"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Permits row */}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {ALL_PERMISSIONS.map(permit => {
                      const granted = isAdminUser || permits.includes(permit);
                      return (
                        <button
                          key={permit}
                          disabled={busy || isAdminUser}
                          onClick={() => togglePermit(user, permit, !granted)}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors disabled:cursor-not-allowed ${
                            granted
                              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                          } ${isAdminUser ? 'opacity-70' : ''}`}
                        >
                          {granted ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                          {PERMIT_LABELS[permit]}
                        </button>
                      );
                    })}
                  </div>
                  {isAdminUser && (
                    <p className="text-xs text-slate-400 mt-1.5">Admins hold every permit by default.</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {logUser && (
        <UserActivityLog
          userEmail={logUser.email}
          userName={logUser.name}
          onClose={() => setLogUser(null)}
          onNavigate={onNavigate}
        />
      )}

      {showCreate && (
        <CreateUserModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}
    </div>
  );
};

// ── Create user modal ──────────────────────────────────────────────────────────
interface CreateUserModalProps {
  onClose: () => void;
  onCreated: (user: User) => void;
}

const CreateUserModal: React.FC<CreateUserModalProps> = ({ onClose, onCreated }) => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<UserRole>('technician');
  const [permits, setPermits] = useState<Permission[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggle = (p: Permission) =>
    setPermits(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);

  const submit = async () => {
    setErr(null);
    if (!/.+@.+\..+/.test(email.trim())) { setErr('Enter a valid email'); return; }
    if (!name.trim()) { setErr('Enter a name'); return; }
    setSaving(true);
    try {
      const res = await authedFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), name: name.trim(), phone: phone.trim(), role, permissions: permits }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'Failed to create user');
      // After creation the user exists; send them a set-password email.
      await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      }).catch((e) => console.error('[UserPermissionsPanel] resetPasswordForEmail failed', e));
      onCreated(j as User);
    } catch (e: any) {
      setErr(e.message ?? 'Failed to create user');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">New staff user</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          {err && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 text-red-600 text-xs">
              <AlertCircle className="w-3.5 h-3.5" /> {err}
            </div>
          )}
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Email</span>
            <input value={email} onChange={e => setEmail(e.target.value)} type="email"
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="name@conexsol.us" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Full name</span>
            <input value={name} onChange={e => setName(e.target.value)}
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="Jane Doe" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Phone (optional)</span>
            <input value={phone} onChange={e => setPhone(e.target.value)}
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Role</span>
            <select value={role} onChange={e => setRole(e.target.value as UserRole)}
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <div>
            <span className="text-xs font-medium text-slate-600">Permits</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {ALL_PERMISSIONS.map(p => {
                const on = role === 'admin' || permits.includes(p);
                return (
                  <button key={p} type="button" disabled={role === 'admin'} onClick={() => toggle(p)}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                      on ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    } ${role === 'admin' ? 'opacity-70' : ''}`}>
                    {on ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                    {PERMIT_LABELS[p]}
                  </button>
                );
              })}
            </div>
            {role === 'admin' && <p className="text-xs text-slate-400 mt-1">Admins hold every permit.</p>}
          </div>
        </div>
        <div className="p-4 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Create & send email
          </button>
        </div>
      </div>
    </div>
  );
};
