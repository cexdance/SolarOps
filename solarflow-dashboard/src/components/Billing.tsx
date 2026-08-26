// SolarFlow MVP - Billing Component (The "Leakage Fix")
import React, { useState } from 'react';
import {
  DollarSign,
  AlertTriangle,
  CheckCircle,
  Clock,
  Search,
  Send,
  LayoutGrid,
  List as ListIcon,
  Calendar,
  Printer,
  ChevronRight,
  ArrowUpDown,
  FileText,
} from 'lucide-react';
import { Job, Customer, User as UserType } from '../types';
import type { Contractor } from '../types/contractor';
import { sortJobsBy, JOB_SORT_OPTIONS, type JobSortOption } from '../lib/jobSort';
import { serviceOrderNo, isSiteTransferJob } from '../lib/woHelpers';
import { notifyAdminForInvoice } from '../lib/quoteService';
import { formatMoney, formatCost } from '../lib/money';
import { WorkOrderCalendar } from './WorkOrderCalendar';
import { BillingReportModal } from './BillingReportModal';
import { SowDistributionModal } from './SowDistributionModal';
import { printServiceReport } from '../lib/printServiceReport';

// ── Billing pipeline (kanban) ─────────────────────────────────────────────────
// New → Quote Sent → Pending Completion → Ready to Invoice → Invoiced → Paid →
// Costs Covered. PowerCare SOs bill to SolarEdge through Conexsol USA; their
// cards get an orange hue so Daniel spots them at a glance.
export type BillingCol = 'new' | 'quote_sent' | 'pending' | 'to_invoice' | 'invoiced' | 'paid' | 'costs_covered';

export const getBillingColumn = (job: Job): BillingCol => {
  // Site transfers have no quote and no field work: Daniel invoices the flat
  // fee directly, so the card belongs in Ready to Invoice from creation rather
  // than sitting in New waiting for a stage that never comes. It only reaches
  // Invoiced once someone actually invoices it (status invoiced), and Paid
  // still wins so the card closes out normally. Whether the transfer has been
  // executed in SolarEdge is siteTransferCompletedAt, not the column.
  if (isSiteTransferJob(job)) {
    if (job.status === 'paid') return job.costsCoveredAt ? 'costs_covered' : 'paid';
    if (job.status === 'invoiced') return 'invoiced';
    return 'to_invoice';
  }
  // woStatus is the field the Service Order panel actually drives through the
  // 8-stage pipeline, so it is checked FIRST for the two pre-work stages. When
  // woStatus still says draft or quote_sent, the work provably has not been
  // done, and a coarse `status` claiming invoiced or paid is stale data rather
  // than a real stage. Three live orders are exactly that shape
  // (WO-2605-48600 / -55497 / -79732: status invoiced, woStatus draft, and no
  // completedAt, invoicedAt, clientPaidAt or xeroInvoiceId to support it, two
  // of them last written on 2026-06-12, the stale-push incident). Money
  // columns must not accept an order on the word of `status` alone.
  if (job.woStatus === 'draft') return 'new';
  if (job.woStatus === 'quote_sent') return 'quote_sent';
  if (job.status === 'paid') return job.costsCoveredAt ? 'costs_covered' : 'paid';
  if (job.status === 'invoiced') return 'invoiced';
  if (job.status === 'completed') return 'to_invoice';
  // No woStatus at all means the service call was created but never worked,
  // same place as an explicit draft.
  if (!job.woStatus) return 'new';
  return 'pending';
};

// ── Card aging ────────────────────────────────────────────────────────────────
// Each column runs off its own clock: the moment the card landed in that
// stage. What "late" means differs per column (an old Quote Sent is a client
// who never answered, an old Paid is a contractor still owed), but the marker
// is the same so the board reads uniformly left to right.
//
// Costs Covered is deliberately absent. It is the closed-out column: nothing
// is wrong with an old card there, so a marker would just turn every finished
// order red and drown out the columns where red means act now.
//
// The stage stamp is FIRST CHOICE, not the only one. Most of the existing
// backlog predates those stamps (as of 2026-07-28: 0 of 13 Quote Sent cards
// have quoteSentAt, 7 of 31 Invoiced have invoicedAt), and a card that can't
// age is worse than one aged approximately. So fall back to the last touch,
// then to creation, and mark the result inexact so the card can say so.
export const AGE_ANCHORS: Partial<Record<BillingCol, (keyof Job)[]>> = {
  new:        ['createdAt'],
  quote_sent: ['quoteSentAt', 'updatedAt', 'createdAt'],
  // Approved and handed to dispatch: how long the contractor has had it.
  pending:    ['quoteApprovedAt', 'contractorSentAt', 'updatedAt', 'createdAt'],
  to_invoice: ['completedAt', 'updatedAt', 'createdAt'],
  invoiced:   ['invoicedAt', 'updatedAt', 'createdAt'],
  // Client paid but the contractor and expenses are not settled yet.
  paid:       ['clientPaidAt', 'updatedAt', 'createdAt'],
};

// Calendar days, escalating one level every 3. 0-2 clean, 3-5, 6-8, 9+.
// ponytail: capped at 3 because a 4th shade of red reads the same as the 3rd.
export const ageTier = (days: number): 0 | 1 | 2 | 3 =>
  days < 3 ? 0 : Math.min(3, Math.floor(days / 3)) as 1 | 2 | 3;

