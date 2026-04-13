// SolarOps — Contractor Login Screen
// Separate portal with field-worker design: dark, bold, orange energy

import React, { useState, useEffect } from 'react';
import { Sun, Mail, Lock, Eye, EyeOff, ArrowLeft, CheckCircle, AlertCircle, Zap } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Contractor } from '../../types/contractor';
import {
  isPlatformAuthAvailable,
  registerPasskey,
  authenticateWithPasskey,
  PASSKEY_STORE_KEY_CONTRACTOR,
} from '../../lib/passkey';

interface ContractorLoginScreenProps {
  contractors: Contractor[];
  onContractorLogin: (contractor: Contractor) => void;
  onRegister: () => void;
  onGoToStaff: () => void;
}

export const ContractorLoginScreen: React.FC<ContractorLoginScreenProps> = ({
  contractors,
  onContractorLogin,
  onRegister,
  onGoToStaff,
}) => {
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [showPass, setShowPass]     = useState(false);
  const [error, setError]           = useState('');
  const [loading, setLoading]       = useState(false);

  // Forgot password
  const [view, setView]             = useState<'login' | 'forgot' | 'sent'>('login');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  // Passkey
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);
  const [passkeyStored, setPasskeyStored]       = useState(false);

  useEffect(() => {
    if (isPlatformAuthAvailable()) {
      window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
        .then(ok => {
          setPasskeyAvailable(ok);
          setPasskeyStored(ok && !!localStorage.getItem(PASSKEY_STORE_KEY_CONTRACTOR));
        })
        .catch(() => {});
    }
    // Remember mode for after password reset
    localStorage.setItem('solarops_reset_mode', 'contractor');
  }, []);

  // ── Login ──────────────────────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
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
    // Allow pure contractors OR dual-role users (isContractor=true)
    if (meta.role !== 'contractor' && !meta.isContractor) {
      await supabase.auth.signOut();
      setError('This portal is for contractors only. Staff should use the staff login.');
      return;
    }

    const contractor = contractors.find(
      c => c.email === data.user!.email || c.altEmails?.includes(data.user!.email ?? '')
    );

    if (!contractor) {
      await supabase.auth.signOut();
      setError('Contractor account not found. Contact your administrator.');
      return;
    }

    if (contractor.status === 'pending') {
      await supabase.auth.signOut();
      setError('Your application is still pending approval.');
      return;
    }

    if (contractor.status !== 'approved') {
      await supabase.auth.signOut();
      setError('Your account has been suspended or rejected.');
      return;
    }

    // Register passkey on first login
    if (passkeyAvailable && !localStorage.getItem(PASSKEY_STORE_KEY_CONTRACTOR)) {
      await registerPasskey(data.user!.id, data.user!.email ?? '', PASSKEY_STORE_KEY_CONTRACTOR);
      setPasskeyStored(true);
    }

    onContractorLogin(contractor);
  };

  // ── Passkey login ─────────────────────────────────────────────────────────
  const handlePasskeyLogin = async () => {
    setError('');
    setLoading(true);
    const rawId = await authenticateWithPasskey(PASSKEY_STORE_KEY_CONTRACTOR);
    if (!rawId) {
      setLoading(false);
      setError('Face ID failed. Sign in with your password first.');
      return;
    }
    let { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      session = refreshed.session;
    }
    setLoading(false);
    if (!session?.user) {
      setError('Session expired. Sign in with your password to re-enable Face ID.');
      return;
    }
    const contractor = contractors.find(
      c => c.email === session.user!.email || c.altEmails?.includes(session.user!.email ?? '')
    );
    if (contractor?.status === 'approved') {
      onContractorLogin(contractor);
    } else {
      setError('Contractor account not found or not approved.');
    }
  };

  // ── Forgot password ───────────────────────────────────────────────────────
  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    const redirectTo = `${window.location.origin}/reset-password`;
    await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), { redirectTo });
    setForgotLoading(false);
    setView('sent');
  };

  // ─────────────────────────────────────────────────────────────────────────
  // FORGOT — sent confirmation
  // ─────────────────────────────────────────────────────────────────────────
  if (view === 'sent') {
    return (
      <Screen>
        <Card>
          <div className="flex flex-col items-center text-center py-4">
            <div className="w-16 h-16 rounded-full bg-orange-500/20 flex items-center justify-center mb-4">
              <CheckCircle className="w-8 h-8 text-orange-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Check your inbox</h2>
            <p className="text-slate-400 text-sm mb-1">A reset link was sent to</p>
            <p className="text-orange-400 font-semibold text-sm mb-6 break-all">{forgotEmail}</p>
            <p className="text-slate-500 text-xs mb-6">
              Click the link in the email to set a new password. Check your spam folder if you don't see it.
            </p>
            <button
              onClick={() => { setView('login'); setForgotEmail(''); }}
              className="w-full py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl transition-colors"
            >
              Back to Login
            </button>
          </div>
        </Card>
      </Screen>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FORGOT — email input
  // ─────────────────────────────────────────────────────────────────────────
  if (view === 'forgot') {
    return (
      <Screen>
        <LogoHeader />
        <Card>
          <button
            onClick={() => setView('login')}
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-orange-400 mb-5 transition-colors min-h-[44px]"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to login
          </button>

          <h2 className="text-xl font-bold text-white mb-1">Reset password</h2>
          <p className="text-slate-400 text-sm mb-6">
            Enter your email and we'll send you a reset link.
          </p>

          <form onSubmit={handleForgot} className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="email"
                value={forgotEmail}
                onChange={e => setForgotEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="w-full pl-10 pr-4 py-3.5 bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={forgotLoading}
              className="w-full py-3.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-60 text-white font-bold rounded-xl transition-colors shadow-lg shadow-orange-500/20"
            >
              {forgotLoading ? 'Sending…' : 'Send Reset Link'}
            </button>
          </form>
        </Card>
      </Screen>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MAIN LOGIN
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <Screen>
      <LogoHeader />

      <Card>
        {/* Face ID button */}
        {passkeyAvailable && (
          <button
            type="button"
            onClick={passkeyStored ? handlePasskeyLogin : undefined}
            disabled={loading || !passkeyStored}
            title={!passkeyStored ? 'Sign in with password first to enable Face ID' : ''}
            className={`w-full flex items-center justify-center gap-2 py-3.5 mb-5 rounded-xl font-semibold text-sm border-2 transition-colors ${
              passkeyStored
                ? 'border-orange-500/40 text-orange-400 hover:bg-orange-500/10 cursor-pointer'
                : 'border-slate-700 text-slate-500 cursor-default border-dashed'
            } disabled:opacity-50`}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2C8.686 2 6 4.686 6 8c0 2.09.81 3.98 2.13 5.37L6 22h12l-2.13-8.63A7.96 7.96 0 0 0 18 8c0-3.314-2.686-6-6-6z"/>
              <circle cx="12" cy="8" r="2"/>
            </svg>
            {passkeyStored ? 'Sign in with Face ID / Touch ID' : 'Face ID available — sign in once to enable'}
          </button>
        )}

        {/* Divider */}
        {passkeyAvailable && (
          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-slate-700" />
            <span className="text-xs text-slate-500 uppercase tracking-wider">or continue with password</span>
            <div className="flex-1 h-px bg-slate-700" />
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          {/* Email */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="contractor@email.com"
                required
                autoComplete="email"
                className="w-full pl-10 pr-4 py-3.5 bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Password</label>
              <button
                type="button"
                onClick={() => setView('forgot')}
                className="text-xs text-orange-400 hover:text-orange-300 transition-colors py-1 px-1 min-h-[44px] flex items-center"
              >
                Forgot password?
              </button>
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                autoComplete="current-password"
                className="w-full pl-10 pr-12 py-3.5 bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors p-1"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-orange-500 hover:bg-orange-400 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-base rounded-xl transition-all shadow-lg shadow-orange-500/25 active:scale-[0.98]"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                Signing in…
              </span>
            ) : 'Access Contractor Portal'}
          </button>
        </form>

        {/* Register link */}
        <div className="mt-5 pt-5 border-t border-slate-700/60 text-center">
          <p className="text-sm text-slate-500">
            Not a contractor yet?{' '}
            <button
              onClick={onRegister}
              className="text-orange-400 font-semibold hover:text-orange-300 transition-colors"
            >
              Apply to join
            </button>
          </p>
        </div>
      </Card>

      {/* Staff login link */}
      <div className="mt-4 text-center">
        <button
          onClick={onGoToStaff}
          className="text-xs text-slate-500 hover:text-slate-400 transition-colors py-2 inline-flex items-center gap-1"
        >
          <Zap className="w-3 h-3" />
          Staff / Admin login
        </button>
      </div>
    </Screen>
  );
};

// ── Shared layout sub-components ───────────────────────────────────────────

const Screen: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-[#0a0f1a] flex flex-col items-center justify-center p-4 relative overflow-hidden">
    {/* Background glow */}
    <div className="absolute inset-0 pointer-events-none">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-orange-500/8 rounded-full blur-3xl" />
      <div className="absolute bottom-0 right-0 w-[300px] h-[300px] bg-orange-600/5 rounded-full blur-3xl" />
    </div>
    <div className="w-full max-w-sm relative z-10">{children}</div>
  </div>
);

const Card: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="bg-slate-900/80 backdrop-blur-sm border border-slate-700/60 rounded-2xl p-6 shadow-2xl">
    {children}
  </div>
);

const LogoHeader: React.FC = () => (
  <div className="flex flex-col items-center mb-6">
    {/* Icon mark */}
    <div className="w-16 h-16 rounded-2xl bg-orange-500 flex items-center justify-center mb-4 shadow-lg shadow-orange-500/30">
      <Sun className="w-8 h-8 text-white" />
    </div>
    <h1 className="text-2xl font-bold text-white tracking-tight">Contractor Portal</h1>
    <p className="text-slate-400 text-sm mt-1">ConexSol Field Team Access</p>
  </div>
);
