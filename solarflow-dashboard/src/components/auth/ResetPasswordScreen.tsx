import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

export const ResetPasswordScreen: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const hasRecoveryHash = window.location.hash.includes('type=recovery') || window.location.hash.includes('access_token');
  const [sessionReady, setSessionReady] = useState(hasRecoveryHash);

  useEffect(() => {
    if (hasRecoveryHash) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessionReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') && session) setSessionReady(true);
    });
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