/** Days the card has sat in this column, or null when the column has no clock
 *  (Costs Covered) or nothing usable to measure from. `exact` is false when
 *  the stage stamp was missing and a fallback timestamp was used. */
export const cardAge = (
  job: Job,
  col: BillingCol,
  now = Date.now(),
): { days: number; exact: boolean } | null => {
  const chain = AGE_ANCHORS[col];
  if (!chain) return null;
  for (let i = 0; i < chain.length; i++) {
    const raw = job[chain[i]];
    if (typeof raw !== 'string' || !raw) continue;
    const t = new Date(raw).getTime();
    if (Number.isNaN(t)) continue;
    return { days: Math.max(0, Math.floor((now - t) / 86400000)), exact: i === 0 };
  }
  return null;
};

// Sorting by age can't live in lib/jobSort: the anchor depends on which column
// the card is in, and sortJobsBy has no column. So Billing owns these two and
// delegates everything else unchanged.
export type BillingSortOption = JobSortOption | 'age_desc' | 'age_asc';

export const BILLING_SORT_OPTIONS: { value: BillingSortOption; label: string }[] = [
  { value: 'age_desc', label: 'Aging, Most Critical First' },
  { value: 'age_asc',  label: 'Aging, Newest First' },
  ...JOB_SORT_OPTIONS,
];

/** Age sort for one column. Cards with no measurable age always sink to the
 *  bottom in both directions, so "newest first" can't be led by cards that
 *  simply have no date. */
export const sortByAge = (list: Job[], col: BillingCol, dir: 'asc' | 'desc', now = Date.now()): Job[] => {
  const dated: { job: Job; days: number }[] = [];
  const undated: Job[] = [];
  for (const job of list) {
    const age = cardAge(job, col, now);
    if (age) dated.push({ job, days: age.days });
    else undated.push(job);
  }
  dated.sort((a, b) => (dir === 'desc' ? b.days - a.days : a.days - b.days));
  return [...dated.map(d => d.job), ...undated];
};

const TIER_STYLE: Record<0 | 1 | 2 | 3, { border: string; pill: string }> = {
  0: { border: '',                               pill: '' },
  1: { border: 'border-l-4 border-l-amber-400',  pill: 'bg-amber-100 text-amber-800' },
  2: { border: 'border-l-4 border-l-orange-500', pill: 'bg-orange-100 text-orange-800' },
  3: { border: 'border-l-4 border-l-red-600',    pill: 'bg-red-100 text-red-700 font-bold' },
};

/** `YYYY-MM-DD` for a date input, in LOCAL time. `toISOString().slice(0,10)`
 *  is wrong here: it converts to UTC first, so anyone west of Greenwich gets
 *  yesterday's date as the default after ~19:00 local. */
export const toDateInputValue = (d = new Date()): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Turn a `YYYY-MM-DD` picker value into an ISO timestamp at LOCAL midday.
 *  `new Date('2026-08-21')` parses as UTC midnight, which renders as the 20th
 *  in any negative-offset timezone (all of the US). Midday local survives the
 *  round trip through toLocaleDateString in every zone. Returns null on junk so
 *  a bad value can never be written as the close-out date. */
export const dateInputToISO = (value: string): string | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const [, y, mo, d] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d), 12, 0, 0, 0);
  if (Number.isNaN(dt.getTime())) return null;
  // JS rolls impossible dates over silently: new Date(2026, 12, 45) is Feb
  // 2027, not an error. Reject anything that did not survive the round trip,
  // so a typo cannot be written as the close-out date.
  if (dt.getFullYear() !== Number(y) || dt.getMonth() !== Number(mo) - 1 || dt.getDate() !== Number(d)) return null;
  return dt.toISOString();
};

/** Billing works service orders, not leads. An order gets its woNumber when it
 *  is created, so that number IS the "a service order exists" flag: as of
 *  2026-08-08 all 116 orders across the six worked columns have one, and the
 *  only 35 records without one are S1 pipeline leads (every one of them
 *  carrying a pipelineStage, which by design nothing in billing reads). Those
 *  belong on the sales board until someone actually raises an order. */
export const isServiceOrder = (job: Job): boolean => !!job.woNumber;

/** A lead converted straight to a service order has no customer row yet, only
 *  job.clientName. Falling back keeps those cards from rendering nameless. */
export const displayName = (job: Job, customer?: Customer): string =>
  customer?.name || job.clientName || 'Unnamed order';

/** What the first column is actually asking Daniel to do. The three intake
 *  flows land in the same place but need different work, so the card says
 *  which one it is instead of making him open it to find out. */
export type OrderKind = 'powercare' | 'expense' | 'quote';

export const orderKind = (job: Job): OrderKind =>
  job.isPowercare ? 'powercare' : job.isServiceAccountExpense ? 'expense' : 'quote';

export const ORDER_KIND_META: Record<OrderKind, { label: string; badge: string; action: string }> = {
  powercare: { label: 'PowerCare', badge: 'bg-orange-100 text-orange-700', action: 'Review PowerCare' },
  expense:   { label: 'Service Account', badge: 'bg-cyan-100 text-cyan-700', action: 'Log Expense' },
  quote:     { label: 'Quote', badge: 'bg-blue-100 text-blue-700', action: 'Create Quote' },
};

