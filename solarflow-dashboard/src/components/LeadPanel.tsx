// Lead card for the LL board's funnel. A lead is a Job with no customer yet, so
// the standard Service Order panel can't open it. This lightweight panel lets the
// team add contact info and log call/email/note actions on the lead, then convert
// it to a client. Everything is stored on the job (leadInfo + activityHistory)
// until "Move to Client" creates the real Customer.
import React, { useState } from 'react';
import { Phone, Mail, FileText, X, UserCheck, PhoneCall, MessageSquare } from 'lucide-react';
import type { Job, LeadInfo, Activity } from '../types';
import { seedLeadInfo, leadDisplayName, formatImportedAt } from '../lib/leadConvert';
import { rcCall, rcSMS } from '../lib/ringcentral';
import { LabelPicker } from './LabelPicker';

interface LeadPanelProps {
  job: Job;
  currentUserName?: string;
  onSave: (partial: Partial<Job>) => void;
  onConvertToClient: () => void;
  onClose: () => void;
}

const FIELD = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-400';

/**
 * Draft "log a contact action" text, per lead, at MODULE scope so it survives a
 * remount of this panel.
 *
 * It has to live outside the component. Saving a contact field fires onSave on
 * blur, which updates the job, pushes through the sync engine and re-renders
 * this panel asynchronously - and the parent unmounts the panel outright if the
 * jobs array transiently does not contain the lead. Either path resets useState
 * and silently swallowed whatever the user had typed: two real notes were lost
 * this way on 2026-08-24 and saved as the bare fallback "Call: contacted".
 *
 * Keyed by job id so two leads never share a draft. Cleared once the entry is
 * actually logged.
 */
const logDrafts = new Map<string, string>();

export function getLogDraft(jobId: string): string {
  return logDrafts.get(jobId) ?? '';
}
export function setLogDraft(jobId: string, text: string): void {
  if (text) logDrafts.set(jobId, text);
  else logDrafts.delete(jobId);
}

