// SolarFlow - Admin Billing Module
import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  FileText,
  Send,
  CheckCircle,
  Clock,
  AlertTriangle,
  Search,
  Filter,
  Download,
  Eye,
  CreditCard,
  User,
  MapPin,
  Calendar,
  ChevronDown,
  ChevronUp,
  Image,
  Printer,
  Mail,
  X,
  Target,
  Undo2,
} from 'lucide-react';
import { ContractorJob, InvoiceStatus, PaymentStatus } from '../../types/contractor';

interface BillingModuleProps {
  jobs: ContractorJob[];
  onUpdateJob: (job: ContractorJob) => void;
}

const statusColors: Record<InvoiceStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  sent: 'bg-blue-100 text-blue-700',
  paid: 'bg-green-100 text-green-700',
  overdue: 'bg-red-100 text-red-700',
};

const paymentColors: Record<PaymentStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-blue-100 text-blue-700',
  processed: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

export const BillingModule: React.FC<BillingModuleProps> = ({ jobs, onUpdateJob }) => {
  const [filterStatus, setFilterStatus] = useState<'all' | 'invoice' | 'payment'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedJob, setSelectedJob] = useState<ContractorJob | null>(null);
  const [showJobDetail, setShowJobDetail] = useState(false);
  const [monthlyGoal, setMonthlyGoal] = useState<number>(10000);
  const [timeframe, setTimeframe] = useState<'day' | 'week' | 'month' | 'qtr' | 'ytd' | 'custom'>('month');
  const [customDateRange, setCustomDateRange] = useState<{start: string; end: string}>({
    start: '',
    end: ''
  });

  // Helper to get date range based on timeframe
  const getDateRange = () => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    switch (timeframe) {
      case 'day':
        return { start: today, end: today };
      case 'week': {
        const dayOfWeek = now.getDay();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - dayOfWeek);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        return {
          start: startOfWeek.toISOString().split('T')[0],
          end: endOfWeek.toISOString().split('T')[0]
        };
      }
      case 'month': {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        return {
          start: startOfMonth.toISOString().split('T')[0],
          end: endOfMonth.toISOString().split('T')[0]
        };
      }
      case 'qtr': {
        const quarter = Math.floor(now.getMonth() / 3);
        const startOfQtr = new Date(now.getFullYear(), quarter * 3, 1);
        const endOfQtr = new Date(now.getFullYear(), quarter * 3 + 3, 0);
        return {
          start: startOfQtr.toISOString().split('T')[0],
          end: endOfQtr.toISOString().split('T')[0]
        };
      }
      case 'ytd': {
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        return {
          start: startOfYear.toISOString().split('T')[0],
          end: today
        };
      }
      case 'custom':
        return customDateRange;
      default:
        return { start: '', end: '' };
    }
  };

  const dateRange = getDateRange();

  // Filter jobs - show all work orders (assigned, in_progress, completed)
  const allJobs = jobs.filter(j => {
    // Include all statuses: assigned, en_route, in_progress, documentation, completed, on_hold
    const validStatuses = ['assigned', 'en_route', 'in_progress', 'documentation', 'completed', 'on_hold', 'cancelled'];
    if (!validStatuses.includes(j.status)) return false;

    // For date filtering, use scheduledDate for non-completed jobs, completedAt for completed
    let jobDate: string;
    if (j.status === 'completed' && j.completedAt) {
      jobDate = j.completedAt.split('T')[0];
    } else {
      jobDate = j.scheduledDate;
    }

    return jobDate >= dateRange.start && jobDate <= dateRange.end;
  });

  // Filter by search
  const filteredJobs = allJobs.filter(job =>
    job.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    job.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Calculate totals with profitability
  const totals = allJobs.reduce((acc, job) => {
    const materialCost = job.partsAmount || 0;
    const mileageCost = 0; // Could add mileage field to job
    const laborCost = job.contractorTotalPay;
    const totalCost = materialCost + mileageCost + laborCost;
    const revenue = job.totalAmount;
    const profit = revenue - totalCost;

    return {
      totalInvoiced: acc.totalInvoiced + revenue,
      totalPaid: acc.totalPaid + (job.invoiceStatus === 'paid' ? revenue : 0),
      totalPending: acc.totalPending + (job.invoiceStatus !== 'paid' ? revenue : 0),
      contractorPayPending: acc.contractorPayPending + (job.paymentStatus === 'pending' ? laborCost : 0),
      contractorPayApproved: acc.contractorPayApproved + (job.paymentStatus === 'approved' ? laborCost : 0),
      contractorPayProcessed: acc.contractorPayProcessed + (job.paymentStatus === 'processed' ? laborCost : 0),
      totalMaterials: acc.totalMaterials + materialCost,
      totalMileage: acc.totalMileage + mileageCost,
      totalLabor: acc.totalLabor + laborCost,
      totalProfit: acc.totalProfit + profit,
    };
  }, {
    totalInvoiced: 0,
    totalPaid: 0,
    totalPending: 0,
    contractorPayPending: 0,
    contractorPayApproved: 0,
    contractorPayProcessed: 0,
    totalMaterials: 0,
    totalMileage: 0,
    totalLabor: 0,
    totalProfit: 0,
  });

  // Profit percentage
  const profitPercentage = totals.totalInvoiced > 0
    ? (totals.totalProfit / totals.totalInvoiced) * 100
    : 0;

  // Goal progress
  const goalProgress = Math.min((totals.totalProfit / monthlyGoal) * 100, 100);
  const amountToGoal = Math.max(monthlyGoal - totals.totalProfit, 0);

  // Handle invoice actions
  const handleSendInvoice = (job: ContractorJob) => {
    const updated = {
      ...job,
      invoiceStatus: 'sent' as InvoiceStatus,
      invoiceSentAt: new Date().toISOString(),
    };
    onUpdateJob(updated);
  };

  const handleMarkPaid = (job: ContractorJob) => {
    const updated = {
      ...job,
      invoiceStatus: 'paid' as InvoiceStatus,
      invoicePaidAt: new Date().toISOString(),
    };
    onUpdateJob(updated);
  };

  // Handle payment actions
  const handleApprovePayment = (job: ContractorJob) => {
    const updated = {
      ...job,
      paymentStatus: 'approved' as PaymentStatus,
      paymentApprovedAt: new Date().toISOString(),
    };
    onUpdateJob(updated);
  };

  const handleProcessPayment = (job: ContractorJob) => {
    const updated = {
      ...job,
      paymentStatus: 'processed' as PaymentStatus,
      paymentProcessedAt: new Date().toISOString(),
    };
    onUpdateJob(updated);
  };

  // Handle revert actions
  const handleRevertInvoice = (job: ContractorJob) => {
    const updated = {
      ...job,
      invoiceStatus: 'pending' as InvoiceStatus,
      invoiceSentAt: undefined,
      invoicePaidAt: undefined,
    };
    onUpdateJob(updated);
  };

  const handleRevertPayment = (job: ContractorJob) => {
    const updated = {
      ...job,
      paymentStatus: 'pending' as PaymentStatus,
      paymentApprovedAt: undefined,
      paymentProcessedAt: undefined,
    };
    onUpdateJob(updated);
  };

  const handleViewJob = (job: ContractorJob) => {
    setSelectedJob(job);
    setShowJobDetail(true);
  };

  if (showJobDetail && selectedJob) {
    return (
      <JobDetailModal job={selectedJob} onClose={() => setShowJobDetail(false)} />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="p-4">
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-green-600" />
            Contractor Pay
          </h1>
          <p className="text-sm text-slate-500">Track work orders and contractor payments</p>
        </div>
      </header>

      {/* Summary Cards */}
      <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-blue-500" />
            <span className="text-sm text-slate-500">Total Invoiced</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">${totals.totalInvoiced.toFixed(2)}</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span className="text-sm text-slate-500">Paid</span>
          </div>
          <p className="text-2xl font-bold text-green-600">${totals.totalPaid.toFixed(2)}</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-yellow-500" />
            <span className="text-sm text-slate-500">Open Invoices</span>
          </div>
          <p className="text-2xl font-bold text-yellow-600">${totals.totalPending.toFixed(2)}</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <CreditCard className="w-4 h-4 text-orange-500" />
            <span className="text-sm text-slate-500">Contractor Pay</span>
          </div>
          <p className="text-2xl font-bold text-orange-600">${totals.contractorPayPending.toFixed(2)}</p>
          <p className="text-xs text-slate-500">pending approval</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-purple-500" />
            <span className="text-sm text-slate-500">Profitability</span>
          </div>
          <p className={`text-2xl font-bold ${totals.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            ${totals.totalProfit.toFixed(2)}
          </p>
          <p className="text-xs text-slate-500">
            {profitPercentage.toFixed(1)}% margin
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-indigo-500" />
              <span className="text-sm text-slate-500">Goal Progress</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={monthlyGoal}
              onChange={(e) => setMonthlyGoal(parseFloat(e.target.value) || 0)}
              className="w-24 px-2 py-1 border border-slate-200 rounded text-sm font-bold"
            />
            <span className="text-xs text-slate-500">/month</span>
          </div>
          <div className="mt-2">
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full ${goalProgress >= 100 ? 'bg-green-500' : 'bg-indigo-500'}`}
                style={{ width: `${goalProgress}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {goalProgress >= 100 ? 'Goal reached!' : `$${amountToGoal.toFixed(0)} to goal`}
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-4 pb-4">
        {/* Timeframe Filter Bar */}
        <div className="bg-white rounded-lg border border-slate-200 p-2 mb-4">
          <div className="flex gap-1">
            {[
              { id: 'day', label: 'DAY' },
              { id: 'week', label: 'WEEK' },
              { id: 'month', label: 'MONTH' },
              { id: 'qtr', label: 'QTR' },
              { id: 'ytd', label: 'YTD' },
              { id: 'custom', label: 'CUSTOM' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setTimeframe(item.id as typeof timeframe)}
                className={`flex-1 py-2 text-xs font-medium rounded-md ${
                  timeframe === item.id
                    ? 'bg-orange-500 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Custom Date Range Inputs */}
          {timeframe === 'custom' && (
            <div className="mt-3 pt-3 border-t border-slate-200 flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-slate-500">Start Date</label>
                <input
                  type="date"
                  value={customDateRange.start}
                  onChange={(e) => setCustomDateRange({ ...customDateRange, start: e.target.value })}
                  className="w-full px-2 py-1 text-sm border border-slate-200 rounded"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-slate-500">End Date</label>
                <input
                  type="date"
                  value={customDateRange.end}
                  onChange={(e) => setCustomDateRange({ ...customDateRange, end: e.target.value })}
                  className="w-full px-2 py-1 text-sm border border-slate-200 rounded"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setFilterStatus('all')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg ${
              filterStatus === 'all' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border'
            }`}
          >
            All Work Orders
          </button>
          <button
            onClick={() => setFilterStatus('invoice')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg ${
              filterStatus === 'invoice' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border'
            }`}
          >
            Invoices
          </button>
          <button
            onClick={() => setFilterStatus('payment')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg ${
              filterStatus === 'payment' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border'
            }`}
          >
            Payments
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search work orders..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm"
          />
        </div>
      </div>

      {/* Work Orders List */}
      <div className="px-4 pb-24 space-y-3">
        {filteredJobs.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">No completed work orders yet</p>
          </div>
        ) : (
          filteredJobs.map((job) => (
            <div
              key={job.id}
              className="bg-white rounded-xl border border-slate-200 p-4"
            >
              {/* Job Header */}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-slate-900">{job.customerName}</h3>
                  <p className="text-sm text-slate-500">WO #{job.id}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-slate-900">${job.totalAmount.toFixed(2)}</p>
                  <p className="text-xs text-slate-500">{job.serviceType}</p>
                </div>
              </div>

              {/* Location & Date */}
              <div className="flex items-center gap-4 text-xs text-slate-500 mb-3">
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {job.city}, {job.state}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {new Date(job.completedAt || '').toLocaleDateString()}
                </span>
              </div>

              {/* Profitability Column */}
              <div className="mb-3 p-3 bg-indigo-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-indigo-900">Profitability</span>
                  <span className={`text-sm font-bold ${(job.totalAmount - job.partsAmount - job.contractorTotalPay) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ${(job.totalAmount - job.partsAmount - job.contractorTotalPay).toFixed(2)}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="text-center">
                    <p className="text-slate-500">Revenue</p>
                    <p className="font-semibold text-green-600">${job.totalAmount.toFixed(2)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-slate-500">Materials</p>
                    <p className="font-semibold text-red-500">-${job.partsAmount.toFixed(2)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-slate-500">Labor</p>
                    <p className="font-semibold text-red-500">-${job.contractorTotalPay.toFixed(2)}</p>
                  </div>
                </div>
              </div>

              {/* Invoice Status */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-600">Invoice</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[job.invoiceStatus || 'pending']}`}>
                    {(job.invoiceStatus || 'pending').toUpperCase()}
                  </span>
                </div>

                {(!job.invoiceStatus || job.invoiceStatus === 'pending') && (
                  <button
                    onClick={() => handleSendInvoice(job)}
                    className="flex items-center gap-1 px-3 py-1 bg-blue-500 text-white text-xs rounded-lg"
                  >
                    <Send className="w-3 h-3" />
                    Send
                  </button>
                )}

                {job.invoiceStatus === 'sent' && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleMarkPaid(job)}
                      className="flex items-center gap-1 px-3 py-1 bg-green-500 text-white text-xs rounded-lg"
                    >
                      <CheckCircle className="w-3 h-3" />
                      Mark Paid
                    </button>
                    <button
                      onClick={() => handleRevertInvoice(job)}
                      className="flex items-center gap-1 px-2 py-1 bg-slate-400 text-white text-xs rounded-lg"
                      title="Revert to pending"
                    >
                      <Undo2 className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {job.invoiceStatus === 'paid' && (
                  <button
                    onClick={() => handleRevertInvoice(job)}
                    className="flex items-center gap-1 px-2 py-1 bg-slate-400 text-white text-xs rounded-lg"
                    title="Revert to sent"
                  >
                    <Undo2 className="w-3 h-3" />
                    Revert
                  </button>
                )}
              </div>

              {/* Payment Status */}
              <div className="flex items-center justify-between mb-3 p-3 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-orange-400" />
                  <span className="text-sm text-slate-600">Contractor Pay</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${paymentColors[job.paymentStatus || 'pending']}`}>
                    {(job.paymentStatus || 'pending').replace('_', ' ').toUpperCase()}
                  </span>
                  <span className="font-semibold text-orange-600">${job.contractorTotalPay.toFixed(2)}</span>
                </div>

                <div className="flex gap-1">
                  {(!job.paymentStatus || job.paymentStatus === 'pending') && (
                    <button
                      onClick={() => handleApprovePayment(job)}
                      className="px-2 py-1 bg-blue-500 text-white text-xs rounded-lg"
                    >
                      Approve
                    </button>
                  )}

                  {job.paymentStatus === 'approved' && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleProcessPayment(job)}
                        className="px-2 py-1 bg-green-500 text-white text-xs rounded-lg"
                      >
                        Process
                      </button>
                      <button
                        onClick={() => handleRevertPayment(job)}
                        className="px-2 py-1 bg-slate-400 text-white text-xs rounded-lg"
                        title="Revert to pending"
                      >
                        <Undo2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  {job.paymentStatus === 'processed' && (
                    <button
                      onClick={() => handleRevertPayment(job)}
                      className="flex items-center gap-1 px-2 py-1 bg-slate-400 text-white text-xs rounded-lg"
                    >
                      <Undo2 className="w-3 h-3" />
                      Revert
                    </button>
                  )}
                </div>
              </div>

              {/* Photo Gallery Preview */}
              {job.photos && (
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {Object.entries(job.photos).map(([category, photos]) => (
                    photos.slice(0, 2).map((photo, idx) => (
                      <div key={`${category}-${idx}`} className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-slate-100">
                        <img src={photo} alt="" className="w-full h-full object-cover" />
                      </div>
                    ))
                  ))}
                </div>
              )}

              {/* View Details */}
              <button
                onClick={() => handleViewJob(job)}
                className="w-full mt-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg flex items-center justify-center gap-1"
              >
                <Eye className="w-4 h-4" />
                View Full Details
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// Job Detail Modal for Admin
const JobDetailModal: React.FC<{ job: ContractorJob; onClose: () => void }> = ({ job, onClose }) => {
  const [activeTab, setActiveTab] = useState<'details' | 'photos' | 'notes'>('details');

  const photoCategories = [
    { key: 'before', label: 'Before' },
    { key: 'serial', label: 'Serial #' },
    { key: 'parts', label: 'Parts' },
    { key: 'process', label: 'Process' },
    { key: 'after', label: 'After' },
  ] as const;

  return (
    <div className="fixed inset-0 bg-white z-50 overflow-y-auto">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="flex items-center justify-between p-4">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Work Order #{job.id}</h1>
            <p className="text-sm text-slate-500">{job.customerName}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => setActiveTab('details')}
            className={`flex-1 py-3 text-sm font-medium ${
              activeTab === 'details' ? 'text-orange-500 border-b-2 border-orange-500' : 'text-slate-500'
            }`}
          >
            Details
          </button>
          <button
            onClick={() => setActiveTab('photos')}
            className={`flex-1 py-3 text-sm font-medium ${
              activeTab === 'photos' ? 'text-orange-500 border-b-2 border-orange-500' : 'text-slate-500'
            }`}
          >
            Photos
          </button>
          <button
            onClick={() => setActiveTab('notes')}
            className={`flex-1 py-3 text-sm font-medium ${
              activeTab === 'notes' ? 'text-orange-500 border-b-2 border-orange-500' : 'text-slate-500'
            }`}
          >
            Notes
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="p-4">
        {activeTab === 'details' && (
          <div className="space-y-4">
            {/* Customer Info */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-900 mb-3">Customer</h3>
              <div className="space-y-2 text-sm">
                <p className="font-medium">{job.customerName}</p>
                <p className="text-slate-600">{job.address}</p>
                <p className="text-slate-600">{job.city}, {job.state} {job.zip}</p>
                <p className="text-slate-600">{job.customerPhone}</p>
                {job.customerEmail && <p className="text-slate-600">{job.customerEmail}</p>}
              </div>
            </div>

            {/* Service Info */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-900 mb-3">Service</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Type</span>
                  <span className="font-medium">{job.serviceType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Completed</span>
                  <span className="font-medium">
                    {job.completedAt ? new Date(job.completedAt).toLocaleString() : 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            {/* Financials */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-900 mb-3">Financials</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Labor</span>
                  <span className="font-medium">${job.laborAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Parts</span>
                  <span className="font-medium">${job.partsAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Markup ({job.markupPercent}%)</span>
                  <span className="font-medium">
                    ${((job.laborAmount + job.partsAmount) * job.markupPercent / 100).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between font-bold text-lg pt-2 border-t">
                  <span>Total Invoice</span>
                  <span className="text-green-600">${job.totalAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold pt-2 border-t">
                  <span>Contractor Pay</span>
                  <span className="text-orange-600">${job.contractorTotalPay.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Signature */}
            {job.clientSignature && (
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h3 className="font-semibold text-slate-900 mb-3">Client Signature</h3>
                <div className="border border-slate-200 rounded-lg p-2">
                  <img src={job.clientSignature} alt="Client signature" className="max-h-24" />
                </div>
                {job.signatureDate && (
                  <p className="text-xs text-slate-500 mt-2">
                    Signed on {new Date(job.signatureDate).toLocaleString()}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'photos' && (
          <div className="space-y-4">
            {photoCategories.map((category) => (
              <div key={category.key} className="bg-white rounded-xl border border-slate-200 p-4">
                <h3 className="font-semibold text-slate-900 mb-3">{category.label}</h3>
                {job.photos[category.key].length > 0 ? (
                  <div className="grid grid-cols-3 gap-2">
                    {job.photos[category.key].map((photo, idx) => (
                      <div key={idx} className="aspect-square rounded-lg overflow-hidden bg-slate-100">
                        <img src={photo} alt="" className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">No photos</p>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'notes' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-900 mb-3">Service Status</h3>
              <p className="text-sm">
                {job.serviceStatus?.replace(/_/g, ' ').toUpperCase() || 'Not specified'}
              </p>
            </div>

            {job.operationalNotes && (
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h3 className="font-semibold text-slate-900 mb-3">Service Notes</h3>
                <p className="text-sm text-slate-600">{job.operationalNotes}</p>
              </div>
            )}

            {job.nextSteps && (
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h3 className="font-semibold text-slate-900 mb-3">Next Steps</h3>
                <p className="text-sm text-slate-600">{job.nextSteps}</p>
                {job.requiresFollowUp && (
                  <span className="inline-block mt-2 px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded-full">
                    Follow-up Required
                  </span>
                )}
              </div>
            )}

            {job.completionNotes && (
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h3 className="font-semibold text-slate-900 mb-3">Final Notes</h3>
                <p className="text-sm text-slate-600">{job.completionNotes}</p>
              </div>
            )}

            {job.parts.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h3 className="font-semibold text-slate-900 mb-3">Parts Used</h3>
                <div className="space-y-2">
                  {job.parts.map((part) => (
                    <div key={part.id} className="flex justify-between text-sm">
                      <span>{part.name} (x{part.quantity})</span>
                      <span className="font-medium">${part.totalPrice}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default BillingModule;
