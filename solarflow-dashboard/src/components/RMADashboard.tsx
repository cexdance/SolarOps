// SolarOps, RMA Compensation Tracker (standalone page)
//
//   RMA PARTS lane                                | SITE TRANSFER lane
//   New | Not Eligible | Processed | Paid         | New Site Transfer | Site Processed
//
// Columns map at read time (see rmaColumn in woHelpers); nothing migrates.
// Cards never cross lanes. The transfer lane is driven by the SERVICE ORDER,
// not by RMA entries: 10 of 21 live transfers carry no entry at all.
import { useState, useRef, useEffect } from 'react';
import {
  serviceOrderNo, isSiteTransferJob, rmaColumn, isSiteTransferEntry,
  siteTransferBadge, shouldAutoCompleteSiteTransfer, type RmaBoardColumn,
} from '../lib/woHelpers';
import {
  RotateCcw, Users, CheckCircle, Plus, Package, LayoutGrid, List, Calendar, ChevronLeft, ChevronRight,
  AlertTriangle, Search, ExternalLink,
} from 'lucide-react';
import { Job, Customer, User, RMAEntry, RMAStatus } from '../types';
import type { SolarEdgeSite } from '../lib/solarEdgeSites';
import { formatMoney } from '../lib/money';
import { RmaCreateModal } from './RmaCreateModal';

interface RMADashboardProps {
  jobs: Job[];
  customers: Customer[];
  currentUser: User | null;
  standaloneRmas?: RMAEntry[];
  /** FL_SITES + synced extras. Feeds the auto-move rule; empty means "do not stamp". */
  solarEdgeSites?: SolarEdgeSite[];
  onCreateStandaloneRma?: (entry: RMAEntry) => void;
  onUpdateStandaloneRma?: (entry: RMAEntry) => void;
  onJobClick?: (jobId: string) => void;
  onViewCustomer?: (customerId: string) => void;
  onUpdateJob?: (job: Job) => void;
  onViewChange?: (view: string) => void;
}

type PartRow = {
  key: string;
  entry: RMAEntry;
  job?: Job;
  customer?: Customer;
  source: 'rmaEntry' | 'lineItem' | 'standalone';
  lineItemId?: string;
};

type StRow = {
  job: Job;
  customer?: Customer;
  site?: SolarEdgeSite;
  caseNumber?: string;
  column: 'new' | 'processed';
  badge: 'needs_rename' | 'waiting' | null;
};

/** `writes` is the value a move stores. Old tabs may still write 'eligible' or
 *  'shipped'; rmaColumn folds those into Processed rather than losing them. */
const PART_COLUMNS: Array<{ id: RmaBoardColumn; label: string; writes: RMAStatus; color: string; bgCard: string; dotColor: string; bg: string }> = [
  { id: 'new',          label: 'New RMA Parts', writes: 'processes',    color: 'text-amber-700', bgCard: 'bg-amber-50', dotColor: 'bg-amber-400', bg: 'bg-amber-50/60' },
  { id: 'not_eligible', label: 'Not Eligible',  writes: 'not_eligible', color: 'text-slate-500', bgCard: 'bg-slate-50', dotColor: 'bg-slate-400', bg: 'bg-slate-50/60' },
  { id: 'processed',    label: 'Processed',     writes: 'submitted',    color: 'text-blue-700',  bgCard: 'bg-blue-50',  dotColor: 'bg-blue-400',  bg: 'bg-blue-50/60' },
  { id: 'paid',         label: 'Paid',          writes: 'paid',         color: 'text-green-700', bgCard: 'bg-green-50', dotColor: 'bg-green-400', bg: 'bg-green-50/60' },
];