interface BillingProps {
  jobs: Job[];
  customers: Customer[];
  users: UserType[];
  onUpdateJob: (job: Job) => void;
  isMobile: boolean;
  currentUserName?: string;
  onJobClick?: (jobId: string) => void;
  contractors?: Contractor[];
  /** Fired once when an order first moves into Costs Covered, so the contractor
   *  can be told they have been paid. App owns the delivery. */
  onCostsCovered?: (job: Job) => void;
}

export const Billing: React.FC<BillingProps> = ({
  jobs,
  customers,
  users,
  onUpdateJob,
  currentUserName,
  onJobClick,
  contractors = [],
  onCostsCovered,
}) => {
  const [filter, setFilter] = useState<'all' | 'unbilled' | 'invoiced' | 'paid'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [processingIds, setProcessingIds] = useState<string[]>([]);
  const [showReport, setShowReport] = useState(false);
  // Click a column's aging badge to see only the cards that are actually late.
  const [agingOnly, setAgingOnly] = useState<Record<string, boolean>>({});
  // Order whose SOW is being reviewed before invoicing.
  const [sowJobId, setSowJobId] = useState<string | null>(null);
  // Close-out step: which order is being covered, and the date the admin picked.
  const [coverJobId, setCoverJobId] = useState<string | null>(null);
  const [coverDate, setCoverDate] = useState(() => toDateInputValue());

  /** Open the close-out step with today pre-filled. */
  const startCoverCosts = (jobId: string) => {
    setCoverDate(toDateInputValue());
    setCoverJobId(jobId);
  };
  const [viewMode, setViewMode] = useState<'kanban' | 'list' | 'calendar'>(() => {
    const saved = localStorage.getItem('solarops_billing_view');
    if (saved === 'kanban' || saved === 'list' || saved === 'calendar') return saved as 'kanban' | 'list' | 'calendar';
    return 'list';
  });

  // Per-column sort, same options and persistence behavior as the Service
  // Orders board. Keyed by column so each stack can be ordered independently.
  const COL_SORT_KEY = 'solarops_billing_col_sort';
  const [columnSortBy, setColumnSortBy] = useState<Record<string, BillingSortOption>>(() => {
    try { return JSON.parse(localStorage.getItem(COL_SORT_KEY) ?? '{}'); } catch { return {}; }
  });
  const setColSort = (col: string, sort: BillingSortOption) => {
    setColumnSortBy(prev => {
      const next = { ...prev, [col]: sort };
      localStorage.setItem(COL_SORT_KEY, JSON.stringify(next));
      return next;
    });
  };

  const LIST_SORT_KEY = 'solarops_billing_list_sort';
  const [listSortBy, setListSortBy] = useState<JobSortOption>(
    () => (localStorage.getItem(LIST_SORT_KEY) as JobSortOption) || 'none'
  );
  const setListSort = (sort: JobSortOption) => {
    setListSortBy(sort);
    localStorage.setItem(LIST_SORT_KEY, sort);
  };

  // Whole card opens the service order. ponytail: one target check instead of
  // stopPropagation on every action button, so buttons added later are covered
  // for free. A drag never fires click, so this is safe on the kanban card.
  const openFromCard = (job: Job) => (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button,a')) return;
    onJobClick?.(job.id);
  };

  // Print the client service report straight from a billing card.
  // ponytail: reuses printServiceReport, no new modal.
  const cardLinks = (job: Job, customer?: Customer) => (
    <div className="flex items-center gap-3 text-[11px] font-medium">
      <button
        onClick={(e) => {
          e.stopPropagation();
          printServiceReport({
            job,
            customer,
            siteName: customer?.name ?? '',
            siteAddress: customer?.address,
            clientId: customer?.clientId,
            serviceType: job.serviceType ? String(job.serviceType) : undefined,
          });
        }}
        title="Print client service report (no financials)"
        className="inline-flex items-center gap-1 text-slate-500 hover:text-orange-600 cursor-pointer"
      >
        <Printer className="w-3 h-3" /> Report
      </button>
    </div>
  );

  const handleViewMode = (mode: 'kanban' | 'list' | 'calendar') => {
    setViewMode(mode);
    localStorage.setItem('solarops_billing_view', mode);
  };

  // Billing only ever deals in service orders. Everything upstream of that,
  // the S1 sales funnel, belongs on the pipeline board.
  const serviceOrders = jobs.filter(isServiceOrder);

  // Filter jobs by status
  const filteredJobs = serviceOrders
    .filter((job) => {
      // Show all jobs in 'all' filter, otherwise filter by specific status
      if (filter === 'all') return true;
      if (filter === 'unbilled') return job.status === 'completed' || job.status === 'new' || job.status === 'assigned' || job.status === 'in_progress';
      if (filter === 'invoiced') return job.status === 'invoiced';
      if (filter === 'paid') return job.status === 'paid';
      return true;
    })
    .filter((job) => {
      // An empty search must not filter anything. It used to: with no query the
      // predicate still ran, and a job whose customerId resolves to nothing
      // returned undefined and was DROPPED off the board silently. Real service
      // orders do hit that path (2 live ones carry a woNumber but no linked
      // customer), so the guard stays even now that leads are excluded above.
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      const customer = customers.find((c) => c.id === job.customerId);
      return (
        (job.clientName ?? '').toLowerCase().includes(q) ||
        (job.siteAddress ?? '').toLowerCase().includes(q) ||
        customer?.name.toLowerCase().includes(q) ||
        customer?.address.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      // Sort by date, newest first
      const dateA = new Date(a.completedAt || a.scheduledDate || a.createdAt).getTime();
      const dateB = new Date(b.completedAt || b.scheduledDate || b.createdAt).getTime();
      return dateB - dateA;
    });

  const unbilledJobs = serviceOrders.filter((j) => j.status === 'completed');
  const invoicedJobs = serviceOrders.filter((j) => j.status === 'invoiced');
  const paidJobs = serviceOrders.filter((j) => j.status === 'paid');

  const getCustomer = (customerId: string) => customers.find((c) => c.id === customerId);

  const handleRequestInvoice = async (job: Job) => {
    const customer = getCustomer(job.customerId);
    if (!customer) return;

    setProcessingIds(prev => [...prev, job.id]);
    try {
      await notifyAdminForInvoice(
        job.id,
        job.woNumber ?? `WO-${job.id.slice(-6)}`,
        customer.name,
        job.totalAmount,
        currentUserName ?? 'Staff',
        users.map(u => ({ id: u.id, name: u.name })),
      );
      onUpdateJob({ ...job, status: 'invoiced' });
    } catch (error) {
      console.error('Invoice notification failed:', error);
    } finally {
      setProcessingIds(prev => prev.filter(id => id !== job.id));
    }
  };

  const handleMarkPaid = (job: Job) => {
    onUpdateJob({ ...job, status: 'paid' });
  };

  const getJobBillingStatus = (job: Job): 'unbilled' | 'invoiced' | 'paid' => {
    if (job.status === 'paid') return 'paid';
    if (job.status === 'invoiced') return 'invoiced';
    return 'unbilled';
  };

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<BillingCol | null>(null);

  const moveToColumn = (jobId: string, col: BillingCol, coveredAtISO?: string) => {
    const job = jobs.find(j => j.id === jobId);
    if (!job || getBillingColumn(job) === col) return;
    // A site transfer skips the quote and field-work stages, so it only moves
    // forward from Ready to Invoice. A drop on an earlier column would write a
    // stage the board immediately renders back as Ready to Invoice, so ignore
    // it rather than silently patching a status nobody sees.
    if (isSiteTransferJob(job) && col !== 'invoiced' && col !== 'paid' && col !== 'costs_covered') return;
    const now = new Date().toISOString();
    // Close-out is the one stage whose date the admin sets by hand: costs are
    // often covered days after the fact, and this timestamp is what the
    // contractor sees as their paid date.
    const coveredAt = coveredAtISO ?? job.costsCoveredAt ?? now;
    let patch: Partial<Job>;
    switch (col) {
      case 'new':
        patch = { status: 'new', woStatus: 'draft', costsCoveredAt: undefined };
        break;
      case 'quote_sent':
        patch = { status: 'new', woStatus: 'quote_sent', quoteSentAt: job.quoteSentAt ?? now, costsCoveredAt: undefined };
        break;
      case 'pending':
        patch = { status: 'in_progress', woStatus: 'in_progress', costsCoveredAt: undefined };
        break;
      case 'to_invoice':
        patch = { status: 'completed', woStatus: 'completed', completedAt: job.completedAt ?? now, costsCoveredAt: undefined };
        break;
      case 'invoiced':
        patch = { status: 'invoiced', woStatus: 'invoiced', invoicedAt: job.invoicedAt ?? now, costsCoveredAt: undefined };
        break;
      case 'paid':
        patch = { status: 'paid', woStatus: 'paid', clientPaidAt: job.clientPaidAt ?? now, costsCoveredAt: undefined };
        break;
      case 'costs_covered':
        patch = { status: 'paid', woStatus: 'paid', clientPaidAt: job.clientPaidAt ?? now, costsCoveredAt: coveredAt };
        break;
    }
    onUpdateJob({ ...job, ...patch });

    // Covering contractor + expenses is the contractor's payday, so tell them.
    // Guarded on the order NOT already being covered: moveToColumn also runs on
    // drag, and dragging a card out and back must not re-send a payment
    // confirmation every time.
    if (col === 'costs_covered' && !job.costsCoveredAt) {
      onCostsCovered?.({ ...job, ...patch });
    }
  };

  // Client accepted the quote. The order leaves billing's hands and goes back
  // to dispatch/scheduling, so it lands in Pending Completion and returns on
  // its own once the contractor completes it.
  const approveQuote = (job: Job) =>
    onUpdateJob({
      ...job,
      status: 'assigned',
      woStatus: 'quote_approved',
      quoteApprovedAt: job.quoteApprovedAt ?? new Date().toISOString(),
    });

  const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) : '');

  const getDaysSinceCompleted = (completedAt?: string) => {
    if (!completedAt) return 0;
    const completed = new Date(completedAt);
    const now = new Date();
    return Math.floor((now.getTime() - completed.getTime()) / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Billing</h1>
          <p className="text-slate-500 mt-1">Manage invoices and track payments</p>
        </div>
        <button
          onClick={() => setShowReport(true)}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-700 transition-colors shrink-0 cursor-pointer"
        >
          <Printer className="w-4 h-4" />
          Print Report
        </button>
      </div>

      {/* Unbilled Alert: clicking it jumps to the unbilled jobs list */}
      {unbilledJobs.length > 0 && (
        <button
          onClick={() => { setFilter('unbilled'); handleViewMode('list'); }}
          className="w-full text-left bg-red-50 border border-red-200 rounded-xl p-4 mb-6 hover:bg-red-100/70 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg animate-pulse">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-red-900">
                ACTION REQUIRED: {unbilledJobs.length} unbilled job{unbilledJobs.length > 1 ? 's' : ''}
              </p>
              <p className="text-sm text-red-700">
                Completed work with no invoice yet. Click to review the list.
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-red-400 shrink-0" />
          </div>
        </button>
      )}

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3 mb-6">
        {/* View toggle */}
        <div className="flex rounded-lg border border-slate-200 overflow-hidden shrink-0">
          <button
            onClick={() => handleViewMode('kanban')}
            title="Kanban"
            className={`px-3 py-2.5 flex items-center justify-center ${viewMode === 'kanban' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleViewMode('list')}
            title="List"
            className={`px-3 py-2.5 flex items-center justify-center ${viewMode === 'list' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            <ListIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleViewMode('calendar')}
            title="Calendar"
            className={`px-3 py-2.5 flex items-center justify-center ${viewMode === 'calendar' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            <Calendar className="w-4 h-4" />
          </button>
        </div>
        {/* Type dropdown */}
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as 'all' | 'unbilled' | 'invoiced' | 'paid')}
          className="px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 shrink-0"
        >
          <option value="all">All ({serviceOrders.length})</option>
          <option value="unbilled">Unbilled ({unbilledJobs.length})</option>
          <option value="invoiced">Invoiced ({invoicedJobs.length})</option>
          <option value="paid">Paid ({paidJobs.length})</option>
        </select>
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by customer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
        {/* List sort. The kanban has its own per-column control instead. */}
        {viewMode === 'list' && (
          <div className="relative">
            <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <select
              value={listSortBy}
              onChange={e => setListSort(e.target.value as JobSortOption)}
              title="Sort billing records"
              className="pl-8 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm cursor-pointer"
            >
              {JOB_SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Kanban View: the billing pipeline. Drag a card to advance it. */}
      {viewMode === 'kanban' && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {([
            { key: 'new'           as BillingCol, label: 'CREATE QUOTE',       sub: 'Every new service order: quote, service account, PowerCare', headerCls: 'bg-blue-50 border-blue-200 text-blue-700' },
            { key: 'quote_sent'    as BillingCol, label: 'Quote Sent',         sub: 'Awaiting client approval',     headerCls: 'bg-violet-50 border-violet-200 text-violet-700' },
            { key: 'pending'       as BillingCol, label: 'Pending Completion', sub: 'Approved, waiting on contractor', headerCls: 'bg-slate-100 border-slate-200 text-slate-700' },
            { key: 'to_invoice'    as BillingCol, label: 'Ready to Invoice',   sub: 'Create and send in Xero',      headerCls: 'bg-red-50 border-red-200 text-red-700' },
            { key: 'invoiced'      as BillingCol, label: 'Invoiced',           sub: 'Awaiting payment',             headerCls: 'bg-purple-50 border-purple-200 text-purple-700' },
            { key: 'paid'          as BillingCol, label: 'Paid',               sub: 'Client / SolarEdge paid',      headerCls: 'bg-green-50 border-green-200 text-green-700' },
            { key: 'costs_covered' as BillingCol, label: 'Costs Covered',      sub: 'Contractor + expenses settled', headerCls: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
          ]).map(col => {
            // Most critical first by default: the whole point of the markers is
            // that the worst card should not be the one you have to scroll to.
            const colSort = columnSortBy[col.key] ?? 'age_desc';
            const inCol = filteredJobs.filter(j => j.status !== 'archived' && getBillingColumn(j) === col.key);
            const allColJobs = colSort === 'age_desc' || colSort === 'age_asc'
              ? sortByAge(inCol, col.key, colSort === 'age_desc' ? 'desc' : 'asc')
              : sortJobsBy(inCol, colSort, contractors);
            const isAging = (j: Job) => ageTier(cardAge(j, col.key)?.days ?? 0) > 0;
            const agingCount = allColJobs.filter(isAging).length;
            const showAgingOnly = !!agingOnly[col.key] && agingCount > 0;
            const colJobs = showAgingOnly ? allColJobs.filter(isAging) : allColJobs;
            return (
              <div
                key={col.key}
                className={`flex-1 min-w-[260px] rounded-xl transition-colors ${dragOverCol === col.key ? 'bg-orange-50 ring-2 ring-orange-300' : ''}`}
                onDragOver={e => { e.preventDefault(); setDragOverCol(col.key); }}
                onDragLeave={() => setDragOverCol(prev => (prev === col.key ? null : prev))}
                onDrop={e => {
                  e.preventDefault();
                  setDragOverCol(null);
                  // Dropping onto Costs Covered asks for the date as well, so
                  // the close-out date never depends on how the card got there.
                  if (draggedId) {
                    if (col.key === 'costs_covered') startCoverCosts(draggedId);
                    else moveToColumn(draggedId, col.key);
                  }
                  setDraggedId(null);
                }}
              >
                <div className={`px-3 py-2 rounded-lg border mb-3 ${col.headerCls}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm">{col.label}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* How many are rotting below the fold. Toggles the stack
                          down to just those, so the count is also the triage. */}
                      {agingCount > 0 && (
                        <button
                          onClick={() => setAgingOnly(prev => ({ ...prev, [col.key]: !prev[col.key] }))}
                          title={showAgingOnly ? 'Show all cards' : `Show only the ${agingCount} aging`}
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold cursor-pointer transition-colors ${
                            showAgingOnly ? 'bg-red-600 text-white' : 'bg-red-100 text-red-700 hover:bg-red-200'
                          }`}
                        >
                          <AlertTriangle className="w-2.5 h-2.5" />
                          {agingCount} aging
                        </button>
                      )}
                      <span className="text-xs font-bold">{colJobs.length}</span>
                    </div>
                  </div>
                  <p className="text-[10px] opacity-70 mt-0.5">{col.sub}</p>
                </div>
                <div className="relative mb-3">
                  <ArrowUpDown className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                  <select
                    value={colSort}
                    onChange={e => setColSort(col.key, e.target.value as BillingSortOption)}
                    title={`Sort ${col.label}`}
                    className="w-full pl-6 pr-2 py-1 bg-white border border-slate-200 rounded-md text-[11px] text-slate-600 focus:outline-none focus:ring-1 focus:ring-orange-500 cursor-pointer"
                  >
                    {BILLING_SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="space-y-3 min-h-[80px]">
                  {colJobs.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-xl">
                      Empty
                    </div>
                  ) : colJobs.map(job => {
                    const customer = getCustomer(job.customerId);
                    const age = cardAge(job, col.key);
                    const tier = ageTier(age?.days ?? 0);
                    return (
                      <div
                        key={job.id}
                        draggable
                        onDragStart={() => setDraggedId(job.id)}
                        onDragEnd={() => { setDraggedId(null); setDragOverCol(null); }}
                        onClick={openFromCard(job)}
                        title="Open service order"
                        className={`rounded-xl border p-3 hover:shadow-md transition-all cursor-grab select-none ${
                          job.isPowercare ? 'bg-orange-50/70 border-orange-200' : 'bg-white border-slate-200'
                        } ${TIER_STYLE[tier].border} ${draggedId === job.id ? 'opacity-40 scale-95' : ''}`}
                      >
                        <div className="flex items-center gap-1.5 mb-0.5">
                          {customer?.clientId && (
                            <span className="text-[10px] text-slate-400 font-medium leading-tight">{customer.clientId}</span>
                          )}
                          {/* In the intake column say which of the three flows
                              this is; elsewhere only PowerCare needs calling out. */}
                          {col.key === 'new' ? (
                            <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${ORDER_KIND_META[orderKind(job)].badge}`}>
                              {ORDER_KIND_META[orderKind(job)].label}
                            </span>
                          ) : job.isPowercare && (
                            <span className="text-[9px] font-bold uppercase tracking-wide bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">PowerCare</span>
                          )}
                          {/* Site transfers all sit in Invoiced, so the column
                              no longer says whether the transfer itself has
                              been run. The badge does. */}
                          {isSiteTransferJob(job) && (
                            <span
                              title={job.siteTransferCompletedAt
                                ? `Transfer executed in SolarEdge on ${new Date(job.siteTransferCompletedAt).toLocaleDateString()}`
                                : 'Invoiced, but the SolarEdge transfer has not been marked done yet'}
                              className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${
                                job.siteTransferCompletedAt
                                  ? 'bg-teal-100 text-teal-700'
                                  : 'bg-amber-100 text-amber-700'
                              }`}
                            >
                              {job.siteTransferCompletedAt ? 'Transferred' : 'Transfer pending'}
                            </span>
                          )}
                          {tier > 0 && age && (
                            <span
                              title={age.exact
                                ? `${age.days} days in ${col.label}`
                                : `About ${age.days} days: no stage date on this order, measured from its last update`}
                              className={`text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap ${TIER_STYLE[tier].pill}`}
                            >
                              {age.exact ? '' : '~'}{age.days}d
                            </span>
                          )}
                          {job.woNumber && (
                            <span className="text-[10px] text-slate-400 ml-auto shrink-0">{serviceOrderNo(job.woNumber)}</span>
                          )}
                        </div>
                        <p className="font-semibold text-slate-900 text-sm leading-tight truncate">{displayName(job, customer)}</p>
                        {!customer && (
                          <p className="text-[10px] text-amber-600 leading-tight">Not linked to a client record</p>
                        )}
                        <div className="mt-1">{cardLinks(job, customer)}</div>
                        <div className="flex items-center gap-1.5 flex-wrap mt-1 mb-2">
                          {job.serviceType && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-teal-100 text-teal-700 whitespace-nowrap">{String(job.serviceType)}</span>
                          )}
                          {job.completedAt && !['pending', 'new', 'quote_sent'].includes(col.key) && (
                            <span className="text-[10px] text-slate-500">Done {fmtDate(job.completedAt)}</span>
                          )}
                          {job.quoteSentAt && col.key === 'quote_sent' && (
                            <span className="text-[10px] text-slate-500">Sent {fmtDate(job.quoteSentAt)}</span>
                          )}
                          {job.invoicedAt && ['invoiced', 'paid', 'costs_covered'].includes(col.key) && (
                            <span className="text-[10px] text-slate-500">· Inv {fmtDate(job.invoicedAt)}</span>
                          )}
                          {job.clientPaidAt && ['paid', 'costs_covered'].includes(col.key) && (
                            <span className="text-[10px] text-slate-500">· Paid {fmtDate(job.clientPaidAt)}</span>
                          )}
                        </div>
                        {/* What Daniel has to quote: the free-text scope the
                            caller gave. Shown before he opens the panel. */}
                        {['new', 'quote_sent'].includes(col.key) && (job.description || job.notes) && (
                          <p className="text-[11px] text-slate-600 mb-2 whitespace-pre-line line-clamp-3">
                            {job.description || job.notes}
                          </p>
                        )}
                        <div className="flex gap-2">
                          {col.key === 'new' && (
                            <button
                              onClick={() => onJobClick?.(job.id)}
                              className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 cursor-pointer"
                            >
                              <FileText className="w-3 h-3" /> {ORDER_KIND_META[orderKind(job)].action}
                            </button>
                          )}
                          {col.key === 'quote_sent' && (
                            <>
                              <span className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-violet-100 text-violet-700 rounded-lg text-xs font-medium">
                                <Clock className="w-3 h-3" /> Awaiting Approval
                              </span>
                              <button onClick={() => approveQuote(job)} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 cursor-pointer">Approved</button>
                            </>
                          )}
                          {col.key === 'pending' && (
                            <span className="text-[11px] text-slate-400">With dispatch · moves to Ready to Invoice when the contractor completes</span>
                          )}
                          {col.key === 'to_invoice' && (
                            // Opens the SOW instead of invoicing blind. The card
                            // stays exactly where it is: nothing advances until
                            // Daniel acts from inside the report.
                            <button
                              onClick={() => setSowJobId(job.id)}
                              className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 cursor-pointer"
                            >
                              <FileText className="w-3 h-3" /> Generate Invoice
                            </button>
                          )}
                          {col.key === 'invoiced' && (
                            <>
                              <span className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-xs font-medium">
                                <Clock className="w-3 h-3" /> Awaiting Payment
                              </span>
                              <button onClick={() => moveToColumn(job.id, 'paid')} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 cursor-pointer">Paid</button>
                            </>
                          )}
                          {col.key === 'paid' && (
                            <button
                              onClick={() => startCoverCosts(job.id)}
                              className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 cursor-pointer"
                            >
                              <CheckCircle className="w-3 h-3" /> Cover Contractor & Expenses
                            </button>
                          )}
                          {col.key === 'costs_covered' && (
                            <div className="flex items-center gap-1 text-emerald-600 text-xs font-medium">
                              <CheckCircle className="w-4 h-4" /> Closed out {fmtDate(job.costsCoveredAt)}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Calendar View */}
      {viewMode === 'calendar' && (
        <WorkOrderCalendar
          jobs={filteredJobs}
          customers={customers}
          users={[]}
          onJobClick={() => {}}
        />
      )}

      {/* Billing Report Modal */}
      {showReport && (
        <BillingReportModal
          jobs={filteredJobs}
          customers={customers}
          reportTitle={
            filter === 'all'      ? 'Full Billing Report' :
            filter === 'unbilled' ? 'Unbilled Jobs Report' :
            filter === 'invoiced' ? 'Invoiced Jobs Report' :
                                    'Paid Jobs Report'
          }
          onClose={() => setShowReport(false)}
        />
      )}

      {/* ── Close-out date ───────────────────────────────────────────────────
          Costs are routinely covered days after the fact, and this timestamp is
          what the contractor sees as their paid date, so the admin sets it
          rather than inheriting "whenever I happened to click". */}
      {coverJobId && (() => {
        const job = serviceOrders.find(j => j.id === coverJobId);
        if (!job) return null;
        const customer = getCustomer(job.customerId);
        const close = () => setCoverJobId(null);
        const iso = dateInputToISO(coverDate);
        const confirm = () => {
          if (!iso) return;
          moveToColumn(job.id, 'costs_covered', iso);
          close();
        };
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={close}
          >
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-slate-200">
                <h2 className="text-base font-bold text-slate-900">Close out this order</h2>
                <p className="text-xs text-slate-500 mt-0.5 truncate">
                  {displayName(job, customer)}
                  {job.woNumber && <> · {serviceOrderNo(job.woNumber)}</>}
                </p>
              </div>
              <div className="px-5 py-4">
                <label htmlFor="coverDate" className="block text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1.5">
                  Close-out date
                </label>
                <input
                  id="coverDate"
                  type="date"
                  value={coverDate}
                  max={toDateInputValue()}
                  onChange={e => setCoverDate(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && iso) confirm(); }}
                  autoFocus
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <p className="text-[11px] text-slate-500 mt-2">
                  Defaults to today. This is the date the contractor sees as their paid date.
                </p>
                {!iso && (
                  <p className="text-[11px] text-red-600 mt-1.5">Pick a valid date to continue.</p>
                )}
              </div>
              <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex items-center justify-end gap-2">
                <button
                  onClick={close}
                  className="px-3 py-2 border border-slate-200 bg-white rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={confirm}
                  disabled={!iso}
                  className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                >
                  <CheckCircle className="w-3.5 h-3.5" /> Cover Contractor &amp; Expenses
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Invoice review ───────────────────────────────────────────────────
          Generate Invoice opens the SOW rather than invoicing blind, so the
          work actually done and the amount about to be billed are on screen
          together. The card does not move until Daniel acts from in here. */}
      {sowJobId && (() => {
        const job = serviceOrders.find(j => j.id === sowJobId);
        if (!job) return null;
        const customer = getCustomer(job.customerId);
        const parts = job.partsCost ?? 0;
        const close = () => setSowJobId(null);
        return (
          <SowDistributionModal
            job={job}
            siteName={displayName(job, customer)}
            siteAddress={customer?.address ?? job.siteAddress}
            customer={customer}
            contractors={contractors}
            users={users.map(u => ({ id: u.id, name: u.name, username: u.username, email: u.email }))}
            onClose={close}
            actions={
              <div className="flex items-center justify-between gap-4 flex-wrap">
                {/* No client total here on purpose: commercial figures are
                    hidden platform-wide (SHOW_MONEY), the invoice itself is
                    raised in Xero. What Daniel needs off this screen is what
                    was actually done, plus the field-entered costs formatCost
                    is explicitly allowed to show. */}
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Billable work</p>
                  <p className="text-sm font-semibold text-slate-900 leading-tight">
                    {job.laborHours ? `${job.laborHours} hr${job.laborHours === 1 ? '' : 's'} labor` : 'No labor hours logged'}
                    {parts > 0 && <span className="font-normal text-slate-600"> · parts {formatCost(parts)}</span>}
                  </p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {job.serviceType ? String(job.serviceType) : 'No service type'}
                    {job.isPowercare && <> · <span className="text-orange-600 font-semibold">PowerCare, bills to SolarEdge</span></>}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={close}
                    className="px-3 py-2 border border-slate-200 bg-white rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Not yet
                  </button>
                  <button
                    onClick={() => { handleRequestInvoice(job); close(); }}
                    disabled={processingIds.includes(job.id)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 disabled:opacity-50 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" /> Notify Daniel to Invoice
                  </button>
                  <button
                    onClick={() => { moveToColumn(job.id, 'invoiced'); close(); }}
                    className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-700 cursor-pointer"
                  >
                    <CheckCircle className="w-3.5 h-3.5" /> Mark Invoiced
                  </button>
                </div>
              </div>
            }
          />
        );
      })()}

      {/* List View */}
      {viewMode === 'list' && (
      <div className="space-y-3">
        {filteredJobs.length === 0 ? (
          <div className="text-center py-12">
            <DollarSign className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">No {filter} jobs found</p>
          </div>
        ) : (
          sortJobsBy(filteredJobs, listSortBy, contractors).map((job) => {
            const customer = getCustomer(job.customerId);
            const daysOld = getDaysSinceCompleted(job.completedAt);
            const billingStatus = getJobBillingStatus(job);

            return (
              <div
                key={job.id}
                onClick={openFromCard(job)}
                title="Open service order"
                className={`
                  rounded-xl border p-4 ${onJobClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}
                  ${billingStatus === 'unbilled' && daysOld > 2 ? 'border-red-300 bg-red-50'
                    : job.isPowercare ? 'bg-orange-50/70 border-orange-200' : 'bg-white border-slate-200'}
                `}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    {(customer?.clientId || job.isPowercare) && (
                      <p className="text-[10px] text-slate-400 font-medium leading-tight mb-0.5 flex items-center gap-1.5">
                        {customer?.clientId}
                        {job.isPowercare && (
                          <span className="text-[9px] font-bold uppercase tracking-wide bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">PowerCare</span>
                        )}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-slate-900">{displayName(job, customer)}</h3>
                      {billingStatus === 'unbilled' && daysOld > 2 && (
                        <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full">
                          {daysOld} days old
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-500 mb-2">
                      {customer?.address}, {customer?.city}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span>{job.serviceType}</span>
                      <span>•</span>
                      <span>Completed: {job.completedAt ? new Date(job.completedAt).toLocaleDateString() : 'N/A'}</span>
                      {job.status === 'invoiced' && (
                        <>
                          <span>•</span>
                          <span className="text-purple-600">Invoiced</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-slate-900">{formatMoney(job.totalAmount)}</p>
                    <p className="text-xs text-slate-500">
                      {job.laborHours} hrs @ {formatMoney(job.laborRate, { decimals: 0 })}/hr
                      {job.partsCost > 0 && ` + ${formatMoney(job.partsCost, { decimals: 0 })} parts`}
                    </p>
                    <div className="mt-2 flex justify-end">{cardLinks(job, customer)}</div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100">
                  {billingStatus === 'unbilled' && (
                    <>
                      <button
                        onClick={() => handleRequestInvoice(job)}
                        disabled={processingIds.includes(job.id)}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium transition-colors bg-green-600 text-white hover:bg-green-700 cursor-pointer ${processingIds.includes(job.id) ? 'opacity-50' : ''}`}
                      >
                        {processingIds.includes(job.id) ? (
                          <>
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Notifying...
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4" />
                            Notify Daniel to Invoice
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => handleMarkPaid(job)}
                        className="px-4 py-2.5 border border-slate-200 rounded-lg font-medium text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                      >
                        Mark Paid
                      </button>
                    </>
                  )}

                  {billingStatus === 'invoiced' && (
                    <>
                      <span className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-purple-100 text-purple-700 rounded-lg font-medium">
                        <Clock className="w-4 h-4" />
                        Awaiting Payment
                      </span>
                      <button
                        onClick={() => handleMarkPaid(job)}
                        className="px-4 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors cursor-pointer"
                      >
                        Mark Paid
                      </button>
                    </>
                  )}

                  {billingStatus === 'paid' && (
                    <div className="flex items-center gap-2 text-green-600">
                      <CheckCircle className="w-5 h-5" />
                      <span className="font-medium">Payment Received</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
      )}
    </div>
  );
};
