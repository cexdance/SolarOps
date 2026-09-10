// SolarOps, end-of-day report settings (Settings, requires users.manage).
//
// Edits the recipient list the nightly cron reads. Saved to app_data via the
// synced KV key, not localStorage, because the sender runs server-side.
import React, { useCallback, useEffect, useState } from 'react';
import { Mail, Send, Plus, X, Clock, AlertTriangle } from 'lucide-react';
import {
  DAILY_REPORT_KEY,
  DailyReportConfig,
  DEFAULT_DAILY_REPORT,
  normalizeConfig,
  isValidEmail,
  isValidChatId,
  hasRecipients,
} from '../../lib/dailyReportConfig';
import { dbSet } from '../../lib/db';

// Read from localStorage, not dbGet: dbGet is a deprecated stub that always
// returns null, so using it would show an empty recipient list forever and then
// save that emptiness over the real one. The sync engine mirrors every KV key
// into localStorage on pull, which is what the other KV stores read.
function loadConfig(): DailyReportConfig {
  try {
    const raw = localStorage.getItem(DAILY_REPORT_KEY);
    return normalizeConfig(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_DAILY_REPORT };
  }
}

export const DailyReportSettings: React.FC = () => {
  const [cfg, setCfg] = useState<DailyReportConfig>(DEFAULT_DAILY_REPORT);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [emailDraft, setEmailDraft] = useState('');
  const [chatDraft, setChatDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCfg(loadConfig());
    setLoaded(true);
    // A remote pull rewrites the KV mirror, so pick that up rather than showing
    // a stale list until reload.
    const onRemote = () => setCfg(loadConfig());
    window.addEventListener('solarflow-remote-update', onRemote);
    return () => window.removeEventListener('solarflow-remote-update', onRemote);
  }, []);

  const persist = useCallback(async (next: DailyReportConfig) => {
    setCfg(next);
    setSaving(true);
    setError(null);
    try {
      // Mirror locally first so the UI survives a reload even if the push is
      // queued to the outbox, matching the other KV stores.
      try { localStorage.setItem(DAILY_REPORT_KEY, JSON.stringify(next)); } catch { /* quota */ }
      await dbSet(DAILY_REPORT_KEY, next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }, []);

  const addEmail = () => {
    const v = emailDraft.trim();
    if (!isValidEmail(v)) { setError(`"${v}" does not look like an email address.`); return; }
    if (cfg.emails.some(x => x.toLowerCase() === v.toLowerCase())) { setEmailDraft(''); return; }
    setEmailDraft('');
    void persist({ ...cfg, emails: [...cfg.emails, v] });
  };

  const addChat = () => {
    const v = chatDraft.trim();
    if (!isValidChatId(v)) { setError(`"${v}" is not a Telegram chat id or @name.`); return; }
    if (cfg.telegramChatIds.includes(v)) { setChatDraft(''); return; }
    setChatDraft('');
    void persist({ ...cfg, telegramChatIds: [...cfg.telegramChatIds, v] });
  };

  const enabledButEmpty = cfg.enabled && !hasRecipients(cfg);

  return (
    <div className="bg-white rounded-xl border border-slate-200 mb-6">
      <div className="p-4 border-b border-slate-100">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-900">End-of-day report</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Sends the team workload summary each night. Estimated from app activity, a floor rather than a timesheet.
            </p>
          </div>
          <label className="flex items-center gap-2 shrink-0 cursor-pointer">
            <span className="text-xs text-slate-500">{cfg.enabled ? 'On' : 'Off'}</span>
            <input
              type="checkbox"
              checked={cfg.enabled}
              disabled={!loaded}
              onChange={e => void persist({ ...cfg, enabled: e.target.checked })}
              className="w-4 h-4 accent-orange-500 cursor-pointer"
              aria-label="Enable the end-of-day report"
            />
          </label>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span>Runs nightly at about 11:00 PM Eastern, covering that day.</span>
        </div>

        {error && (
          <div className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 rounded p-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span className="min-w-0 break-words">{error}</span>
          </div>
        )}

        {enabledButEmpty && (
          <div className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 rounded p-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>Switched on, but there is nobody to send to. Add a recipient below.</span>
          </div>
        )}

        {/* Email recipients */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Mail className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-700">Email</span>
          </div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {cfg.emails.map(e => (
              <span key={e} className="inline-flex items-center gap-1 bg-slate-100 rounded px-2 py-1 text-xs text-slate-700">
                {e}
                <button
                  onClick={() => void persist({ ...cfg, emails: cfg.emails.filter(x => x !== e) })}
                  className="text-slate-400 hover:text-red-600"
                  aria-label={`Remove ${e}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {cfg.emails.length === 0 && <span className="text-xs text-slate-400">No email recipients.</span>}
          </div>
          <div className="flex gap-2">
            <input
              type="email"
              value={emailDraft}
              onChange={e => setEmailDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEmail(); } }}
              placeholder="name@conexsol.us"
              className="flex-1 min-w-0 px-3 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-orange-500/30"
            />
            <button
              onClick={addEmail}
              disabled={!emailDraft.trim()}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-slate-900 text-white rounded disabled:opacity-40"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>
        </div>

        {/* Telegram recipients */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Send className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-700">Telegram</span>
          </div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {cfg.telegramChatIds.map(c => (
              <span key={c} className="inline-flex items-center gap-1 bg-slate-100 rounded px-2 py-1 text-xs text-slate-700">
                {c}
                <button
                  onClick={() => void persist({ ...cfg, telegramChatIds: cfg.telegramChatIds.filter(x => x !== c) })}
                  className="text-slate-400 hover:text-red-600"
                  aria-label={`Remove ${c}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {cfg.telegramChatIds.length === 0 && <span className="text-xs text-slate-400">No Telegram recipients.</span>}
          </div>
          <div className="flex gap-2">
            <input
              value={chatDraft}
              onChange={e => setChatDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addChat(); } }}
              placeholder="Chat id, or @channelname"
              className="flex-1 min-w-0 px-3 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-orange-500/30"
            />
            <button
              onClick={addChat}
              disabled={!chatDraft.trim()}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-slate-900 text-white rounded disabled:opacity-40"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>
          <p className="text-[11px] text-slate-400 mt-1.5">
            Telegram needs a bot token set on the server. Until then these are saved but not delivered.
          </p>
        </div>

        {saving && <p className="text-xs text-slate-400">Saving...</p>}
      </div>
    </div>
  );
};
