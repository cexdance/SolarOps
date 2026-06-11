// SolarOps, RMA Compensation Tracker (standalone page)
import { useState } from 'react';
import { serviceOrderNo } from '../lib/woHelpers';
import {
  RotateCcw, Users, CheckCircle, Plus, Package, LayoutGrid, List, Calendar, ChevronLeft, ChevronRight,
  AlertTriangle, Link2,
} from 'lucide-react';
import { Job, Customer, User, RMAEntry, RMAStatus } from '../types';
import { formatMoney } from '../lib/money';
import { RmaCreateModal } from './RmaCreateModal';

interface RMADashboardProps {
  jobs: Job[];
  customers: Customer[];
  currentUser: User | null;
  standaloneRmas?: RMAEntry[];
  onCreateStandaloneRma?: (entry: RMAEntry) => void;
  onUpdateStandaloneRma?: (entry: RMAEntry) => void;
  onJobClick?: (jobId: string) => void;
  onViewCustomer?: (customerId: string) => void;
  onUpdateJob?: (job: Job) => void;
  onViewChange?: (view: string) => void;
}

type RMARow = {
  job: Job;
  customer: Customer | undefined;
  entry: RMAEntry;
  source: 'rmaEntry' | 'lineItem';
  lineItemId?: string;
};

const COLUMNS: Array<{ id: RMAStatus; label: string; color: string; bgCard: string; dotColor: string; bg: string }> = [
  { id: 'processes',    label: 'In Process',   color: 'text-amber-700',  bgCard: 'bg-amber-50',  dotColor: 'bg-amber-400',  bg: 'bg-amber-50/60' },
  { id: 'eligible',     label: 'Eligible',     color: 'text-blue-700',   bgCard: 'bg-blue-50',   dotColor: 'bg-blue-400',   bg: 'bg-blue-50/60' },
  { id: 'not_eligible', label: 'Not Eligible', color: 'text-slate-500',  bgCard: 'bg-slate-50',  dotColor: 'bg-slate-400',  bg: 'bg-slate-50/60' },
  { id: 'submitted',    label: 'Submitted',    color: 'text-purple-700', bgCard: 'bg-purple-50', dotColor: 'bg-purple-400', bg: 'bg-purple-50/60' },
  { id: 'shipped',      label: 'Shipped',      color: 'text-indigo-700', bgCard: 'bg-indigo-50', dotColor: 'bg-indigo-400', bg: 'bg-indigo-50/60' },
  { id: 'paid',         label: 'Paid',         color: 'text-green-700',  bgCard: 'bg-green-50',  dotColor: 'bg-green-400',  bg: 'bg-green-50/60' },
];

function resolveStatus(e: RMAEntry): RMAStatus {
  if (e.rmaStatus) return e.rmaStatus;
  if (e.compensationCollected) return 'paid';
  if (e.status === 'received' || e.status === 'approved') return 'eligible';
  return 'processes';
}

