// SolarOps — RMA Compensation Tracker (standalone page)
import React from 'react';
import {
  RotateCcw, Users, CheckCircle, Plus, Package,
} from 'lucide-react';
import { Job, Customer, User, RMAEntry, RMAStatus } from '../types';

interface RMADashboardProps {
  jobs: Job[];
  customers: Customer[];
  currentUser: User | null;
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
  onJobClick,
  onViewCustomer,
  onUpdateJob,
  onViewChange,
}: RMADashboardProps) {
  const getCustomer = (id: string) => customers.find(c => c.id === id);

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

          {/* Summary chips */}
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
                  ${collectedComp.toLocaleString()} <span className="text-slate-400 font-normal">/ ${totalComp.toLocaleString()}</span>
                </p>
              </div>
            )}
            {onViewChange && (
              <button
                onClick={() => onViewChange('jobs')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add via Work Order
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Empty state ────────────────────────────────────────────────────── */}
      {rmaRows.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="p-4 bg-slate-100 rounded-full">
            <Package className="w-8 h-8 text-slate-400" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-slate-700">No RMA entries yet</p>
            <p className="text-sm text-slate-400 mt-1">
              Open a work order, go to RMA Tracking, and add an entry.
            </p>
          </div>
          {onViewChange && (
            <button
              onClick={() => onViewChange('jobs')}
              className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              Go to Work Orders
            </button>
          )}
        </div>
      )}

      {/* ── Kanban board ───────────────────────────────────────────────────── */}
      {rmaRows.length > 0 && (
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
                    } catch {}
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
                              #{row.entry.rmaNumber || row.entry.caseNumber || '—'}
                            </span>
                            {(row.entry.compensationAmount ?? 0) > 0 && (
                              <span className={`text-[10px] font-bold whitespace-nowrap ${isPaid ? 'text-green-500' : 'text-slate-700'}`}>
                                ${(row.entry.compensationAmount ?? 0).toLocaleString()}
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
                                {row.job.woNumber}
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
    </div>
  );
}
