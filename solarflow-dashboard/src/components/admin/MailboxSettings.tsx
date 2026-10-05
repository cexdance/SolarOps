import { useEffect, useState } from 'react';
import { authedFetch } from '../../lib/supabase';
import { MailboxSyncSettings } from './MailboxSyncSettings';

interface Check { ok: boolean; error?: string; messages?: number; sentFolder?: string | null }
interface Status {
  configured: boolean;
  email?: string;
  smtpHost?: string;
  smtpPort?: number;
  imapHost?: string;
  checks?: { smtp: Check; imap: Check; checkedAt: string };
}

export function MailboxSettings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [region, setRegion] = useState('com');
  const [port, setPort] = useState(465);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void authedFetch('/api/mailbox').then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to load mailbox.');
      if (!active) return;
      setStatus(result);
      setEmail(result.email || '');
      setRegion(result.smtpHost?.replace('smtp.ionos.', '') || 'com');
      setPort(result.smtpPort || 465);
      setEditing(!result.configured);
      setLoaded(true);
    }).catch(() => { if (active) setError('Mailbox setup is unavailable. The server endpoint, database migration and encryption key must be configured.'); });
    return () => { active = false; };
  }, []);

  async function run(action: 'save' | 'check') {
    setBusy(true);
    setError('');
    try {
      const response = await authedFetch('/api/mailbox', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...(action === 'save' ? { config: { email, password, smtpHost: `smtp.ionos.${region}`, smtpPort: port, imapHost: `imap.ionos.${region}` } } : {}) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Mailbox request failed.');
      setStatus(result);
      if (action === 'save') { setPassword(''); setEditing(false); }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Mailbox request failed.');
    } finally { setBusy(false); }
  }

  return <section className="p-4 border-b border-slate-100 space-y-3" aria-label="Shared IONOS mailbox">
    <div>
      <h3 className="font-medium text-slate-900">Shared IONOS mailbox</h3>
      <p className="text-sm text-slate-500">Connect the team mailbox for the upcoming communications inbox. Credentials are encrypted on the server.</p>
    </div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {!loaded && !error && <p className="text-sm text-slate-500">Loading mailbox settings…</p>}
    {status?.configured && <div className="text-sm text-slate-700">
      <p>{status.email}</p>
      <p>SMTP: {status.smtpHost}:{status.smtpPort} · IMAP: {status.imapHost}:993</p>
    </div>}
    {status?.checks && <div role="status" className="text-sm space-y-1">
      <p className={status.checks.smtp.ok ? 'text-green-700' : 'text-red-700'}>Sending: {status.checks.smtp.ok ? 'SMTP authentication verified (no email sent)' : status.checks.smtp.error}</p>
      <p className={status.checks.imap.ok ? 'text-green-700' : 'text-red-700'}>Receiving: {status.checks.imap.ok ? `IMAP verified · ${status.checks.imap.messages} messages in Inbox` : status.checks.imap.error}</p>
      {status.checks.imap.ok && <p>Sent folder: {status.checks.imap.sentFolder || 'Not detected automatically; folder selection will be needed before synchronization.'}</p>}
      <p className="text-slate-500">Checked {new Date(status.checks.checkedAt).toLocaleString()}</p>
    </div>}
    {editing && loaded && <form className="space-y-3" onSubmit={event => { event.preventDefault(); void run('save'); }}>
      <label className="block text-sm">Mailbox email
        <input required type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} className="block w-full border rounded-lg p-2" />
      </label>
      <label className="block text-sm">Mailbox password
        <input required type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} className="block w-full border rounded-lg p-2" />
      </label>
      <div className="flex gap-3">
        <label className="text-sm">IONOS server region
          <select value={region} onChange={event => setRegion(event.target.value)} className="block border rounded-lg p-2">
            {['com', 'co.uk', 'ca', 'de', 'fr', 'es', 'it'].map(value => <option key={value} value={value}>ionos.{value}</option>)}
          </select>
        </label>
        <label className="text-sm">SMTP encryption
          <select value={port} onChange={event => setPort(Number(event.target.value))} className="block border rounded-lg p-2">
            <option value={465}>465 · TLS</option><option value={587}>587 · STARTTLS</option>
          </select>
        </label>
      </div>
      <p className="text-xs text-slate-500">Saving verifies SMTP and IMAP without sending email or changing messages.</p>
      <button disabled={busy} className="px-3 py-2 bg-orange-500 text-white rounded-lg disabled:opacity-50">{busy ? 'Checking…' : 'Verify & save connection'}</button>
      {status?.configured && <button type="button" disabled={busy} onClick={() => { setEditing(false); setPassword(''); }} className="ml-3 text-sm">Cancel</button>}
    </form>}
    {status?.configured && !editing && <div className="flex gap-3">
      <button disabled={busy} onClick={() => void run('check')} className="px-3 py-2 border rounded-lg text-sm disabled:opacity-50">{busy ? 'Checking…' : 'Check connection'}</button>
      <button disabled={busy} onClick={() => setEditing(true)} className="text-sm">Edit connection</button>
    </div>}
    {status?.configured && <MailboxSyncSettings />}
  </section>;
}
