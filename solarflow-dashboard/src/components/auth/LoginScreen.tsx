import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import type { User } from '../../types';
import {
  PASSKEY_STORE_KEY,
  isPlatformAuthAvailable,
  registerPasskey,
  authenticateWithPasskey,
} from '../../lib/passkey';

export const LoginScreen: React.FC<{
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
    localStorage.removeItem('solarops_reset_mode');
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
    if (authError || !data.user) { setError('Invalid email or password.'); return; }
    const meta = data.user.user_metadata ?? {};
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
    await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
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
        <div className="flex flex-col items-center mb-8">
          <div className="overflow-hidden" style={{ height: 145, width: 300 }}>
            <img src="/conexsol-logo.png" alt="Conexsol" className="brightness-0 invert" style={{ width: 300, height: 'auto', marginTop: -42 }} />
          </div>
          <p className="text-slate-400 text-sm tracking-wide">Operations Management Platform</p>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-2xl">
          <h2 className="text-lg font-bold text-slate-900 mb-5">Staff Login</h2>
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
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
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
