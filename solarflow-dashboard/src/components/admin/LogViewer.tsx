/**
 * LogViewer — Admin audit log panel (Settings page)
 *
 * Reads from localStorage change_log (up to last 100 entries) and
 * displays a color-coded, time-sorted table. Includes a Refresh button
 * and a "Copy JSON" export for sharing with engineering.
 */
import React, { useState, useCallback } from 'react';
import { RefreshCw, Copy, Check, AlertCircle, CheckCircle, Info, Upload, Zap } from 'lucide-react';
import { getRecentLog, ChangeEntry } from '../../lib/changeLog';

// ── Chip colors by op-type prefix ────────────────────────────────────────────
function chipStyle(opType: string): { bg: string; text: string; icon: React.ReactNode } {
  if (opType.includes('fail') || opType.includes('error') || opType.includes('delete')) {
    return { bg: 'bg-red-100', text: 'text-red-700', icon: <AlertCircle className="w-3 h-3" /> };
  }
  if (opType.includes('success') || opType.includes('create') || opType.includes('merge')) {
    return { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: <CheckCircle className="w-3 h-3" /> };
  }
  if (opType.includes('upload_start')) {
    return { bg: 'bg-blue-100', text: 'text-blue-700', icon: <Upload className="w-3 h-3" /> };
  }
  if (opType.includes('update') || opType.includes('avatar')) {
    return { bg: 'bg-amber-100', text: 'text-amber-700', icon: <Zap className="w-3 h-3" /> };
  }
  return { bg: 'bg-slate-100', text: 'text-slate-600', icon: <Info className="w-3 h-3" /> };
}

// ── Relative time formatter ───────────────────────────────────────────────────
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000)  return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

// ── Compact payload summary ───────────────────────────────────────────────────
function payloadSummary(entry: ChangeEntry): string {
  const p = entry.payload as Record<string, unknown> | null;
  if (!p) return '—';

  // Photo events
  if (entry.opType === 'photo.upload_start')   return `${p.name ?? '?'} · ${p.type ?? '?'} · ${Math.round((p.size as number ?? 0) / 1024)}KB`;
  if (entry.opType === 'photo.upload_success') return `✓ ${String(p.storageUrl ?? '').split('/').pop()?.split('?')[0] ?? 'uploaded'}`;
  if (entry.opType === 'photo.upload_fail')    return `✗ ${p.error ?? 'unknown error'}`;
  if (entry.opType === 'avatar.upload_start')  return `${p.name ?? '?'} · ${Math.round((p.size as number ?? 0) / 1024)}KB`;
  if (entry.opType === 'avatar.upload_success') return `✓ avatar updated`;
  if (entry.opType === 'avatar.upload_fail')   return `✗ ${p.error ?? 'unknown error'}`;

  // Generic — show first meaningful key
  const keys = Object.keys(p).filter(k => !k.startsWith('_'));
  if (keys.length === 0) return '—';
  const val = p[keys[0]];
  const str = typeof val === 'string' ? val : JSON.stringify(val);
  return str.slice(0, 60) + (str.length > 60 ? '…' : '');
}

// ── Device chip ───────────────────────────────────────────────────────────────
function deviceLabel(entry: ChangeEntry): string {
  const ua  = entry.device?.ua ?? '';
  const scr = entry.device?.screen ?? '';
  if (/iPhone/.test(ua))  return `📱 iPhone ${scr}`;
  if (/iPad/.test(ua))    return `📱 iPad ${scr}`;
  if (/Android/.test(ua)) return `📱 Android ${scr}`;
  if (/Mac/.test(ua))     return `💻 Mac ${scr}`;
  if (/Windows/.test(ua)) return `🖥 Win ${scr}`;
  return scr || 'unknown';
}

// ── Component ─────────────────────────────────────────────────────────────────
export const LogViewer: React.FC = () => {
  const [entries, setEntries] = useState<ChangeEntry[]>(() => getRecentLog(100));
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState<'all' | 'photo' | 'fail' | 'job' | 'customer'>('all');

  const refresh = useCallback(() => setEntries(getRecentLog(100)), []);

  const handleCopy = useCallback(() => {
    const json = JSON.stringify(entries, null, 2);
    navigator.clipboard.writeText(json).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch((e) => console.error('[LogViewer] clipboard write failed', e));
  }, [entries]);

  const filtered = entries.filter(e => {
    if (filter === 'all')      return true;
    if (filter === 'photo')    return e.entityType === 'photo' || e.opType.startsWith('avatar');
    if (filter === 'fail')     return e.opType.includes('fail') || e.opType.includes('error');
    if (filter === 'job')      return e.entityType === 'job';
    if (filter === 'customer') return e.entityType === 'customer';
    return true;
  });

  const FILTERS = [
    { key: 'all',      label: 'All' },
    { key: 'photo',    label: '📷 Photos' },
    { key: 'fail',     label: '🔴 Errors' },
    { key: 'job',      label: 'Jobs' },
    { key: 'customer', label: 'Customers' },
  ] as const;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 flex-wrap">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                filter === f.key
                  ? 'bg-orange-500 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={refresh}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-slate-500 hover:bg-slate-100 transition-colors"
          >
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-slate-500 hover:bg-slate-100 transition-colors"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied!' : 'Copy JSON'}
          </button>
        </div>
      </div>

      {/* Count */}
      <p className="text-xs text-slate-400">
        {filtered.length} event{filtered.length !== 1 ? 's' : ''}
        {filter !== 'all' ? ` (filtered)` : ''} · device: {DEVICE_ID_DISPLAY}
      </p>

      {/* Table */}
      {filtered.length === 0 ? (
        <p className="text-sm text-slate-400 py-6 text-center">No log entries yet.</p>
      ) : (
        <div className="space-y-1 max-h-[480px] overflow-y-auto pr-1">
          {filtered.map(entry => {
            const chip = chipStyle(entry.opType);
            return (
              <div key={entry.id} className="bg-white border border-slate-100 rounded-lg p-3 flex gap-3 items-start text-xs">
                {/* Time */}
                <span className="text-slate-400 shrink-0 w-14 pt-0.5">{relativeTime(entry.createdAt)}</span>

                {/* Op chip */}
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium shrink-0 ${chip.bg} ${chip.text}`}>
                  {chip.icon}
                  {entry.opType}
                </span>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <p className="text-slate-700 truncate">{payloadSummary(entry)}</p>
                  <p className="text-slate-400 mt-0.5 flex gap-2 flex-wrap">
                    <span>{entry.userEmail}</span>
                    <span>·</span>
                    <span>{deviceLabel(entry)}</span>
                    {entry.durationMs != null && (
                      <><span>·</span><span>{entry.durationMs}ms</span></>
                    )}
                    {entry.syncedAt && (
                      <><span>·</span><span className="text-emerald-500">synced</span></>
                    )}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// Expose DEVICE_ID without importing the whole changeLog just for display
import { DEVICE_ID } from '../../lib/changeLog';
const DEVICE_ID_DISPLAY = DEVICE_ID;
