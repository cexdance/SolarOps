// SolarFlow MVP - Billing Component (The "Leakage Fix")
import React, { useState } from 'react';
import {
  DollarSign,
  AlertTriangle,
  CheckCircle,
  Clock,
  Search,
  Send,
  ExternalLink,
  FileText,
  ChevronRight,
  LayoutGrid,
  List as ListIcon,
  Calendar,
} from 'lucide-react';
import { Job, Customer, User as UserType } from '../types';
import { createXeroInvoice } from '../lib/xeroService';
import { WorkOrderCalendar } from './WorkOrderCalendar';

interface BillingProps {
  jobs: Job[];
  customers: Customer[];
  users: UserType[];
  onUpdateJob: (job: Job) => void;
  xeroConnected: boolean;
  onConnectXero: () => void;
  isMobile: boolean;
}

export const Billing: React.FC<BillingProps> = ({
  jobs,
  customers,
  users,
  onUpdateJob,
  xeroConnected,
  onConnectXero,
  isMobile,
}) => {
  const [filter, setFilter] = useState<'all' | 'unbilled' | 'invoiced' | 'paid'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [processingIds, setProcessingIds] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'kanban' | 'list' | 'calendar'>(() => {
    const saved = localStorage.getItem('solarops_billing_view');
    if (saved === 'kanban' || saved === 'list' || saved === 'calendar') return saved as 'kanban' | 'list' | 'calendar';
    return 'list';
  });

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
  const unbilledTotal = unbilledJobs.reduce((sum, j) => sum + j.totalAmount, 0);

  const invoicedJobs = jobs.filter((j) => j.status === 'invoiced');
  const invoicedTotal = invoicedJobs.reduce((sum, j) => sum + j.totalAmount, 0);

  const paidJobs = jobs.filter((j) => j.status === 'paid');
  const paidTotal = paidJobs.reduce((sum, j) => sum + j.totalAmount, 0);

  const getCustomer = (customerId: string) => customers.find((c) => c.id === customerId);

  const handleGenerateInvoice = async (job: Job) => {
    const customer = getCustomer(job.customerId);
    if (!customer) return;

    setProcessingIds([...processingIds, job.id]);
    try {
      const result = await createXeroInvoice({ customer, job });
      if (result.success && result.invoiceId) {
        onUpdateJob({ ...job, status: 'invoiced', xeroInvoiceId: result.invoiceId });
      }
    } catch (error) {
      console.error('Invoice generation failed:', error);
    } finally {
      setProcessingIds(processingIds.filter((id) => id !== job.id));
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

  const getDaysSinceCompleted = (completedAt?: string) => {
    if (!completedAt) return 0;
    const completed = new Date(completedAt);
    const now = new Date();
    return Math.floor((now.getTime() - completed.getTime()) / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Billing</h1>
        <p className="text-slate-500 mt-1">Manage invoices and track payments</p>
      </div>

      {/* Xero Connection Banner */}
      {!xeroConnected && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-blue-900">Connect to Xero</p>
              <p className="text-sm text-blue-700">
                Connect your Xero account to generate invoices automatically
              </p>
            </div>
            <button
              onClick={onConnectXero}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Connect
            </button>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-100 border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-5 h-5 text-slate-600" />
            <span className="text-sm font-medium text-slate-800">Total</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">${jobs.reduce((sum, j) => sum + j.totalAmount, 0).toLocaleString()}</p>
          <p className="text-xs text-slate-600">{jobs.length} jobs</p>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <span className="text-sm font-medium text-red-800">Unbilled</span>
          </div>
          <p className="text-2xl font-bold text-red-900">${unbilledTotal.toLocaleString()}</p>
          <p className="text-xs text-red-600">{unbilledJobs.length} jobs</p>
        </div>

        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-5 h-5 text-purple-600" />
            <span className="text-sm font-medium text-purple-800">Invoiced</span>
          </div>
          <p className="text-2xl font-bold text-purple-900">${invoicedTotal.toLocaleString()}</p>
          <p className="text-xs text-purple-600">{invoicedJobs.length} jobs</p>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <span className="text-sm font-medium text-green-800">Paid</span>
          </div>
          <p className="text-2xl font-bold text-green-900">${paidTotal.toLocaleString()}</p>
          <p className="text-xs text-green-600">{paidJobs.length} jobs</p>
        </div>
      </div>

      {/* Unbilled Alert */}
      {unbilledJobs.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg animate-pulse">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="font-bold text-red-900">
                ACTION REQUIRED: {unbilledJobs.length} unbilled job{unbilledJobs.length > 1 ? 's' : ''}
              </p>
              <p className="text-sm text-red-700">
                ${unbilledTotal.toLocaleString()} in unbilled revenue needs immediate attention
              </p>
            </div>
          </div>
        </div>
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

      {/* Kanban View */}
      {viewMode === 'kanban' && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {([
            { key: 'unbilled' as const, label: 'Unbilled', count: unbilledJobs.length, total: unbilledTotal, headerCls: 'bg-red-50 border-red-200 text-red-700' },
            { key: 'invoiced' as const, label: 'Invoiced', count: invoicedJobs.length, total: invoicedTotal, headerCls: 'bg-purple-50 border-purple-200 text-purple-700' },
            { key: 'paid'    as const, label: 'Paid',     count: paidJobs.length,     total: paidTotal,     headerCls: 'bg-green-50 border-green-200 text-green-700' },
          ]).map(col => {
            const colJobs = filteredJobs.filter(j => getJobBillingStatus(j) === col.key);
            return (
              <div key={col.key} className="flex-1 min-w-[280px]">
                <div className={`flex items-center justify-between px-3 py-2 rounded-lg border mb-3 ${col.headerCls}`}>
                  <span className="font-semibold text-sm">{col.label}</span>
                  <span className="text-xs font-medium">{col.count} · ${col.total.toLocaleString()}</span>
                </div>
                <div className="space-y-3">
                  {colJobs.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-xl">
                      No {col.label.toLowerCase()} jobs
                    </div>
                  ) : colJobs.map(job => {
                    const customer = getCustomer(job.customerId);
                    const billingStatus = getJobBillingStatus(job);
                    return (
                      <div key={job.id} className="bg-white rounded-xl border border-slate-200 p-3 hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between mb-2">
                          <div className="min-w-0">
                            {customer?.clientId && (
                              <p className="text-[10px] text-slate-400 font-medium leading-tight mb-0.5">{customer.clientId}</p>
                            )}
                            <p className="font-semibold text-slate-900 text-sm leading-tight truncate">{customer?.name}</p>
                          </div>
                          <p className="font-bold text-slate-900 text-sm ml-2 shrink-0">${job.totalAmount.toFixed(0)}</p>
                        </div>
                        <p className="text-xs text-slate-500 mb-3">{job.serviceType}</p>
                        <div className="flex gap-2">
                          {billingStatus === 'unbilled' && (
                            <>
                              <button
                                onClick={() => handleGenerateInvoice(job)}
                                disabled={processingIds.includes(job.id) || !xeroConnected}
                                className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${xeroConnected ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-slate-200 text-slate-500 cursor-not-allowed'}`}
                              >
                                <Send className="w-3 h-3" /> Invoice
                              </button>
                              <button onClick={() => handleMarkPaid(job)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50">Paid</button>
                            </>
                          )}
                          {billingStatus === 'invoiced' && (
                            <>
                              <button className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-xs font-medium hover:bg-purple-200">
                                <ExternalLink className="w-3 h-3" /> Xero
                              </button>
                              <button onClick={() => handleMarkPaid(job)} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700">Paid</button>
                            </>
                          )}
                          {billingStatus === 'paid' && (
                            <div className="flex items-center gap-1 text-green-600 text-xs font-medium">
                              <CheckCircle className="w-4 h-4" /> Payment Received
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
          onJobClick={() => {}}
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
                  bg-white rounded-xl border p-4
                  ${billingStatus === 'unbilled' && daysOld > 2 ? 'border-red-300 bg-red-50' : 'border-slate-200'}
                `}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    {customer?.clientId && (
                      <p className="text-[10px] text-slate-400 font-medium leading-tight mb-0.5">{customer.clientId}</p>
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
                      {job.xeroInvoiceId && (
                        <>
                          <span>•</span>
                          <span className="text-purple-600">Invoiced</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-slate-900">${job.totalAmount.toFixed(2)}</p>
                    <p className="text-xs text-slate-500">
                      {job.laborHours} hrs @ ${job.laborRate}/hr
                      {job.partsCost > 0 && ` + $${job.partsCost} parts`}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100">
                  {billingStatus === 'unbilled' && (
                    <>
                      <button
                        onClick={() => handleGenerateInvoice(job)}
                        disabled={processingIds.includes(job.id) || !xeroConnected}
                        className={`
                          flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium transition-colors
                          ${xeroConnected
                            ? 'bg-green-600 text-white hover:bg-green-700'
                            : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                          }
                          ${processingIds.includes(job.id) ? 'opacity-50' : ''}
                        `}
                      >
                        {processingIds.includes(job.id) ? (
                          <>
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4" />
                            Generate Invoice
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => handleMarkPaid(job)}
                        className="px-4 py-2.5 border border-slate-200 rounded-lg font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                      >
                        Mark Paid
                      </button>
                    </>
                  )}

                  {billingStatus === 'invoiced' && (
                    <>
                      <button className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-purple-100 text-purple-700 rounded-lg font-medium hover:bg-purple-200 transition-colors">
                        <ExternalLink className="w-4 h-4" />
                        View in Xero
                      </button>
                      <button
                        onClick={() => handleMarkPaid(job)}
                        className="px-4 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
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
