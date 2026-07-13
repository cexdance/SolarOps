// SolarFlow MVP - Main Application with Contractor Module
// Auth screens live in src/components/auth/, imported by name here to avoid duplication on next cleanup pass
// View routing lives in src/components/AppRouter.tsx
// Sync side-effects live in src/hooks/useSyncEngine.ts
// Version-poll side-effect lives in src/hooks/useVersionPoll.ts
import { useState, useEffect, useRef, useMemo, lazy, Suspense, startTransition } from 'react';
import { useVersionPoll } from './hooks/useVersionPoll';
import { useSyncEngine }  from './hooks/useSyncEngine';
import { BUILD_ID } from './lib/versionConfig';
import { StorageWarningBanner } from './components/StorageWarningBanner';
import { ErrorBoundary } from './shared/components/ErrorBoundary';
import { SuspenseFallback } from './shared/components/SuspenseFallback';
const Layout             = lazy(() => import('./components/Layout').then(m => ({ default: m.Layout })));
const Dashboard          = lazy(() => import('./components/Dashboard').then(m => ({ default: m.Dashboard })));
const Jobs               = lazy(() => import('./components/Jobs').then(m => ({ default: m.Jobs })));
const ServiceOrderPanel     = lazy(() => import('./components/ServiceOrderPanel').then(m => ({ default: m.ServiceOrderPanel })));
const Customers          = lazy(() => import('./components/Customers').then(m => ({ default: m.Customers })));
const Billing            = lazy(() => import('./components/Billing').then(m => ({ default: m.Billing })));
const TechnicianView     = lazy(() => import('./components/TechnicianView').then(m => ({ default: m.TechnicianView })));
const Settings           = lazy(() => import('./components/Settings').then(m => ({ default: m.Settings })));
const ContractorRegister = lazy(() => import('./components/contractor').then(m => ({ default: m.ContractorRegister })));
const ContractorDashboard = lazy(() => import('./components/contractor').then(m => ({ default: m.ContractorDashboard })));
const RateManagement     = lazy(() => import('./components/contractor').then(m => ({ default: m.RateManagement })));
const ContractorApprovals = lazy(() => import('./components/contractor').then(m => ({ default: m.ContractorApprovals })));
const BillingModule      = lazy(() => import('./components/admin/BillingModule').then(m => ({ default: m.BillingModule })));
const InventoryModule    = lazy(() => import('./components/InventoryModule').then(m => ({ default: m.InventoryModule })));
const SolarProjects      = lazy(() => import('./components/SolarProjects').then(m => ({ default: m.SolarProjects })));
const CRMDashboard       = lazy(() => import('./components/CRMDashboard').then(m => ({ default: m.CRMDashboard })));
const CustomerManagement = lazy(() => import('./components/CustomerManagement').then(m => ({ default: m.CustomerManagement })));
const Operations         = lazy(() => import('./components/Operations'));
const SolarEdgeMonitoring = lazy(() => import('./components/SolarEdgeMonitoring').then(m => ({ default: m.SolarEdgeMonitoring })));
const DispatchDashboard  = lazy(() => import('./components/DispatchDashboard').then(m => ({ default: m.DispatchDashboard })));
const DispatchMap        = lazy(() => import('./components/DispatchMap'));
const LeadLobby          = lazy(() => import('./components/LeadLobby').then(m => ({ default: m.LeadLobby })));
const RMADashboardPage   = lazy(() => import('./components/RMADashboard').then(m => ({ default: m.RMADashboard })));
import { supabase, authedFetch } from './lib/supabase';
import { canSeeFinancials, isFinancialView } from './lib/access';
import { syncFromDB } from './lib/db';
import { loadData, saveData } from './lib/dataStore';
import { migrateWoPhotos } from './lib/photoStore';
import { pickupJobsForContractor, toContractorJobView, serviceOrderNo, photoUrlStem, bareOrderNo, dedupeWoPhotos } from './lib/woHelpers';
import { fireMentionNotifications, sendCustomerAppointmentEmail } from './components/ui/MentionTextarea';
import { logChange, logJobChange, flushChangeLog } from './lib/changeLog';
import { autoArchiveCompletedJobs, stampJobFields } from './lib/jobService';
import { fetchMyNotifications, markNotificationReadRemote, markAllNotificationsReadRemote, startNotificationPolling, stopNotificationPolling, subscribeToNotifications, unsubscribeFromNotifications } from './lib/notifications';
import { processBillingTimers } from './lib/billingService';
import { loadContractors, saveContractors, loadServiceRates, saveServiceRates, loadContractorJobs, saveContractorJobs, initializeContractorData, findInviteByToken } from './lib/contractorStore';
import { ContractorInvite as ContractorInviteType } from './types/contractor';
import { AppState, Job, Customer, User, AppNotification, SolarEdgeExtraSite, RMAEntry, WOStatus, JobStatus, Activity } from './types';
import { FL_SITES } from './lib/solarEdgeSites';
import { isFloridaSite, isAllowedCustomer, deriveClientId } from './lib/solarEdgeSiteFilter';
import { getDeletedCustomerIds, markJobDeleted } from './lib/dataStore';
import { Contractor, ContractorStatus, ContractorJob } from './types/contractor';
import { addInteraction, loadCustomers, loadInteractions, saveInteractions } from './lib/customerStore';
import { validateAddress, normalizeStreetOrder, sameStreetAddress } from './lib/addressValidator';
import { useUnreadBadge } from './hooks/useUnreadBadge';
import { resolveSessionRoute, isContractorAccount } from './lib/authRouting';
import { Eye, X } from 'lucide-react';

// ── Web Push helpers ────────────────────────────────────────────────────────

// Rotated 2026-07-10: the private half of the previous key was lost (Vercel env
// held empty strings), so a fresh pair was generated. Must match the server's
// VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY env in Vercel or every push is rejected.
const VAPID_PUBLIC_KEY = 'BAukyCJ6BvbIXY2lp54WbisMgPjwL5qU8T93BmdtAAmGCKNAkTQwuU84OjrrQIxLq91qiZCa5QjQoRpzuOH5XJg';

function urlBase64ToUint8Array(b64: string): Uint8Array {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function subscribeToPush(accessToken?: string): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const appKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    let sub = await reg.pushManager.getSubscription();
    // VAPID rotation: a subscription bound to an old server key can never
    // receive pushes signed with the current one; drop it and re-subscribe.
    if (sub) {
      const bound = sub.options.applicationServerKey
        ? new Uint8Array(sub.options.applicationServerKey)
        : null;
      const stale = !bound || bound.length !== appKey.length || bound.some((b, i) => b !== appKey[i]);
      if (stale) {
        await sub.unsubscribe().catch(() => {});
        sub = null;
      }
    }
    if (!sub) {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return;
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appKey,
      });
    }
    // Use provided token, or fetch session as fallback
    let token = accessToken;
    if (!token) {
      const { data: { session } } = await supabase.auth.getSession();
      token = session?.access_token;
    }
    if (!token) return;
    await fetch('/api/push-subscribe', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ subscription: sub.toJSON() }),
    });
  } catch (err) {
    console.warn('[push] subscription failed:', err);
  }
}

// Auth timeout error class for distinct error handling
class AuthTimeoutError extends Error {
  constructor(message = 'Authentication request timed out') {
    super(message);
    this.name = 'AuthTimeoutError';
  }
}

function isAuthTimeoutError(err: unknown): err is AuthTimeoutError {
  return err instanceof AuthTimeoutError;
}

// ── Passkey / WebAuthn helpers (imported from shared lib) ─────────────────────
import {
  PASSKEY_STORE_KEY,
  isPlatformAuthAvailable,
  registerPasskey,
  authenticateWithPasskey,
} from './lib/passkey';
import { ContractorLoginScreen } from './components/contractor/ContractorLoginScreen';
import { SyncStatusToast } from './components/SyncStatusIndicator';
import { initSyncStatusListeners } from './lib/supabaseErrors';

// ── Login Screen ──────────────────────────────────────────────────────────────

const LoginScreen: React.FC<{
  onLogin: (user: User, forcePasswordChange?: boolean) => void;
  onGoToContractor: () => void;
}> = ({ onLogin, onGoToContractor }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);
  const [passkeyStored, setPasskeyStored] = useState(false);
  useEffect((): (() => void) => {
    localStorage.removeItem('solarops_reset_mode'); // staff page clears contractor mode flag
    let cancelled = false;
    if (isPlatformAuthAvailable()) {
      window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
        .then(available => {
          if (!cancelled) {
            setPasskeyAvailable(available);
            setPasskeyStored(available && !!localStorage.getItem(PASSKEY_STORE_KEY));
          }
        })
        .catch((e) => {
          if (!cancelled) console.error('[App] passkey availability check failed', e);
        });
    }
    return () => { cancelled = true; };
  }, []);

  const finishStaffLogin = async (supaUser: import('@supabase/supabase-js').User, offerPasskey = false) => {
    // STEP 5: Force-fresh on sign-in, if a new deploy landed, reload before entering the app
    if (BUILD_ID !== 'dev') {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
        });
        if (res.ok) {
          let remote: { build?: string } = { build: undefined };
          try {
            remote = await res.json() as { build?: string };
            // Validate the response format
            if (typeof remote !== 'object' || remote === null) {
              throw new Error('Invalid version response format');
            }
          } catch (parseErr) {
            console.warn('[Auth] Version check: malformed response, ignoring', parseErr);
          }
          if (remote.build && remote.build !== BUILD_ID) {
            console.info('[Auth] New deployment detected on sign-in. Reloading…');
            window.location.reload();
            return;
          }
        }
      } catch (err) {
        console.warn('[Auth] Version check failed (continuing)', err);
      }
    }

    const meta = supaUser.user_metadata ?? {};
    // CRITICAL ACCESS CONTROL: contractors must NEVER enter the staff app. If a
    // contractor-role account authenticates on the staff screen, reject it and
    // point them at the Contractor login (which routes to the contractor portal).
    if (isContractorAccount(meta)) {
      await supabase.auth.signOut();
      setError('This is the staff portal. Please use the Contractor login.');
      return;
    }
    const user: User = {
      id: supaUser.id,
      name: meta['name'] ?? supaUser.email ?? 'Staff',
      email: supaUser.email ?? email,
      phone: meta['phone'] ?? '',
      role: meta['role'] ?? 'admin',
      active: true,
      username: meta['username'] ?? '',
      avatar: (meta['avatar_url'] as string | undefined) ?? undefined,
    };
    if (offerPasskey && passkeyAvailable && !localStorage.getItem(PASSKEY_STORE_KEY)) {
      await registerPasskey(supaUser.id, supaUser.email ?? '');
      setPasskeyStored(true);
    }
    onLogin(user, !!meta['mustChangePassword']);
  };

  const AUTH_TIMEOUT_MS = 12_000; // 12s, Supabase auth must respond within this window

