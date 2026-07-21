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
} from 'lucide-react';
import { Job, Customer, User as UserType } from '../types';
import { serviceOrderNo } from '../lib/woHelpers';
import { notifyAdminForInvoice } from '../lib/quoteService';
import { formatMoney } from '../lib/money';
import { WorkOrderCalendar } from './WorkOrderCalendar';
import { BillingReportModal } from './BillingReportModal';
import { printServiceReport } from '../lib/printServiceReport';

interface BillingProps {
  jobs: Job[];
  customers: Customer[];
  users: UserType[];
  onUpdateJob: (job: Job) => void;
  isMobile: boolean;
  currentUserName?: string;
  onJobClick?: (jobId: string) => void;
}

export const Billing: React.FC<BillingProps> = ({
  jobs,
  customers,
  users,
  onUpdateJob,
  currentUserName,
  onJobClick,
}) => {
  const [filter, setFilter] = useState<'all' | 'unbilled' | 'invoiced' | 'paid'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [processingIds, setProcessingIds] = useState<string[]>([]);
  const [showReport, setShowReport] = useState(false);
  const [viewMode, setViewMode] = useState<'kanban' | 'list' | 'calendar'>(() => {
    const saved = localStorage.getItem('solarops_billing_view');
    if (saved === 'kanban' || saved === 'list' || saved === 'calendar') return saved as 'kanban' | 'list' | 'calendar';
    return 'list';
  });

  // Open the service order, or print the client service report, straight from a
  // billing card. ponytail: reuses printServiceReport + the existing jobDetail
  // view, no new modal.
  const cardLinks = (job: Job, customer?: Customer) => (
    <div className="flex items-center gap-3 text-[11px] font-medium">
      {onJobClick && (
        <button
          onClick={(e) => { e.stopPropagation(); onJobClick(job.id); }}
          className="inline-flex items-center gap-0.5 text-slate-500 hover:text-slate-900 cursor-pointer"
        >
          Open SO <ChevronRight className="w-3 h-3" />
        </button>
      )}
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

  // Filter jobs by status
  const filteredJobs = jobs
    .filter((job) => {
      // Show all jobs in 'all' filter, otherwise filter by specific status
      if (filter === 'all') return true;
      if (filter === 'unbilled') return job.status === 'completed' || job.status === 'new' || job.status === 'assigned' || job.status === 'in_progress';
      if (filter === 'invoiced') return job.status === 'invoiced';
      if (filter === 'paid') return job.status === 'paid';
      return true;
    })
    .filter((job) => {
      const customer = customers.find((c) => c.id === job.customerId);
      return (
        customer?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        customer?.address.toLowerCase().includes(searchQuery.toLowerCase())
      );
    })
    .sort((a, b) => {
      // Sort by date, newest first
      const dateA = new Date(a.completedAt || a.scheduledDate || a.createdAt).getTime();
      const dateB = new Date(b.completedAt || b.scheduledDate || b.createdAt).getTime();
      return dateB - dateA;
    });

  const unbilledJobs = jobs.filter((j) => j.status === 'completed');
  const invoicedJobs = jobs.filter((j) => j.status === 'invoiced');
  const paidJobs = jobs.filter((j) => j.status === 'paid');

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

  // ── Billing pipeline (kanban) ───────────────────────────────────────────────
  // Pending Completion → Ready to Invoice → Invoiced → Paid → Costs Covered.
  // PowerCare SOs bill to SolarEdge through Conexsol USA; their cards get an
  // orange hue so Daniel spots them at a glance.
  type BillingCol = 'pending' | 'to_invoice' | 'invoiced' | 'paid' | 'costs_covered';

  const getBillingColumn = (job: Job): BillingCol => {
    if (job.status === 'paid') return job.costsCoveredAt ? 'costs_covered' : 'paid';
    if (job.status === 'invoiced') return 'invoiced';
    if (job.status === 'completed') return 'to_invoice';
    return 'pending';
  };

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<BillingCol | null>(null);

  const moveToColumn = (jobId: string, col: BillingCol) => {
    const job = jobs.find(j => j.id === jobId);
    if (!job || getBillingColumn(job) === col) return;
    const now = new Date().toISOString();
    let patch: Partial<Job>;
    switch (col) {
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
        patch = { status: 'paid', woStatus: 'paid', clientPaidAt: job.clientPaidAt ?? now, costsCoveredAt: job.costsCoveredAt ?? now };
        break;
    }
    onUpdateJob({ ...job, ...patch });
  };

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
          <option value="all">All ({jobs.length})</option>
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
      </div>

      {/* Kanban View: the billing pipeline. Drag a card to advance it. */}
      {viewMode === 'kanban' && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {([
            { key: 'pending'       as BillingCol, label: 'Pending Completion', sub: 'Waiting on contractor',        headerCls: 'bg-slate-100 border-slate-200 text-slate-700' },
            { key: 'to_invoice'    as BillingCol, label: 'Ready to Invoice',   sub: 'Create and send in Xero',      headerCls: 'bg-red-50 border-red-200 text-red-700' },
            { key: 'invoiced'      as BillingCol, label: 'Invoiced',           sub: 'Awaiting payment',             headerCls: 'bg-purple-50 border-purple-200 text-purple-700' },
            { key: 'paid'          as BillingCol, label: 'Paid',               sub: 'Client / SolarEdge paid',      headerCls: 'bg-green-50 border-green-200 text-green-700' },
            { key: 'costs_covered' as BillingCol, label: 'Costs Covered',      sub: 'Contractor + expenses settled', headerCls: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
          ]).map(col => {
            const colJobs = filteredJobs.filter(j => j.status !== 'archived' && getBillingColumn(j) === col.key);
            return (
              <div
                key={col.key}
                className={`flex-1 min-w-[260px] rounded-xl transition-colors ${dragOverCol === col.key ? 'bg-orange-50 ring-2 ring-orange-300' : ''}`}
                onDragOver={e => { e.preventDefault(); setDragOverCol(col.key); }}
                onDragLeave={() => setDragOverCol(prev => (prev === col.key ? null : prev))}
                onDrop={e => {
                  e.preventDefault();
                  setDragOverCol(null);
                  if (draggedId) moveToColumn(draggedId, col.key);
                  setDraggedId(null);
                }}
              >
                <div className={`px-3 py-2 rounded-lg border mb-3 ${col.headerCls}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">{col.label}</span>
                    <span className="text-xs font-bold">{colJobs.length}</span>
                  </div>
                  <p className="text-[10px] opacity-70 mt-0.5">{col.sub}</p>
                </div>
                <div className="space-y-3 min-h-[80px]">
                  {colJobs.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-xl">
                      Empty
                    </div>
                  ) : colJobs.map(job => {
                    const customer = getCustomer(job.customerId);
                    return (
                      <div
                        key={job.id}
                        draggable
                        onDragStart={() => setDraggedId(job.id)}
                        onDragEnd={() => { setDraggedId(null); setDragOverCol(null); }}
                        className={`rounded-xl border p-3 hover:shadow-md transition-all cursor-grab select-none ${
                          job.isPowercare ? 'bg-orange-50/70 border-orange-200' : 'bg-white border-slate-200'
                        } ${draggedId === job.id ? 'opacity-40 scale-95' : ''}`}
                      >
                        <div className="flex items-center gap-1.5 mb-0.5">
                          {customer?.clientId && (
                            <span className="text-[10px] text-slate-400 font-medium leading-tight">{customer.clientId}</span>
                          )}
                          {job.isPowercare && (
                            <span className="text-[9px] font-bold uppercase tracking-wide bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">PowerCare</span>
                          )}
                          {job.woNumber && (
                            <span className="text-[10px] text-slate-400 ml-auto shrink-0">{serviceOrderNo(job.woNumber)}</span>
                          )}
                        </div>
                        <p className="font-semibold text-slate-900 text-sm leading-tight truncate">{customer?.name}</p>
                        <div className="mt-1">{cardLinks(job, customer)}</div>
                        <div className="flex items-center gap-1.5 flex-wrap mt-1 mb-2">
                          {job.serviceType && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-teal-100 text-teal-700 whitespace-nowrap">{String(job.serviceType)}</span>
                          )}
                          {job.completedAt && col.key !== 'pending' && (
                            <span className="text-[10px] text-slate-500">Done {fmtDate(job.completedAt)}</span>
                          )}
                          {job.invoicedAt && ['invoiced', 'paid', 'costs_covered'].includes(col.key) && (
                            <span className="text-[10px] text-slate-500">· Inv {fmtDate(job.invoicedAt)}</span>
                          )}
                          {job.clientPaidAt && ['paid', 'costs_covered'].includes(col.key) && (
                            <span className="text-[10px] text-slate-500">· Paid {fmtDate(job.clientPaidAt)}</span>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {col.key === 'pending' && (
                            <span className="text-[11px] text-slate-400">In the field · moves here when contractor completes</span>
                          )}
                          {col.key === 'to_invoice' && (
                            <>
                              <button
                                onClick={() => handleRequestInvoice(job)}
                                disabled={processingIds.includes(job.id)}
                                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium transition-colors bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer"
                              >
                                <Send className="w-3 h-3" /> Notify Daniel
                              </button>
                              <button onClick={() => moveToColumn(job.id, 'invoiced')} className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer">Invoiced</button>
                            </>
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
                              onClick={() => moveToColumn(job.id, 'costs_covered')}
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

      {/* List View */}
      {viewMode === 'list' && (
      <div className="space-y-3">
        {filteredJobs.length === 0 ? (
          <div className="text-center py-12">
            <DollarSign className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">No {filter} jobs found</p>
          </div>
        ) : (
          filteredJobs.map((job) => {
            const customer = getCustomer(job.customerId);
            const daysOld = getDaysSinceCompleted(job.completedAt);
            const billingStatus = getJobBillingStatus(job);

            return (
              <div
                key={job.id}
                className={`
                  rounded-xl border p-4
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
                      <h3 className="font-semibold text-slate-900">{customer?.name}</h3>
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
