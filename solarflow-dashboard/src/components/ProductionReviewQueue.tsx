import { useCallback, useEffect, useState } from 'react';
import { authedFetch } from '../lib/supabase';
import type { Review, ReviewState } from '../../../api/_productionReview';
const ENDPOINT = '/api/solaredge?action=production-reviews';
export function ProductionReviewQueue({ role }: { role?: string }) {
  const [state, setState] = useState<ReviewState | null>(null);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [history, setHistory] = useState(false);
  const [selected, setSelected] = useState<Review | null>(null); const [notes, setNotes] = useState('');
  const canReview = ['admin', 'coo', 'support'].includes(role || '');
  const load = useCallback(async () => {
    setBusy(true); setError('');
    try { const r = await authedFetch(ENDPOINT); const body = await r.json(); if (!r.ok) throw new Error(body.error || 'Review queue unavailable'); if (!Array.isArray(body.reviews)) throw new Error('Review queue response is unavailable. Refresh after deployment.'); setState(body); }
    catch (e) { setError(e instanceof Error ? e.message : 'Review queue unavailable'); } finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function save(review: Review, status: Review['status']) {
    setBusy(true); setError('');
    try {
      const r = await authedFetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: review.id, status, notes: selected?.id === review.id ? notes : review.notes || '' }) });
      const body = await r.json(); if (!r.ok) throw new Error(body.error || 'Could not save review'); setState(body); setSelected(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save review'); } finally { setBusy(false); }
  }
  const pending = state?.reviews.filter(r => r.status !== 'reviewed') || [];
  const rows = history ? state?.reviews || [] : pending; const run = state?.lastRun;
  const awaitingEmail = pending.filter(r => !r.notifiedAt).length;
  const stale = run && Date.now() - Date.parse(run.completedAt || run.startedAt) > 36 * 3600000;
  return <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3" aria-label="Production review queue">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="font-semibold text-slate-900">Human review queue <span className="text-amber-700">({pending.length})</span></h2>
        <p className="text-sm text-slate-600">Daily Florida scan: communication lost for 48 hours or production down at least 40%.</p>
        <p className="text-xs text-slate-500">Latest 7 completed local days compared with the average of the preceding 10 weeks. Email to cesar.jurado@conexsol.us requires approval before sending.</p></div>
      <div className="flex gap-2"><button type="button" className="text-sm text-blue-700 underline" onClick={() => setHistory(!history)}>{history ? 'Show pending' : 'Show history'}</button>
        <button type="button" disabled={busy} onClick={() => void load()} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50">{busy ? 'Loading...' : 'Refresh queue'}</button></div>
    </div>
    {awaitingEmail > 0 && <p className="text-xs text-amber-800">{awaitingEmail} alert notifications awaiting approval. Emails are held until explicitly approved.</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {run ? <div className={`rounded-lg px-3 py-2 text-xs ${stale || run.status !== 'complete' ? 'bg-amber-50 text-amber-900' : 'bg-slate-50 text-slate-600'}`}>
      Last scan: {new Date(run.completedAt || run.startedAt).toLocaleString()} ({run.status}). {run.checked}/{run.total} sites have a complete production comparison. {run.insufficient} have insufficient history. {run.unknownCommunication} lack a communication timestamp or open site fault. {run.errors} reads failed.
      {stale && ' Scan is overdue. Results may be stale.'}{run.error && ` ${run.error}`}
    </div> : state && <p className="text-sm text-slate-600">Awaiting the first fleet scan. No health conclusion is available yet.</p>}
    {state && !rows.length && <p className="text-sm text-slate-600">{history ? 'No review history yet.' : 'No pending human reviews.'}</p>}
    <div className="space-y-2">{[...rows].reverse().map(review => <article key={review.id} className="rounded-lg border border-slate-200 p-3">
      <div className="flex flex-wrap justify-between gap-2"><div><h3 className="text-sm font-semibold text-slate-900">{review.name} <span className="font-normal text-slate-500">Site {review.siteId}</span></h3>
        <p className="text-sm text-slate-700">{review.finding.detail}</p><p className="text-xs text-slate-500 mt-1">{review.status.replace('_', ' ')} | {review.active ? 'Condition still active' : review.status === 'reviewed' ? 'Condition recovered' : 'Condition recovered; human review remains required'} | Flagged {new Date(review.openedAt).toLocaleString()}{review.reviewer && ` | ${review.reviewer}`}</p>
        {review.notes && <p className="text-sm text-slate-600 mt-1">Review: {review.notes}</p>}</div>
        <div className="flex flex-wrap items-start gap-2"><a className="text-sm text-blue-700 underline" href={`https://monitoring.solaredge.com/one#/residential/digital-twin?siteId=${review.siteId}`} target="_blank" rel="noreferrer">Open SolarEdge</a>
          {canReview && review.status === 'open' && <button disabled={busy} onClick={() => void save(review, 'in_review')} className="text-sm rounded-md bg-amber-100 text-amber-900 px-2 py-1">Start review</button>}
          {canReview && review.status !== 'reviewed' && <button disabled={busy} onClick={() => { setSelected(review); setNotes(review.notes || ''); }} className="text-sm rounded-md bg-slate-800 text-white px-2 py-1">Record review</button>}
          {canReview && review.status === 'reviewed' && <button disabled={busy} onClick={() => void save(review, 'open')} className="text-sm text-blue-700 underline">Reopen review</button>}</div></div>
      {selected?.id === review.id && <form className="mt-3 space-y-2" onSubmit={e => { e.preventDefault(); void save(review, 'reviewed'); }}>
        <label className="block text-sm text-slate-700" htmlFor="production-review-notes">Findings and next steps</label><textarea id="production-review-notes" required maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} className="w-full rounded-md border border-slate-300 p-2 text-sm" rows={3} />
        <div className="flex gap-2"><button disabled={busy || !notes.trim()} className="bg-slate-800 text-white rounded-lg px-3 py-2 text-sm disabled:opacity-50">Complete human review</button><button type="button" onClick={() => setSelected(null)} className="text-sm px-3 py-2">Cancel</button></div>
      </form>}
    </article>)}</div>
  </section>;
}
