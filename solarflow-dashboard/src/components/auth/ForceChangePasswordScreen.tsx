import { useState } from 'react';
import { supabase } from '../../lib/supabase';

export const ForceChangePasswordScreen: React.FC<{
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
              <svg className="w-5 h-5 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
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
