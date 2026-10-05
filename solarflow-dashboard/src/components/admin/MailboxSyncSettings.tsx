import { useEffect, useState } from 'react';
import { authedFetch } from '../../lib/supabase';
interface SyncStatus {
  state: null | { enabled: boolean; started_at: string; last_completed_at: string | null; last_error: string | null };
  latest: { id: string; subject: string; message_date: string | null; direction: string; content_status: string }[];
}
export function MailboxSyncSettings() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function load() {
    const response = await authedFetch('/api/mailbox-sync');
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to load sync status.');
    return result as SyncStatus;
  }
  useEffect(() => {
    let active = true;
    void load().then(result => { if (active) setStatus(result); }).catch(() => { if (active) setError('Synchronization settings are unavailable.'); });
    return () => { active = false; };
  }, []);
  async function act(action: 'start-new' | 'pause' | 'run') {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await authedFetch('/api/mailbox-sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Synchronization request failed.');
      setStatus(await load());
      setNotice(action === 'run' ? (result.status === 'synced' ? `Batch checked: ${result.processed} messages processed.` : 'Synchronization is paused or another batch is running.') : action === 'pause' ? 'Synchronization paused.' : 'Capture initialized. Use Run sync to collect new messages.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Synchronization request failed.'); }
    finally { setBusy(false); }
  }
  return <div className="border-t border-slate-200 pt-3 space-y-2">
    <h4 className="font-medium text-slate-900">Email synchronization</h4>
    <p className="text-sm text-slate-600">{status?.state?.enabled ? 'New email capture is ready. Run a batch manually below.' : 'Paused. No background email import is running.'}</p>
    <p className="text-xs text-slate-500">First activation starts with new emails in Inbox and Sent Items. Existing mail is excluded. Resuming retains the original checkpoint, including messages received while paused. Scheduled polling is not enabled for this pilot.</p>
    {status?.state?.last_completed_at && <p className="text-xs text-slate-500">Last batch: {new Date(status.state.last_completed_at).toLocaleString()}</p>}
    {(error || status?.state?.last_error) && <p role="alert" className="text-sm text-red-700">{error || status?.state?.last_error}</p>}
    {notice && <p role="status" className="text-sm text-green-700">{notice}</p>}
    {status && <div className="flex flex-wrap gap-2">
      {status.state?.enabled ? <>
        <button disabled={busy} onClick={() => void act('run')} className="px-3 py-2 border rounded-lg text-sm disabled:opacity-50">{busy ? 'Working…' : 'Run sync'}</button>
        <button disabled={busy} onClick={() => void act('pause')} className="px-3 py-2 border rounded-lg text-sm disabled:opacity-50">Pause capture</button>
      </> : <button disabled={busy} onClick={() => void act('start-new')} className="px-3 py-2 border rounded-lg text-sm disabled:opacity-50">{busy ? 'Connecting…' : status.state ? 'Resume capture' : 'Enable new emails only'}</button>}
    </div>}
    {!!status?.latest.length && <div className="space-y-1">
      <h5 className="text-sm font-medium">Recently captured emails</h5>
      <ul className="text-sm divide-y divide-slate-100">{status.latest.map(message => <li key={message.id} className="py-2">
        <span className="text-slate-500">{message.direction === 'outbound' ? 'Sent' : 'Received'} · </span>
        {message.subject || '(No subject)'}
        {message.content_status === 'too_large' && <span className="text-amber-700"> · Over 15 MB; original remains in IONOS</span>}
      </li>)}</ul>
    </div>}
  </div>;
}