export function RMADashboard({
  jobs,
  customers,
  currentUser,
  standaloneRmas = [],
  onCreateStandaloneRma,
  onUpdateStandaloneRma,
  onJobClick,
  onViewCustomer,
  onUpdateJob,
  onViewChange,
}: RMADashboardProps) {
  const [viewMode, setViewMode] = useState<'kanban' | 'list' | 'calendar'>('kanban');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showCreateRma, setShowCreateRma] = useState(false);
  const getCustomer = (id: string) => customers.find(c => c.id === id);
  const jobById = (id?: string) => (id ? jobs.find(j => j.id === id) : undefined);

  // ── Build RMA rows from all jobs ──────────────────────────────────────────
  const rmaJobs = jobs.filter(j =>
    (j.rmaEntries && j.rmaEntries.length > 0) ||
    (j.lineItems?.some(li => li.rmaNumber))
  );

  const rmaRows: RMARow[] = [];
  for (const job of rmaJobs) {
    const cust = getCustomer(job.customerId);
    for (const entry of (job.rmaEntries ?? [])) {
      rmaRows.push({ job, customer: cust, entry, source: 'rmaEntry' });
    }
    for (const li of (job.lineItems ?? [])) {
      if (li.rmaNumber) {
        const promoId = `li-${li.id}`;
        if (job.rmaEntries?.some(e => e.id === promoId)) continue;
        rmaRows.push({
          job, customer: cust, source: 'lineItem', lineItemId: li.id,
          entry: {
            id: promoId,
            manufacturer: li.manufacturer ?? '',
            partDescription: li.description,
            rmaNumber: li.rmaNumber,
            caseNumber: li.caseNumber,
            status: 'pending',
            rmaStatus: 'processes',
            compensationAmount: li.seCompAmount,
            createdAt: job.createdAt,
            createdBy: '',
          },
        });
      }
    }
  }

  // ── Build column map ──────────────────────────────────────────────────────
  const columnMap = new Map<RMAStatus, RMARow[]>();
  for (const col of COLUMNS) columnMap.set(col.id, []);
  for (const row of rmaRows) columnMap.get(resolveStatus(row.entry))?.push(row);
  for (const rows of columnMap.values()) {
    rows.sort((a, b) => new Date(b.entry.createdAt).getTime() - new Date(a.entry.createdAt).getTime());
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  const activeCount = (columnMap.get('processes')?.length ?? 0) +
    (columnMap.get('eligible')?.length ?? 0) +
    (columnMap.get('submitted')?.length ?? 0);
  const paidCount = columnMap.get('paid')?.length ?? 0;
  const totalComp = rmaRows.reduce((s, r) => s + (r.entry.compensationAmount ?? 0), 0);
  const collectedComp = (columnMap.get('paid') ?? []).reduce((s, r) => s + (r.entry.compensationAmount ?? 0), 0);

  // ── Move card handler ─────────────────────────────────────────────────────
  const moveCard = (row: RMARow, newStatus: RMAStatus) => {
    if (!onUpdateJob) return;
    const job = row.job;
    const now = new Date().toISOString();
    const isPaid = newStatus === 'paid';

    if (row.source === 'rmaEntry') {
      const updated = (job.rmaEntries ?? []).map(e =>
        e.id === row.entry.id
          ? { ...e, rmaStatus: newStatus, compensationCollected: isPaid, compensationCollectedAt: isPaid ? now : e.compensationCollectedAt }
          : e
      );
      onUpdateJob({ ...job, rmaEntries: updated });
    } else {
      const existing = job.rmaEntries ?? [];
      const promoId = `li-${row.lineItemId}`;
      const alreadyPromoted = existing.find(e => e.id === promoId);
      if (alreadyPromoted) {
        const updated = existing.map(e =>
          e.id === promoId
            ? { ...e, rmaStatus: newStatus, compensationCollected: isPaid, compensationCollectedAt: isPaid ? now : e.compensationCollectedAt }
            : e
        );
        onUpdateJob({ ...job, rmaEntries: updated });
      } else {
        const newEntry: RMAEntry = {
          id: promoId,
          manufacturer: row.entry.manufacturer,
          partDescription: row.entry.partDescription,
          rmaNumber: row.entry.rmaNumber,
          caseNumber: row.entry.caseNumber,
          status: row.entry.status,
          rmaStatus: newStatus,
          compensationCollected: isPaid,
          compensationCollectedAt: isPaid ? now : undefined,
          compensationAmount: row.entry.compensationAmount,
          createdAt: row.entry.createdAt,
          createdBy: currentUser?.name ?? 'system',
        };
        onUpdateJob({ ...job, rmaEntries: [...existing, newEntry] });
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-xl">
              <RotateCcw className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">RMA Tracker</h1>
              <p className="text-xs text-slate-500">
                {rmaRows.length} total &middot; {activeCount} active &middot; {paidCount} paid
              </p>
            </div>
          </div>

          {/* Summary chips + view toggle */}
          <div className="flex items-center gap-4 flex-wrap sm:flex-nowrap">
            <div className="hidden sm:flex items-center gap-3">
              {activeCount > 0 && (
                <span className="px-3 py-1 bg-amber-100 text-amber-700 text-xs font-semibold rounded-full">
                  {activeCount} active
                </span>
              )}
              {totalComp > 0 && (
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Compensation</p>
                  <p className="text-sm font-bold text-slate-800">
                    {formatMoney(collectedComp, { decimals: 0 })} <span className="text-slate-400 font-normal">/ {formatMoney(totalComp, { decimals: 0 })}</span>
                  </p>
                </div>
              )}
            </div>

            {/* View toggle */}
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('kanban')}
                className={`p-1.5 rounded transition-colors ${viewMode === 'kanban' ? 'bg-white shadow-sm text-orange-500' : 'text-slate-600 hover:text-slate-900'}`}
                title="Kanban view"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded transition-colors ${viewMode === 'list' ? 'bg-white shadow-sm text-orange-500' : 'text-slate-600 hover:text-slate-900'}`}
                title="List view"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('calendar')}
                className={`p-1.5 rounded transition-colors ${viewMode === 'calendar' ? 'bg-white shadow-sm text-orange-500' : 'text-slate-600 hover:text-slate-900'}`}
                title="Calendar view"
              >
                <Calendar className="w-4 h-4" />
              </button>
            </div>

            {onCreateStandaloneRma && (
              <button
                onClick={() => setShowCreateRma(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
                title="Create an RMA (with or without a service order)"
              >
                <Plus className="w-3.5 h-3.5" />
                New RMA
              </button>
            )}
            {onViewChange && (
              <button
                onClick={() => onViewChange('jobs')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                Add via Service Order
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Standalone / unlinked RMAs ──────────────────────────────────────── */}
      {standaloneRmas.length > 0 && (
        <div className="px-4 pt-4">
          <div className="bg-white rounded-xl border border-slate-200">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <h3 className="font-semibold text-slate-900 text-sm">Standalone RMAs</h3>
              <span className="text-xs text-slate-400">created outside a service order</span>
            </div>
            <div className="divide-y divide-slate-100">
              {standaloneRmas.map(e => {
                const linkedJob = jobById(e.linkedJobId);
                return (
                  <div key={e.id} className="p-3 flex items-center gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-slate-900 text-sm">{e.rmaNumber || '(no RMA #)'}</span>
                        {!e.linkedJobId ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-xs font-medium border border-red-200">
                            <AlertTriangle className="w-3 h-3" /> No service order
                          </span>
                        ) : (
                          <button
                            onClick={() => linkedJob && onJobClick?.(linkedJob.id)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-200 hover:bg-emerald-100"
                          >
                            <Link2 className="w-3 h-3" /> {linkedJob ? (linkedJob.woNumber ?? linkedJob.id) : 'linked'}
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 truncate">{e.manufacturer} · {e.partDescription}</p>
                    </div>
                    <select
                      value={e.status}
                      onChange={ev => onUpdateStandaloneRma?.({ ...e, status: ev.target.value as RMAEntry['status'] })}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white capitalize"
                    >
                      {['pending', 'submitted', 'approved', 'received', 'shipped', 'paid'].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    {!e.linkedJobId && jobs.length > 0 && (
                      <select
                        value=""
                        onChange={ev => ev.target.value && onUpdateStandaloneRma?.({ ...e, linkedJobId: ev.target.value })}
                        className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
                        title="Link this RMA to a service order"
                      >
                        <option value="">Link to WO…</option>
                        {jobs.map(j => <option key={j.id} value={j.id}>{j.woNumber ? serviceOrderNo(j.woNumber) : j.id}</option>)}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Empty state ────────────────────────────────────────────────────── */}
      {rmaRows.length === 0 && standaloneRmas.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="p-4 bg-slate-100 rounded-full">
            <Package className="w-8 h-8 text-slate-400" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-slate-700">No RMA entries yet</p>
            <p className="text-sm text-slate-400 mt-1">
              Open a service order, go to RMA Tracking, and add an entry.
            </p>
          </div>
          {onViewChange && (
            <button
              onClick={() => onViewChange('jobs')}
              className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              Go to Service Orders
            </button>
          )}
        </div>
      )}

      {/* ── View panel (Kanban / List / Calendar) ─────────────────────────── */}
      {rmaRows.length > 0 && viewMode === 'kanban' && (
        <div className="p-4 overflow-x-auto">
          <div className="flex gap-3 min-w-[920px]">
            {COLUMNS.map(col => {
              const rows = columnMap.get(col.id) ?? [];
              return (
                <div
                  key={col.id}
                  className={`flex-1 min-w-[175px] flex flex-col rounded-xl border border-slate-200 ${col.bg}`}
                  onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('ring-2', 'ring-orange-300'); }}
                  onDragLeave={e => { e.currentTarget.classList.remove('ring-2', 'ring-orange-300'); }}
                  onDrop={e => {
                    e.preventDefault();
                    e.currentTarget.classList.remove('ring-2', 'ring-orange-300');
                    try {
                      const d = JSON.parse(e.dataTransfer.getData('text/plain'));
                      const row = rmaRows.find(r => r.entry.id === d.entryId && r.job.id === d.jobId);
                      if (row && resolveStatus(row.entry) !== col.id) moveCard(row, col.id);
                    } catch (e) { console.error('[RMADashboard] drag-drop dataTransfer parse failed', e); }
                  }}
                >
                  {/* Column header */}
                  <div className="px-3 py-2.5 flex items-center justify-between border-b border-slate-200/60">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${col.dotColor}`} />
                      <span className={`text-xs font-semibold ${col.color}`}>{col.label}</span>
                    </div>
                    <span className="text-[10px] bg-white text-slate-500 font-semibold px-1.5 py-0.5 rounded-full shadow-sm border border-slate-100">
                      {rows.length}
                    </span>
                  </div>

                  {/* Cards */}
                  <div className="p-2 flex flex-col gap-2 overflow-y-auto flex-1" style={{ maxHeight: 'calc(100vh - 200px)' }}>
                    {rows.map((row, idx) => {
                      const isPaid = col.id === 'paid';
                      return (
                        <div
                          key={`${row.job.id}-${row.entry.id}-${idx}`}
                          draggable
                          onDragStart={e => {
                            e.dataTransfer.setData('text/plain', JSON.stringify({ entryId: row.entry.id, jobId: row.job.id }));
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          className={`bg-white rounded-lg border border-slate-100 p-3 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-shadow ${isPaid ? 'opacity-60' : ''}`}
                        >
                          {/* RMA # + amount */}
                          <div className="flex items-start justify-between gap-1">
                            <span className={`text-xs font-bold leading-tight ${isPaid ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                              #{row.entry.rmaNumber || row.entry.caseNumber || '-'}
                            </span>
                            {(row.entry.compensationAmount ?? 0) > 0 && (
                              <span className={`text-[10px] font-bold whitespace-nowrap ${isPaid ? 'text-green-500' : 'text-slate-700'}`}>
                                {formatMoney(row.entry.compensationAmount ?? 0, { decimals: 0 })}
                              </span>
                            )}
                          </div>

                          {/* Part description */}
                          <p className="text-[10px] text-slate-500 mt-1 leading-tight line-clamp-2">
                            {row.entry.partDescription}
                            {row.entry.manufacturer && ` · ${row.entry.manufacturer}`}
                          </p>

                          {/* Customer link */}
                          {row.customer && (
                            <button
                              onClick={() => onViewCustomer?.(row.customer!.id)}
                              className="mt-1.5 text-[10px] text-orange-600 hover:text-orange-700 font-medium flex items-center gap-1 truncate max-w-full"
                            >
                              <Users className="w-3 h-3 shrink-0" />
                              <span className="truncate">{row.customer.name}</span>
                            </button>
                          )}

                          {/* WO link + date */}
                          <div className="flex items-center justify-between mt-1.5">
                            {row.job.woNumber ? (
                              <button
                                onClick={() => onJobClick?.(row.job.id)}
                                className="text-[10px] text-blue-500 hover:text-blue-700 font-mono font-semibold underline underline-offset-2"
                              >
                                {serviceOrderNo(row.job.woNumber)}
                              </button>
                            ) : <span />}
                            <span className="text-[9px] text-slate-300">
                              {new Date(row.entry.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          </div>

                          {/* Move buttons */}
                          {onUpdateJob && (
                            <div className="flex gap-1 mt-2 flex-wrap">
                              {COLUMNS.filter(c => c.id !== col.id).map(target => (
                                <button
                                  key={target.id}
                                  onClick={() => moveCard(row, target.id)}
                                  className={`text-[9px] px-1.5 py-0.5 rounded font-medium border transition-colors hover:opacity-80 ${target.bgCard} ${target.color} border-current/20`}
                                >
                                  {target.label}
                                </button>
                              ))}
                            </div>
                          )}

                          {/* Paid date */}
                          {isPaid && row.entry.compensationCollectedAt && (
                            <p className="text-[9px] text-green-600 mt-1.5 flex items-center gap-0.5">
                              <CheckCircle className="w-2.5 h-2.5" />
                              {new Date(row.entry.compensationCollectedAt).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      );
                    })}

                    {rows.length === 0 && (
                      <div className="flex-1 flex items-center justify-center min-h-[80px]">
                        <p className="text-[10px] text-slate-300 italic">No items</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── List view ──────────────────────────────────────────────────────── */}
      {rmaRows.length > 0 && viewMode === 'list' && (
        <div className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">RMA / Case #</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Part</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Manufacturer</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Service Order</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {rmaRows.map((row) => {
                  const status = resolveStatus(row.entry);
                  const col = COLUMNS.find(c => c.id === status);
                  return (
                    <tr key={`${row.job.id}-${row.entry.id}`} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-bold text-slate-900 font-mono">
                        #{row.entry.rmaNumber || row.entry.caseNumber || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{row.entry.partDescription}</td>
                      <td className="px-4 py-3 text-sm text-slate-500">{row.entry.manufacturer || '-'}</td>
                      <td className="px-4 py-3">
                        {row.customer && (
                          <button
                            onClick={() => onViewCustomer?.(row.customer!.id)}
                            className="text-sm text-orange-600 hover:text-orange-700 font-medium"
                          >
                            {row.customer.name}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {row.job.woNumber && (
                          <button
                            onClick={() => onJobClick?.(row.job.id)}
                            className="text-sm text-blue-600 hover:text-blue-700 font-mono font-semibold"
                          >
                            {serviceOrderNo(row.job.woNumber)}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-semibold ${col?.bgCard} ${col?.color}`}>
                          {col?.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-slate-900">
                        {formatMoney(row.entry.compensationAmount ?? 0, { decimals: 0 })}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">
                        {new Date(row.entry.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Calendar view ──────────────────────────────────────────────────── */}
      {rmaRows.length > 0 && viewMode === 'calendar' && (
        <div className="p-6">
          <div className="space-y-4">
            {/* Calendar header with navigation */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-slate-900">
                {selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1))}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                  title="Previous month"
                >
                  <ChevronLeft className="w-5 h-5 text-slate-600" />
                </button>
                <button
                  onClick={() => setSelectedDate(new Date())}
                  className="px-3 py-1.5 text-sm font-medium bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors text-slate-700"
                >
                  Today
                </button>
                <button
                  onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1))}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                  title="Next month"
                >
                  <ChevronRight className="w-5 h-5 text-slate-600" />
                </button>
              </div>
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="text-center text-xs font-semibold text-slate-500 py-2">
                  {day}
                </div>
              ))}

              {Array.from({ length: new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 0).getDate() +
                            new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1).getDay() }, (_, i) => {
                const firstDayOfMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1).getDay();
                const dayNum = i - firstDayOfMonth + 1;
                const isCurrentMonth = dayNum > 0;
                const date = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), dayNum);
                const entriesForDate = isCurrentMonth ? rmaRows.filter(r =>
                  new Date(r.entry.createdAt).toDateString() === date.toDateString()
                ) : [];

                return (
                  <div
                    key={i}
                    className={`min-h-[100px] p-2 rounded-lg border ${
                      isCurrentMonth
                        ? 'bg-white border-slate-200 hover:border-slate-300'
                        : 'bg-slate-50 border-slate-100'
                    }`}
                  >
                    <div className={`text-xs font-semibold mb-1 ${isCurrentMonth ? 'text-slate-900' : 'text-slate-400'}`}>
                      {isCurrentMonth ? dayNum : ''}
                    </div>
                    <div className="space-y-1">
                      {entriesForDate.slice(0, 3).map(row => (
                        <div
                          key={`${row.job.id}-${row.entry.id}`}
                          className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium truncate cursor-pointer hover:bg-amber-200"
                          title={`${row.entry.partDescription} - ${row.customer?.name || 'Unknown'}`}
                        >
                          #{row.entry.rmaNumber || '?'}
                        </div>
                      ))}
                      {entriesForDate.length > 3 && (
                        <div className="text-[9px] text-slate-500 px-1.5 py-0.5 italic">
                          +{entriesForDate.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {showCreateRma && onCreateStandaloneRma && (
        <RmaCreateModal
          jobs={jobs}
          currentUserName={currentUser?.name ?? currentUser?.email}
          onClose={() => setShowCreateRma(false)}
          onCreate={onCreateStandaloneRma}
        />
      )}
    </div>
  );
}
