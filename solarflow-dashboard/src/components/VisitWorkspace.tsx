import { useState } from 'react';
import type { Job } from '../types';
import { allVisits, currentVisitId, visitNeedsApproval, MAX_VISITS } from '../lib/visits';
import { changeVisit } from '../lib/visitApi';
import { loadServiceRates } from '../lib/contractorStore';
import VisitHistory from './VisitHistory';
import VisitLaborEditor from './VisitLaborEditor';
export default function VisitWorkspace({ job, isAdmin, onSave, onSelectionChange, snapshot }: { job: Job; isAdmin: boolean; onSave: (job: Job) => void; onSelectionChange?: (historical: boolean) => void; snapshot?: Record<string, unknown> }) {
  const [selected, setSelected] = useState('current');
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(''); const [time, setTime] = useState('');
  const [service, setService] = useState(''); const [reason, setReason] = useState('');
  const [approvalReason, setApprovalReason] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const visits = allVisits(job); const current = currentVisitId(job);
  const perform = async (action: string) => {
    setBusy(true); setError('');
    try { const saved = await changeVisit(job.id, { action, expectedVisitId: action === 'paid' ? selected : current, snapshot, date, time, serviceType: service, serviceCode: loadServiceRates().find(r => r.serviceName === service)?.serviceCode, reason: action === 'request' ? reason : approvalReason }); onSave(saved); setOpen(false); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save visit'); }
    finally { setBusy(false); }
  };
  return <section className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3" aria-label="Service order visits">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <label className="text-sm font-semibold text-slate-800">Visits <select aria-label="Select visit" className="ml-2 rounded-lg border p-2 bg-white" value={selected} onChange={e => { setSelected(e.target.value); onSelectionChange?.(e.target.value !== 'current'); }}>
        <option value="current">Visit {job.currentVisit?.number ?? (job.visits?.length ?? 0) + 1} (current)</option>
        {(job.visits ?? []).map(v => <option key={v.id} value={v.id}>Visit {v.number}: {v.date}</option>)}
      </select></label>
      <span className="text-xs text-slate-500">{job.visits?.length ?? 0} of 10 follow-ups</span>
    </div>
    {selected !== 'current' ? <><p className="text-xs text-slate-500">Completed visit record. Select the current visit to enter new work.</p><VisitHistory visits={visits.filter(v => v.id === selected)} showBilling={isAdmin} />
      {isAdmin && visits.find(v => v.id === selected)?.billing?.xeroInvoiceId && !visits.find(v => v.id === selected)?.billing?.clientPaidAt && <div className="space-y-2">
        <label className="block text-xs">Payment reference<input className="block w-full rounded-lg border p-2" value={approvalReason} onChange={e => setApprovalReason(e.target.value)} /></label>
        <button type="button" disabled={busy || !approvalReason.trim()} onClick={() => void perform('paid')} className="rounded-lg bg-teal-700 px-3 py-2 text-sm text-white disabled:opacity-40">Mark this visit paid</button>
      </div>}
    </> : <>
      {job.currentVisit && <div className="text-sm text-slate-700 space-y-1">
        <p className="font-semibold">{job.currentVisit.serviceType}</p>
        <p>Proposed: {job.scheduledDate} {job.scheduledTime}</p>
        <p>{job.currentVisit.reason}</p>
        <p className="font-semibold text-orange-700">{visitNeedsApproval(job) ? 'Awaiting Daniel’s quote review / admin approval' : job.currentVisit.approval === 'included' ? 'Included, no additional charge' : 'Quote approved'}</p>
        {job.currentVisit.decisionReason && <p>Approval record: {job.currentVisit.decisionReason}</p>}
        {isAdmin && visitNeedsApproval(job) && <div className="space-y-2">
          <p className="text-xs">Prepare the quote using the Quote action. Record approval here, or mark this visit included.</p>
          <label className="block text-xs">Approval or coverage reference<textarea aria-label="Approval or coverage reference" value={approvalReason} onChange={e => setApprovalReason(e.target.value)} className="block w-full rounded-lg border p-2 text-sm" /></label>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy || !approvalReason.trim()} onClick={() => void perform('included')} className="rounded-lg bg-teal-700 px-3 py-2 text-sm text-white disabled:opacity-40">Included, no additional charge</button>
            <button type="button" disabled={busy || !approvalReason.trim() || !job.quoteSentAt} onClick={() => void perform('approved')} className="rounded-lg bg-orange-600 px-3 py-2 text-sm text-white disabled:opacity-40">Record quote approval</button>
          </div>
        </div>}
      </div>}
      <VisitLaborEditor visitId={current} entries={job.visitLabor ?? []} showCosts={isAdmin} onChange={visitLabor => onSave({ ...job, visitLabor })} />
      {!visitNeedsApproval(job) && <button type="button" disabled={(job.visits?.length ?? 0) >= MAX_VISITS - 1} className="text-sm font-semibold text-orange-700 disabled:text-slate-500" onClick={() => setOpen(v => !v)}>{(job.visits?.length ?? 0) >= 10 ? 'Visit limit reached. Contact the office.' : 'Finish visit / Add follow-up visit'}</button>}
      {open && <div className="space-y-2 border-t pt-3">
        <p className="text-xs text-slate-600">Save current work before requesting a follow-up. The date is proposed until approval and dispatch.</p>
        <div className="flex flex-wrap gap-2">
          <label className="text-xs">Return date<input aria-label="Return date" type="date" value={date} onChange={e => setDate(e.target.value)} className="block rounded-lg border p-2" /></label>
          <label className="text-xs">Time (optional)<input type="time" value={time} onChange={e => setTime(e.target.value)} className="block rounded-lg border p-2" /></label>
        </div>
        <label className="block text-xs">Follow-up service type<select aria-label="Follow-up service type" value={service} onChange={e => setService(e.target.value)} className="block w-full rounded-lg border p-2"><option value="">Select service</option>{loadServiceRates().filter(r => r.active).map(r => <option key={r.id} value={r.serviceName}>{r.serviceName}</option>)}</select></label>
        <label className="block text-xs">Remaining work<textarea aria-label="Remaining work" value={reason} onChange={e => setReason(e.target.value)} className="block w-full rounded-lg border p-2" /></label>
        <button type="button" disabled={busy || !date || !service || !reason.trim()} className="rounded-lg bg-orange-600 px-3 py-2 text-sm text-white disabled:opacity-40" onClick={() => void perform('request')}>{busy ? 'Saving…' : 'Send follow-up to quote review'}</button>
      </div>}
    </>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </section>;
}
