// SolarFlow MVP - Main Application with Contractor Module
import { useState, useEffect, lazy, Suspense } from 'react';
const Layout = lazy(() => import('./components/Layout').then(m => ({ default: m.Layout })));
const Dashboard = lazy(() => import('./components/Dashboard').then(m => ({ default: m.Dashboard })));
const Jobs = lazy(() => import('./components/Jobs').then(m => ({ default: m.Jobs })));
const WorkOrderPanel = lazy(() => import('./components/WorkOrderPanel').then(m => ({ default: m.WorkOrderPanel })));
const Customers = lazy(() => import('./components/Customers').then(m => ({ default: m.Customers })));
const Billing = lazy(() => import('./components/Billing').then(m => ({ default: m.Billing })));
const TechnicianView = lazy(() => import('./components/TechnicianView').then(m => ({ default: m.TechnicianView })));
const Settings = lazy(() => import('./components/Settings').then(m => ({ default: m.Settings })));
const ContractorRegister = lazy(() => import('./components/contractor').then(m => ({ default: m.ContractorRegister })));
const ContractorDashboard = lazy(() => import('./components/contractor').then(m => ({ default: m.ContractorDashboard })));
const RateManagement = lazy(() => import('./components/contractor').then(m => ({ default: m.RateManagement })));
const ContractorApprovals = lazy(() => import('./components/contractor').then(m => ({ default: m.ContractorApprovals })));
const BillingModule = lazy(() => import('./components/admin/BillingModule').then(m => ({ default: m.BillingModule })));
const InventoryModule = lazy(() => import('./components/InventoryModule').then(m => ({ default: m.InventoryModule })));
const SolarProjects = lazy(() => import('./components/SolarProjects').then(m => ({ default: m.SolarProjects })));
const CRMDashboard = lazy(() => import('./components/CRMDashboard').then(m => ({ default: m.CRMDashboard })));
const CustomerManagement = lazy(() => import('./components/CustomerManagement').then(m => ({ default: m.CustomerManagement })));
const Operations = lazy(() => import('./components/Operations').then(m => ({ default: m.Operations })));
const SolarEdgeMonitoring = lazy(() => import('./components/SolarEdgeMonitoring').then(m => ({ default: m.SolarEdgeMonitoring })));
const DispatchDashboard = lazy(() => import('./components/DispatchDashboard').then(m => ({ default: m.DispatchDashboard })));
const LeadLobby = lazy(() => import('./components/LeadLobby').then(m => ({ default: m.LeadLobby })));
import { supabase } from './lib/supabase';
import { syncFromDB } from './lib/db';
import { loadData, saveData } from './lib/dataStore';
import { logChange, flushChangeLog } from './lib/changeLog';
import { fetchMyNotifications, markNotificationReadRemote, markAllNotificationsReadRemote, startNotificationPolling, stopNotificationPolling } from './lib/notifications';
import { processBillingTimers } from './lib/billingService';
import { loadContractors, saveContractors, loadServiceRates, saveServiceRates, loadContractorJobs, saveContractorJobs, initializeContractorData, findInviteByToken } from './lib/contractorStore';
import { ContractorInvite as ContractorInviteType } from './types/contractor';
import { AppState, Job, Customer, User, AppNotification, CRMCustomer, InteractionOutcome, SolarEdgeExtraSite } from './types';
import { FL_SITES } from './lib/solarEdgeSites';
import { Contractor, ContractorStatus, ContractorJob } from './types/contractor';
import { addInteraction, loadCustomers, loadInteractions, saveInteractions } from './lib/customerStore';
import {
  getXeroClientId, setXeroClientId, startXeroOAuth,
  handleXeroCallback, clearXeroTokens, isXeroConnected, getXeroTokens,
} from './lib/xeroService';