export const LeadPanel: React.FC<LeadPanelProps> = ({ job, currentUserName, onSave, onConvertToClient, onClose }) => {
  const [info, setInfo] = useState<LeadInfo>(() => seedLeadInfo(job));
  const [logText, setLogTextState] = useState(() => getLogDraft(job.id));
  // Mirror every keystroke into the module-scope draft, so a remount mid-typing
  // restores the text instead of losing it.
  const setLogText = (t: string) => { setLogDraft(job.id, t); setLogTextState(t); };
  // Local activity mirror so logged actions render immediately.
  const [activity, setActivity] = useState<Activity[]>(job.activityHistory ?? []);
  const set = (k: keyof LeadInfo, v: string) => setInfo(p => ({ ...p, [k]: v }));

  const saveInfo = () => onSave({ leadInfo: info });

  const log = (kind: 'Call' | 'Email' | 'Note') => {
    const body = logText.trim();
    const entry: Activity = {
      id: `lead-log-${Date.now()}`,
      type: 'note_added',
      description: `${kind}: ${body || (kind === 'Call' ? 'contacted' : kind === 'Email' ? 'emailed' : 'note')}`,
      timestamp: new Date().toISOString(),
      userName: currentUserName,
    };
    const next = [entry, ...activity];
    setActivity(next);
    setLogText('');            // clears the persisted draft too
    // Persist the log AND any in-progress contact edits in one save.
    onSave({ leadInfo: info, activityHistory: next });
  };

  const sorted = [...activity].sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 sticky top-0 bg-white">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900 truncate">{leadDisplayName(job)}</h2>
            <p className="text-xs text-slate-500">
              Lead {job.clientId ? `· ${job.clientId}` : ''}
              {job.createdAt && (
                <span title={`Imported ${new Date(job.createdAt).toLocaleString()}`}>
                  {' · Imported '}{formatImportedAt(job.createdAt)}
                </span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5 text-slate-500" /></button>
        </div>

        <div className="p-4 space-y-4">
          {/* Labels (also render as chips on the kanban card) */}
          <LabelPicker value={job.labels ?? []} onChange={labels => onSave({ labels })} />

          {/* Contact info */}
          <div className="space-y-3">
            <div className="flex gap-2">
              <input className={FIELD} placeholder="First name" value={info.firstName ?? ''} onChange={e => set('firstName', e.target.value)} onBlur={saveInfo} />
              <input className={FIELD} placeholder="Last name" value={info.lastName ?? ''} onChange={e => set('lastName', e.target.value)} onBlur={saveInfo} />
            </div>
            {/* Reach the lead: call, text, email. Same trio and icons as the
                customer record (CustomerManagement), so the actions read the
                same everywhere. Each sits beside the field that feeds it and is
                disabled until that field has a value, and each only LAUNCHES the
                conversation: logging it stays the explicit step below, or every
                misdial would write a contact record. */}
            <div className="flex gap-2">
              <input className={FIELD} placeholder="Phone" value={info.phone ?? ''} onChange={e => set('phone', e.target.value)} onBlur={saveInfo} />
              <button
                type="button"
                onClick={() => info.phone && rcCall(info.phone)}
                disabled={!info.phone}
                title="Call via RingCentral"
                className="shrink-0 px-3 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-40 flex items-center gap-1"
              >
                <PhoneCall className="w-4 h-4" /> Call
              </button>
              <button
                type="button"
                onClick={() => info.phone && rcSMS(info.phone)}
                disabled={!info.phone}
                title="Text via RingCentral"
                className="shrink-0 px-3 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 disabled:opacity-40 flex items-center gap-1"
              >
                <MessageSquare className="w-4 h-4" /> SMS
              </button>
            </div>
            <div className="flex gap-2">
              <input className={FIELD} placeholder="Email" value={info.email ?? ''} onChange={e => set('email', e.target.value)} onBlur={saveInfo} />
              <button
                type="button"
                onClick={() => info.email && window.open(`mailto:${info.email}`)}
                disabled={!info.email}
                title="Email this lead"
                className="shrink-0 px-3 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40 flex items-center gap-1"
              >
                <Mail className="w-4 h-4" /> Email
              </button>
            </div>
            <input className={FIELD} placeholder="Address" value={info.address ?? ''} onChange={e => set('address', e.target.value)} onBlur={saveInfo} />
            <div className="flex gap-2">
              <input className={FIELD} placeholder="City" value={info.city ?? ''} onChange={e => set('city', e.target.value)} onBlur={saveInfo} />
              <input className={`${FIELD} w-20`} placeholder="State" value={info.state ?? ''} onChange={e => set('state', e.target.value)} onBlur={saveInfo} />
              <input className={`${FIELD} w-28`} placeholder="Zip" value={info.zip ?? ''} onChange={e => set('zip', e.target.value)} onBlur={saveInfo} />
            </div>
          </div>

          {/* Log a contact action */}
          <div className="border border-slate-200 rounded-lg p-3 space-y-2 bg-slate-50/60">
            <p className="text-xs font-semibold text-slate-600">Log a contact action</p>
            <textarea rows={2} className={`${FIELD} resize-none`} placeholder="What happened on the call / email? (optional)" value={logText} onChange={e => setLogText(e.target.value)} />
            <div className="flex gap-2">
              <button type="button" onClick={() => log('Call')} className="flex-1 py-1.5 text-xs font-medium rounded-lg bg-white border border-slate-200 hover:bg-slate-100 flex items-center justify-center gap-1"><Phone className="w-3.5 h-3.5 text-green-600" /> Log Call</button>
              <button type="button" onClick={() => log('Email')} className="flex-1 py-1.5 text-xs font-medium rounded-lg bg-white border border-slate-200 hover:bg-slate-100 flex items-center justify-center gap-1"><Mail className="w-3.5 h-3.5 text-blue-600" /> Log Email</button>
              <button type="button" onClick={() => log('Note')} className="flex-1 py-1.5 text-xs font-medium rounded-lg bg-white border border-slate-200 hover:bg-slate-100 flex items-center justify-center gap-1"><FileText className="w-3.5 h-3.5 text-slate-500" /> Log Note</button>
            </div>
          </div>

          {/* Activity */}
          <div>
            <p className="text-xs font-semibold text-slate-600 mb-2">Activity ({sorted.length})</p>
            {sorted.length === 0 ? (
              <p className="text-xs text-slate-400">No contact logged yet.</p>
            ) : (
              <ul className="space-y-2 max-h-52 overflow-y-auto">
                {sorted.map(a => (
                  <li key={a.id} className="text-xs border-l-2 border-slate-200 pl-2">
                    <p className="text-slate-700 whitespace-pre-wrap break-words">{a.description}</p>
                    <p className="text-slate-400">{a.userName || 'Someone'} · {(a.timestamp || '').slice(0, 16).replace('T', ' ')}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 sticky bottom-0 bg-white flex justify-between gap-2">
          <button onClick={() => { saveInfo(); onClose(); }} className="px-4 py-2 text-sm font-medium text-slate-600 rounded-lg border border-slate-200 hover:bg-slate-50">Save & Close</button>
          <button onClick={onConvertToClient} className="px-4 py-2 text-sm font-semibold text-white bg-orange-500 rounded-lg hover:bg-orange-600 flex items-center gap-1.5">
            <UserCheck className="w-4 h-4" /> Move to Client
          </button>
        </div>
      </div>
    </div>
  );
};