// Auth timeout wrapper with custom error and optional retry
async function authTimeoutWithRetry<T>(
  p: Promise<T>,
  timeoutMs = AUTH_TIMEOUT_MS,
  retries = 0
): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await Promise.race<T>([
        p,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new AuthTimeoutError()), timeoutMs)
        ),
      ]);
    } catch (err) {
      if (isAuthTimeoutError(err)) {
        if (attempt < retries) {
          console.warn(`[Auth] Timeout on attempt ${attempt + 1}/${retries + 1}, retrying...`);
          // Exponential backoff: 1s, 2s, 4s...
          await new Promise(r => setTimeout(r, 1000 * 2 ** attempt));
          continue;
        }
        throw new AuthTimeoutError(
          `Authentication timed out after ${retries + 1} attempt(s). Check your internet connection.`
        );
      }
      throw err;
    }
  }
  // Should never reach here, but TypeScript needs it
  throw new AuthTimeoutError('Authentication failed after retries');
}

  const handlePasskeyLogin = async () => {
    setError('');
    setLoading(true);
    try {
      const rawId = await authenticateWithPasskey();
      if (!rawId) {
        setError('Face ID / Touch ID failed. Please sign in with your password.');
        return;
      }
      // Try current session first; if JWT expired, refresh using the stored refresh token
      // Use retry logic (2 retries = 3 attempts total) for better resilience on slow networks
      let { data: { session } } = await authTimeoutWithRetry(supabase.auth.getSession(), AUTH_TIMEOUT_MS, 2);
      if (!session) {
        const { data: refreshed } = await authTimeoutWithRetry(supabase.auth.refreshSession(), AUTH_TIMEOUT_MS, 1);
        session = refreshed.session;
      }
      if (session?.user) {
        await finishStaffLogin(session.user);
      } else {
        setError('Session expired. Please sign in with your password once to re-enable Face ID.');
      }
    } catch (err: any) {
      if (isAuthTimeoutError(err)) {
        setError(err.message);
      } else {
        setError('Sign in failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data, error: authError } = await authTimeoutWithRetry(
        supabase.auth.signInWithPassword({ email, password }),
        AUTH_TIMEOUT_MS,
        2 // 2 retries for password auth too
      );
      if (authError || !data.user) {
        setError('Invalid email or password.');
        return;
      }
      const meta = data.user.user_metadata ?? {};
      // Block pure contractors (no staff access); dual-role users (isStaff=true) are allowed
      if (meta['role'] === 'contractor' && !meta['isStaff']) {
        await supabase.auth.signOut();
        setError('This is the staff portal. Please use the Contractor Portal below.');
        return;
      }
      await finishStaffLogin(data.user, true);
    } catch (err: any) {
      if (isAuthTimeoutError(err)) {
        setError(err.message);
      } else {
        setError('Sign in failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    const redirectTo = `${window.location.origin}/reset-password`;
    await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), { redirectTo });
    setForgotLoading(false);
    setForgotSent(true);
  };

  if (showForgot) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center mb-8">
            <div className="overflow-hidden" style={{ height: 145, width: 300 }}>
              <img src="/conexsol-logo.png" alt="Conexsol" className="brightness-0 invert" style={{ width: 300, height: 'auto', marginTop: -42 }} />
            </div>
            <p className="text-slate-400 text-sm tracking-wide">Operations Management Platform</p>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-2xl">
            <button onClick={() => { setShowForgot(false); setForgotSent(false); setForgotEmail(''); }} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
              ← Back to login
            </button>
            <h2 className="text-lg font-semibold text-slate-900 mb-1">Reset your password</h2>
            <p className="text-sm text-slate-500 mb-4">Enter your email and we'll send you a reset link.</p>
            {forgotSent ? (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                Check your inbox, a reset link has been sent to <strong>{forgotEmail}</strong>.
              </div>
            ) : (
              <form onSubmit={handleForgotSubmit} className="space-y-4">
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={e => setForgotEmail(e.target.value)}
                  placeholder="you@conexsol.com"
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  required
                />
                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="w-full py-3 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-60"
                >
                  {forgotLoading ? 'Sending…' : 'Send reset link'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="overflow-hidden" style={{ height: 145, width: 300 }}>
            <img src="/conexsol-logo.png" alt="Conexsol" className="brightness-0 invert" style={{ width: 300, height: 'auto', marginTop: -42 }} />
          </div>
          <p className="text-slate-400 text-sm tracking-wide">Operations Management Platform</p>
        </div>

        {/* Login Form */}
        <div className="bg-white rounded-2xl p-6 shadow-2xl">
          <h2 className="text-lg font-bold text-slate-900 mb-5">Staff Login</h2>

          {/* Face ID */}
          {passkeyAvailable && (
            <button
              type="button"
              onClick={passkeyStored ? handlePasskeyLogin : undefined}
              disabled={loading || !passkeyStored}
              title={!passkeyStored ? 'Sign in with your password once to enable Face ID on this device' : ''}
              className={`w-full flex items-center justify-center gap-2 py-3 mb-4 border-2 rounded-lg font-medium transition-colors ${
                passkeyStored
                  ? 'border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer'
                  : 'border-dashed border-slate-200 text-slate-400 cursor-default'
              } disabled:opacity-60`}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2C8.686 2 6 4.686 6 8c0 2.09.81 3.98 2.13 5.37L6 22h12l-2.13-8.63A7.96 7.96 0 0 0 18 8c0-3.314-2.686-6-6-6z"/>
                <circle cx="12" cy="8" r="2"/>
              </svg>
              {passkeyStored ? 'Sign in with Face ID' : 'Face ID / Touch ID, sign in with password once to enable'}
            </button>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@conexsol.com"
                className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                required
                autoComplete="email"
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-slate-700">Password</label>
                <button
                  type="button"
                  onClick={() => setShowForgot(true)}
                  className="text-xs text-orange-500 hover:underline py-2 px-1 min-h-[44px] flex items-center"
                >
                  Forgot password?
                </button>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          {/* Contractor portal link */}
          <div className="mt-5 pt-5 border-t border-slate-100 text-center">
            <p className="text-sm text-slate-500">
              Are you a contractor?{' '}
              <button onClick={onGoToContractor} className="text-orange-500 font-medium hover:underline">
                Contractor Portal →
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Pending approval screen for contractors
const PendingApprovalScreen: React.FC<{ contractor: Contractor; onLogout: () => void }> = ({ contractor, onLogout }) => {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">⏳</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Application Under Review</h1>
        <p className="text-slate-600 mb-6">
          Your contractor application for <strong>{contractor.businessName}</strong> is being reviewed by our team.
        </p>
        <div className="bg-white rounded-xl p-4 border border-slate-200 mb-6">
          <div className="flex items-center justify-center gap-2 text-amber-600">
            <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
            <span className="text-sm font-medium">Pending Approval</span>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          Sign out and return later
        </button>
      </div>
    </div>
  );
};

// ── Force Change Password Screen ──────────────────────────────────────────────
// Shown after first login when mustChangePassword flag is set

const ForceChangePasswordScreen: React.FC<{
  isContractor?: boolean;
  onDone: (newPassword: string) => void;
}> = ({ isContractor, onDone }) => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (password === '123456789') { setError('Please choose a different password'); return; }
    setError('');
    setLoading(true);
    if (!isContractor) {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) { setError(err.message); setLoading(false); return; }
      // Clear the flag in user_metadata
      await supabase.auth.updateUser({ data: { mustChangePassword: false } });
    }
    setLoading(false);
    onDone(password);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="overflow-hidden" style={{ height: 145, width: 300 }}>
            <img src="/conexsol-logo.png" alt="Conexsol" className="brightness-0 invert" style={{ width: 300, height: 'auto', marginTop: -42 }} />
          </div>
          <p className="text-slate-400 text-sm tracking-wide">Operations Management Platform</p>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-2xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Set your password</h2>
              <p className="text-xs text-slate-500">Your account requires a new password before continuing</p>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">New password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Confirm password</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Repeat your password"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                required
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60"
            >
              {loading ? 'Saving…' : 'Set password & continue'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

// ── Reset Password Screen ─────────────────────────────────────────────────────

const ResetPasswordScreen: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  // Show form if URL hash has recovery token OR session already exists
  const hasRecoveryHash = window.location.hash.includes('type=recovery') || window.location.hash.includes('access_token');
  const [sessionReady, setSessionReady] = useState(hasRecoveryHash);

  useEffect(() => {
    if (hasRecoveryHash) return undefined; // already showing the form
    // Fallback: wait for session via getSession or auth event
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessionReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') && session) {
        setSessionReady(true);
      }
    });
    // Timeout fallback, show form after 3s regardless, updateUser will surface any real error
    const t = setTimeout(() => setSessionReady(true), 3000);
    return () => { subscription.unsubscribe(); clearTimeout(t); };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setError('');
    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) { setError(updateError.message); return; }
    setDone(true);
    setTimeout(() => { supabase.auth.signOut(); onDone(); }, 2500);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="overflow-hidden" style={{ height: 145, width: 300 }}>
            <img src="/conexsol-logo.png" alt="Conexsol" className="brightness-0 invert" style={{ width: 300, height: 'auto', marginTop: -42 }} />
          </div>
          <p className="text-slate-400 text-sm tracking-wide">Operations Management Platform</p>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-2xl">
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Set a new password</h2>
          <p className="text-sm text-slate-500 mb-4">Choose a strong password for your account.</p>
          {done ? (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
              Password updated! Redirecting to login…
            </div>
          ) : !sessionReady ? (
            <div className="flex flex-col items-center py-6 gap-3">
              <div className="w-8 h-8 border-4 border-orange-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-500">Verifying your reset link…</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="New password"
                className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                required
                minLength={8}
              />
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Confirm new password"
                className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                required
              />
              {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-60"
              >
                {loading ? 'Saving…' : 'Update password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

function App() {
  const [dbReady, setDbReady] = useState(false);
  const [data, setData] = useState<AppState>(() => loadData());
  const [currentView, setCurrentView] = useState(
    () => localStorage.getItem('solarflow_current_view') || 'dashboard'
  );
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectCustomerSeq, setSelectCustomerSeq] = useState(0);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  // Authentication state - Supabase session + contractor sessionStorage
  const validateContractorSession = (): boolean => {
    const token = sessionStorage.getItem('solarflow_session');
    const userId = sessionStorage.getItem('solarflow_user_id');
    const isContractor = sessionStorage.getItem('solarflow_contractor_mode') === 'true';
    if (!token || !userId || !isContractor) return false;
    try {
      const decoded = atob(token);
      const parts = decoded.split(':');
      if (parts.length < 3) return false;
      const storedUserId = parts[0];
      const timestamp = parseInt(parts[1]);
      const SESSION_MAX_MS = 8 * 60 * 60 * 1000;
      if (storedUserId !== userId) return false;
      if (Date.now() - timestamp > SESSION_MAX_MS) return false;
      return true;
    } catch { return false; }
  };

  const fetchStaffUsers = async (): Promise<User[]> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return [];
      const res = await fetch('/api/users', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return [];
      const users = await res.json() as User[];
      // Strip leading @ from usernames stored as "@handle" in Supabase metadata
      return users.map(u => ({
        ...u,
        username: u.username ? u.username.replace(/^@/, '') : u.username,
      }));
    } catch {
      return [];
    }
  };

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isContractorMode, setIsContractorMode] = useState(() => validateContractorSession());
  // Staff user who is also linked to a contractor (dual-role: e.g. cesar.jurado@conexsol.us ↔ iMPower)
  const [linkedContractor, setLinkedContractor] = useState<Contractor | null>(null);
  const findLinkedContractor = (list: Contractor[], email?: string | null): Contractor | null => {
    if (!email) return null;
    const e = email.trim().toLowerCase();
    return list.find(c =>
      (c.email ?? '').trim().toLowerCase() === e ||
      (c.altEmails ?? []).some(alt => (alt ?? '').trim().toLowerCase() === e)
    ) ?? null;
  };
  const [loginMode, setLoginMode] = useState<'staff' | 'contractor'>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('mode') === 'contractor' || localStorage.getItem('solarops_reset_mode') === 'contractor'
      ? 'contractor' : 'staff';
  });
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [currentContractor, setCurrentContractor] = useState<Contractor | null>(null);
  // Admin "View as contractor" impersonation. When true, the staff session stays
  // authenticated underneath; we render the contractor portal with a banner and an
  // Exit that returns to admin WITHOUT signing out. Intentionally not persisted to
  // sessionStorage, so a refresh drops back to the admin view.
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(
    () => window.location.pathname === '/reset-password'
  );

  // Invite token detection from URL
  const [pendingInvite, setPendingInvite] = useState<ContractorInviteType | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('invite');
    if (!token) return null;
    // Initialize store before looking up invite
    initializeContractorData();
    return findInviteByToken(token);
  });

  // Contractor data
  const [contractors, setContractors] = useState<Contractor[]>(() => {
    initializeContractorData();
    return loadContractors();
  });

  // One-time migration: reassign any admin-side jobs from legacy contractor-1 → contractor-2.
  // Persist synchronously so a concurrent syncFromDB pull cannot overwrite the migrated state.
  useEffect(() => {
    setData(prev => {
      const needsPatch = prev.jobs.some(j => j.contractorId === 'contractor-1');
      if (!needsPatch) return prev;
      const next = { ...prev, jobs: prev.jobs.map(j => j.contractorId === 'contractor-1' ? { ...j, contractorId: 'contractor-2' } : j) };
      saveData(next);
      return next;
    });
  }, []);

  // Re-resolve dual-role link whenever contractors list updates (handles async sync hydration on mobile)
  useEffect(() => {
    const email = data.currentUser?.email;
    if (!email) return;
    setLinkedContractor(prev => {
      const next = findLinkedContractor(contractors, email);
      if (next?.id === prev?.id) return prev;
      return next ?? prev;
    });
  }, [contractors, data.currentUser?.email]);
  const [serviceRates, setServiceRates] = useState(() => loadServiceRates());
  const [contractorJobs, setContractorJobs] = useState(() => loadContractorJobs());

  // Sync from Supabase on startup → merge into local state
  // syncFromDB() merges remote customers/jobs into localStorage, then we reload
  // Wrapped in Promise.race() so Supabase timeouts never block the loading spinner
  useEffect(() => {
    const SYNC_TIMEOUT_MS = 8000; // 8s max, fall back to local data if Supabase is slow
    const timeout = new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('sync-timeout')), SYNC_TIMEOUT_MS)
    );

    Promise.race([syncFromDB(), timeout])
      .then(() => {
        // Re-read localStorage after remote merge (may have new records from other devices)
        const merged = loadData();
        // Auto-archive completed jobs >30 days old
        const withArchived = {
          ...merged,
          jobs: autoArchiveCompletedJobs(merged.jobs),
        };
        setData(prev => {
          // ALWAYS adopt the merged state. The previous length-only comparison
          // skipped adoption when record CONTENT changed but counts matched, so
          // React state kept stale records that the next edit then pushed back
          // out, regressing other devices' changes (notes, addresses, renames).
          // Defensive photo merge: keep whichever copy has more photos so a startup
          // sync (reading localStorage which may have stale photo count) doesn't
          // overwrite photos that are already in React state from a recent upload.
          const safeMergedJobs = withArchived.jobs.map((j: import('./types').Job) => {
            const prevJ = prev.jobs.find(p => p.id === j.id);
            if (!prevJ) return j;
            const incoming = j.woPhotos ?? [];
            const existing  = prevJ.woPhotos ?? [];
            return incoming.length >= existing.length ? j : { ...j, woPhotos: existing };
          });
          return { ...withArchived, jobs: safeMergedJobs };
        });
      })
      .catch((err) => {
        // Sync failed (offline, not logged in, or timed out), local data is already loaded
        if (err?.message === 'sync-timeout') {
          console.warn('[App] Supabase sync timed out after 8s, using local data');
        }
      })
      .finally(() => setDbReady(true));
  }, []);

  // Save data whenever it changes (debounced 500ms)
  useEffect(() => {
    const timer = setTimeout(() => saveData(data), 500);
    return () => clearTimeout(timer);
  }, [data]);

  // Initialize sync status listeners
  useEffect(() => {
    const cleanup = initSyncStatusListeners();
    return cleanup;
  }, []);

  // ── Sync: poll + realtime + remote-update handler (extracted to hook) ────
  // skipContractorPersist guards against re-pushing data we just pulled from remote
  const skipContractorPersist = useRef(false);
  const { deepSync } = useSyncEngine({ setData, setContractors, setServiceRates, setContractorJobs, skipContractorPersist });

  // ── Version poll (extracted to hook) ─────────────────────────────────────
  const { state: versionState, remoteVersion, checkNow: checkForUpdate } = useVersionPoll();


  useEffect(() => {
    if (skipContractorPersist.current) return;
    saveContractors(contractors);
  }, [contractors]);

  useEffect(() => {
    if (skipContractorPersist.current) return;
    saveServiceRates(serviceRates);
  }, [serviceRates]);

  useEffect(() => {
    if (skipContractorPersist.current) return;
    saveContractorJobs(contractorJobs);
  }, [contractorJobs]);

  // ── Contractor → admin reconciliation (sync-side) ──────────────────────────
  // handleContractorJobUpdate mirrors contractor work into the admin Job, but it
  // only runs on the CONTRACTOR's device, where data.jobs usually has no admin
  // Job, so `if (!adminJob) return prev` no-ops and the admin Job never gets the
  // completion or photos. The ContractorJob still syncs (completed + photos), so
  // the admin board is left stuck at "assigned"/0 photos (e.g. SO-2606-82754:
  // contractor completed with 15 photos, admin frozen at assigned). This admin-
  // side pass reconciles any synced ContractorJob into its linked admin Job.
  // Idempotent: it only writes when content actually differs (photo stems, status,
  // service report), so once mirrored it produces no further updates and can't loop.
  // ponytail: additive photo merge (never deletes) + advance-only status. The
  // contractor-device path still owns deletes/downgrades; this only fills gaps.
  useEffect(() => {
    // Skip while an admin is impersonating a contractor (read-only view, no writes).
    // Real contractor sessions are staff-User-less and carry no admin jobs anyway.
    if (isImpersonating) return;
    const VALID = new Set(['before', 'after', 'serial', 'process', 'parts', 'progress', 'ppe', 'voltage', 'old_serial', 'string_voltage', 'cabinet_old', 'cabinet_new', 'new_serial', 'inv_overview']);
    const STALE_ADMIN = new Set<JobStatus>(['new', 'assigned', 'in_progress']);

    const jobsById = new Map(data.jobs.map(j => [j.id, j]));
    const patches = new Map<string, Job>();

    for (const cj of contractorJobs) {
      if (!cj.sourceJobId) continue;
      const adminJob = jobsById.get(cj.sourceJobId);
      if (!adminJob) continue;

      // New contractor photos (Storage URLs only; base64 lives in IDB and is
      // mirrored once it has an https URL). Dedupe by URL stem against existing,
      // and NEVER re-import a stem the admin explicitly deleted (cj.photos has no
      // tombstones, so without this ledger a deleted/cleaned photo resurrects here).
      const existing = adminJob.woPhotos ?? [];
      const seen = new Set(existing.map(p => photoUrlStem(p.storageUrl || p.dataUrl || '')).filter(Boolean));
      const removedStems = new Set(adminJob.deletedPhotoStems ?? []);
      const newPhotos: import('./types').WOPhoto[] = [];
      for (const [cat, urls] of Object.entries(cj.photos ?? {})) {
        for (const url of (urls ?? [])) {
          if (!url || !url.startsWith('http')) continue;
          const stem = photoUrlStem(url);
          if (stem && (seen.has(stem) || removedStems.has(stem))) continue;
          if (stem) seen.add(stem);
          newPhotos.push({
            id: `cp-${cat}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            category: (VALID.has(cat) ? cat : 'process') as import('./types').WOPhoto['category'],
            name: `${cat} photo`, dataUrl: '', storageUrl: url, createdAt: new Date().toISOString(),
          });
        }
      }

      // Completion is driven by completedAt, NOT status: 'on_hold' is an orthogonal
      // parking flag (not a status), so a completed-then-parked WO still carries
      // completedAt and must read as completed on the admin side. Advance only when
      // the admin Job is still behind so we never downgrade an invoiced/paid order.
      const isCompleted = cj.status === 'completed' || !!cj.completedAt;
      const liveStatus: (WOStatus & JobStatus) | null = isCompleted ? 'completed'
        : (cj.status === 'en_route' || cj.status === 'in_progress') ? 'in_progress' : null;
      const advance = !!liveStatus && STALE_ADMIN.has(adminJob.status) && liveStatus !== adminJob.status;
      const note = (cj.operationalNotes ?? cj.completionNotes ?? '').trim();
      const needReport = !!note && note !== (adminJob.serviceReport ?? '').trim();
      // NOTE: On Hold is admin-owned (orthogonal parking flag). We deliberately do
      // NOT mirror a contractor's on_hold here, a completed WO shouldn't be force-
      // parked on the staff board, and the office controls hold state.

      if (newPhotos.length === 0 && !advance && !needReport) continue;

      const updated: Job = { ...adminJob, updatedAt: new Date().toISOString() };
      if (newPhotos.length) updated.woPhotos = [...existing, ...newPhotos];
      if (advance && liveStatus) {
        updated.status = liveStatus;
        updated.woStatus = liveStatus;
        if (liveStatus === 'completed') updated.completedAt = adminJob.completedAt || cj.completedAt || new Date().toISOString();
      }
      updated.contractorJobStatus = cj.status ?? adminJob.contractorJobStatus;
      if (needReport) updated.serviceReport = note;
      if (cj.serviceStatus && cj.serviceStatus !== adminJob.serviceStatus) updated.serviceStatus = cj.serviceStatus;

      patches.set(adminJob.id, stampJobFields(adminJob, updated));
      logChange('job.field_update', 'job', adminJob.id, {
        source: 'contractor-reconcile', cjId: cj.id, photosAdded: newPhotos.length, advanced: advance,
      }, data.currentUser?.email ?? 'system');
    }

    if (patches.size === 0) return;
    setData(prev => {
      const next = { ...prev, jobs: prev.jobs.map(j => patches.get(j.id) ?? j) };
      saveData(next);
      return next;
    });
  }, [contractorJobs, data.jobs, isImpersonating]);

  // remote-update handler is now inside useSyncEngine above

  // Run billing timers once on mount
  useEffect(() => {
    if (data.jobs.length === 0) return;
    const { jobs: processed, newNotifications } = processBillingTimers(data.jobs);
    const hasJobChanges = processed.some((j, i) => JSON.stringify(j) !== JSON.stringify(data.jobs[i]));
    if (hasJobChanges || newNotifications.length > 0) {
      setData(prev => ({
        ...prev,
        jobs: processed,
        notifications: [...(prev.notifications || []), ...newNotifications],
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist current view
  useEffect(() => {
    localStorage.setItem('solarflow_current_view', currentView);
  }, [currentView]);

  // Restore Supabase staff session on load and listen for auth state changes
  useEffect(() => {
    // Contractor session takes priority, check it before Supabase
    if (sessionStorage.getItem('solarflow_contractor_mode') === 'true') {
      const contractorId = sessionStorage.getItem('solarflow_contractor_id');
      const allContractors = loadContractors();
      const contractor = contractorId ? allContractors.find(c => c.id === contractorId) ?? null : null;
      setCurrentContractor(contractor);
      setIsContractorMode(true);
      setIsAuthenticated(true);
      // Still subscribe to auth events but skip session restore
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY') setShowResetPassword(true);
        else if (event === 'SIGNED_OUT') {
          setIsAuthenticated(false);
          setIsContractorMode(false);
          setCurrentContractor(null);
          setCurrentView('dashboard');
        }
      });
      return () => subscription.unsubscribe();
    }

    // Check for existing Supabase session (e.g., page refresh)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const meta = session.user.user_metadata ?? {};
        // CRITICAL ACCESS CONTROL: role is the source of truth. A pure contractor
        // (role === 'contractor') must NEVER be set up as staff, even when the
        // fragile sessionStorage contractor flag is gone (mobile Safari drops it
        // on tab reopen). Route the durable Supabase session straight to the
        // contractor portal, or sign out if no approved contractor record matches.
        if (isContractorAccount(meta)) {
          const decision = resolveSessionRoute(meta, session.user.email ?? '', loadContractors());
          if (decision.route === 'contractor') {
            const linked = loadContractors().find(c => c.id === decision.contractorId) ?? null;
            sessionStorage.setItem('solarflow_contractor_mode', 'true');
            sessionStorage.setItem('solarflow_contractor_id', decision.contractorId);
            setCurrentContractor(linked);
            setIsContractorMode(true);
            setIsAuthenticated(true);
          } else {
            // Contractor token but no approved record on this device, deny access.
            supabase.auth.signOut();
          }
          return;
        }
        const user: User = {
          id: session.user.id,
          name: meta['name'] ?? session.user.email ?? 'Staff',
          email: session.user.email ?? '',
          phone: meta['phone'] ?? '',
          role: meta['role'] ?? 'admin',
          active: true,
          username: meta['username'] ?? '',
          // Restore avatar from user_metadata so it shows on page load/refresh
          avatar: (meta['avatar_url'] as string | undefined) ?? undefined,
        };
        setData(prev => ({ ...prev, currentUser: user }));
        setIsAuthenticated(true);
        fetchStaffUsers().then(users => {
          if (users.length > 0) setData(prev => ({
            ...prev,
            // Merge: keep locally-set avatars that the API doesn't return yet
            // (avatar lives in user_metadata.avatar_url; API populates it too,
            // but guard against a race where metadata hasn't propagated yet).
            users: users.map(u => {
              const existing = prev.users.find(e => e.id === u.id);
              return (u.avatar || !existing?.avatar) ? u : { ...u, avatar: existing.avatar };
            }),
          }));
        });
        // Flush any change log entries that were queued while offline
        flushChangeLog().catch((e) => console.error('[App] flushChangeLog failed', e));
        // Load Supabase notifications, start polling + Realtime sub for instant delivery
        setupNotifications(user.id);
        // Subscribe to Web Push (Tier 3 badge) - pass token from restored session
        subscribeToPush(session?.access_token);
        // Restore dual-role contractor link on session resume
        const linked = findLinkedContractor(loadContractors(), user.email);
        if (linked) setLinkedContractor(linked);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setShowResetPassword(true);
      } else if (event === 'SIGNED_OUT') {
        setIsAuthenticated(false);
        setIsContractorMode(false);
        setCurrentContractor(null);
        setCurrentView('dashboard');
        stopNotificationPolling();
        unsubscribeFromNotifications();
      } else if (event === 'TOKEN_REFRESHED' && session) {
        // Session refreshed silently, no action needed
      }
    });

    return () => {
      subscription.unsubscribe();
      stopNotificationPolling();
      unsubscribeFromNotifications();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle window resize for mobile detection
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Register service worker for Web Push (Tier 3). Safe no-op in dev/unsupported browsers.
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
    }
  }, []);

  // Computed values
  const currentUser = data.currentUser;

  // Unread mention count drives favicon badge + tab title
  const unreadMentions = useMemo(
    () => (data.notifications || []).filter(
      n => n.userId === currentUser?.id && !n.read && n.type === 'mention',
    ).length,
    [data.notifications, currentUser?.id],
  );
  useUnreadBadge(unreadMentions);

  // Memoized heavy filters, recompute only when the source arrays change.
  // With 400+ customers and frequent re-renders, these were running on every
  // keystroke in search boxes and every kanban drag.
  const unbilledCount = useMemo(
    () => data.jobs.filter(j => j.status === 'completed').length,
    [data.jobs],
  );

  // Get selected job details
  const selectedJob = selectedJobId
    ? data.jobs.find((j) => j.id === selectedJobId)
    : null;
  const selectedCustomer = selectedJob
    ? data.customers.find((c) => c.id === selectedJob.customerId)
    : null;

  // Auth handlers
  const handleLogin = async (user: User, forcePasswordChange = false) => {
    sessionStorage.removeItem('solarflow_contractor_mode');
    setData(prev => ({ ...prev, currentUser: user }));
    setIsAuthenticated(true);
    setIsContractorMode(false);
    if (forcePasswordChange) { setMustChangePassword(true); return; }
    // Get session for Web Push subscription (avoids race condition in subscribeToPush)
    const { data: { session } } = await supabase.auth.getSession();
    fetchStaffUsers().then(users => {
      if (users.length > 0) setData(prev => ({
        ...prev,
        users: users.map(u => {
          const existing = prev.users.find(e => e.id === u.id);
          return (u.avatar || !existing?.avatar) ? u : { ...u, avatar: existing.avatar };
        }),
      }));
    });
    // Wire up the bell on fresh login (resume path does this separately).
    setupNotifications(user.id);
    // Subscribe to Web Push (Tier 3 badge) - pass token to avoid race condition
    if (session?.access_token) subscribeToPush(session.access_token);
    if (user.role === 'sales') {
      setCurrentView('crm');
    }
    // Detect dual-role: staff user linked to a contractor via email or altEmails
    setLinkedContractor(findLinkedContractor(loadContractors(), user.email));
  };

  const handleContractorLogin = (contractor: Contractor) => {
    sessionStorage.setItem('solarflow_contractor_mode', 'true');
    sessionStorage.setItem('solarflow_contractor_id', contractor.id);
    setCurrentContractor(contractor);
    setIsAuthenticated(true);
    setIsContractorMode(true);
    if (contractor.mustChangePassword) {
      setMustChangePassword(true);
    }
  };

  const handleLogout = async () => {
    sessionStorage.removeItem('solarflow_session');
    sessionStorage.removeItem('solarflow_user_id');
    sessionStorage.removeItem('solarflow_contractor_mode');
    sessionStorage.removeItem('solarflow_contractor_id');
    if (!isContractorMode) {
      await supabase.auth.signOut();
    }
    // Reload on sign-out so the next session always starts on the latest bundle.
    // index.html is no-cache on Vercel, so a reload guarantees fresh assets.
    window.location.reload();
  };

  const handleMarkNotificationRead = (id: string) => {
    setData(prev => ({
      ...prev,
      notifications: prev.notifications.map(n => n.id === id ? { ...n, read: true } : n),
    }));
    markNotificationReadRemote(id).catch((e) => console.error('[App] markNotificationReadRemote failed', e));
  };

  const handleMarkAllNotificationsRead = () => {
    setData(prev => ({
      ...prev,
      notifications: prev.notifications.map(n => ({ ...n, read: true })),
    }));
    markAllNotificationsReadRemote().catch((e) => console.error('[App] markAllNotificationsReadRemote failed', e));
  };

  // Merge Supabase notifications into local state (dedup by id)
  const mergeRemoteNotifications = (remoteNotifs: AppNotification[]) => {
    setData(prev => {
      const localIds = new Set(prev.notifications.map(n => n.id));
      const newOnes = remoteNotifs.filter(n => !localIds.has(n.id));
      // Also update read status for existing ones that were marked read remotely
      const updated = prev.notifications.map(n => {
        const remote = remoteNotifs.find(r => r.id === n.id);
        return remote && remote.read && !n.read ? { ...n, read: true } : n;
      });
      if (newOnes.length === 0 && updated.every((n, i) => n === prev.notifications[i])) return prev;
      return { ...prev, notifications: [...newOnes, ...updated] };
    });
  };

  // Wire up the bell: initial fetch, 5-min poll, and Realtime INSERT subscription.
  // Both idempotent helpers reset prior state, so this is safe to call on every
  // login (fresh or session resume).
  const setupNotifications = (userId: string) => {
    fetchMyNotifications().then(notifs => {
      if (notifs.length > 0) mergeRemoteNotifications(notifs);
    });
    startNotificationPolling(mergeRemoteNotifications);
    subscribeToNotifications(userId, (notif) => {
      mergeRemoteNotifications([notif]);
    });
  };

  const handleContractorRegister = (contractor: Contractor) => {
    setContractors([...contractors, contractor]);
    setShowRegister(false);
    setCurrentContractor(contractor);
    setIsContractorMode(true);
  };

  const handleContractorStatusUpdate = (contractorId: string, status: ContractorStatus, _reason?: string) => {
    const updated = contractors.map(c => c.id === contractorId ? { ...c, status } : c);
    setContractors(updated);
    saveContractors(updated);
  };

  const handleContractorUpdate = (updated: Contractor) => {
    const next = contractors.map(c => c.id === updated.id ? updated : c);
    setContractors(next);
    saveContractors(next);
  };

  const handleContractorDelete = (contractorId: string) => {
    const next = contractors.filter(c => c.id !== contractorId);
    setContractors(next);
    saveContractors(next);
  };

  // Admin enters the contractor portal as this contractor (read of their data).
  // No sessionStorage write and no Supabase contractor session: the staff session
  // remains active so Exit returns straight to admin.
  const handleViewAsContractor = (contractor: Contractor) => {
    // Switching to the (lazy-loaded) contractor portal swaps out the visible admin
    // UI. Wrap in startTransition so React tolerates the Suspense fallback during a
    // discrete click instead of throwing (React #426).
    startTransition(() => {
      setCurrentContractor(contractor);
      setIsContractorMode(true);
      setIsImpersonating(true);
    });
    window.scrollTo(0, 0);
  };

  const handleExitImpersonation = () => {
    setIsImpersonating(false);
    setIsContractorMode(false);
    setCurrentContractor(null);
    setCurrentView('contractors');
  };

  const handleContractorJobUpdate = (incomingJob: ContractorJob) => {
    // Stamp every contractor-side edit so cross-device merges resolve by
    // last-writer-wins instead of whole-blob clobber (CB-3).
    const updatedJob: ContractorJob = { ...incomingJob, updatedAt: new Date().toISOString() };
    // Persist contractorJobs synchronously so a fast reload doesn't drop the update.
    // Match by id OR by sourceJobId so projected views (cj-view-*) still find their row.
    const existingIdx = contractorJobs.findIndex(j =>
      j.id === updatedJob.id || (updatedJob.sourceJobId && j.sourceJobId === updatedJob.sourceJobId)
    );
    const prevCj = existingIdx >= 0 ? contractorJobs[existingIdx] : undefined;
    const nextContractorJobs = existingIdx >= 0
      ? contractorJobs.map((j, i) => i === existingIdx ? updatedJob : j)
      : [...contractorJobs, updatedJob];
    setContractorJobs(nextContractorJobs);
    saveContractorJobs(nextContractorJobs);

    // Audit the contractor-side write itself (previously unlogged) with a field-
    // level diff and the contractor as the actor, keyed to the admin Job id when
    // linked so it shows in that work order's history.
    logJobChange(
      'job.contractor_update',
      updatedJob.sourceJobId || updatedJob.id,
      prevCj as unknown as Record<string, unknown> | undefined,
      updatedJob as unknown as Record<string, unknown>,
      resolveActor(),
    );

    // ── Phase 1: Full bidirectional mirror to admin-side Job ────────────
    // Mirror ALL field-side data back to admin Job, not just status.
    // This closes the dual-store gap where photos, service reports, parts,
    // and service status written by the contractor never reached the admin record.
    if (updatedJob.sourceJobId) {
      const woStatusMap: Record<string, WOStatus & JobStatus> = {
        en_route: 'in_progress',
        in_progress: 'in_progress',
        completed: 'completed',
      };

      // All 14 contractor photo categories now map 1:1 to admin WOPhoto categories.
      // WOPhoto.category was expanded in Phase 2 to include all 14 values, no
      // more lossy collapse that made PPE/voltage/inverter photos invisible in admin.
      const VALID_WO_CATEGORIES = new Set([
        'before', 'after', 'serial', 'process', 'parts',
        'progress', 'ppe', 'voltage',
        'old_serial', 'string_voltage', 'cabinet_old', 'cabinet_new', 'new_serial', 'inv_overview',
      ]);
      const mapContractorCategory = (cat: string): import('./types').WOPhoto['category'] => {
        if (VALID_WO_CATEGORIES.has(cat)) return cat as import('./types').WOPhoto['category'];
        return 'process'; // fallback for any unknown future category
      };

      // Convert contractor photos (object-of-arrays of URLs) → admin WOPhoto[]
      // After Phase 1, URLs from contractor are Storage URLs (https://…), not base64.
      // Route them to storageUrl so admin renders them from CDN, not inline.
      const contractorPhotosToWoPhotos = (photos: ContractorJob['photos']): import('./types').WOPhoto[] => {
        const out: import('./types').WOPhoto[] = [];
        for (const [cat, urls] of Object.entries(photos)) {
          for (const url of (urls ?? [])) {
            if (!url) continue;
            // NEVER mirror base64 into solarflow_data, that blob overflows localStorage.
            // base64 only lives in React state + IndexedDB (IDB); it will be mirrored
            // here automatically once the IDB background mirror produces an https:// URL.
            if (url.startsWith('data:')) continue;
            const isStorageUrl = url.startsWith('http');
            out.push({
              id: `cp-${cat}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              category: mapContractorCategory(cat),
              name: `${cat} photo`,
              dataUrl: isStorageUrl ? '' : url,
              storageUrl: isStorageUrl ? url : undefined,
              createdAt: new Date().toISOString(),
            });
          }
        }
        return out;
      };

      // Captured from the reconciled (post-delete) photo set inside the updater
      // below, so the fire-and-forget migration reads the FRESH list instead of a
      // stale render-closure `data.jobs` (which could re-add a just-deleted photo).
      let reconciledWoPhotos: import('./types').WOPhoto[] = [];
      setData(prev => {
        const adminJob = prev.jobs.find(j => j.id === updatedJob.sourceJobId);
        if (!adminJob) return prev;

        // Reconcile contractor photos into admin woPhotos. The contractor's photo
        // set is authoritative (every ContractorJob carries the full set via
        // toContractorJobView's union, so it only shrinks on an explicit delete).
        // Previously this MERGED (added only), so a contractor-deleted photo was
        // never removed from woPhotos and reappeared in the view = "delete not
        // working". Now we drop existing admin photos no longer in the
        // contractor's set, then add any new ones.
        const existingWoPhotos = adminJob.woPhotos ?? [];
        const effectiveUrl = (p: import('./types').WOPhoto) => p.storageUrl || p.dataUrl || '';
        const contractorUrlSet = new Set(
          Object.values(updatedJob.photos ?? {}).flat()
            .filter((u): u is string => !!u && !u.startsWith('data:')),
        );
        const keptExisting = existingWoPhotos.filter(p => contractorUrlSet.has(effectiveUrl(p)));
        const keptUrls = new Set(keptExisting.map(effectiveUrl).filter(Boolean));
        // Never re-import a stem the admin explicitly deleted (see deletedPhotoStems).
        const removedStems = new Set(adminJob.deletedPhotoStems ?? []);
        const newPhotos = contractorPhotosToWoPhotos(updatedJob.photos)
          .filter(p => {
            const url = effectiveUrl(p);
            return url && !keptUrls.has(url) && !removedStems.has(photoUrlStem(url));
          });
        // De-dupe by photo stem so the same image saved under two storage keys
        // (.jpg vs .../category/.jpeg) collapses to one stored woPhoto.
        const seenStems = new Set<string>();
        const mergedPhotos = [...keptExisting, ...newPhotos].filter(p => {
          const stem = photoUrlStem(effectiveUrl(p));
          if (!stem || seenStems.has(stem)) return false;
          seenStems.add(stem);
          return true;
        });
        reconciledWoPhotos = mergedPhotos;

        // Build the updated admin job with all mirrored fields
        const statusFields = ['en_route', 'in_progress', 'completed'].includes(updatedJob.status)
          ? {
              woStatus: woStatusMap[updatedJob.status],
              status: woStatusMap[updatedJob.status],
              completedAt: updatedJob.status === 'completed'
                ? (adminJob.completedAt || new Date().toISOString())
                : adminJob.completedAt,
              startedAt: updatedJob.startedAt ?? adminJob.startedAt,
            }
          : {};

        // Surface the contractor's service note as a comment on the job's
        // activity feed so it flows to the Client Card Activity tab (the same
        // aggregation that shows staff SO comments). Append-only with a
        // content-stable id: mergeJobPair unions activityHistory by id, so the
        // SAME note re-synced from another device collapses to one entry instead
        // of spamming the feed on every contractor save.
        const contractorNote = (updatedJob.operationalNotes ?? updatedJob.completionNotes ?? '').trim();
        const prevContractorNote = (adminJob.serviceReport ?? '').trim();
        let woActivityHistory = adminJob.activityHistory ?? [];
        if (contractorNote && contractorNote !== prevContractorNote) {
          let h = 0;
          for (let i = 0; i < contractorNote.length; i++) h = (h * 31 + contractorNote.charCodeAt(i)) | 0;
          const noteId = `cnote-${updatedJob.sourceJobId}-${h >>> 0}`;
          if (!woActivityHistory.some(a => a.id === noteId)) {
            const c = contractors.find(c => c.id === updatedJob.contractorId);
            const cName = c?.businessName ?? c?.contactName ?? 'Contractor';
            woActivityHistory = [
              { id: noteId, type: 'note_added' as const, description: contractorNote,
                timestamp: new Date().toISOString(), userName: cName },
              ...woActivityHistory,
            ];
          }
        }

        const updatedAdminJob = {
          ...adminJob,
          activityHistory: woActivityHistory,
          // Stamp the admin-side mirror too (CB-3): the ContractorJob is stamped
          // above, but the Job row that pushes to Supabase needs its own fresh
          // updatedAt or a stale prior edit time can win the LWW merge and stomp
          // this contractor update on another device.
          updatedAt: new Date().toISOString(),
          ...statusFields,
          // Preserve the contractor's granular live status so the staff board can
          // tell "on route" (en_route) apart from "in progress" (both map to
          // in_progress in the coarse status above).
          contractorJobStatus: updatedJob.status ?? adminJob.contractorJobStatus,
          // Field-side data mirror
          // Use the reconciled set directly (not gated on length) so deleting the
          // last contractor photo actually clears it on the admin side too.
          woPhotos: mergedPhotos,
          serviceReport: updatedJob.operationalNotes ?? updatedJob.completionNotes ?? adminJob.serviceReport,
          serviceStatus: updatedJob.serviceStatus ?? adminJob.serviceStatus,
          requiresFollowUp: updatedJob.requiresFollowUp ?? adminJob.requiresFollowUp,
          nextSteps: updatedJob.nextSteps ?? adminJob.nextSteps,
          completionNotes: updatedJob.completionNotes ?? adminJob.completionNotes,
          // Mileage (PowerCare)
          travelMiles: updatedJob.miles ?? adminJob.travelMiles,
          // ── Full contractor record mirror (Phase D) ────────────────────────
          // Previously these never reached data.jobs, so admin/billing couldn't
          // see contractor-entered parts, labor, signatures, invoice or mileage.
          contractorParts: updatedJob.parts ?? adminJob.contractorParts,
          contractorPartsAmount: updatedJob.partsAmount ?? adminJob.contractorPartsAmount,
          contractorLaborAmount: updatedJob.laborAmount ?? adminJob.contractorLaborAmount,
          markupPercent: updatedJob.markupPercent ?? adminJob.markupPercent,
          signature: updatedJob.signature ?? adminJob.signature,
          clientSignature: updatedJob.clientSignature ?? adminJob.clientSignature,
          signatureDate: updatedJob.signatureDate ?? adminJob.signatureDate,
          contractorInvoiceId: updatedJob.invoiceId ?? adminJob.contractorInvoiceId,
          contractorInvoiceStatus: updatedJob.invoiceStatus ?? adminJob.contractorInvoiceStatus,
          contractorInvoiceSentAt: updatedJob.invoiceSentAt ?? adminJob.contractorInvoiceSentAt,
          contractorInvoiceNumber: updatedJob.contractorInvoiceNumber ?? adminJob.contractorInvoiceNumber,
          mileageCost: updatedJob.mileageCost ?? adminJob.mileageCost,
          mileageCharge: updatedJob.mileageCharge ?? adminJob.mileageCharge,
          contractorPaymentStatus: updatedJob.paymentStatus ?? adminJob.contractorPaymentStatus,
          contractorTotalPay: updatedJob.contractorTotalPay ?? adminJob.contractorTotalPay,
          assignedAt: updatedJob.assignedAt ?? adminJob.assignedAt,
          // On Hold mirrors the contractor's parked state. It is an orthogonal flag
          // (the underlying woStatus stage is preserved above), so a held order drops
          // out of the active queue on both sides until resumed.
          onHold: updatedJob.status === 'on_hold',
          onHoldAt: updatedJob.status === 'on_hold'
            ? (adminJob.onHoldAt || new Date().toISOString())
            : undefined,
        };

        const next = {
          ...prev,
          jobs: prev.jobs.map(j => j.id === updatedJob.sourceJobId ? stampJobFields(adminJob, updatedAdminJob) : j),
        };
        saveData(next);

        // Audit log for contractor-originated field update
        logChange('job.field_update', 'job', updatedJob.sourceJobId!, {
          source: 'contractor',
          contractorId: updatedJob.contractorId,
          fieldsUpdated: Object.keys(statusFields).concat(
            newPhotos.length > 0 ? ['woPhotos'] : [],
            updatedJob.serviceStatus ? ['serviceStatus'] : [],
            updatedJob.operationalNotes || updatedJob.completionNotes ? ['serviceReport'] : [],
          ),
        }, data.currentUser?.email ?? updatedJob.contractorId);

        return next;
      });

      // Fire-and-forget: migrate inline contractor photos into IndexedDB AND
      // write the resulting photoStoreId references back to admin Job.woPhotos.
      // Without the write-back, every contractor save would re-migrate the same
      // blobs (wasted work, no correctness loss but slows things down).
      const sourceJobId = updatedJob.sourceJobId;
      void (async () => {
        try {
          // Use the freshly reconciled set, NOT a stale render-closure read.
          const woPhotos = reconciledWoPhotos;
          if (woPhotos.length === 0) return;
          const migrated = await migrateWoPhotos(sourceJobId!, woPhotos);
          // If any new photoStoreId rewrites happened, persist them.
          const hadRewrites = migrated.some((p, i) =>
            p.photoStoreId && !woPhotos[i].photoStoreId
          );
          if (hadRewrites) {
            setData(prev => {
              const next = {
                ...prev,
                jobs: prev.jobs.map(j =>
                  j.id === sourceJobId ? { ...j, woPhotos: migrated } : j
                ),
              };
              saveData(next);
              return next;
            });
          }
        } catch (e) {
          console.error('[App] contractor photo migration failed', sourceJobId, e);
        }
      })();
    }
    // Notify admins when the work order transitions to started, left-site
    // (documentation), or completed. Transition-guarded against prevCj so later
    // saves of an already-completed job (photo sweeps, report edits) do not
    // re-fire the alert. Manual buttons and the arrival/departure geofence both
    // land here, one notify path.
    const startedNow = updatedJob.status === 'in_progress' && prevCj?.status !== 'in_progress';
    const leftSiteNow = updatedJob.status === 'documentation' && prevCj?.status !== 'documentation';
    const completedNow = updatedJob.status === 'completed' && prevCj?.status !== 'completed';
    if (startedNow || leftSiteNow || completedNow) {
      const adminUserIds = ['user-1', 'user-3', 'user-4'];
      const message = completedNow
        ? `${updatedJob.serviceType} completed by contractor for ${updatedJob.customerName} at ${updatedJob.address}, ${updatedJob.city}`
        : leftSiteNow
          ? `Contractor left site for ${updatedJob.serviceType} at ${updatedJob.address}, ${updatedJob.city} (${updatedJob.customerName}). Service report pending.`
          : `${updatedJob.serviceType} started by contractor for ${updatedJob.customerName} at ${updatedJob.address}, ${updatedJob.city}`;
      const newNotifs: AppNotification[] = adminUserIds.map(uid => ({
        id: `notif-${Date.now()}-${uid}-${Math.random().toString(36).slice(2, 6)}`,
        userId: uid,
        // 'mention' reused for the start/left-site alerts (same precedent as
        // the auto-schedule FYI) to avoid widening the AppNotification union.
        type: completedNow ? ('contractor_completed' as const) : ('mention' as const),
        title: completedNow ? 'Work Order Completed' : leftSiteNow ? 'Contractor Left Site' : 'Work Order Started',
        message,
        relatedJobId: updatedJob.sourceJobId || updatedJob.id,
        relatedContractorId: updatedJob.contractorId,
        read: false,
        createdAt: new Date().toISOString(),
      }));
      setData(prev => ({
        ...prev,
        notifications: [...(prev.notifications || []), ...newNotifs],
      }));
      // Best-effort push/email to the admin team via /api/notify (prod).
      void fireMentionNotifications({
        mentionedUserIds: adminUserIds,
        notifierName: currentContractor?.contactName || currentContractor?.businessName || 'Contractor',
        context: `${serviceOrderNo(updatedJob.woNumber)} ${updatedJob.customerName}`,
        contextId: updatedJob.sourceJobId || updatedJob.id,
        contextType: 'workOrder',
        message,
      }).catch(e => console.error('[contractor] status notify failed', e));
    }
  };

  // Contractor proposes their own service date/time from the portal. This writes
  // the schedule onto the Service Order, drops a visible @mention note into the
  // SO team conversation, and pings the office (Cruz + Cesar) so they can contact
  // the client to confirm. (Client contact is manual for now; to be automated.)
  const handleContractorProposeSchedule = (cjob: ContractorJob, dateISO: string, time: string) => {
    const adminJob = data.jobs.find(j => j.id === (cjob.sourceJobId ?? cjob.id));
    if (!adminJob || !dateISO) return;

    // Office recipients = Cesar + Cruz (cruxfernndez). A real contractor session
    // cannot load the staff user list (/api/users is staff-only), so resolve from
    // data.users when present but ALWAYS include the known fallback IDs so the bell
    // still fires from a contractor device. Cesar = user-1 (Daniel=user-3,
    // Anthony=user-4 per billingService ADMIN_USER_IDS).
    const OFFICE_FALLBACK_IDS = ['user-1']; // Cesar Jurado
    const matchedIds = data.users
      .filter(u => /\bcesar\b|\bcruz\b|cruxfernndez/i.test(`${u.name} ${u.username ?? ''}`))
      .map(u => u.id);
    const recipientIds = Array.from(new Set([...matchedIds, ...OFFICE_FALLBACK_IDS]));
    const contractorName = currentContractor?.contactName || currentContractor?.businessName || 'The contractor';
    const when = `${dateISO}${time ? ` at ${time}` : ''}`;
    const nowIso = new Date().toISOString();

    // ── Auto-confirm: the contractor's proposed date becomes the booked
    // appointment with no manual office step. If the order is still at a
    // pre-dispatch stage, advance it to the scheduled/assigned stage so the
    // confirmed date locks it into the pipeline (mirror of the assign auto-dispatch).
    const PRE_DISPATCH_WO = new Set(['draft', 'quote_sent', 'contact_client', 'quote_approved']);
    const needsAdvance = !adminJob.woStatus || PRE_DISPATCH_WO.has(adminJob.woStatus) || adminJob.status === 'new';
    const advanced = needsAdvance
      ? { woStatus: 'scheduled' as WOStatus, status: 'assigned' as JobStatus,
          contractorSentAt: adminJob.contractorSentAt ?? nowIso }
      : {};

    // Client-facing confirmation, logged on the order activity feed (this surfaces
    // on the customer card Activity tab). Records that the appointment was
    // auto-confirmed with the client.
    const clientNote: Activity = {
      id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'note_added',
      description: `Appointment auto-confirmed with ${cjob.customerName} for ${when} (scheduled by ${contractorName}). Client notified of the confirmed date.`,
      timestamp: nowIso,
      userId: cjob.contractorId,
      userName: contractorName,
    };

    // Office FYI (no action required) - mentions still fire the bell so the office
    // is aware, but the client no longer needs a manual confirmation call.
    const officeNote: Activity = {
      id: `activity-${Date.now() + 1}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'note_added',
      description: `${contractorName} scheduled this call for ${when}. Auto-confirmed and client notified. @cesar @cruz FYI, no action needed.`,
      timestamp: nowIso,
      userId: cjob.contractorId,
      userName: contractorName,
      mentions: recipientIds,
    };

    // Synced in-app bell notification (AppNotification) for each office recipient -
    // this is the same path the contractor-completed alert uses, so it reaches the
    // staff bell across devices without depending on the staff user list.
    const newNotifs: AppNotification[] = recipientIds.map(uid => ({
      id: `notif-${Date.now()}-${uid}-${Math.random().toString(36).slice(2, 6)}`,
      userId: uid,
      type: 'mention' as const,
      title: 'Job auto-scheduled',
      message: `${serviceOrderNo(adminJob.woNumber)} ${cjob.customerName} was auto-confirmed for ${when} by ${contractorName}. Client notified, no action needed.`,
      relatedJobId: adminJob.id,
      relatedContractorId: cjob.contractorId,
      read: false,
      createdAt: nowIso,
    }));

    const updated: Job = {
      ...adminJob,
      ...advanced,
      scheduledDate: dateISO,
      scheduledTime: time,
      contractorScheduleProposedAt: nowIso,
      scheduleConfirmedAt: nowIso,
      updatedAt: nowIso,
      activityHistory: [...(adminJob.activityHistory ?? []), clientNote, officeNote],
    };

    setData(prev => {
      const next = {
        ...prev,
        jobs: prev.jobs.map(j => (j.id === updated.id ? stampJobFields(adminJob, updated) : j)),
        notifications: [...(prev.notifications || []), ...newNotifs],
      };
      saveData(next);
      return next;
    });

    // Record the client confirmation as an outbound CRM interaction when the CRM
    // customer can be resolved (staff session). Best-effort - a contractor session
    // has no CRM store, so guard with try/catch and skip silently. Also resolve
    // the customer's email so we can send the live confirmation.
    let clientEmail = cjob.customerEmail?.trim() || '';
    try {
      const crmCustomers = loadCustomers();
      const crmMatch = crmCustomers.find(c => c.id === adminJob.customerId);
      if (crmMatch) {
        if (!clientEmail) clientEmail = crmMatch.email?.trim() || '';
        const interactions = loadInteractions();
        saveInteractions(addInteraction(
          interactions, crmMatch.id, 'note',
          `Service appointment auto-confirmed for ${when} (${serviceOrderNo(adminJob.woNumber)}, scheduled by ${contractorName}).`,
          cjob.contractorId, contractorName,
          { subject: 'Appointment confirmed', direction: 'outbound' },
        ));
      }
    } catch (e) {
      console.error('[schedule] CRM interaction log skipped', e);
    }

    // Live client confirmation email (Resend via /api/notify, from
    // solar.ops@conexsol.us). Best-effort, non-blocking; no-op without an email.
    if (clientEmail) {
      void sendCustomerAppointmentEmail({
        customerEmail: clientEmail,
        customerName: cjob.customerName,
        when,
        orderNo: serviceOrderNo(adminJob.woNumber),
        contractorName,
      }).then(ok => { if (!ok) console.warn('[schedule] client email not sent'); })
        .catch(e => console.error('[schedule] client email failed', e));
    }

    logChange('job.contractor_schedule_confirmed', 'job', updated.id,
      { scheduledDate: dateISO, scheduledTime: time, autoConfirmed: true, advanced: needsAdvance, recipients: recipientIds },
      currentContractor?.contactName ?? cjob.contractorId);

    // Best-effort: also add to the staff @mention inbox / fire /api/notify (prod).
    void fireMentionNotifications({
      mentionedUserIds: recipientIds,
      notifierName: contractorName,
      context: `${serviceOrderNo(adminJob.woNumber)} ${cjob.customerName}`,
      contextId: adminJob.id,
      contextType: 'workOrder',
      message: `${cjob.customerName} auto-confirmed for ${when}. Client notified, no action needed.`,
    }).catch(e => console.error('[schedule] mention notify failed', e));
  };

  // Handlers
  const handleCreateJob = (job: Partial<Job>): Job => {
    const newJob: Job = {
      id: `job-${Date.now()}`,
      customerId: job.customerId || '',
      technicianId: job.technicianId || '',
      title: job.title || '',
      serviceType: job.serviceType || 'maintenance',
      status: job.status || 'new',
      scheduledDate: job.scheduledDate || job.date || new Date().toISOString().split('T')[0],
      scheduledTime: job.scheduledTime || '09:00',
      notes: job.notes || job.description || '',
      laborHours: job.laborHours || 1,
      laborRate: job.laborRate || 125,
      partsCost: job.partsCost || 0,
      totalAmount: job.totalAmount || 125,
      photos: [],
      createdAt: new Date().toISOString(),
      urgency: job.urgency || job.priority || 'medium',
      isPowercare: job.isPowercare || false,
      // Preserve all WO-extended fields
      woStatus: job.woStatus,
      woNumber: job.woNumber,
      solarEdgeSiteId: job.solarEdgeSiteId,
      solarEdgeClientId: job.solarEdgeClientId,
      siteAddress: job.siteAddress,
      clientName: job.clientName,
      quoteAmount: job.quoteAmount,
      quoteSentAt: job.quoteSentAt,
      quoteApprovedAt: job.quoteApprovedAt,
      contractorId: job.contractorId,
      contractorPayRate: job.contractorPayRate,
      contractorPayUnit: job.contractorPayUnit,
      contractorSentAt: job.contractorSentAt,
      lineItems: job.lineItems,
      woPhotos: job.woPhotos,
      serviceReport: job.serviceReport,
      serviceStatus: job.serviceStatus,
      requiresFollowUp: job.requiresFollowUp,
      nextSteps: job.nextSteps,
    };
    // Stamp all fields at creation (prev=undefined) so a new job carries a full
    // fieldTimes map from the start.
    const stampedNewJob = stampJobFields(undefined, newJob);
    logChange('job.create', 'job', stampedNewJob.id, stampedNewJob, resolveActor());
    setData(prev => {
      const next = { ...prev, jobs: [...prev.jobs, stampedNewJob] };
      saveData(next);
      return next;
    });
    // Don't navigate away when creating from a site panel (WO has solarEdgeSiteId set)
    if (!job.solarEdgeSiteId) setCurrentView('jobs');
    return stampedNewJob;
  };

  // Resolve who performed an action for audit attribution: admin email, else the
  // signed-in contractor's name/id. Never the bare string 'unknown'.
  const resolveActor = (): string =>
    data.currentUser?.email || currentContractor?.contactName || currentContractor?.id || 'system';

  const handleCreateStandaloneRma = (entry: RMAEntry) => {
    setData(prev => {
      const next = { ...prev, standaloneRmas: [...(prev.standaloneRmas ?? []), entry] };
      saveData(next);
      return next;
    });
  };

  const handleUpdateStandaloneRma = (entry: RMAEntry) => {
    setData(prev => {
      const next = {
        ...prev,
        standaloneRmas: (prev.standaloneRmas ?? []).map(e =>
          e.id === entry.id ? { ...entry, updatedAt: new Date().toISOString() } : e),
      };
      saveData(next);
      return next;
    });
  };

  // Assign a set of work orders to a contractor from the Dispatch Map. Routes
  // each through handleUpdateJob so the change is audited, persisted, and
  // auto-mirrored to the contractor's queue (which builds the ContractorJob).
  const handleAssignJobsToContractor = (jobIds: string[], contractorId: string) => {
    const now = new Date().toISOString();
    const ids = new Set(jobIds);
    const targets = data.jobs.filter(j => ids.has(j.id));
    for (const job of targets) {
      handleUpdateJob({ ...job, contractorId, contractorSentAt: job.contractorSentAt ?? now }, 'admin');
    }
  };

  const handleUpdateJob = (incomingJob: Job, role: 'admin' | 'contractor' | 'technician' = 'admin') => {
    // Auto-dispatch: when an admin assigns a contractor to a job that is still at a
    // pre-dispatch stage (draft/new/quote_sent/contact_client/quote_approved), advance
    // it to the Assigned stage (woStatus 'scheduled' -> JobStatus 'assigned') so the
    // contractor sees it IMMEDIATELY. Previously assigning only set contractorId and
    // the admin had to separately advance the job, so newly-assigned jobs stayed
    // invisible to the contractor (the "Jaime can't see Alfonso" bug). Only fires on a
    // NEW assignment (contractor changed) so it never re-advances an intentional edit.
    const PRE_DISPATCH_WO = new Set(['draft', 'quote_sent', 'contact_client', 'quote_approved']);
    const prevForAssign = data.jobs.find(j => j.id === incomingJob.id);
    const newlyAssigned = !!incomingJob.contractorId && incomingJob.contractorId !== prevForAssign?.contractorId;
    const isPreDispatch = !incomingJob.woStatus || PRE_DISPATCH_WO.has(incomingJob.woStatus) || incomingJob.status === 'new';
    const baseJob0: Job = (newlyAssigned && isPreDispatch && role === 'admin')
      ? { ...incomingJob, woStatus: 'scheduled' as WOStatus, status: 'assigned' as JobStatus, contractorSentAt: incomingJob.contractorSentAt ?? new Date().toISOString() }
      : incomingJob;
    // Self-heal duplicate woPhotos on every save (root cause of the 581-photo WO).
    const baseJob: Job = baseJob0.woPhotos && baseJob0.woPhotos.length > 0
      ? { ...baseJob0, woPhotos: dedupeWoPhotos(baseJob0.woPhotos) }
      : baseJob0;
    // Stamp the LWW key (updatedAt) AND per-field edit times against the previous
    // record, so this change wins the merge and, once field-level merge ships
    // (Phase 2), only the fields that actually changed here can win.
    const updatedJob: Job = stampJobFields(prevForAssign, baseJob);
    const newActivity = {
      id: `activity-${Date.now()}`,
      type: 'job_updated' as const,
      description: `Work order ${updatedJob.woNumber ?? updatedJob.id} updated, ${updatedJob.serviceType} · ${updatedJob.status}`,
      timestamp: new Date().toISOString(),
    };
    // Field-level audit: log WHAT changed (before→after) and WHO, not a blind snapshot.
    const prevJob = data.jobs.find(j => j.id === updatedJob.id) as unknown as Record<string, unknown> | undefined;
    logJobChange(
      role === 'contractor' ? 'job.contractor_update' : role === 'technician' ? 'job.tech_update' : 'job.update',
      updatedJob.id, prevJob, updatedJob as unknown as Record<string, unknown>, resolveActor(),
    );
    setData(prev => {
      const next = {
        ...prev,
        jobs: prev.jobs.map((j) => (j.id === updatedJob.id ? updatedJob : j)),
        customers: prev.customers.map((c) =>
          c.id === updatedJob.customerId
            ? { ...c, activityHistory: [newActivity, ...(c.activityHistory || [])] }
            : c
        ),
      };
      saveData(next);
      return next;
    });

    // Auto-mirror to contractor side: if a contractor is assigned and no
    // ContractorJob exists yet for this admin Job, create one. Previously the
    // ContractorJob was only built when the user advanced status to
    // 'quote_approved' (ServiceOrderPanel.tsx:651), so simply assigning a
    // contractor + saving left the contractor side empty.
    if (updatedJob.contractorId) {
      const mirrorCust = data.customers.find(c => c.id === updatedJob.customerId);
      const alreadyMirrored = contractorJobs.some(cj => cj.sourceJobId === updatedJob.id);
      if (!alreadyMirrored) {
        const mirror: ContractorJob = {
          id: `cj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          sourceJobId: updatedJob.id,
          contractorId: updatedJob.contractorId,
          customerId: updatedJob.customerId,
          // Client number (US-1XXXX) - contractors need this for invoices. Prefer customer record, fall back to job's solarEdgeClientId
          clientId: mirrorCust?.clientId ?? updatedJob.clientId ?? updatedJob.solarEdgeClientId,
          customerName: updatedJob.clientName ?? '',
          customerPhone: mirrorCust?.phone ?? '',
          customerEmail: mirrorCust?.email,
          address: mirrorCust?.address || updatedJob.siteAddress || '',
          city: mirrorCust?.city ?? '', state: mirrorCust?.state ?? 'FL', zip: mirrorCust?.zip ?? '',
          latitude: 0, longitude: 0,
          serviceType: updatedJob.serviceType,
          description: updatedJob.notes || updatedJob.title || `Work Order ${updatedJob.woNumber ?? updatedJob.id}`,
          priority: (updatedJob.urgency === 'critical' ? 'critical'
                  : updatedJob.urgency === 'high' ? 'high'
                  : updatedJob.urgency === 'medium' ? 'normal' : 'low'),
          status: 'assigned',
          isRecurringClient: !!updatedJob.isRecurringClient,
          urgency: (updatedJob.urgency as ContractorJob['urgency']) ?? 'medium',
          isPowercare: !!updatedJob.isPowercare,
          scheduledDate: updatedJob.scheduledDate,
          scheduledTime: updatedJob.scheduledTime,
          estimatedDuration: 120,
          assignedAt: new Date().toISOString(),
          notes: updatedJob.notes,
          photos: { before: [], serial: [], parts: [], process: [], after: [], progress: [], ppe: [], voltage: [], old_serial: [], string_voltage: [], cabinet_old: [], cabinet_new: [], new_serial: [], inv_overview: [] },
          parts: [],
          laborAmount: 0,
          partsAmount: 0,
          markupPercent: 0,
          totalAmount: updatedJob.quoteAmount ?? updatedJob.totalAmount ?? 0,
          contractorPayRate: updatedJob.contractorPayRate ?? 0,
          contractorPayUnit: (updatedJob.contractorPayUnit as 'hour' | 'flat') ?? 'flat',
          contractorTotalPay: (updatedJob.contractorPayRate ?? 0) * ((updatedJob.contractorPayUnit ?? 'flat') === 'flat' ? 1 : (updatedJob.laborHours ?? 1)),
          paymentStatus: 'pending',
          payRate: updatedJob.contractorPayRate ?? 0,
          payUnit: (updatedJob.contractorPayUnit as 'hour' | 'flat') ?? 'flat',
          totalPay: (updatedJob.contractorPayRate ?? 0) * ((updatedJob.contractorPayUnit ?? 'flat') === 'flat' ? 1 : (updatedJob.laborHours ?? 1)),
        };
        const nextCj = [...contractorJobs, mirror];
        setContractorJobs(nextCj);
        saveContractorJobs(nextCj);
        logChange('contractor_job.create', 'contractor_job', mirror.id, mirror, data.currentUser?.email ?? 'unknown');
      } else {
        // Already mirrored, keep contractor row in sync with admin edits (assignment / schedule / scope).
        const nextCj = contractorJobs.map(cj => cj.sourceJobId === updatedJob.id
          ? { ...cj,
              contractorId: updatedJob.contractorId!,
              // Client number (US-1XXXX) - sync from customer record if available
              clientId: mirrorCust?.clientId ?? updatedJob.clientId ?? updatedJob.solarEdgeClientId ?? cj.clientId,
              address: mirrorCust?.address || updatedJob.siteAddress || cj.address,
              city:    mirrorCust?.city ?? cj.city,
              state:   mirrorCust?.state ?? cj.state,
              zip:     mirrorCust?.zip ?? cj.zip,
              scheduledDate: updatedJob.scheduledDate,
              scheduledTime: updatedJob.scheduledTime,
              serviceType: updatedJob.serviceType,
              description: updatedJob.notes || updatedJob.title || cj.description,
              isPowercare: !!updatedJob.isPowercare,
              totalAmount: updatedJob.quoteAmount ?? updatedJob.totalAmount ?? cj.totalAmount,
              contractorPayRate: updatedJob.contractorPayRate ?? cj.contractorPayRate,
              contractorPayUnit: (updatedJob.contractorPayUnit as 'hour' | 'flat') ?? cj.contractorPayUnit,
            }
          : cj);
        setContractorJobs(nextCj);
        saveContractorJobs(nextCj);
      }
    }
    // Fire-and-forget: offload any inline photo data URLs to IndexedDB so the
    // localStorage blob doesn't bloat past quota. Runs after the synchronous
    // save above, so the user's edit is already persisted; this just shrinks
    // the next saved blob.
    if (updatedJob.woPhotos && updatedJob.woPhotos.length > 0) {
      void (async () => {
        try {
          const migrated = await migrateWoPhotos(updatedJob.id, updatedJob.woPhotos);
          if (migrated.some((p, i) => p.photoStoreId && !updatedJob.woPhotos![i].photoStoreId)) {
            setData(prev => {
              const next = {
                ...prev,
                jobs: prev.jobs.map((j) => (j.id === updatedJob.id ? { ...j, woPhotos: migrated } : j)),
              };
              saveData(next);
              return next;
            });
          }
        } catch (e) {
          console.error('[App] photo migration failed for job', updatedJob.id, e);
        }
      })();
    }
  };

  const handleDeleteJob = (jobId: string) => {
    logChange('job.delete', 'job', jobId,
      { deleted: true, snapshot: data.jobs.find(j => j.id === jobId) ?? null },
      data.currentUser?.email ?? 'unknown');
    // Tombstone so realtime/sync cannot resurrect this job from a stale remote row.
    markJobDeleted(jobId);
    setData(prev => {
      const next = { ...prev, jobs: prev.jobs.filter((j) => j.id !== jobId) };
      saveData(next);
      return next;
    });
  };

  const handleCreateCustomer = (customer: Partial<Customer>) => {
    const newCustomer: Customer = {
      id: `cust-${Date.now()}`,
      name: customer.name || '',
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email || '',
      phone: customer.phone || '',
      address: normalizeStreetOrder(customer.address || ''),
      city: customer.city || '',
      state: customer.state || 'FL',
      zip: customer.zip || '',
      type: customer.type || 'residential',
      notes: customer.notes || '',
      clientId: customer.clientId,
      clientStatus: customer.clientStatus,
      category: customer.category,
      systemType: customer.systemType,
      referralSource: customer.referralSource,
      howFound: customer.referralSource,
      isPowerCare: customer.isPowerCare,
      solarEdgeSiteId: customer.solarEdgeSiteId,
      createdAt: customer.createdAt || new Date().toISOString(),
    };
    // Log before state update, append-only audit trail
    logChange('customer.create', 'customer', newCustomer.id, newCustomer,
      data.currentUser?.email ?? 'unknown');

    // Use prev => pattern to avoid stale-closure data loss
    setData(prev => {
      const next = { ...prev, customers: [...prev.customers, newCustomer] };
      // Immediate synchronous save, never rely solely on the 500ms debounce
      saveData(next);
      return next;
    });
  };

  const handleUpdateCustomer = (rawCustomer: Customer) => {
    // Write-path guard: no customer save may persist a SolarEdge European-order
    // address (street name before house number). Devices holding stale data
    // re-push the whole record on unrelated edits, which is how corrected
    // addresses regressed; normalizing here self-heals on every save.
    // Stamp updatedAt at EDIT time: the sync stale-write guard compares it
    // against the server copy, so a genuine user edit must carry a fresh time
    // to win, while untouched stale records keep their old stamp and lose.
    const updatedCustomer = {
      ...rawCustomer,
      address: normalizeStreetOrder(rawCustomer.address || ''),
      updatedAt: new Date().toISOString(),
    };
    logChange('customer.update', 'customer', updatedCustomer.id, updatedCustomer,
      data.currentUser?.email ?? 'unknown');

    // When the address changes, cascade it to the customer's jobs (job.siteAddress
    // is what toContractorJobView projects into the contractor WO) and to any
    // already-dispatched contractor work orders, which otherwise hold a stale
    // snapshot taken at dispatch time.
    const prevCust = data.customers.find(c => c.id === updatedCustomer.id);
    const addrChanged = !!prevCust && (
      prevCust.address !== updatedCustomer.address ||
      prevCust.city !== updatedCustomer.city ||
      prevCust.state !== updatedCustomer.state ||
      prevCust.zip !== updatedCustomer.zip
    );
    const fullAddr = [
      updatedCustomer.address,
      updatedCustomer.city,
      [updatedCustomer.state, updatedCustomer.zip].filter(Boolean).join(' '),
    ].filter(Boolean).join(', ');

    setData(prev => {
      const next = {
        ...prev,
        customers: prev.customers.map((c) => (c.id === updatedCustomer.id ? updatedCustomer : c)),
        jobs: addrChanged
          ? prev.jobs.map(j => j.customerId === updatedCustomer.id ? { ...j, siteAddress: fullAddr } : j)
          : prev.jobs,
      };
      saveData(next);
      return next;
    });

    if (addrChanged) {
      setContractorJobs(prev => {
        const nextCj = prev.map(cj => cj.customerId === updatedCustomer.id
          ? {
              ...cj,
              address: updatedCustomer.address || cj.address,
              city:    updatedCustomer.city ?? cj.city,
              state:   updatedCustomer.state ?? cj.state,
              zip:     updatedCustomer.zip ?? cj.zip,
            }
          : cj);
        saveContractorJobs(nextCj);
        return nextCj;
      });
    }
  };

  const handleDeleteCustomer = (customerId: string) => {
    // Log deletion to the audit trail
    logChange('customer.delete', 'customer', customerId, { deleted: true },
      data.currentUser?.email ?? 'unknown');

    // Track deleted IDs so sync/migration never resurrects them
    try {
      const key = 'solarflow_deleted_customer_ids';
      const deleted: string[] = JSON.parse(localStorage.getItem(key) || '[]');
      if (!deleted.includes(customerId)) {
        deleted.push(customerId);
        localStorage.setItem(key, JSON.stringify(deleted));
      }
    } catch (e) { console.error('[App] failed to write deleted-customer tombstone', e); }

    setData(prev => {
      const next = {
        ...prev,
        customers: prev.customers.filter((c) => c.id !== customerId),
        jobs: prev.jobs.filter((j) => j.customerId !== customerId),
      };
      saveData(next);
      return next;
    });
  };

  const handleMergeCustomers = (primaryId: string, secondaryId: string, resolvedFields?: Partial<Customer>) => {
    // Log before setData so we have access to both customer records
    const primary   = data.customers.find(c => c.id === primaryId);
    const secondary = data.customers.find(c => c.id === secondaryId);
    if (primary && secondary) {
      logChange('customer.merge', 'customer', primaryId, {
        primaryId,
        secondaryId,
        primaryName:   `${primary.firstName ?? ''} ${primary.lastName ?? ''}`.trim(),
        secondaryName: `${secondary.firstName ?? ''} ${secondary.lastName ?? ''}`.trim(),
        resolvedFields,
      }, data.currentUser?.email ?? 'unknown');
    }
    // Tombstone the secondary so sync drops its per-record `customer:{id}` row
    // and never resurrects it on the next pull. Without this, the merged-away
    // duplicate re-hydrates from Supabase and the merge "doesn't stick".
    try {
      const key = 'solarflow_deleted_customer_ids';
      const deleted: string[] = JSON.parse(localStorage.getItem(key) || '[]');
      if (!deleted.includes(secondaryId)) {
        deleted.push(secondaryId);
        localStorage.setItem(key, JSON.stringify(deleted));
      }
    } catch (e) { console.error('[App] failed to write merge tombstone', e); }

    setData(prev => {
      const primary = prev.customers.find(c => c.id === primaryId);
      const secondary = prev.customers.find(c => c.id === secondaryId);
      if (!primary || !secondary) return prev;
      const merged: Customer = {
        ...primary,
        // Carry the secondary's name when the primary has none (e.g. a SolarEdge
        // site record with a blank name absorbing a named lead).
        firstName: primary.firstName?.trim() ? primary.firstName : secondary.firstName,
        lastName:  primary.lastName?.trim()  ? primary.lastName  : secondary.lastName,
        email: resolvedFields?.email ?? (primary.email || secondary.email),
        phone: resolvedFields?.phone ?? (primary.phone || secondary.phone),
        address: resolvedFields?.address ?? (primary.address || secondary.address),
        city: resolvedFields?.city ?? (primary.city || secondary.city),
        zip: resolvedFields?.zip ?? (primary.zip || secondary.zip),
        notes: resolvedFields?.notes ?? ([primary.notes, secondary.notes].filter(Boolean).join('\n') || primary.notes),
        category: resolvedFields?.category ?? (primary.category || secondary.category),
        clientStatus: resolvedFields?.clientStatus ?? (primary.clientStatus || secondary.clientStatus),
        solarEdgeSiteId: resolvedFields?.solarEdgeSiteId ?? (primary.solarEdgeSiteId || secondary.solarEdgeSiteId),
        systemType: resolvedFields?.systemType ?? (primary.systemType || secondary.systemType),
        referralSource: resolvedFields?.referralSource ?? (primary.referralSource || secondary.referralSource),
        activityHistory: [...(primary.activityHistory || []), ...(secondary.activityHistory || [])],
        // Stamp the LWW key so the merged record wins the next cross-device merge.
        updatedAt: new Date().toISOString(),
      };
      const next = {
        ...prev,
        customers: prev.customers.filter(c => c.id !== secondaryId).map(c => c.id === primaryId ? merged : c),
        jobs: prev.jobs.map(j => j.customerId === secondaryId ? { ...j, customerId: primaryId } : j),
      };
      // Persist - the previous version only updated React state, so the merge was
      // lost on reload and never pushed to Supabase.
      saveData(next);
      return next;
    });
  };

  const handleViewChange = (view: string, jobId?: string) => {
    setCurrentView(view);
    if (jobId) {
      setSelectedJobId(jobId);
    } else {
      setSelectedJobId(null);
    }
  };

  // SolarEdge API handlers
  const handleSaveSolarEdgeApiKey = (apiKey: string) => {
    setData(prev => {
      const next = {
        ...prev,
        solarEdgeConfig: {
          ...prev.solarEdgeConfig,
          apiKey,
        },
      };
      saveData(next);
      return next;
    });
  };

  // SolarEdge API rate-limit constants
  const SE_SYNC_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes between syncs
  const SE_DAILY_LIMIT = 295;                  // hard cap (SolarEdge allows 300/day)

  const handleSyncSolarEdge = async () => {
    const apiKey = data.solarEdgeConfig.apiKey;

    if (!apiKey) {
      alert('Please enter a SolarEdge API key first');
      return;
    }

    // ── Rate-limit: cooldown check ────────────────────────────────────────────
    const { nextSyncAllowed, dailyCallCount, dailyCallDate } = data.solarEdgeConfig;
    const now = new Date();
    if (nextSyncAllowed && new Date(nextSyncAllowed) > now) {
      const diff = Math.ceil((new Date(nextSyncAllowed).getTime() - now.getTime()) / 60000);
      const hrs = Math.floor(diff / 60);
      const mins = diff % 60;
      const label = hrs > 0 ? `${hrs}h ${mins}m` : `${diff}m`;
      alert(`Please wait ${label} before syncing again.\n\nThe 30-minute cooldown prevents hitting the SolarEdge 300 calls/day limit.`);
      return;
    }

    // ── Rate-limit: daily cap check ───────────────────────────────────────────
    const todayUTC = now.toISOString().slice(0, 10);
    const callsToday = dailyCallDate === todayUTC ? (dailyCallCount ?? 0) : 0;
    if (callsToday >= SE_DAILY_LIMIT) {
      alert(`Daily API call limit reached (${callsToday}/${SE_DAILY_LIMIT} calls used today).\n\nLimit resets at midnight UTC. SolarEdge allows 300 calls/day.`);
      return;
    }

    try {
      // ── Paginate: SolarEdge returns max 100 per request ───────────────────────
      const SE_PAGE = 100;
      let seStartIndex = 0;
      let sites: any[] = [];
      let seTotalCount = 0;

      while (true) {
        const url = `/api/solaredge?path=/sites/list&size=${SE_PAGE}&startIndex=${seStartIndex}`;
        const response = await authedFetch(url);

        if (!response.ok) {
          // Try to extract a JSON error body from the proxy
          let detail = '';
          try { const b = await response.json(); detail = b?.error || JSON.stringify(b); } catch { /* non-JSON */ }
          if (response.status === 401 || response.status === 403) {
            alert(`Invalid API key (HTTP ${response.status}).${detail ? `\n${detail}` : ''}\nPlease check your SolarEdge API key in Settings.`);
            return;
          }
          if (response.status === 404) {
            throw new Error('API proxy not found (404). The /api/solaredge route may not be deployed.');
          }
          throw new Error(`HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
        }

        const result = await response.json();
        if (result.errors) {
          const errorMsg = result.errors?.error?.[0]?.message || 'Unknown API error';
          alert(`SolarEdge API error: ${errorMsg}`);
          return;
        }

        const page: any[] = result.sites?.site || [];
        seTotalCount = result.sites?.count ?? (sites.length + page.length);
        sites = sites.concat(page);
        if (page.length < SE_PAGE || sites.length >= seTotalCount) break;
        seStartIndex += SE_PAGE;
      }
      // ── Filter: Florida portfolio only, drop GT-, USP-, GA-, DELETE, non-FL ──
      sites = sites.filter(isFloridaSite);

      // Match sites with customers and update
      let matchedCount = 0;
      const updatedCustomers = data.customers.map((customer) => {
        const site = sites.find((s: any) => {
          // Match by clientId (US-XXXXX format)
          const siteName = s.name?.toLowerCase() || '';
          const customerName = customer.name?.toLowerCase() || '';
          const clientId = customer.clientId?.replace('US-', '') || '';

          return (
            s.accountId === clientId ||
            siteName.includes(customerName) ||
            customerName.includes(siteName) ||
            // Match by address
            s.location?.address?.toLowerCase()?.includes(customer.address?.toLowerCase() || '')
          );
        });

        if (site) {
          matchedCount++;
          return {
            ...customer,
            solarEdgeSiteId: String(site.id),
          };
        }
        return customer;
      });

      // ── Record this API call against the daily budget ─────────────────────
      const syncedAt = new Date();
      const syncedDateUTC = syncedAt.toISOString().slice(0, 10);
      const newDailyCount =
        data.solarEdgeConfig.dailyCallDate === syncedDateUTC
          ? (data.solarEdgeConfig.dailyCallCount ?? 0) + 1
          : 1;

      // ── Create new customers for sites with no match ──────────────────────
      const flSiteIds = new Set(FL_SITES.map(s => s.siteId));
      const existingSiteIds = new Set(updatedCustomers.map(c => c.solarEdgeSiteId).filter(Boolean));
      const tombstonedIds   = getDeletedCustomerIds(); // never re-add manually deleted sites
      const unmatchedSites: any[] = sites.filter((s: any) =>
        !existingSiteIds.has(String(s.id)) &&
        !tombstonedIds.has(`cust-se-${s.id}`)
      );
      const newCustomersFromSync: Customer[] = unmatchedSites.map((s: any) => ({
        id: `cust-se-${s.id}`,
        name: s.name || `SolarEdge Site ${s.id}`,
        clientId: deriveClientId(s.name, s.accountId),
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        // SolarEdge sends street name before house number; never store raw.
        address: normalizeStreetOrder(s.location?.address || ''),
        city: s.location?.city || '',
        state: s.location?.state || 'FL',
        zip: s.location?.zip || '',
        type: 'commercial' as const,
        notes: `Auto-imported from SolarEdge Florida group on ${new Date().toLocaleDateString()}`,
        solarEdgeSiteId: String(s.id),
        createdAt: new Date().toISOString(),
      }));

      // ── Persist any new sites not in the static FL_SITES list ─────────────
      const existingExtraIds = new Set((data.solarEdgeExtraSites ?? []).map(x => x.siteId));
      const newExtraSites: SolarEdgeExtraSite[] = unmatchedSites
        .filter((s: any) => !flSiteIds.has(String(s.id)) && !existingExtraIds.has(String(s.id)))
        .map((s: any) => ({
          siteId: String(s.id),
          clientId: s.accountId || '',
          siteName: s.name || '',
          address: [s.location?.address, s.location?.city, s.location?.state, s.location?.zip].filter(Boolean).join(', '),
          status: s.status || 'Active',
          peakPower: s.peakPower || 0,
          installDate: s.installationDate || '',
          ptoDate: s.ptoDate || '',
          alerts: 0,
          highestImpact: '0',
          systemType: '',
          module: '',
          todayKwh: s.lastDayData?.energy || 0,
          monthKwh: s.lastMonthData?.energy || 0,
          yearKwh: s.lastYearData?.energy || 0,
          lifetimeKwh: s.lifeTimeData?.energy || 0,
          lastUpdate: s.lastUpdateTime || new Date().toISOString(),
        }));

      // Update customers and solarEdgeConfig
      setData(prev => {
        const next = {
          ...prev,
          customers: [...updatedCustomers, ...newCustomersFromSync].filter(isAllowedCustomer),
          solarEdgeExtraSites: [...(prev.solarEdgeExtraSites ?? []), ...newExtraSites],
          solarEdgeConfig: {
            ...prev.solarEdgeConfig,
            lastSync: syncedAt.toISOString(),
            siteCount: sites.length,
            nextSyncAllowed: new Date(syncedAt.getTime() + SE_SYNC_COOLDOWN_MS).toISOString(),
            dailyCallCount: newDailyCount,
            dailyCallDate: syncedDateUTC,
          },
        };
        saveData(next);
        return next;
      });

      const remaining = SE_DAILY_LIMIT - newDailyCount;
      alert(`Sync complete!\n• ${sites.length} sites in group\n• ${matchedCount} matched to existing customers\n• ${newCustomersFromSync.length} new customers created\n• ${newExtraSites.length} new sites added to monitoring\n\nAPI calls today: ${newDailyCount}/${SE_DAILY_LIMIT} (${remaining} remaining).`);
    } catch (error) {
      console.error('SolarEdge sync error:', error);
      const msg = error instanceof Error ? error.message : String(error);
      alert(`Failed to sync with SolarEdge.\n\n${msg}`);
    }
  };

  // ── Site filter: Conexsol Florida group ──────────────────────────────────
  // The SolarEdge account IS the Florida group, all sites in the account belong.
  // We keep this helper for optional secondary filtering (currently accepts ALL).
  const isFLSite = (_s: any): boolean => true;

  // ── Paginate SolarEdge API ────────────────────────────────────────────────
  const fetchAllSESites = async (_apiKey: string): Promise<any[]> => {
    const PAGE = 100;
    let startIndex = 0;
    let all: any[] = [];
    let totalCount = 0;
    while (true) {
      const response = await authedFetch(
        `/api/solaredge?path=/sites/list&size=${PAGE}&startIndex=${startIndex}`
      );
      if (!response.ok) {
        if (response.status === 401 || response.status === 403)
          throw new Error('Invalid API key, check Settings');
        throw new Error(`SolarEdge API error ${response.status}`);
      }
      const result = await response.json();
      if (result.errors) throw new Error(result.errors?.error?.[0]?.message || 'API error');
      const page: any[] = result.sites?.site || [];
      totalCount = result.sites?.count ?? (all.length + page.length);
      all = all.concat(page);
      if (page.length < PAGE || all.length >= totalCount) break;
      startIndex += PAGE;
    }
    return all;
  };

  // ── Update Florida Sites ─────────────────────────────────────────────────
  // Fetches the live group, filters to FL/US-15 sites, auto-creates Customer
  // records for any site that doesn't already have one, returns a summary.
  const handleUpdateFloridaSites = async (): Promise<{ newCount: number; total: number }> => {
    const apiKey = data.solarEdgeConfig.apiKey;
    if (!apiKey) throw new Error('No SolarEdge API key, add one in Settings');

    const allSites = await fetchAllSESites(apiKey);
    // Only keep FL state or US-15 name prefix sites
    const sites = allSites.filter(isFLSite);

    const flSiteIds      = new Set(FL_SITES.map(s => s.siteId));
    const existingSiteIds = new Set(data.customers.map((c) => c.solarEdgeSiteId).filter(Boolean));
    const existingExtraIds = new Set((data.solarEdgeExtraSites ?? []).map(x => x.siteId));

    const newSites = sites.filter((s: any) => !existingSiteIds.has(String(s.id)));

    const newCustomers: Customer[] = newSites.map((s: any) => ({
      id: `cust-se-${s.id}-${Date.now()}`,
      name: s.name || `SolarEdge Site ${s.id}`,
      firstName: '', lastName: '', email: '', phone: '',
      // SolarEdge sends street name before house number; never store raw.
      address: normalizeStreetOrder(s.location?.address || ''),
      city:    s.location?.city    || '',
      state:   s.location?.state   || 'FL',
      zip:     s.location?.zip     || '',
      type: 'commercial' as const,
      notes: `Auto-imported from SolarEdge Florida group on ${new Date().toLocaleDateString()}`,
      solarEdgeSiteId: String(s.id),
      createdAt: new Date().toISOString(),
    }));

    const newExtraSites: SolarEdgeExtraSite[] = newSites
      .filter((s: any) => !flSiteIds.has(String(s.id)) && !existingExtraIds.has(String(s.id)))
      .map((s: any) => ({
        siteId:       String(s.id),
        clientId:     s.name?.startsWith('US-') ? s.name.split(' ')[0] : (s.accountId || ''),
        siteName:     s.name || '',
        address:      [s.location?.address, s.location?.city, s.location?.state, s.location?.zip].filter(Boolean).join(', '),
        status:       s.status || 'Active',
        peakPower:    s.peakPower || 0,
        installDate:  s.installationDate || '',
        ptoDate:      s.ptoDate || '',
        alerts: 0, highestImpact: '0', systemType: '', module: '',
        todayKwh:    s.lastDayData?.energy   || 0,
        monthKwh:    s.lastMonthData?.energy  || 0,
        yearKwh:     s.lastYearData?.energy   || 0,
        lifetimeKwh: s.lifeTimeData?.energy   || 0,
        lastUpdate:  s.lastUpdateTime || new Date().toISOString(),
      }));

    if (newCustomers.length > 0 || newExtraSites.length > 0) {
      setData((prev) => {
        const next = {
          ...prev,
          customers: [...prev.customers, ...newCustomers],
          solarEdgeExtraSites: [...(prev.solarEdgeExtraSites ?? []), ...newExtraSites],
        };
        saveData(next);
        return next;
      });
    }

    return { newCount: newExtraSites.length, total: sites.length };
  };

  // ── Import Modal Apply ────────────────────────────────────────────────────
  // Called when user clicks "Apply N changes" in SolarEdgeImportModal.
  const handleImportApply = async (accepted: import('./components/SolarEdgeImportModal').DiffItem[]) => {
    // A React state updater must run synchronously, so resolve all address
    // validation (async) up front and stash the results keyed by item.
    type ValidatedLoc = { address: string; city: string; state: string; zip: string };
    const validatedMap = new Map<(typeof accepted)[number], ValidatedLoc>();
    for (const item of accepted) {
      const site = (item.type === 'new' || item.type === 'updated') ? item.site : undefined;
      if (!site) continue;
      const loc = (site.location ?? {}) as { address?: string; city?: string; zip?: string; state?: string };
      // SolarEdge sends street name before house number; fix the order before
      // validating so Nominatim can resolve it and the fallback stays correct.
      const usOrderAddress = normalizeStreetOrder(loc.address || '');
      let validated: ValidatedLoc = {
        address: usOrderAddress,
        city: loc.city || '',
        state: loc.state || 'FL',
        zip: loc.zip || '',
      };
      if (loc.address || loc.city || loc.state || loc.zip) {
        const validation = await validateAddress({
          address: usOrderAddress || undefined,
          city: loc.city,
          state: loc.state,
          zip: loc.zip,
        });
        if (validation.isValid && validation.normalized) {
          validated = {
            address: validation.normalized.address || usOrderAddress,
            city: validation.normalized.city || loc.city || '',
            state: validation.normalized.state || loc.state || 'FL',
            zip: validation.normalized.zip || loc.zip || '',
          };
        }
      }
      validatedMap.set(item, validated);
    }

    setData(prev => {
      let customers = [...prev.customers];
      const flSiteIds = new Set(FL_SITES.map(s => s.siteId));
      // Track ALL extra site IDs (existing + newly added this batch)
      const existingExtraIds = new Set((prev.solarEdgeExtraSites ?? []).map(s => s.siteId));
      const newExtraSites: SolarEdgeExtraSite[] = [];

      for (const item of accepted) {
        if (item.type === 'new' && item.site) {
          const s = item.site;
          const loc = (s.location ?? {}) as { address?: string; city?: string; zip?: string; state?: string };
          const siteId = String(s.id);

          // Address was validated up front (see validatedMap); fall back to raw loc.
          const validatedAddress = validatedMap.get(item) ?? {
            address: normalizeStreetOrder(loc.address || ''),
            city: loc.city || '',
            state: loc.state || 'FL',
            zip: loc.zip || '',
          };

          // ── Dedup guard: skip if any customer already owns this siteId ─────
          // (catches edge cases where buildDiff missed a prior import)
          const alreadyLinked = customers.some(c => c.solarEdgeSiteId === siteId);
          if (!alreadyLinked) {
            // Stable ID, no Date.now() suffix so re-importing never duplicates
            const newC: Customer = {
              id: `cust-se-${s.id}`,
              name: s.name,
              email: '', phone: '',
              address: validatedAddress.address,
              city:    validatedAddress.city,
              state:   validatedAddress.state,
              zip:     validatedAddress.zip,
              type: 'residential' as const,
              notes: `Imported from SolarEdge on ${new Date().toLocaleDateString()}`,
              solarEdgeSiteId: siteId,
              systemType: 'SolarEdge',
              clientStatus: s.status === 'Active' ? 'O&M' : 'Standby',
              createdAt: s.installationDate ? new Date(s.installationDate).toISOString() : new Date().toISOString(),
            };
            customers.push(newC);
          }

          // ── Always ensure extraSites entry so site appears in monitoring ──
          // (even if customer already existed from a pre-fix import that missed this)
          if (!flSiteIds.has(siteId) && !existingExtraIds.has(siteId)) {
            const clientId = s.name?.match(/^(US[\s-]\d+)/i)?.[1] || '';
            newExtraSites.push({
              siteId,
              clientId,
              siteName:    s.name || '',
              address:     [validatedAddress.address, validatedAddress.city, validatedAddress.state, validatedAddress.zip].filter(Boolean).join(', '),
              status:      s.status || 'Active',
              peakPower:   s.peakPower || 0,
              installDate: s.installationDate || '',
              ptoDate:     s.ptoDate || '',
              alerts: 0, highestImpact: '0', systemType: 'SolarEdge', module: '',
              todayKwh: 0, monthKwh: 0, yearKwh: 0, lifetimeKwh: 0,
              lastUpdate: new Date().toISOString(),
            } as SolarEdgeExtraSite);
            existingExtraIds.add(siteId);
          }
        }

        if (item.type === 'updated' && item.site && item.customer && item.changes) {
          const loc = (item.site.location ?? {}) as { address?: string; city?: string; zip?: string; state?: string };
          
          // Address was validated up front (see validatedMap); fall back to raw loc.
          const validatedUpdateAddress = validatedMap.get(item) ?? {
            address: loc.address || '',
            city: loc.city || '',
            state: loc.state || 'FL',
            zip: loc.zip || '',
          };

          customers = customers.map(c => {
            if (c.id !== item.customer!.id) return c;
            const updates: Partial<Customer> = {};
            for (const ch of item.changes!) {
              if (ch.field === 'Name')    updates.name    = ch.to;
              if (ch.field === 'Address') {
                // Validated CRM address PREVAILS: never let a SolarEdge import
                // overwrite an address that is the same street in a different
                // format (order/abbreviations). Only genuinely different
                // addresses get applied - and that overwrite is always logged.
                if (!sameStreetAddress(c.address || '', validatedUpdateAddress.address)) {
                  updates.address = validatedUpdateAddress.address;
                }
              }
              if (ch.field === 'City')    updates.city    = validatedUpdateAddress.city;
              if (ch.field === 'ZIP')     updates.zip     = validatedUpdateAddress.zip;
            }
            // Audit every field the import actually changes, so address
            // regressions are traceable to their source.
            for (const [field, to] of Object.entries(updates)) {
              const from = c[field as keyof Customer];
              if (from !== to) {
                logChange('customer.import_update', 'customer', c.id, {
                  source: 'solaredge-import', field, from, to,
                }, prev.currentUser?.email ?? 'unknown');
              }
            }
            return { ...c, ...updates };
          });
        }

        if (item.type === 'removed' && item.customer) {
          customers = customers.filter(c => c.id !== item.customer!.id);
        }
      }

      // ── Deduplicate customers: if multiple cust-se-* share a siteId, keep newest ─
      const seenSiteIds = new Set<string>();
      const dedupedCustomers = [...customers].reverse().filter(c => {
        if (!c.solarEdgeSiteId) return true;
        if (seenSiteIds.has(c.solarEdgeSiteId)) return false;
        seenSiteIds.add(c.solarEdgeSiteId);
        return true;
      }).reverse();

      // ── Deduplicate extraSites by siteId ──────────────────────────────────
      const allExtra = [...(prev.solarEdgeExtraSites ?? []), ...newExtraSites];
      const seenExtra = new Set<string>();
      const dedupedExtra = allExtra.filter(s => {
        if (seenExtra.has(s.siteId)) return false;
        seenExtra.add(s.siteId);
        return true;
      });

      const next = {
        ...prev,
        customers: dedupedCustomers,
        solarEdgeExtraSites: dedupedExtra,
      };
      saveData(next);
      return next;
    });
  };

  // Loading gate, wait for Neon sync before rendering
  if (!dbReady) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Loading SolarOps...</p>
        </div>
      </div>
    );
  }

  // Password reset screen (arrived via email link)
  if (showResetPassword) {
    return <ResetPasswordScreen onDone={() => {
      setShowResetPassword(false);
      const isContractor = localStorage.getItem('solarops_reset_mode') === 'contractor';
      localStorage.removeItem('solarops_reset_mode');
      window.history.replaceState({}, '', isContractor ? '/?mode=contractor' : '/');
    }} />;
  }

  // Login screen
  if (!isAuthenticated) {
    if (showRegister || pendingInvite) {
      return (
        <ContractorRegister
          onComplete={handleContractorRegister}
          onCancel={() => { setShowRegister(false); setPendingInvite(null); }}
          inviteEmail={pendingInvite?.email}
          inviteToken={pendingInvite?.token}
          invitedBy={pendingInvite?.invitedBy}
        />
      );
    }
    if (loginMode === 'contractor') {
      return (
        <ContractorLoginScreen
          contractors={contractors}
          onContractorLogin={handleContractorLogin}
          onRegister={() => setShowRegister(true)}
          onGoToStaff={() => setLoginMode('staff')}
        />
      );
    }
    return (
      <LoginScreen
        onLogin={handleLogin}
        onGoToContractor={() => setLoginMode('contractor')}
      />
    );
  }

  // Force password change, shown before entering the app (staff or contractor)
  if (mustChangePassword) {
    return (
      <ForceChangePasswordScreen
        isContractor={isContractorMode}
        onDone={async (newPassword) => {
          if (isContractorMode && currentContractor) {
            // Change the real Supabase auth password (contractor login uses
            // signInWithPassword). Without this the forced change was cosmetic:
            // the record updated but the auth password stayed the default.
            await supabase.auth.updateUser({
              password: newPassword,
              data: { mustChangePassword: false },
            });
            // Mirror the cleared flag into the contractor record/store too.
            const { dbGet, dbSet } = await import('./lib/db');
            const contractors = (await dbGet('solarflow_contractors') as Contractor[] | null) ?? [];
            const updated = contractors.map((c: Contractor) =>
              c.id === currentContractor.id ? { ...c, password: newPassword, mustChangePassword: false } : c
            );
            await dbSet('solarflow_contractors', updated);
            setCurrentContractor(prev => prev ? { ...prev, password: newPassword, mustChangePassword: false } : prev);
          }
          setMustChangePassword(false);
          if (!isContractorMode) {
            fetchStaffUsers().then(users => {
              if (users.length > 0) setData(prev => ({
                ...prev,
                users: users.map(u => {
                  const existing = prev.users.find(e => e.id === u.id);
                  return (u.avatar || !existing?.avatar) ? u : { ...u, avatar: existing.avatar };
                }),
              }));
            });
            if (data.currentUser?.role === 'sales') setCurrentView('crm');
          }
        }}
      />
    );
  }

  // Contractor mode
  if (isContractorMode && currentContractor) {
    if (currentContractor.status === 'pending' && !isImpersonating) {
      return (
        <PendingApprovalScreen
          contractor={currentContractor}
          onLogout={handleLogout}
        />
      );
    }

    return (
      <Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="w-8 h-8 border-4 border-orange-400 border-t-transparent rounded-full animate-spin" /></div>}>
        {isImpersonating && (
          <div className="sticky top-0 z-[3000] flex items-center justify-between gap-3 px-4 py-2 bg-amber-500 text-amber-950 text-sm font-semibold shadow-md">
            <span className="flex items-center gap-2 min-w-0">
              <Eye className="w-4 h-4 shrink-0" />
              <span className="truncate">
                Viewing as {currentContractor.contactName} ({currentContractor.businessName}) — read-only preview of their portal
              </span>
            </span>
            <button
              onClick={handleExitImpersonation}
              className="flex items-center gap-1.5 px-3 py-1 bg-amber-950 text-white rounded-lg text-xs font-bold hover:bg-amber-900 transition-colors cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
              Exit preview
            </button>
          </div>
        )}
        <ContractorDashboard
          contractorName={currentContractor.contactName}
          contractorId={currentContractor.id}
          contractor={currentContractor}
          jobs={pickupJobsForContractor(currentContractor.id, data.jobs).map(j => toContractorJobView(j, contractorJobs.find(cj => cj.sourceJobId === j.id), data.customers.find(c => c.id === j.customerId)))}
          onLogout={isImpersonating ? handleExitImpersonation : handleLogout}
          onUpdateJob={isImpersonating ? () => {} : handleContractorJobUpdate}
          onUpdateContractor={isImpersonating ? () => {} : (updated) => {
            setContractors(prev => prev.map(c => c.id === updated.id ? updated : c));
            setCurrentContractor(updated);
          }}
          onSync={isImpersonating ? undefined : deepSync}
          onProposeSchedule={isImpersonating ? undefined : handleContractorProposeSchedule}
        />
      </Suspense>
    );
  }

  // CRITICAL ACCESS CONTROL (defense in depth): a contractor-role user must never
  // reach the staff app. If we somehow have an authenticated contractor session
  // that did not resolve to contractor mode above (e.g. a transient race before
  // the contractor record loaded), block the staff UI entirely instead of leaking
  // admin screens. The session-restore + login guards should prevent ever getting
  // here, this is the last line of defense.
  if ((data.currentUser?.role as string | undefined) === 'contractor') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center bg-slate-50">
        <div className="max-w-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Loading your portal…</h2>
          <p className="text-sm text-slate-600 mb-4">
            This account is a contractor account and does not have access to the staff workspace.
          </p>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium cursor-pointer"
          >
            Back to login
          </button>
        </div>
      </div>
    );
  }

  // Render appropriate view
  const renderView = () => {
    // Sales reps can only access crm, customers2, and lobby
    if (currentUser?.role === 'sales' && !['crm', 'customers2', 'lobby'].includes(currentView)) {
      return <CRMDashboard currentUserId={data.currentUser?.id || 'user-1'} />;
    }

    // Financial views are admin-only, block direct/programmatic access by staff
    if (isFinancialView(currentView) && !canSeeFinancials(currentUser)) {
      return (
        <div className="p-6 max-w-md mx-auto text-center">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Restricted</h2>
          <p className="text-sm text-slate-600 mb-4">
            Financial views are available to administrators only.
          </p>
          <button
            onClick={() => setCurrentView('dashboard')}
            className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium"
          >
            Back to Dashboard
          </button>
        </div>
      );
    }

    // Phase C: a contractor-shaped view derived from the SINGLE source of truth
    // (data.jobs), overlaying contractor-only fields from the legacy store. Plus
    // any orphan contractorJobs rows that have no admin Job yet, so nothing is
    // hidden during the transition. Admin-side contractor views (Projects,
    // Approvals, contractor-Billing) all read THIS instead of the raw store, so
    // they can no longer diverge from what the admin board shows.
    const contractorJobsView: ContractorJob[] = (() => {
      const allJobIds = new Set(data.jobs.map(j => j.id));
      const projected = data.jobs
        .filter(j => j.contractorId)
        .map(j => toContractorJobView(j, contractorJobs.find(cj => cj.sourceJobId === j.id), data.customers.find(c => c.id === j.customerId)));
      // Keep ONLY contractorJobs that never had an admin Job (no sourceJobId at all).
      // A row whose sourceJobId no longer resolves to a live Job is STALE - the admin
      // order was deleted or re-imported with a new id - so it must NOT surface as an
      // active work order. Those stale rows were why the contractor's WO tab showed
      // more jobs than the Service Orders window (single source of truth = data.jobs).
      // A legacy mirror created BEFORE sourceJobId linking has no sourceJobId, so the
      // check above can't tie it to its admin Job. After a reassignment the live job
      // moves (projected row gets the new contractorId) but this dangling row keeps its
      // OLD contractorId, duplicating the order under the previously-assigned contractor
      // (the "removed from Carlos but still shows on Carlos" bug). Suppress any such
      // orphan that a live job already represents (same order number, or same
      // customer + service type).
      const liveOrderNos = new Set(projected.map(p => bareOrderNo(p.woNumber)).filter(Boolean));
      const liveCustSvc  = new Set(projected.map(p => `${p.customerId}|${p.serviceType}`));
      const trueOrphans = contractorJobs.filter(cj =>
        !cj.sourceJobId && !allJobIds.has(cj.id) &&
        !(cj.woNumber && liveOrderNos.has(bareOrderNo(cj.woNumber))) &&
        !liveCustSvc.has(`${cj.customerId}|${cj.serviceType}`)
      );
      return [...projected, ...trueOrphans];
    })();

    switch (currentView) {
      case 'lobby':
        return (
          <LeadLobby
            currentUserId={data.currentUser?.id || 'user-1'}
            currentUserRole={currentUser?.role}
            customers={data.customers}
            onAddCustomer={handleCreateCustomer}
            onCreateStandaloneRma={handleCreateStandaloneRma}
            onViewCustomer={(customerId) => { setSelectedCustomerId(customerId); setCurrentView('customers'); }}
          />
        );

      case 'crm':
        return (
          <CRMDashboard currentUserId={data.currentUser?.id || 'user-1'} />
        );

      case 'customers2':
        return (
          <CustomerManagement currentUserId={data.currentUser?.id || 'user-1'} currentUserRole={currentUser?.role} />
        );

      case 'projects':
        return (
          <SolarProjects customers={data.customers} contractorJobs={contractorJobsView} isMobile={isMobile} />
        );

      case 'operations':
        return (
          <Operations currentUserId={data.currentUser?.id || 'user-1'} currentUserRole={currentUser?.role} />
        );

      case 'rates':
        return (
          <RateManagement
            rates={serviceRates}
            onSaveRates={setServiceRates}
          />
        );

      case 'contractors':
        return (
          <ContractorApprovals
            contractors={contractors}
            contractorJobs={contractorJobsView}
            onUpdateStatus={handleContractorStatusUpdate}
            onUpdateContractor={handleContractorUpdate}
            onDeleteContractor={handleContractorDelete}
            onViewAs={handleViewAsContractor}
            adminName={currentUser?.name ?? 'Admin'}
            adminEmail={currentUser?.email ?? 'operations@conexsol.us'}
          />
        );

      case 'contractor-billing':
        return (
          <BillingModule
            jobs={contractorJobsView}
            onUpdateJob={handleContractorJobUpdate}
          />
        );

      case 'dispatch':
        return (
          <DispatchDashboard
            customers={data.customers}
            jobs={data.jobs}
            contractors={contractors}
            users={data.users}
            isMobile={isMobile}
            currentUserId={data.currentUser?.id || 'user-1'}
            onViewCustomer={(customerId) => {
              setSelectedCustomerId(customerId);
              setCurrentView('customers');
            }}
            onViewChange={(view, id) => handleViewChange(view, id)}
          />
        );

      case 'routes':
        return (
          <DispatchMap
            jobs={data.jobs}
            customers={data.customers}
            contractors={contractors}
            onOpenJob={(jobId) => handleViewChange('jobDetail', jobId)}
            onAssign={handleAssignJobsToContractor}
          />
        );

      case 'dashboard':
        return (
          <Dashboard
            jobs={data.jobs}
            customers={data.customers}
            users={data.users}
            currentUser={currentUser}
            onViewChange={handleViewChange}
            onViewCustomer={(customerId) => { setSelectedCustomerId(customerId); setCurrentView('customers'); }}
            onJobClick={(jobId) => handleViewChange('jobDetail', jobId)}
            onUpdateJob={handleUpdateJob}
            isMobile={isMobile}
            notifications={data.notifications}
            onMarkNotificationRead={handleMarkNotificationRead}
            isConnected={true}
          />
        );

      case 'jobs':
        return (
          <Jobs
            jobs={data.jobs}
            customers={data.customers}
            users={data.users}
            contractors={contractors}
            onCreateJob={handleCreateJob}
            onUpdateJob={handleUpdateJob}
            onDeleteJob={handleDeleteJob}
            onViewChange={handleViewChange}
            isMobile={isMobile}
            currentUser={currentUser}
          />
        );

      case 'rma':
        return (
          <RMADashboardPage
            jobs={data.jobs}
            customers={data.customers}
            currentUser={currentUser}
            standaloneRmas={data.standaloneRmas ?? []}
            onCreateStandaloneRma={handleCreateStandaloneRma}
            onUpdateStandaloneRma={handleUpdateStandaloneRma}
            onJobClick={(jobId) => handleViewChange('jobDetail', jobId)}
            onViewCustomer={(customerId) => { setSelectedCustomerId(customerId); setCurrentView('customers'); }}
            onUpdateJob={handleUpdateJob}
            onViewChange={handleViewChange}
          />
        );

      case 'jobDetail':
        if (selectedJob && selectedCustomer) {
          const clientPaidCount = data.jobs.filter(
            j => j.customerId === selectedCustomer.id && (j.status === 'paid' || j.status === 'invoiced')
          ).length;
          return (
            <ServiceOrderPanel
              job={selectedJob}
              siteId={selectedCustomer.id}
              siteName={selectedCustomer.name}
              clientId={selectedCustomer.clientId}
              siteAddress={`${selectedCustomer.address}, ${selectedCustomer.city}, ${selectedCustomer.state}`}
              clientPaidJobCount={clientPaidCount}
              contractors={contractors}
              technicians={data.users.filter(u => u.role === 'technician' || u.role === 'coo').map(u => ({ id: u.id, name: u.name }))}
              users={data.users.map(u => ({ id: u.id, name: u.name, username: u.username, email: u.email }))}
              currentUserName={currentUser?.name}
              currentUserRole={currentUser?.role}
              customer={selectedCustomer}
              onClose={() => { setSelectedJobId(null); setCurrentView('jobs'); }}
              onSave={(partial) => {
                handleUpdateJob({ ...selectedJob, ...partial, id: selectedJob.id } as Job);
                // Panel stays open, user closes manually
              }}
              onDeleteJob={(jobId) => {
                handleDeleteJob(jobId);
                setSelectedJobId(null);
                setCurrentView('jobs');
              }}
              onDispatch={(contractorJob) => {
                const updated = [...contractorJobs, contractorJob];
                setContractorJobs(updated);
                saveContractorJobs(updated);
                logChange('contractor_job.dispatch', 'contractor_job', contractorJob.id, contractorJob, resolveActor());
              }}
              onQuoteSent={(_quoteId, quoteNumber) => {
                const crmCustomers = loadCustomers();
                const crmMatch = crmCustomers.find(
                  c => c.email?.toLowerCase() === selectedCustomer?.email?.toLowerCase()
                );
                if (crmMatch) {
                  const interactions = loadInteractions();
                  const label = quoteNumber ? `Quote #${quoteNumber}` : 'Quote';
                  const updated = addInteraction(
                    interactions,
                    crmMatch.id,
                    'quote',
                    `${label} emailed to ${selectedCustomer?.email ?? 'customer'}`,
                    currentUser?.id ?? '',
                    currentUser?.name ?? 'Staff',
                    { subject: `${label} sent via email`, direction: 'outbound' }
                  );
                  saveInteractions(updated);
                }
              }}
              onViewCustomer={(customerId) => {
                setSelectedJobId(null);
                setSelectedCustomerId(customerId);
                setCurrentView('customers');
              }}
              onViewChange={handleViewChange}
            />
          );
        }
        return (
          <Jobs
            jobs={data.jobs}
            customers={data.customers}
            users={data.users}
            contractors={contractors}
            onCreateJob={handleCreateJob}
            onUpdateJob={handleUpdateJob}
            onDeleteJob={handleDeleteJob}
            onViewChange={handleViewChange}
            isMobile={isMobile}
            currentUser={currentUser}
          />
        );

      case 'customers':
        return (
          <Customers
            customers={data.customers}
            jobs={data.jobs}
            users={data.users}
            contractors={contractors}
            currentUser={currentUser}
            onCreateCustomer={handleCreateCustomer}
            onUpdateCustomer={handleUpdateCustomer}
            onDeleteCustomer={handleDeleteCustomer}
            onMergeCustomers={handleMergeCustomers}
            onCreateJob={handleCreateJob}
            onUpdateJob={handleUpdateJob}
            onDeleteJob={handleDeleteJob}
            onDispatch={(contractorJob) => {
              const updated = [...contractorJobs, contractorJob];
              setContractorJobs(updated);
              saveContractorJobs(updated);
            }}
            onViewCustomer={(_customerId) => {
            }}
            onSolarEdgeSites={() => setCurrentView('solaredge')}
            solarEdgeSites={[...FL_SITES, ...(data.solarEdgeExtraSites ?? [])]}
            solarEdgeApiKey={data.solarEdgeConfig.apiKey || undefined}
            isMobile={isMobile}
            initialCustomerId={selectedCustomerId ?? undefined}
            selectCustomerSeq={selectCustomerSeq}
          />
        );

      case 'billing':
        return (
          <Billing
            jobs={data.jobs}
            customers={data.customers}
            users={data.users}
            onUpdateJob={handleUpdateJob}
            isMobile={isMobile}
            currentUserName={currentUser?.name}
          />
        );

      case 'technician':
        return currentUser?.role === 'technician' || currentUser?.role === 'coo' ? (
          <TechnicianView
            jobs={data.jobs}
            customers={data.customers}
            currentUser={currentUser}
            onUpdateJob={handleUpdateJob}
            onViewChange={handleViewChange}
            isMobile={isMobile}
          />
        ) : (
          <Dashboard
            jobs={data.jobs}
            customers={data.customers}
            users={data.users}
            currentUser={currentUser}
            onViewChange={handleViewChange}
            onViewCustomer={(customerId) => { setSelectedCustomerId(customerId); setCurrentView('customers'); }}
            onJobClick={(jobId) => handleViewChange('jobDetail', jobId)}
            onUpdateJob={handleUpdateJob}
            isMobile={isMobile}
            notifications={data.notifications}
            onMarkNotificationRead={handleMarkNotificationRead}
            isConnected={true}
          />
        );

      case 'inventory':
        return <InventoryModule isMobile={isMobile} jobs={data.jobs} onUpdateJob={handleUpdateJob} currentUser={currentUser} standaloneRmas={data.standaloneRmas ?? []} onCreateStandaloneRma={handleCreateStandaloneRma} onUpdateStandaloneRma={handleUpdateStandaloneRma} contractors={contractors} />;

      case 'solaredge':
        return (
          <SolarEdgeMonitoring
            jobs={data.jobs}
            customers={data.customers}
            contractors={contractors}
            onViewChange={handleViewChange}
            onViewCustomer={(customerId) => {
              setSelectedCustomerId(customerId);
              setCurrentView('customers');
            }}
            currentUserName={currentUser?.name ?? 'Staff'}
            currentUserRole={currentUser?.role ?? 'technician'}
            onCreateJob={handleCreateJob}
            onUpdateJob={handleUpdateJob}
            onDispatchContractorJob={(cj) => {
              // Persist immediately so a fast reload doesn't drop the dispatch.
              const updated = [...contractorJobs, cj];
              setContractorJobs(updated);
              saveContractorJobs(updated);
              // Mirror back onto the admin Job (if it exists) so Manage Work Orders shows it as dispatched.
              if (cj.sourceJobId) {
                const parent = data.jobs.find(j => j.id === cj.sourceJobId);
                if (parent) {
                  handleUpdateJob({
                    ...parent,
                    contractorId: cj.contractorId,
                    contractorSentAt: parent.contractorSentAt ?? new Date().toISOString(),
                  });
                }
              }
            }}
            onUpdateSites={data.solarEdgeConfig.apiKey ? handleUpdateFloridaSites : undefined}
            extraSites={data.solarEdgeExtraSites ?? []}
            solarEdgeApiKey={data.solarEdgeConfig.apiKey || undefined}
            onImportApply={handleImportApply}
            users={data.users.map(u => ({ id: u.id, name: u.name, username: u.username, email: u.email }))}
          />
        );

      case 'my-jobs':
        if (linkedContractor) {
          return (
            <ContractorDashboard
              contractorName={linkedContractor.contactName}
              contractorId={linkedContractor.id}
              contractor={linkedContractor}
              jobs={pickupJobsForContractor(linkedContractor.id, data.jobs).map(j => toContractorJobView(j, contractorJobs.find(cj => cj.sourceJobId === j.id), data.customers.find(c => c.id === j.customerId)))}
              onLogout={() => setCurrentView('dashboard')}
              onUpdateJob={handleContractorJobUpdate}
              onUpdateContractor={(updated) => {
                setContractors(prev => prev.map(c => c.id === updated.id ? updated : c));
                setLinkedContractor(updated);
              }}
              onSync={deepSync}
              onProposeSchedule={handleContractorProposeSchedule}
            />
          );
        }
        return (
          <div className="p-6 max-w-md mx-auto text-center">
            <h2 className="text-lg font-semibold text-slate-900 mb-2">My Jobs unavailable</h2>
            <p className="text-sm text-slate-600 mb-4">
              No contractor record is linked to your account email{currentUser?.email ? ` (${currentUser.email})` : ''}.
              Ask an admin to add this email to a contractor's <em>altEmails</em>.
            </p>
            <button
              onClick={() => setCurrentView('dashboard')}
              className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium"
            >
              Back to Dashboard
            </button>
          </div>
        );

      case 'settings':
        return (
          <Settings
            currentUser={currentUser}
            solarEdgeConfig={data.solarEdgeConfig}
            onSaveSolarEdgeApiKey={handleSaveSolarEdgeApiKey}
            onSyncSolarEdge={handleSyncSolarEdge}
            onLogout={handleLogout}
            onNavigateToEntity={(entityType, entityId) => {
              // Deep-link from a user's audit log straight to the affected card.
              if (entityType === 'customer') {
                setSelectedCustomerId(entityId);
                setCurrentView('customers');
              } else if (entityType === 'job') {
                handleViewChange('jobDetail', entityId);
              }
            }}
            onUpdateAvatar={(dataUrl) => {
              if (!currentUser) return;
              logChange('user.avatar_update', 'user', currentUser.id,
                { avatarUrl: dataUrl },
                currentUser.email ?? 'unknown',
              );
              // Persist avatar URL into Supabase Auth user_metadata so it
              // survives fetchStaffUsers() overwrites and syncs cross-device.
              supabase.auth.updateUser({ data: { avatar_url: dataUrl ?? null } })
                .catch(err => console.warn('[Avatar] Failed to persist to user_metadata:', err));
              setData(prev => {
                const next = {
                  ...prev,
                  // Update the logged-in user object so the header + Settings
                  // Avatar renders immediately (currentUser = data.currentUser).
                  currentUser: prev.currentUser
                    ? { ...prev.currentUser, avatar: dataUrl ?? undefined }
                    : prev.currentUser,
                  users: prev.users.map(u =>
                    u.id === currentUser.id ? { ...u, avatar: dataUrl ?? undefined } : u
                  ),
                };
                saveData(next);
                return next;
              });
            }}
            isMobile={isMobile}
          />
        );

      default:
        return (
          <Dashboard
            jobs={data.jobs}
            customers={data.customers}
            users={data.users}
            currentUser={currentUser}
            onViewChange={handleViewChange}
            onViewCustomer={(customerId) => { setSelectedCustomerId(customerId); setCurrentView('customers'); }}
            onJobClick={(jobId) => handleViewChange('jobDetail', jobId)}
            onUpdateJob={handleUpdateJob}
            isMobile={isMobile}
            notifications={data.notifications}
            onMarkNotificationRead={handleMarkNotificationRead}
            isConnected={true}
          />
        );
    }
  };

  return (
    <ErrorBoundary>
      <Suspense fallback={<SuspenseFallback message="Loading application..." />}>
        <StorageWarningBanner getSnapshot={() => data} />
        <Layout
        currentView={currentView}
        onViewChange={handleViewChange}
        currentUser={currentUser}
        onLogout={handleLogout}
        isMobile={isMobile}
        unbilledCount={unbilledCount}
        notifications={data.notifications || []}
        onMarkNotificationRead={handleMarkNotificationRead}
        onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
        linkedContractorName={linkedContractor?.businessName ?? null}
        versionState={versionState}
        remoteVersion={remoteVersion}
        onCheckForUpdate={checkForUpdate}
        onUpdate={() => window.location.reload()}
        customers={data.customers}
        jobs={data.jobs}
        onSelectCustomer={(id) => { setSelectedCustomerId(id); setSelectCustomerSeq(s => s + 1); handleViewChange('customers'); }}
      >
        {renderView()}
      </Layout>
      <SyncStatusToast />
    </Suspense>
  </ErrorBoundary>
);
}

export default App;