// ── Passkey / WebAuthn helpers (imported from shared lib) ─────────────────────
import {
  PASSKEY_STORE_KEY,
  PASSKEY_STORE_KEY_CONTRACTOR,
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
  useEffect(() => {
    localStorage.removeItem('solarops_reset_mode'); // staff page clears contractor mode flag
    if (isPlatformAuthAvailable()) {
      window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
        .then(available => {
          setPasskeyAvailable(available);
          setPasskeyStored(available && !!localStorage.getItem(PASSKEY_STORE_KEY));
        })
        .catch(() => {});
    }
  }, []);

  const finishStaffLogin = async (supaUser: import('@supabase/supabase-js').User, offerPasskey = false) => {
    const meta = supaUser.user_metadata ?? {};
    const user: User = {
      id: supaUser.id,
      name: meta.name ?? supaUser.email ?? 'Staff',
      email: supaUser.email ?? email,
      phone: meta.phone ?? '',
      role: meta.role ?? 'admin',
      active: true,
      username: meta.username ?? '',
    };
    if (offerPasskey && passkeyAvailable && !localStorage.getItem(PASSKEY_STORE_KEY)) {
      await registerPasskey(supaUser.id, supaUser.email ?? '');
      setPasskeyStored(true);
    }
    onLogin(user, !!meta.mustChangePassword);
  };

  const handlePasskeyLogin = async () => {
    setError('');
    setLoading(true);
    const rawId = await authenticateWithPasskey();
    if (!rawId) {
      setLoading(false);
      setError('Face ID / Touch ID failed. Please sign in with your password.');
      return;
    }
    // Try current session first; if JWT expired, refresh using the stored refresh token
    let { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      session = refreshed.session;
    }
    setLoading(false);
    if (session?.user) {
      await finishStaffLogin(session.user);
    } else {
      setError('Session expired. Please sign in with your password once to re-enable Face ID.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (authError || !data.user) {
      setError('Invalid email or password.');
      return;
    }
    const meta = data.user.user_metadata ?? {};
    // Block pure contractors (no staff access); dual-role users (isStaff=true) are allowed
    if (meta.role === 'contractor' && !meta.isStaff) {
      await supabase.auth.signOut();
      setError('This is the staff portal. Please use the Contractor Portal below.');
      return;
    }
    await finishStaffLogin(data.user, true);
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
                Check your inbox — a reset link has been sent to <strong>{forgotEmail}</strong>.
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
              {passkeyStored ? 'Sign in with Face ID' : 'Face ID / Touch ID — sign in with password once to enable'}
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
    if (hasRecoveryHash) return; // already showing the form
    // Fallback: wait for session via getSession or auth event
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessionReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') && session) {
        setSessionReady(true);
      }
    });
    // Timeout fallback — show form after 3s regardless, updateUser will surface any real error
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
      return await res.json() as User[];
    } catch {
      return [];
    }
  };

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isContractorMode, setIsContractorMode] = useState(() => validateContractorSession());
  // Staff user who is also linked to a contractor (dual-role: e.g. cesar.jurado@conexsol.us ↔ iMPower)
  const [linkedContractor, setLinkedContractor] = useState<Contractor | null>(null);
  const [loginMode, setLoginMode] = useState<'staff' | 'contractor'>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('mode') === 'contractor' || localStorage.getItem('solarops_reset_mode') === 'contractor'
      ? 'contractor' : 'staff';
  });
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [currentContractor, setCurrentContractor] = useState<Contractor | null>(null);
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

  // One-time migration: reassign any admin-side jobs from legacy contractor-1 → contractor-2
  useEffect(() => {
    setData(prev => {
      const needsPatch = prev.jobs.some(j => j.contractorId === 'contractor-1');
      if (!needsPatch) return prev;
      return { ...prev, jobs: prev.jobs.map(j => j.contractorId === 'contractor-1' ? { ...j, contractorId: 'contractor-2' } : j) };
    });
  }, []);
  const [serviceRates, setServiceRates] = useState(() => loadServiceRates());
  const [contractorJobs, setContractorJobs] = useState(() => loadContractorJobs());

  // Sync from Supabase on startup → merge into local state
  // syncFromDB() merges remote customers/jobs into localStorage, then we reload
  useEffect(() => {
    syncFromDB()
      .then(() => {
        // Re-read localStorage after remote merge (may have new records from other devices)
        const merged = loadData();
        setData(prev => {
          // Only update if remote actually added records (avoids unnecessary re-renders)
          if (
            merged.customers.length !== prev.customers.length ||
            merged.jobs.length     !== prev.jobs.length
          ) {
            return merged;
          }
          return prev;
        });
      })
      .catch(() => {
        // Sync failed (offline / not logged in) — local data is already loaded
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
    initSyncStatusListeners();
  }, []);

  // Handle Xero OAuth callback (?code=...) and restore existing Xero connection
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    if (code && window.location.pathname === '/xero-callback') {
      // Exchange code for tokens
      handleXeroCallback(code)
        .then(({ orgName, tenantId }) => {
          setData(prev => ({
            ...prev,
            xeroConfig: { connected: true, organizationName: orgName, tenantId },
          }));
          // Clean up URL
          window.history.replaceState({}, '', '/');
          setCurrentView('settings');
        })
        .catch(err => {
          console.error('Xero OAuth error:', err);
          window.history.replaceState({}, '', '/');
        });
    } else if (isXeroConnected()) {
      // Restore connection state on app load from stored tokens
      const { orgName, tenantId } = getXeroTokens();
      if (orgName) {
        setData(prev => ({
          ...prev,
          xeroConfig: { connected: true, organizationName: orgName, tenantId },
        }));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save contractor data
  useEffect(() => {
    saveContractors(contractors);
  }, [contractors]);

  useEffect(() => {
    saveServiceRates(serviceRates);
  }, [serviceRates]);

  useEffect(() => {
    saveContractorJobs(contractorJobs);
  }, [contractorJobs]);

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
    // Contractor session takes priority — check it before Supabase
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
        const user: User = {
          id: session.user.id,
          name: meta.name ?? session.user.email ?? 'Staff',
          email: session.user.email ?? '',
          phone: meta.phone ?? '',
          role: meta.role ?? 'admin',
          active: true,
          username: meta.username ?? '',
        };
        setData(prev => ({ ...prev, currentUser: user }));
        setIsAuthenticated(true);
        fetchStaffUsers().then(users => {
          if (users.length > 0) setData(prev => ({ ...prev, users }));
        });
        // Flush any change log entries that were queued while offline
        flushChangeLog().catch(() => {});
        // Load Supabase notifications and start polling
        fetchMyNotifications().then(notifs => {
          if (notifs.length > 0) mergeRemoteNotifications(notifs);
        });
        startNotificationPolling(mergeRemoteNotifications);
        // Restore dual-role contractor link on session resume
        const allContractors = loadContractors();
        const linked = allContractors.find(
          c => c.email === user.email || c.altEmails?.includes(user.email)
        );
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
      } else if (event === 'TOKEN_REFRESHED' && session) {
        // Session refreshed silently — no action needed
      }
    });

    return () => {
      subscription.unsubscribe();
      stopNotificationPolling();
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

  // Computed values
  const currentUser = data.currentUser;
  const unbilledCount = data.jobs.filter((j) => j.status === 'completed').length;

  // Get selected job details
  const selectedJob = selectedJobId
    ? data.jobs.find((j) => j.id === selectedJobId)
    : null;
  const selectedCustomer = selectedJob
    ? data.customers.find((c) => c.id === selectedJob.customerId)
    : null;
  const selectedTechnician = selectedJob
    ? data.users.find((u) => u.id === selectedJob.technicianId)
    : null;

  // Auth handlers
  const handleLogin = (user: User, forcePasswordChange = false) => {
    sessionStorage.removeItem('solarflow_contractor_mode');
    setData(prev => ({ ...prev, currentUser: user }));
    setIsAuthenticated(true);
    setIsContractorMode(false);
    if (forcePasswordChange) { setMustChangePassword(true); return; }
    fetchStaffUsers().then(users => {
      if (users.length > 0) setData(prev => ({ ...prev, users }));
    });
    if (user.role === 'sales') {
      setCurrentView('crm');
    }
    // Detect dual-role: staff user linked to a contractor via email or altEmails
    const allContractors = loadContractors();
    const linked = allContractors.find(
      c => c.email === user.email || c.altEmails?.includes(user.email)
    );
    setLinkedContractor(linked ?? null);
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
    setIsAuthenticated(false);
    setIsContractorMode(false);
    setCurrentContractor(null);
    setData(prev => ({ ...prev, users: [], currentUser: undefined as any }));
    setCurrentView('dashboard');
  };

  const handleMarkNotificationRead = (id: string) => {
    setData(prev => ({
      ...prev,
      notifications: prev.notifications.map(n => n.id === id ? { ...n, read: true } : n),
    }));
    markNotificationReadRemote(id).catch(() => {});
  };

  const handleMarkAllNotificationsRead = () => {
    setData(prev => ({
      ...prev,
      notifications: prev.notifications.map(n => ({ ...n, read: true })),
    }));
    markAllNotificationsReadRemote().catch(() => {});
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

  const handleContractorRegister = (contractor: Contractor) => {
    setContractors([...contractors, contractor]);
    setShowRegister(false);
    setCurrentContractor(contractor);
    setIsContractorMode(true);
  };

  const handleContractorStatusUpdate = (contractorId: string, status: ContractorStatus, reason?: string) => {
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

  const handleContractorJobUpdate = (updatedJob: ContractorJob) => {
    setContractorJobs(contractorJobs.map(j =>
      j.id === updatedJob.id ? updatedJob : j
    ));
    // Mirror status to admin-side Job when contractor goes en_route, in_progress, or completed
    if (updatedJob.sourceJobId && ['en_route', 'in_progress', 'completed'].includes(updatedJob.status)) {
      const woStatusMap: Record<string, string> = {
        en_route: 'in_progress',
        in_progress: 'in_progress',
        completed: 'completed',
      };
      setData(prev => ({
        ...prev,
        jobs: prev.jobs.map(j =>
          j.id === updatedJob.sourceJobId
            ? {
                ...j,
                woStatus: woStatusMap[updatedJob.status] as any,
                status: woStatusMap[updatedJob.status] as any,
                completedAt: updatedJob.status === 'completed' ? (j.completedAt || new Date().toISOString()) : j.completedAt,
              }
            : j
        ),
      }));
    }
    // Notify admins when a contractor marks the work order as completed
    if (updatedJob.status === 'completed') {
      const adminUserIds = ['user-1', 'user-3', 'user-4'];
      const newNotifs: AppNotification[] = adminUserIds.map(uid => ({
        id: `notif-${Date.now()}-${uid}-${Math.random().toString(36).slice(2, 6)}`,
        userId: uid,
        type: 'contractor_completed' as const,
        title: 'Work Order Completed',
        message: `${updatedJob.serviceType} completed by contractor for ${updatedJob.customerName} at ${updatedJob.address}, ${updatedJob.city}`,
        relatedJobId: updatedJob.sourceJobId || updatedJob.id,
        relatedContractorId: updatedJob.contractorId,
        read: false,
        createdAt: new Date().toISOString(),
      }));
      setData(prev => ({
        ...prev,
        notifications: [...(prev.notifications || []), ...newNotifs],
      }));
    }
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
    setData(prev => ({ ...prev, jobs: [...prev.jobs, newJob] }));
    // Don't navigate away when creating from a site panel (WO has solarEdgeSiteId set)
    if (!job.solarEdgeSiteId) setCurrentView('jobs');
    return newJob;
  };

  const handleUpdateJob = (updatedJob: Job) => {
    const newActivity = {
      id: `activity-${Date.now()}`,
      type: 'job_updated' as const,
      description: `Work order ${updatedJob.woNumber ?? updatedJob.id} updated — ${updatedJob.serviceType} · ${updatedJob.status}`,
      timestamp: new Date().toISOString(),
    };
    setData(prev => ({
      ...prev,
      jobs: prev.jobs.map((j) => (j.id === updatedJob.id ? updatedJob : j)),
      customers: prev.customers.map((c) =>
        c.id === updatedJob.customerId
          ? { ...c, activityHistory: [newActivity, ...(c.activityHistory || [])] }
          : c
      ),
    }));
  };

  const handleDeleteJob = (jobId: string) => {
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
      address: customer.address || '',
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
    // Log before state update — append-only audit trail
    logChange('customer.create', 'customer', newCustomer.id, newCustomer,
      data.currentUser?.email ?? 'unknown');

    // Use prev => pattern to avoid stale-closure data loss
    setData(prev => {
      const next = { ...prev, customers: [...prev.customers, newCustomer] };
      // Immediate synchronous save — never rely solely on the 500ms debounce
      saveData(next);
      return next;
    });
  };

  const handleUpdateCustomer = (updatedCustomer: Customer) => {
    logChange('customer.update', 'customer', updatedCustomer.id, updatedCustomer,
      data.currentUser?.email ?? 'unknown');

    setData(prev => {
      const next = {
        ...prev,
        customers: prev.customers.map((c) => (c.id === updatedCustomer.id ? updatedCustomer : c)),
      };
      saveData(next);
      return next;
    });
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
    } catch {}

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
    setData(prev => {
      const primary = prev.customers.find(c => c.id === primaryId);
      const secondary = prev.customers.find(c => c.id === secondaryId);
      if (!primary || !secondary) return prev;
      const merged: Customer = {
        ...primary,
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
      };
      return {
        ...prev,
        customers: prev.customers.filter(c => c.id !== secondaryId).map(c => c.id === primaryId ? merged : c),
        jobs: prev.jobs.map(j => j.customerId === secondaryId ? { ...j, customerId: primaryId } : j),
      };
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

  const handleCreateInvoice = (job: Job, xeroInvoiceId: string) => {
    console.log('Invoice created:', job.id, xeroInvoiceId);
  };

  /** Save client ID then redirect to Xero OAuth.
   *  Called with a clientId from Settings, or without args from Billing (reads stored key). */
  const handleConnectXero = async (clientId?: string): Promise<void> => {
    const id = clientId || getXeroClientId();
    if (!id) {
      // No client ID configured yet — send user to Settings
      setCurrentView('settings');
      return;
    }
    setXeroClientId(id);
    await startXeroOAuth(id);
  };

  const handleXeroDisconnect = () => {
    clearXeroTokens();
    localStorage.removeItem('solarops_xero_client_id');
    setData(prev => ({ ...prev, xeroConfig: { connected: false } }));
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
    console.log('SolarEdge sync starting with API key:', apiKey ? `${apiKey.substring(0, 10)}...` : 'EMPTY');

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
      console.log('Fetching SolarEdge sites via proxy (paginated)…');
      const SE_PAGE = 100;
      let seStartIndex = 0;
      let sites: any[] = [];
      let seTotalCount = 0;

      while (true) {
        const url = `/api/solaredge?path=/sites/list&size=${SE_PAGE}&startIndex=${seStartIndex}&api_key=${encodeURIComponent(apiKey)}`;
        const response = await fetch(url);

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            alert('Invalid API key. Please check your SolarEdge API key in Settings.');
            return;
          }
          throw new Error(`HTTP error: ${response.status}`);
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
      console.log(`Fetched ${sites.length} of ${seTotalCount} sites from SolarEdge.`);

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
      const unmatchedSites: any[] = sites.filter((s: any) =>
        !existingSiteIds.has(String(s.id))
      );
      const newCustomersFromSync: Customer[] = unmatchedSites.map((s: any) => ({
        id: `cust-se-${s.id}`,
        name: s.name || `SolarEdge Site ${s.id}`,
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        address: s.location?.address || '',
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
          customers: [...updatedCustomers, ...newCustomersFromSync],
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
      alert('Failed to sync with SolarEdge. Please check your API key and try again.');
    }
  };

  // ── Site filter: Conexsol Florida group ──────────────────────────────────
  // The SolarEdge account IS the Florida group — all sites in the account belong.
  // We keep this helper for optional secondary filtering (currently accepts ALL).
  const isFLSite = (_s: any): boolean => true;

  // ── Paginate SolarEdge API ────────────────────────────────────────────────
  const fetchAllSESites = async (apiKey: string): Promise<any[]> => {
    const PAGE = 100;
    let startIndex = 0;
    let all: any[] = [];
    let totalCount = 0;
    while (true) {
      const response = await fetch(
        `/api/solaredge?path=/sites/list&size=${PAGE}&startIndex=${startIndex}&api_key=${encodeURIComponent(apiKey)}`
      );
      if (!response.ok) {
        if (response.status === 401 || response.status === 403)
          throw new Error('Invalid API key — check Settings');
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
    if (!apiKey) throw new Error('No SolarEdge API key — add one in Settings');

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
      address: s.location?.address || '',
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
  const handleImportApply = (accepted: import('./components/SolarEdgeImportModal').DiffItem[]) => {
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

          // ── Dedup guard: skip if any customer already owns this siteId ─────
          // (catches edge cases where buildDiff missed a prior import)
          const alreadyLinked = customers.some(c => c.solarEdgeSiteId === siteId);
          if (!alreadyLinked) {
            // Stable ID — no Date.now() suffix so re-importing never duplicates
            const newC: Customer = {
              id: `cust-se-${s.id}`,
              name: s.name,
              email: '', phone: '',
              address: loc.address || '',
              city:    loc.city    || '',
              state:   loc.state   || 'FL',
              zip:     loc.zip     || '',
              type: 'residential' as const,
              notes: `Imported from SolarEdge on ${new Date().toLocaleDateString()}`,
              solarEdgeSiteId: siteId,
              systemType: 'SolarEdge' as any,
              clientStatus: s.status === 'Active' ? 'O&M' as any : 'Standby' as any,
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
              address:     [loc.address, loc.city, loc.state || 'FL', loc.zip].filter(Boolean).join(', '),
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
          const loc = (item.site.location ?? {}) as { address?: string; city?: string; zip?: string };
          customers = customers.map(c => {
            if (c.id !== item.customer!.id) return c;
            const updates: Partial<Customer> = {};
            for (const ch of item.changes!) {
              if (ch.field === 'Name')    updates.name    = ch.to;
              if (ch.field === 'Address') updates.address = ch.to;
              if (ch.field === 'City')    updates.city    = ch.to;
              if (ch.field === 'ZIP')     updates.zip     = ch.to;
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

  // ── Clean Import ──────────────────────────────────────────────────────────
  // Wipes all auto-imported customers + extraSites + removed-sites cache,
  // then runs a fresh filtered import from the SolarEdge API.
  const handleCleanImport = async (): Promise<{ newCount: number; total: number; importedSites: Array<{ name: string; clientId: string; state: string; siteId: string }> }> => {
    const apiKey = data.solarEdgeConfig.apiKey;
    if (!apiKey) throw new Error('No SolarEdge API key — add one in Settings');

    // 1. Fetch all sites from API (paginated)
    const allSites = await fetchAllSESites(apiKey);

    // 2. Filter to Florida state OR US-15 name prefix
    const sites = allSites.filter(isFLSite);

    // 3. Strip all previously auto-imported customers (id starts with cust-se-)
    //    and keep only manually created customers
    const manualCustomers = data.customers.filter(c => !c.id.startsWith('cust-se-'));

    // 4. Build fresh customer records for all matching sites
    const freshCustomers: Customer[] = sites.map((s: any) => ({
      id: `cust-se-${s.id}`,
      name: s.name || `SolarEdge Site ${s.id}`,
      firstName: '', lastName: '', email: '', phone: '',
      address: s.location?.address || '',
      city:    s.location?.city    || '',
      state:   s.location?.state   || 'FL',
      zip:     s.location?.zip     || '',
      type: 'commercial' as const,
      notes: `Clean import from SolarEdge Florida group on ${new Date().toLocaleDateString()}`,
      solarEdgeSiteId: String(s.id),
      createdAt: new Date().toISOString(),
    }));

    // 5. Build fresh extraSites for sites not already in FL_SITES static list
    const flSiteIds = new Set(FL_SITES.map(s => s.siteId));
    const freshExtraSites: SolarEdgeExtraSite[] = sites
      .filter((s: any) => !flSiteIds.has(String(s.id)))
      .map((s: any) => ({
        siteId:      String(s.id),
        clientId:    s.name?.startsWith('US-') ? s.name.split(' ')[0] : (s.accountId || ''),
        siteName:    s.name || '',
        address:     [s.location?.address, s.location?.city, s.location?.state, s.location?.zip].filter(Boolean).join(', '),
        status:      s.status || 'Active',
        peakPower:   s.peakPower || 0,
        installDate: s.installationDate || '',
        ptoDate:     s.ptoDate || '',
        alerts: 0, highestImpact: '0', systemType: '', module: '',
        todayKwh:    s.lastDayData?.energy   || 0,
        monthKwh:    s.lastMonthData?.energy  || 0,
        yearKwh:     s.lastYearData?.energy   || 0,
        lifetimeKwh: s.lifeTimeData?.energy   || 0,
        lastUpdate:  s.lastUpdateTime || new Date().toISOString(),
      }));

    // 6. Clear removed-sites cache so no sites are hidden
    localStorage.removeItem('solarops_removed_sites');

    // 7. Commit to state + persist to localStorage and Supabase
    setData((prev) => {
      const next = {
        ...prev,
        customers: [...manualCustomers, ...freshCustomers],
        solarEdgeExtraSites: freshExtraSites,
      };
      saveData(next);
      return next;
    });

    // 8. Build report of all imported sites
    const importedSites = sites.map((s: any) => ({
      name: s.name || `SolarEdge Site ${s.id}`,
      clientId: s.name?.startsWith('US-') ? s.name.split(' ')[0] : (s.accountId || ''),
      state: s.location?.state || '',
      siteId: String(s.id),
    }));

    return { newCount: freshExtraSites.length, total: sites.length, importedSites };
  };

  // Loading gate — wait for Neon sync before rendering
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

  // Force password change — shown before entering the app (staff or contractor)
  if (mustChangePassword) {
    return (
      <ForceChangePasswordScreen
        isContractor={isContractorMode}
        onDone={async (newPassword) => {
          if (isContractorMode && currentContractor) {
            // Update contractor password in Neon via store
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
              if (users.length > 0) setData(prev => ({ ...prev, users }));
            });
            if (data.currentUser?.role === 'sales') setCurrentView('crm');
          }
        }}
      />
    );
  }

  // Contractor mode
  if (isContractorMode && currentContractor) {
    if (currentContractor.status === 'pending') {
      return (
        <PendingApprovalScreen
          contractor={currentContractor}
          onLogout={handleLogout}
        />
      );
    }

    return (
      <ContractorDashboard
        contractorName={currentContractor.contactName}
        contractorId={currentContractor.id}
        contractor={currentContractor}
        jobs={contractorJobs.filter(j => j.contractorId === currentContractor.id)}
        onLogout={handleLogout}
        onUpdateJob={handleContractorJobUpdate}
        onUpdateContractor={(updated) => {
          setContractors(prev => prev.map(c => c.id === updated.id ? updated : c));
          setCurrentContractor(updated);
        }}
      />
    );
  }

  // Render appropriate view
  const renderView = () => {
    // Sales reps can only access crm, customers2, and lobby
    if (currentUser?.role === 'sales' && !['crm', 'customers2', 'lobby'].includes(currentView)) {
      return <CRMDashboard currentUserId={data.currentUser?.id || 'user-1'} />;
    }

    switch (currentView) {
      case 'lobby':
        return (
          <LeadLobby
            currentUserId={data.currentUser?.id || 'user-1'}
            currentUserRole={currentUser?.role}
            onAddCustomer={handleCreateCustomer}
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
          <SolarProjects customers={data.customers} contractorJobs={contractorJobs} isMobile={isMobile} />
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
            contractorJobs={contractorJobs}
            onUpdateStatus={handleContractorStatusUpdate}
            onUpdateContractor={handleContractorUpdate}
            onDeleteContractor={handleContractorDelete}
            adminName={currentUser?.name ?? 'Admin'}
            adminEmail={currentUser?.email ?? 'operations@conexsol.us'}
          />
        );

      case 'contractor-billing':
        return (
          <BillingModule
            jobs={contractorJobs}
            onUpdateJob={handleContractorJobUpdate}
          />
        );

      case 'dispatch':
        return (
          <DispatchDashboard
            customers={data.customers}
            jobs={data.jobs}
            contractors={contractors}
            isMobile={isMobile}
            currentUserId={data.currentUser?.id || 'user-1'}
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
            isMobile={isMobile}
            notifications={data.notifications}
            onMarkNotificationRead={(notifId) => {
              setData(prev => ({
                ...prev,
                notifications: prev.notifications.map(n => n.id === notifId ? { ...n, read: true } : n)
              }));
            }}
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

      case 'jobDetail':
        if (selectedJob && selectedCustomer) {
          const clientPaidCount = data.jobs.filter(
            j => j.customerId === selectedCustomer.id && (j.status === 'paid' || j.status === 'invoiced')
          ).length;
          return (
            <WorkOrderPanel
              job={selectedJob}
              siteId={selectedCustomer.id}
              siteName={selectedCustomer.name}
              clientId={selectedCustomer.clientId}
              siteAddress={`${selectedCustomer.address}, ${selectedCustomer.city}, ${selectedCustomer.state}`}
              clientPaidJobCount={clientPaidCount}
              contractors={contractors}
              technicians={data.users.filter(u => u.role === 'technician' || u.role === 'coo').map(u => ({ id: u.id, name: u.name }))}
              currentUserName={currentUser?.name}
              currentUserRole={currentUser?.role}
              xeroConnected={data.xeroConfig.connected}
              customer={selectedCustomer}
              onClose={() => { setSelectedJobId(null); setCurrentView('jobs'); }}
              onSave={(partial) => {
                handleUpdateJob({ ...selectedJob, ...partial, id: selectedJob.id } as Job);
                // Panel stays open — user closes manually
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
              }}
              onQuoteSent={(quoteId, quoteNumber, onlineUrl) => {
                // Find matching CRM customer by email to record in activity timeline
                const crmCustomers = loadCustomers();
                const crmMatch = crmCustomers.find(
                  c => c.email?.toLowerCase() === selectedCustomer?.email?.toLowerCase()
                );
                if (crmMatch) {
                  const interactions = loadInteractions();
                  const label = quoteNumber ? `Quote #${quoteNumber}` : 'Quote';
                  const content = onlineUrl
                    ? `${label} sent via Xero — ${onlineUrl}`
                    : `${label} sent via Xero (Quote ID: ${quoteId})`;
                  const updated = addInteraction(
                    interactions,
                    crmMatch.id,
                    'quote',
                    content,
                    currentUser?.id ?? '',
                    currentUser?.name ?? 'Staff',
                    { subject: `${label} sent via Xero`, direction: 'outbound' }
                  );
                  saveInteractions(updated);
                }
              }}
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
            onViewCustomer={(customerId) => {
              console.log('View customer:', customerId);
            }}
            onSolarEdgeSites={() => setCurrentView('solaredge')}
            isMobile={isMobile}
            initialCustomerId={selectedCustomerId ?? undefined}
          />
        );

      case 'billing':
        return (
          <Billing
            jobs={data.jobs}
            customers={data.customers}
            users={data.users}
            onUpdateJob={handleUpdateJob}
            xeroConnected={data.xeroConfig.connected}
            onConnectXero={handleConnectXero}
            isMobile={isMobile}
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
            isMobile={isMobile}
          />
        );

      case 'inventory':
        return <InventoryModule isMobile={isMobile} />;

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
            onDispatchContractorJob={(cj) => setContractorJobs(prev => [...prev, cj])}
            onUpdateSites={data.solarEdgeConfig.apiKey ? handleUpdateFloridaSites : undefined}
            extraSites={data.solarEdgeExtraSites ?? []}
            solarEdgeApiKey={data.solarEdgeConfig.apiKey || undefined}
            onImportApply={handleImportApply}
          />
        );

      case 'my-jobs':
        if (linkedContractor) {
          return (
            <ContractorDashboard
              contractorName={linkedContractor.contactName}
              contractorId={linkedContractor.id}
              contractor={linkedContractor}
              jobs={contractorJobs.filter(j => j.contractorId === linkedContractor.id)}
              onLogout={() => setCurrentView('dashboard')}
              onUpdateJob={handleContractorJobUpdate}
              onUpdateContractor={(updated) => {
                setContractors(prev => prev.map(c => c.id === updated.id ? updated : c));
                setLinkedContractor(updated);
              }}
            />
          );
        }
        return null;

      case 'settings':
        return (
          <Settings
            currentUser={currentUser}
            xeroConfig={data.xeroConfig}
            solarEdgeConfig={data.solarEdgeConfig}
            onConnectXero={handleConnectXero}
            onXeroDisconnect={handleXeroDisconnect}
            onSaveSolarEdgeApiKey={handleSaveSolarEdgeApiKey}
            onSyncSolarEdge={handleSyncSolarEdge}
            onLogout={handleLogout}
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
            isMobile={isMobile}
          />
        );
    }
  };

  // Add navigation items for admin
  const navItems = [
    { id: 'crm', label: 'Sales CRM' },
    { id: 'customers2', label: 'Customers' },
    { id: 'projects', label: 'New Install' },
    { id: 'operations', label: 'Operations' },
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'jobs', label: 'Work Orders' },
    { id: 'customers', label: 'Legacy' },
    { id: 'billing', label: 'Billing' },
    { id: 'technician', label: 'Manage WORK ORDERS' },
    { id: 'contractors', label: 'Contractors' },
    { id: 'inventory', label: 'Inventory' },
    { id: 'rates', label: 'Rates' },
    { id: 'settings', label: 'Settings' },
  ];


  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="w-8 h-8 border-4 border-orange-400 border-t-transparent rounded-full animate-spin" /></div>}>
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
      >
        {renderView()}
      </Layout>
      <SyncStatusToast />
    </Suspense>
  );
}

export default App;
