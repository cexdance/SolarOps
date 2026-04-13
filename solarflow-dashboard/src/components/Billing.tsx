// SolarFlow MVP - Billing Component (The "Leakage Fix")
import React, { useState } from 'react';
import {
  DollarSign,
  AlertTriangle,
  CheckCircle,
  Clock,
  Filter,
  Search,
  Send,
  ExternalLink,
  FileText,
  ChevronRight,
} from 'lucide-react';
import { Job, Customer, User as UserType } from '../types';
import { createXeroInvoice } from '../lib/xeroService';

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
        <div className="flex rounded-lg border border-slate-200 overflow-hidden">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2.5 font-medium transition-colors ${
              filter === 'all'
                ? 'bg-slate-800 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            All ({jobs.length})
          </button>
          <button
            onClick={() => setFilter('unbilled')}
            className={`px-4 py-2.5 font-medium transition-colors ${
              filter === 'unbilled'
                ? 'bg-red-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            Unbilled ({unbilledJobs.length})
          </button>
          <button
            onClick={() => setFilter('invoiced')}
            className={`px-4 py-2.5 font-medium transition-colors ${
              filter === 'invoiced'
                ? 'bg-purple-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            Invoiced ({invoicedJobs.length})
          </button>
          <button
            onClick={() => setFilter('paid')}
            className={`px-4 py-2.5 font-medium transition-colors ${
              filter === 'paid'
                ? 'bg-green-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            Paid ({paidJobs.length})
          </button>
        </div>
      </div>

      {/* Job List */}
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

            return (
              <div
                key={job.id}
                className={`
                  bg-white rounded-xl border p-4
                  ${filter === 'unbilled' && daysOld > 2 ? 'border-red-300 bg-red-50' : 'border-slate-200'}
                `}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-slate-900">{customer?.name}</h3>
                      {filter === 'unbilled' && daysOld > 2 && (
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
                  {filter === 'unbilled' && (
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

                  {filter === 'invoiced' && (
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

                  {filter === 'paid' && (
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
    </div>
  );
};