const ST_COLUMNS: Array<{ id: 'new' | 'processed'; label: string; color: string; bgCard: string; dotColor: string; bg: string }> = [
  { id: 'new',       label: 'New Site Transfer', color: 'text-cyan-700',    bgCard: 'bg-cyan-50',    dotColor: 'bg-cyan-400',    bg: 'bg-cyan-50/60' },
  { id: 'processed', label: 'Site Processed',    color: 'text-emerald-700', bgCard: 'bg-emerald-50', dotColor: 'bg-emerald-400', bg: 'bg-emerald-50/60' },
];

const seSiteUrl = (siteId: string) => `https://monitoring.solaredge.com/solaredge-web/p/site/${siteId}`;

export function RMADashboard({
  jobs,
  customers,
  currentUser,
  standaloneRmas = [],
  solarEdgeSites = [],
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
  const [search, setSearch] = useState('');
  const getCustomer = (id?: string) => (id ? customers.find(c => c.id === id) : undefined);
  const jobById = (id?: string) => (id ? jobs.find(j => j.id === id) : undefined);
  const siteById = (id?: string) => (id ? solarEdgeSites.find(s => s.siteId === String(id)) : undefined);

  // ── Parts lane rows: job entries, promoted line items, standalone RMAs ─────
  const partRows: PartRow[] = [];
  for (const job of jobs) {
    const cust = getCustomer(job.customerId);
    for (const entry of (job.rmaEntries ?? [])) {
      if (isSiteTransferEntry(entry)) continue; // belongs to the transfer lane
      partRows.push({ key: `${job.id}::${entry.id}`, entry, job, customer: cust, source: 'rmaEntry' });
    }
    for (const li of (job.lineItems ?? [])) {
      if (!li.rmaNumber) continue;
      const promoId = `li-${li.id}`;
      if (job.rmaEntries?.some(e => e.id === promoId)) continue;
      partRows.push({
        key: `${job.id}::${promoId}`, job, customer: cust, source: 'lineItem', lineItemId: li.id,
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
  for (const e of standaloneRmas) {
    const linked = jobById(e.linkedJobId);
    partRows.push({
      key: `sa::${e.id}`, entry: e, job: linked, source: 'standalone',
      customer: getCustomer(linked?.customerId ?? e.customerId),
    });
  }

  // ── Site transfer lane rows: one card per transfer service order ───────────
  const stRows: StRow[] = jobs.filter(isSiteTransferJob).map(job => {
    const customer = getCustomer(job.customerId);
    const site = siteById(job.siteTransferSiteId || customer?.solarEdgeSiteId);
    const slot = (job.rmaEntries ?? []).find(isSiteTransferEntry);
    return {
      job, customer, site,
      caseNumber: slot?.caseNumber || slot?.rmaNumber || undefined,
      column: job.siteTransferCompletedAt ? 'processed' : 'new',
      badge: siteTransferBadge(job, site, customer?.clientId),
    };
  });

  // ── Auto-advance: a renamed SolarEdge site means the work is done ──────────
  // Forward only, once per job per session, and never off an empty cache (an
  // unhydrated tab is still a live sync client, see the 2026-06-12 incident).
  const autoStamped = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!onUpdateJob || solarEdgeSites.length === 0) return;
    for (const row of stRows) {
      if (autoStamped.current.has(row.job.id)) continue;
      if (!shouldAutoCompleteSiteTransfer(row.job, row.site, row.customer?.clientId)) continue;
      autoStamped.current.add(row.job.id);
      onUpdateJob({ ...row.job, siteTransferCompletedAt: new Date().toISOString() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, customers, solarEdgeSites]);

  // ── Search (rma #, case #, part, manufacturer, client #, customer, SO #) ───
  const q = search.trim().toLowerCase();
  const matches = (values: Array<string | undefined>) =>
    !q || values.some(v => (v ?? '').toLowerCase().includes(q));
  const partMatches = (r: PartRow) => matches([
    r.entry.rmaNumber, r.entry.caseNumber, r.entry.manufacturer, r.entry.partDescription,
    r.customer?.clientId, r.customer?.name, r.customer?.address,
    r.job?.woNumber ? serviceOrderNo(r.job.woNumber) : '',
  ]);
  const stMatches = (r: StRow) => matches([
    r.caseNumber, r.customer?.clientId, r.customer?.name, r.customer?.address,
    r.site?.siteName, r.job.siteTransferSiteId,
    r.job.woNumber ? serviceOrderNo(r.job.woNumber) : '',
  ]);
  const visibleParts = partRows.filter(partMatches);
  const visibleSt = stRows.filter(stMatches);

  // ── Column maps ───────────────────────────────────────────────────────────
  const partMap = new Map<RmaBoardColumn, PartRow[]>(PART_COLUMNS.map(c => [c.id, [] as PartRow[]]));
  for (const row of visibleParts) partMap.get(rmaColumn(row.entry))?.push(row);
  for (const rows of partMap.values()) {
    rows.sort((a, b) => new Date(b.entry.createdAt).getTime() - new Date(a.entry.createdAt).getTime());
  }
  const stMap = new Map<'new' | 'processed', StRow[]>(ST_COLUMNS.map(c => [c.id, [] as StRow[]]));
  for (const row of visibleSt) stMap.get(row.column)?.push(row);
  // Sites already in our account, still carrying the installer's name, are the
  // actionable ones, so they sort to the top of New Site Transfer.
  stMap.get('new')?.sort((a, b) => Number(b.badge === 'needs_rename') - Number(a.badge === 'needs_rename'));

  // ── Stats ─────────────────────────────────────────────────────────────────
  const activeCount = (partMap.get('new')?.length ?? 0) + (partMap.get('processed')?.length ?? 0) +
    (stMap.get('new')?.length ?? 0);
  const paidCount = partMap.get('paid')?.length ?? 0;
  const totalComp = partRows.reduce((s, r) => s + (r.entry.compensationAmount ?? 0), 0);
  const collectedComp = (partMap.get('paid') ?? []).reduce((s, r) => s + (r.entry.compensationAmount ?? 0), 0);
  const boardEmpty = partRows.length === 0 && stRows.length === 0;

  // ── Moves ─────────────────────────────────────────────────────────────────
  // Every write stamps `updatedAt`: the union merge in mergeRmaEntries gives
  // ties to the incumbent, so an unstamped edit loses to a stale copy.
  const movePart = (row: PartRow, target: RmaBoardColumn) => {
    if (rmaColumn(row.entry) === target) return;
    const col = PART_COLUMNS.find(c => c.id === target);
    if (!col) return;
    const now = new Date().toISOString();
    const isPaid = target === 'paid';
    const patch = {
      rmaStatus: col.writes,
      status: col.writes,
      compensationCollected: isPaid,
      compensationCollectedAt: isPaid ? now : row.entry.compensationCollectedAt,
      updatedAt: now,
    };

    if (row.source === 'standalone') {
      onUpdateStandaloneRma?.({ ...row.entry, ...patch });
      return;
    }
    const job = row.job;
    if (!onUpdateJob || !job) return;

    const existing = job.rmaEntries ?? [];
    const targetId = row.source === 'lineItem' ? `li-${row.lineItemId}` : row.entry.id;
    if (existing.some(e => e.id === targetId)) {
      onUpdateJob({
        ...job,
        rmaEntries: existing.map(e => (e.id === targetId ? { ...e, ...patch } : e)),
      });
      return;
    }
    // First move of a line-item RMA promotes it to a real entry.
    onUpdateJob({
      ...job,
      rmaEntries: [...existing, {
        ...row.entry,
        id: targetId,
        ...patch,
        compensationCollectedAt: isPaid ? now : undefined,
        createdBy: currentUser?.name ?? 'system',
      }],
    });
  };

  const moveSiteTransfer = (row: StRow, target: 'new' | 'processed') => {
    if (!onUpdateJob || row.column === target) return;
    // A manual move back must stick: pin the job so the auto-rule leaves it
    // alone for the rest of this session.
    autoStamped.current.add(row.job.id);
    onUpdateJob({
      ...row.job,
      siteTransferCompletedAt: target === 'processed' ? new Date().toISOString() : undefined,
    });
  };

  const dragData = (e: React.DragEvent, payload: object) => {
    e.dataTransfer.setData('text/plain', JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'move';
  };
  type DragPayload = { kind?: 'part' | 'st'; key?: string; jobId?: string };
  const readDrag = (e: React.DragEvent): DragPayload | null => {
    try { return JSON.parse(e.dataTransfer.getData('text/plain')); }
    catch (err) { console.error('[RMADashboard] drag payload parse failed', err); return null; }
  };
  const dropStyles = {
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.currentTarget.classList.add('ring-2', 'ring-orange-300'); },
    onDragLeave: (e: React.DragEvent) => { e.currentTarget.classList.remove('ring-2', 'ring-orange-300'); },
  };

  const clientLine = (customer?: Customer, muted = false) => (
    customer ? (
      <button
        onClick={() => onViewCustomer?.(customer.id)}
        className={`mt-1.5 text-[10px] font-medium flex items-center gap-1 max-w-full ${muted ? 'text-slate-600 hover:text-orange-600' : 'text-orange-600 hover:text-orange-700'}`}
      >
        <Users className="w-3 h-3 shrink-0" />
        {customer.clientId && <span className="font-mono text-slate-500 shrink-0">{customer.clientId}</span>}
        <span className="truncate">{customer.name}</span>
      </button>
    ) : null
  );

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
                {partRows.length} parts &middot; {stRows.length} site transfers &middot; {activeCount} active &middot; {paidCount} paid
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

            {/* Search */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search RMA #, case, part, client #, customer, SO…"
                className="w-64 pl-8 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400"
              />
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

      {/* ── Empty state ────────────────────────────────────────────────────── */}
      {boardEmpty && (
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

      {/* ── Kanban: parts lane, then site transfer lane ─────────────────────── */}
      {!boardEmpty && viewMode === 'kanban' && (
        <div className="p-4 overflow-x-auto">
          <div className="flex gap-3 min-w-[1180px] items-start">
            {PART_COLUMNS.map(col => {
              const rows = partMap.get(col.id) ?? [];
              return (
                <div
                  key={col.id}
                  className={`flex-1 min-w-[175px] flex flex-col rounded-xl border border-slate-200 ${col.bg}`}
                  {...dropStyles}
                  onDrop={e => {
                    e.preventDefault();
                    e.currentTarget.classList.remove('ring-2', 'ring-orange-300');
                    const d = readDrag(e);
                    if (d?.kind !== 'part') return; // parts stay in the parts lane
                    const row = partRows.find(r => r.key === d.key);
                    if (row) movePart(row, col.id);
                  }}
                >
                  <div className="px-3 py-2.5 flex items-center justify-between border-b border-slate-200/60">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${col.dotColor}`} />
                      <span className={`text-xs font-semibold ${col.color}`}>{col.label}</span>
                    </div>
                    <span className="text-[10px] bg-white text-slate-500 font-semibold px-1.5 py-0.5 rounded-full shadow-sm border border-slate-100">
                      {rows.length}
                    </span>
                  </div>

                  <div className="p-2 flex flex-col gap-2 overflow-y-auto flex-1" style={{ maxHeight: 'calc(100vh - 200px)' }}>
                    {rows.map(row => {
                      const isPaid = col.id === 'paid';
                      const standalone = row.source === 'standalone';
                      return (
                        <div
                          key={row.key}
                          draggable
                          onDragStart={e => dragData(e, { kind: 'part', key: row.key })}
                          className={`bg-white rounded-lg border p-3 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-shadow ${standalone && !row.job ? 'border-red-200' : 'border-slate-100'} ${isPaid ? 'opacity-60' : ''}`}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <span className={`text-xs font-bold leading-tight font-mono ${isPaid ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                              #{row.entry.rmaNumber || row.entry.caseNumber || '-'}
                            </span>
                            {standalone && !row.job && (
                              <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                                <AlertTriangle className="w-2.5 h-2.5" /> No SO
                              </span>
                            )}
                          </div>

                          <p className="text-[10px] text-slate-500 mt-1 leading-tight line-clamp-2">
                            {row.entry.partDescription}
                            {row.entry.manufacturer && ` · ${row.entry.manufacturer}`}
                          </p>

                          {clientLine(row.customer)}
                          {!row.customer && standalone && (
                            <select
                              value=""
                              onChange={ev => ev.target.value && onUpdateStandaloneRma?.({ ...row.entry, customerId: ev.target.value, updatedAt: new Date().toISOString() })}
                              className="mt-2 w-full text-[10px] border border-red-200 rounded-lg px-1.5 py-1 bg-white text-red-600"
                              title="Assign a customer to this RMA"
                            >
                              <option value="">Assign customer…</option>
                              {[...customers].sort((a, b) => a.name.localeCompare(b.name)).map(c => (
                                <option key={c.id} value={c.id}>{c.clientId ? `${c.clientId} ` : ''}{c.name}</option>
                              ))}
                            </select>
                          )}

                          <div className="flex items-center justify-between mt-1.5 gap-2">
                            {row.job?.woNumber ? (
                              <button
                                onClick={() => onJobClick?.(row.job!.id)}
                                className="text-[10px] text-blue-500 hover:text-blue-700 font-mono font-semibold underline underline-offset-2"
                              >
                                {serviceOrderNo(row.job.woNumber)}
                              </button>
                            ) : <span />}
                            <span className="text-[9px] text-slate-300">
                              {new Date(row.entry.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          </div>

                          {standalone && !row.job && jobs.length > 0 && (
                            <select
                              value=""
                              onChange={ev => ev.target.value && onUpdateStandaloneRma?.({ ...row.entry, linkedJobId: ev.target.value, updatedAt: new Date().toISOString() })}
                              className="mt-1.5 w-full text-[10px] border border-slate-200 rounded-lg px-1.5 py-1 bg-white"
                              title="Link this RMA to a service order"
                            >
                              <option value="">Link to WO…</option>
                              {jobs.map(j => <option key={j.id} value={j.id}>{j.woNumber ? serviceOrderNo(j.woNumber) : j.id}</option>)}
                            </select>
                          )}

                          {/* Move to: the touch and keyboard path, drag is desktop only */}
                          <div className="flex gap-1 mt-2 flex-wrap">
                            {PART_COLUMNS.filter(c => c.id !== col.id).map(target => (
                              <button
                                key={target.id}
                                onClick={() => movePart(row, target.id)}
                                className={`text-[9px] px-2 py-1 rounded font-medium border border-current/20 transition-colors hover:opacity-80 ${target.bgCard} ${target.color}`}
                                title={`Move to ${target.label}`}
                              >
                                {target.label}
                              </button>
                            ))}
                          </div>

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
                        <p className="text-[10px] text-slate-300 italic">Nothing here</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Lane divider */}
            <div className="self-stretch w-px bg-slate-300 mx-1 shrink-0" aria-hidden="true" />

            {ST_COLUMNS.map(col => {
              const rows = stMap.get(col.id) ?? [];
              return (
                <div
                  key={col.id}
                  className={`flex-1 min-w-[200px] flex flex-col rounded-xl border border-slate-200 ${col.bg}`}
                  {...dropStyles}
                  onDrop={e => {
                    e.preventDefault();
                    e.currentTarget.classList.remove('ring-2', 'ring-orange-300');
                    const d = readDrag(e);
                    if (d?.kind !== 'st') return; // transfers stay in the transfer lane
                    const row = stRows.find(r => r.job.id === d.jobId);
                    if (row) moveSiteTransfer(row, col.id);
                  }}
                >
                  <div className="px-3 py-2.5 flex items-center justify-between border-b border-slate-200/60">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${col.dotColor}`} />
                      <span className={`text-xs font-semibold ${col.color}`}>{col.label}</span>
                    </div>
                    <span className="text-[10px] bg-white text-slate-500 font-semibold px-1.5 py-0.5 rounded-full shadow-sm border border-slate-100">
                      {rows.length}
                    </span>
                  </div>

                  <div className="p-2 flex flex-col gap-2 overflow-y-auto flex-1" style={{ maxHeight: 'calc(100vh - 200px)' }}>
                    {rows.map(row => {
                      const siteId = row.job.siteTransferSiteId || row.customer?.solarEdgeSiteId;
                      const target = col.id === 'new' ? 'processed' : 'new';
                      const targetLabel = ST_COLUMNS.find(c => c.id === target)!.label;
                      return (
                        <div
                          key={row.job.id}
                          draggable
                          onDragStart={e => dragData(e, { kind: 'st', jobId: row.job.id })}
                          className="bg-white rounded-lg border border-slate-100 p-3 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-shadow"
                        >
                          <div className="flex items-start justify-between gap-1">
                            <span className="text-xs font-bold leading-tight font-mono text-slate-900">
                              {row.customer?.clientId || 'No client #'}
                            </span>
                            {row.badge === 'needs_rename' && (
                              <span className="text-[9px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                                Needs rename
                              </span>
                            )}
                            {row.badge === 'waiting' && (
                              <span className="text-[9px] font-medium text-slate-500 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                                Waiting on SolarEdge
                              </span>
                            )}
                          </div>

                          {row.customer ? (
                            <button
                              onClick={() => onViewCustomer?.(row.customer!.id)}
                              className="mt-1 text-[11px] font-medium text-slate-700 hover:text-orange-600 truncate max-w-full block text-left"
                            >
                              {row.customer.name}
                            </button>
                          ) : (
                            <p className="mt-1 text-[11px] text-slate-400 italic">Unknown customer</p>
                          )}

                          <p className="text-[10px] mt-1">
                            {row.caseNumber
                              ? <span className="text-slate-500 font-mono">Case #{row.caseNumber}</span>
                              : <span className="text-amber-600">No case # yet</span>}
                          </p>

                          {siteId && (
                            <a
                              href={seSiteUrl(siteId)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-1 inline-flex items-center gap-1 text-[10px] text-cyan-700 hover:text-cyan-900 max-w-full"
                              title={row.site?.siteName ? `SolarEdge name: ${row.site.siteName}` : 'Open this site in SolarEdge'}
                            >
                              <ExternalLink className="w-3 h-3 shrink-0" />
                              <span className="truncate">{row.site?.siteName || `Site ${siteId}`}</span>
                            </a>
                          )}

                          <div className="flex items-center justify-between mt-1.5 gap-2">
                            {row.job.woNumber ? (
                              <button
                                onClick={() => onJobClick?.(row.job.id)}
                                className="text-[10px] text-blue-500 hover:text-blue-700 font-mono font-semibold underline underline-offset-2"
                              >
                                {serviceOrderNo(row.job.woNumber)}
                              </button>
                            ) : <span />}
                            {row.job.siteTransferCompletedAt && (
                              <span className="text-[9px] text-emerald-600 flex items-center gap-0.5">
                                <CheckCircle className="w-2.5 h-2.5" />
                                {new Date(row.job.siteTransferCompletedAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>

                          {onUpdateJob && (
                            <div className="flex gap-1 mt-2">
                              <button
                                onClick={() => moveSiteTransfer(row, target)}
                                className={`text-[9px] px-2 py-1 rounded font-medium border border-current/20 transition-colors hover:opacity-80 ${ST_COLUMNS.find(c => c.id === target)!.bgCard} ${ST_COLUMNS.find(c => c.id === target)!.color}`}
                                title={`Move to ${targetLabel}`}
                              >
                                {targetLabel}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {rows.length === 0 && (
                      <div className="flex-1 flex items-center justify-center min-h-[80px]">
                        <p className="text-[10px] text-slate-300 italic">
                          {col.id === 'new' ? 'No open site transfers' : 'Nothing processed yet'}
                        </p>
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
      {!boardEmpty && viewMode === 'list' && (
        <div className="p-6 space-y-8">
          <div className="overflow-x-auto">
            <h2 className="text-sm font-semibold text-slate-900 mb-2">RMA parts ({visibleParts.length})</h2>
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">RMA / Case #</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Part</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Manufacturer</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Client #</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Service Order</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600">Column</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {visibleParts.map(row => {
                  const col = PART_COLUMNS.find(c => c.id === rmaColumn(row.entry));
                  return (
                    <tr key={row.key} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-bold text-slate-900 font-mono">
                        #{row.entry.rmaNumber || row.entry.caseNumber || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{row.entry.partDescription}</td>
                      <td className="px-4 py-3 text-sm text-slate-500">{row.entry.manufacturer || '-'}</td>
                      <td className="px-4 py-3 text-sm text-slate-500 font-mono">{row.customer?.clientId || '-'}</td>
                      <td className="px-4 py-3">
                        {row.customer ? (
                          <button
                            onClick={() => onViewCustomer?.(row.customer!.id)}
                            className="text-sm text-orange-600 hover:text-orange-700 font-medium"
                          >
                            {row.customer.name}
                          </button>
                        ) : <span className="text-sm text-slate-300 italic">no customer</span>}
                      </td>
                      <td className="px-4 py-3">
                        {row.job?.woNumber ? (
                          <button
                            onClick={() => onJobClick?.(row.job!.id)}
                            className="text-sm text-blue-600 hover:text-blue-700 font-mono font-semibold"
                          >
                            {serviceOrderNo(row.job.woNumber)}
                          </button>
                        ) : <span className="text-sm text-red-500">No SO</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-semibold ${col?.bgCard} ${col?.color}`}>
                          {col?.label}
                        </span>
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

          <div className="overflow-x-auto">
            <h2 className="text-sm font-semibold text-slate-900 mb-2">Site transfers ({visibleSt.length})</h2>
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Client #</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Case #</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">SolarEdge site</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Service Order</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600">Column</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {visibleSt.map(row => {
                  const col = ST_COLUMNS.find(c => c.id === row.column);
                  return (
                    <tr key={row.job.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-bold text-slate-900 font-mono">{row.customer?.clientId || '-'}</td>
                      <td className="px-4 py-3">
                        {row.customer ? (
                          <button
                            onClick={() => onViewCustomer?.(row.customer!.id)}
                            className="text-sm text-orange-600 hover:text-orange-700 font-medium"
                          >
                            {row.customer.name}
                          </button>
                        ) : <span className="text-sm text-slate-300 italic">no customer</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500 font-mono">{row.caseNumber || '-'}</td>
                      <td className="px-4 py-3 text-sm text-slate-500">
                        {row.site?.siteName || (row.badge === 'waiting' ? 'Waiting on SolarEdge' : '-')}
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
                        {row.badge === 'needs_rename' && (
                          <span className="ml-1 inline-block px-2 py-1 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700">
                            Needs rename
                          </span>
                        )}
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
      {!boardEmpty && viewMode === 'calendar' && (
        <div className="p-6">
          <div className="space-y-4">
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
                const entriesForDate = isCurrentMonth ? visibleParts.filter(r =>
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
                          key={row.key}
                          className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium truncate cursor-pointer hover:bg-amber-200"
                          title={`${row.entry.partDescription} - ${row.customer?.clientId ?? ''} ${row.customer?.name || 'Unknown'}`}
                        >
                          #{row.entry.rmaNumber || row.entry.caseNumber || '?'}
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
          customers={customers}
          currentUserName={currentUser?.name ?? currentUser?.email}
          onClose={() => setShowCreateRma(false)}
          onCreate={onCreateStandaloneRma}
        />
      )}
    </div>
  );
}
