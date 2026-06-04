/**
 * UserActivityLog — Admin view of everything ONE user has done.
 *
 * Opened from the User Permissions panel "View log" quick link. Pulls that
 * user's cross-device history from Supabase change_log (merged with the local
 * log) so an admin can trace who changed what, and when. Each entry that maps
 * to a customer or work order deep-links straight to that card.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  X, RefreshCw, AlertCircle, CheckCircle, Info, Upload, Zap, ArrowUpRight, Loader2,
} from 'lucide-react';
import { fetchLogForUser, ChangeEntry } from '../../lib/changeLog';

// ── Op-type chip styling (mirrors LogViewer) ──────────────────────────────────
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
  if (opType.includes('update') || opType.includes('permits') || opType.includes('avatar')) {
    return { bg: 'bg-amber-100', text: 'text-amber-700', icon: <Zap className="w-3 h-3" /> };
  }
  return { bg: 'bg-slate-100', text: 'text-slate-600', icon: <Info className="w-3 h-3" /> };
}

function fullTime(iso: string): string {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function payloadSummary(entry: ChangeEntry): string {
  const p = entry.payload as Record<string, unknown> | null;
  if (!p) return '';
  if ((p as any).changed && typeof (p as any).changed === 'object') {
    const fields = Object.keys((p as any).changed);
    return fields.length ? `changed: ${fields.join(', ')}` : '';
  }
  const keys = Object.keys(p).filter(k => !k.startsWith('_'));
  if (keys.length === 0) return '';
  const val = p[keys[0]];
  const str = typeof val === 'string' ? val : JSON.stringify(val);
  return `${keys[0]}: ${str.slice(0, 80)}${str.length > 80 ? '…' : ''}`;
}

// Entity types we can deep-link to. Others render as plain text.
const LINKABLE = new Set(['customer', 'job']);

interface UserActivityLogProps {
  userEmail: string;
  userName: string;
  onClose: () => void;
  /** Navigate the app to the entity. Returns nothing; closes this modal first. */
  onNavigate?: (entityType: string, entityId: string) => void;
}

export const UserActivityLog: React.FC<UserActivityLogProps> = ({
  userEmail, userName, onClose, onNavigate,
}) => {
  const [entries, setEntries] = useState<ChangeEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetchLogForUser(userEmail, 200)
      .then(setEntries)
      .finally(() => setLoading(false));
  }, [userEmail]);

  useEffect(() => { load(); }, [load]);

  const openEntity = (entry: ChangeEntry) => {
    if (!onNavigate || !LINKABLE.has(entry.entityType)) return;
    onClose();
    onNavigate(entry.entityType, entry.entityId);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <div>
            <h3 className="font-semibold text-slate-900">Activity log</h3>
            <p className="text-xs text-slate-500 mt-0.5">{userName} · {userEmail}</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={load}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-slate-500 hover:bg-slate-100 transition-colors"
            >
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-slate-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading activity…
            </div>
          ) : entries.length === 0 ? (
            <p className="text-sm text-slate-400 py-10 text-center">No recorded activity for this user.</p>
          ) : (
            <div className="space-y-1">
              {entries.map(entry => {
                const chip = chipStyle(entry.opType);
                const linkable = !!onNavigate && LINKABLE.has(entry.entityType);
                return (
                  <div
                    key={entry.id}
                    className="bg-white border border-slate-100 rounded-lg p-3 flex gap-3 items-start text-xs"
                  >
                    <span className="text-slate-400 shrink-0 w-32 pt-0.5">{fullTime(entry.createdAt)}</span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium shrink-0 ${chip.bg} ${chip.text}`}>
                      {chip.icon}
                      {entry.opType}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-700 break-words">{payloadSummary(entry)}</p>
                      <p className="text-slate-400 mt-0.5">{entry.entityType} · {entry.entityId}</p>
                    </div>
                    {linkable && (
                      <button
                        onClick={() => openEntity(entry)}
                        className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-orange-600 hover:bg-orange-50 font-medium"
                      >
                        Open <ArrowUpRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-3 border-t border-slate-100 text-center">
          <p className="text-xs text-slate-400">{entries.length} event{entries.length !== 1 ? 's' : ''}</p>
        </div>
      </div>
    </div>
  );
};
