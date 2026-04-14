// SolarFlow - Admin Contractor Approvals Component
import React, { useState } from 'react';
import {
  User,
  Building,
  Shield,
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  Mail,
  Phone,
  MapPin,
  AlertCircle,
  ChevronRight,
  ChevronDown,
  DollarSign,
  X,
  Plus,
  Upload,
  Trash2,
} from 'lucide-react';
import { Contractor, ContractorStatus, ContractorJob, ContractorExpense, ExpenseCategory, ExpenseStatus } from '../../types/contractor';

interface ContractorApprovalsProps {
  contractors: Contractor[];
  contractorJobs?: ContractorJob[];
  onUpdateStatus: (contractorId: string, status: ContractorStatus, reason?: string) => void;
}

export const ContractorApprovals: React.FC<ContractorApprovalsProps> = ({
  contractors,
  contractorJobs = [],
  onUpdateStatus,
}) => {
  const [selectedContractor, setSelectedContractor] = useState<Contractor | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [earningsPeriod, setEarningsPeriod] = useState<'week' | 'curr_month' | 'prev_month' | 'ytd'>('curr_month');
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<ContractorJob | null>(null);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<ContractorExpense | null>(null);

  // Filter jobs for selected contractor
  const contractorWorkOrders = contractorJobs.filter(job => job.contractorId === selectedContractor?.id);

  // Calculate earnings based on period
  const calculateEarnings = () => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    return contractorWorkOrders
      .filter(job => {
        if (!job.completedAt) return false;
        const jobDate = new Date(job.completedAt);

        switch (earningsPeriod) {
          case 'week':
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - now.getDay());
            weekStart.setHours(0, 0, 0, 0);
            return jobDate >= weekStart;
          case 'curr_month':
            const monthStart = new Date(currentYear, currentMonth, 1);
            return jobDate >= monthStart;
          case 'prev_month':
            const prevMonthStart = new Date(currentYear, currentMonth - 1, 1);
            const prevMonthEnd = new Date(currentYear, currentMonth, 0);
            return jobDate >= prevMonthStart && jobDate <= prevMonthEnd;
          case 'ytd':
            const ytdStart = new Date(currentYear, 0, 1);
            return jobDate >= ytdStart;
          default:
            return true;
        }
      })
      .reduce((sum, job) => sum + (job.contractorTotalPay || 0), 0);
  };

  const totalEarnings = calculateEarnings();

  const pendingContractors = contractors.filter((c) => c.status === 'pending');
  const approvedContractors = contractors.filter((c) => c.status === 'approved');
  const rejectedContractors = contractors.filter((c) => c.status === 'rejected');

  const statusColors: Record<ContractorStatus, string> = {
    pending: 'bg-amber-100 text-amber-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    suspended: 'bg-slate-100 text-slate-700',
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleApprove = (contractor: Contractor) => {
    onUpdateStatus(contractor.id, 'approved');
    setSelectedContractor(null);
  };

  const handleReject = () => {
    if (!selectedContractor) return;
    onUpdateStatus(selectedContractor.id, 'rejected', rejectReason);
    setShowRejectModal(false);
    setSelectedContractor(null);
    setRejectReason('');
  };

  const ContractorCard: React.FC<{ contractor: Contractor; onClick: () => void }> = ({ contractor, onClick }) => (
    <div
      onClick={onClick}
      className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
            <Building className="w-5 h-5 text-slate-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">{contractor.businessName}</h3>
            <p className="text-xs text-slate-500">{contractor.contactName}</p>
          </div>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full capitalize ${statusColors[contractor.status]}`}>
          {contractor.status}
        </span>
      </div>

      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <Mail className="w-3 h-3" />
          {contractor.email}
        </span>
        <span className="flex items-center gap-1">
          <Phone className="w-3 h-3" />
          {contractor.contactPhone}
        </span>
      </div>

      {contractor.status === 'pending' && (
        <div className="mt-3 pt-3 border-t border-slate-100 flex gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleApprove(contractor);
            }}
            className="flex-1 flex items-center justify-center gap-1 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700"
          >
            <CheckCircle className="w-4 h-4" />
            Approve
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSelectedContractor(contractor);
              setShowRejectModal(true);
            }}
            className="flex-1 flex items-center justify-center gap-1 py-2 border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50"
          >
            <XCircle className="w-4 h-4" />
            Reject
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Contractor Management</h1>
        <p className="text-slate-500 mt-1">Review and approve contractor applications</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-5 h-5 text-amber-600" />
            <span className="text-sm font-medium text-amber-800">Pending</span>
          </div>
          <p className="text-2xl font-bold text-amber-900">{pendingContractors.length}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <span className="text-sm font-medium text-green-800">Approved</span>
          </div>
          <p className="text-2xl font-bold text-green-900">{approvedContractors.length}</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <XCircle className="w-5 h-5 text-red-600" />
            <span className="text-sm font-medium text-red-800">Rejected</span>
          </div>
          <p className="text-2xl font-bold text-red-900">{rejectedContractors.length}</p>
        </div>
      </div>

      {/* Pending Contractors */}
      {pendingContractors.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">Pending Applications</h2>
          <div className="space-y-3">
            {pendingContractors.map((contractor) => (
              <ContractorCard
                key={contractor.id}
                contractor={contractor}
                onClick={() => setSelectedContractor(contractor)}
              />
            ))}
          </div>
        </div>
      )}

      {/* All Contractors */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-3">All Contractors</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {contractors.map((contractor) => (
            <ContractorCard
              key={contractor.id}
              contractor={contractor}
              onClick={() => setSelectedContractor(contractor)}
            />
          ))}
        </div>
      </div>

      {/* Contractor Detail Modal */}
      {selectedContractor && !showRejectModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-lg font-semibold">Contractor Details</h2>
              <button onClick={() => setSelectedContractor(null)} className="p-2 hover:bg-slate-100 rounded-lg">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Business Info */}
              <div className="bg-slate-50 rounded-lg p-4">
                <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <Building className="w-4 h-4" />
                  Business Information
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-slate-500">Business Name</p>
                    <p className="font-medium">{selectedContractor.businessName}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Business Type</p>
                    <p className="font-medium capitalize">{selectedContractor.businessType.replace('_', ' ')}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">EIN</p>
                    <p className="font-medium">{selectedContractor.ein}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Address</p>
                    <p className="font-medium">{selectedContractor.city}, {selectedContractor.state}</p>
                  </div>
                </div>
              </div>

              {/* Contact Info */}
              <div className="bg-slate-50 rounded-lg p-4">
                <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Contact Information
                </h3>
                <div className="space-y-2 text-sm">
                  <p className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-slate-400" />
                    {selectedContractor.email}
                  </p>
                  <p className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-slate-400" />
                    {selectedContractor.contactPhone}
                  </p>
                  <p className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-slate-400" />
                    {selectedContractor.streetAddress}, {selectedContractor.city}, {selectedContractor.state} {selectedContractor.zip}
                  </p>
                </div>
              </div>

              {/* Insurance Info */}
              <div className="bg-slate-50 rounded-lg p-4">
                <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Insurance Information
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-slate-500">Provider</p>
                    <p className="font-medium">{selectedContractor.insuranceProvider}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Policy #</p>
                    <p className="font-medium">{selectedContractor.policyNumber}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">COI Expiry</p>
                    <p className="font-medium">{formatDate(selectedContractor.coiExpiryDate)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">GL Limit</p>
                    <p className="font-medium">${selectedContractor.generalLiabilityLimit.toLocaleString()}</p>
                  </div>
                </div>
              </div>

              {/* Safety */}
              <div className="bg-slate-50 rounded-lg p-4">
                <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Safety Compliance
                </h3>
                <div className="flex items-center gap-2">
                  {selectedContractor.agreedToSafety ? (
                    <>
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <span className="text-sm text-green-700">
                        Agreed to safety protocols on {formatDate(selectedContractor.safetyAgreedDate || '')}
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-5 h-5 text-amber-600" />
                      <span className="text-sm text-amber-700">Safety protocols not yet acknowledged</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Earnings Summary Box */}
            <div className="bg-slate-50 rounded-lg p-4">
              <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Contractor Earnings
              </h3>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-2xl font-bold text-slate-900">${totalEarnings.toLocaleString()}</p>
                  <p className="text-xs text-slate-500">Total Paid</p>
                </div>
                <select
                  value={earningsPeriod}
                  onChange={(e) => setEarningsPeriod(e.target.value as any)}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                >
                  <option value="week">This Week</option>
                  <option value="curr_month">Running Month</option>
                  <option value="prev_month">Past Month</option>
                  <option value="ytd">YTD</option>
                </select>
              </div>
            </div>

            {/* Work Orders List */}
            <div className="bg-slate-50 rounded-lg p-4">
              <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Assigned Work Orders ({contractorWorkOrders.length})
              </h3>
              {contractorWorkOrders.length === 0 ? (
                <p className="text-sm text-slate-500">No work orders assigned yet.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {contractorWorkOrders.map((job) => (
                    <div
                      key={job.id}
                      onClick={() => setSelectedWorkOrder(job)}
                      className="bg-white rounded-lg p-3 border border-slate-200 cursor-pointer hover:bg-slate-50 hover:border-blue-300 hover:translate-x-1 transition-all duration-200"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm text-slate-900">{job.serviceType}</span>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            job.status === 'on_hold' ? 'bg-red-100 text-red-700' :
                            job.status === 'completed' ? 'bg-green-100 text-green-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {job.status === 'on_hold' ? 'ON HOLD' : job.status.replace('_', ' ').toUpperCase()}
                          </span>
                          <ChevronRight className="w-4 h-4 text-slate-400" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
                        <div>
                          <p className="font-medium">Date Received</p>
                          <p>{new Date(job.scheduledDate).toLocaleDateString()}</p>
                        </div>
                        <div>
                          <p className="font-medium">Assigned</p>
                          <p>{job.assignedAt ? new Date(job.assignedAt).toLocaleDateString() : '-'}</p>
                        </div>
                        <div>
                          <p className="font-medium">Completed/Route</p>
                          <p>{job.completedAt ? new Date(job.completedAt).toLocaleDateString() : (job.startedAt ? new Date(job.startedAt).toLocaleDateString() : '-')}</p>
                        </div>
                        <div>
                          <p className="font-medium">Amount Paid</p>
                          <p className="text-green-600 font-medium">${(job.contractorTotalPay || 0).toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Expenses Section */}
            <div className="bg-slate-50 rounded-lg p-4 mt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  Expenses ({selectedContractor.expenses?.length || 0})
                </h3>
                <button
                  onClick={() => setShowExpenseModal(true)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-orange-500 text-white text-xs rounded-lg hover:bg-orange-600"
                >
                  <Plus className="w-3 h-3" />
                  Add Expense
                </button>
              </div>

              {(!selectedContractor.expenses || selectedContractor.expenses.length === 0) ? (
                <p className="text-sm text-slate-500">No expenses submitted yet.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {selectedContractor.expenses.map((expense) => (
                    <div
                      key={expense.id}
                      onClick={() => setSelectedExpense(expense)}
                      className="bg-white rounded-lg p-3 border border-slate-200 cursor-pointer hover:bg-slate-50 hover:border-blue-300 transition-all"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm text-slate-900">{expense.workOrderName}</span>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            expense.status === 'approved' ? 'bg-green-100 text-green-700' :
                            expense.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                            expense.status === 'rejected' ? 'bg-red-100 text-red-700' :
                            expense.status === 'paid' ? 'bg-blue-100 text-blue-700' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {expense.status.toUpperCase()}
                          </span>
                          <ChevronRight className="w-4 h-4 text-slate-400" />
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <div className="flex items-center gap-3">
                          <span>{expense.category.charAt(0).toUpperCase() + expense.category.slice(1)}</span>
                          <span>{new Date(expense.dateIncurred).toLocaleDateString()}</span>
                        </div>
                        <span className="font-medium text-slate-900">${expense.amount.toFixed(2)}</span>
                      </div>
                      {expense.attachments && expense.attachments.length > 0 && (
                        <div className="mt-2 flex items-center gap-1 text-xs text-slate-500">
                          <FileText className="w-3 h-3" />
                          {expense.attachments.length} attachment{expense.attachments.length > 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            {selectedContractor.status === 'pending' && (
              <div className="p-4 border-t border-slate-200 flex gap-3">
                <button
                  onClick={() => setSelectedContractor(null)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-lg font-medium text-slate-600 hover:bg-slate-50"
                >
                  Close
                </button>
                <button
                  onClick={() => handleApprove(selectedContractor)}
                  className="flex-1 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
                >
                  Approve Contractor
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && selectedContractor && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md">
            <div className="p-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold">Reject Application</h2>
              <p className="text-sm text-slate-500 mt-1">
                Are you sure you want to reject {selectedContractor.businessName}?
              </p>
            </div>

            <div className="p-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">Reason for rejection</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Enter reason..."
                rows={3}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
              />
            </div>

            <div className="p-4 border-t border-slate-200 flex gap-3">
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectReason('');
                }}
                className="flex-1 py-2.5 border border-slate-200 rounded-lg font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Work Order Detail Modal */}
      {selectedWorkOrder && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center">
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 p-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Work Order Details</h2>
                <p className="text-sm text-slate-500">{selectedWorkOrder.id}</p>
              </div>
              <button
                onClick={() => setSelectedWorkOrder(null)}
                className="p-2 hover:bg-slate-100 rounded-lg"
              >
                <XCircle className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Status and Service Type */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide">Service Type</p>
                  <p className="font-semibold text-slate-900">{selectedWorkOrder.serviceType}</p>
                </div>
                <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                  selectedWorkOrder.status === 'on_hold' ? 'bg-red-100 text-red-700' :
                  selectedWorkOrder.status === 'completed' ? 'bg-green-100 text-green-700' :
                  'bg-blue-100 text-blue-700'
                }`}>
                  {selectedWorkOrder.status === 'on_hold' ? 'ON HOLD' : selectedWorkOrder.status.replace('_', ' ').toUpperCase()}
                </span>
              </div>

              {/* Customer Info */}
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Customer</p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-slate-400" />
                    <span className="text-sm text-slate-900">{selectedWorkOrder.customerName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-slate-400" />
                    <span className="text-sm text-slate-600">{selectedWorkOrder.address}</span>
                  </div>
                  {selectedWorkOrder.customerPhone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-slate-400" />
                      <span className="text-sm text-slate-600">{selectedWorkOrder.customerPhone}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Schedule Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-lg p-4">
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Scheduled Date</p>
                  <p className="text-sm font-medium text-slate-900">
                    {new Date(selectedWorkOrder.scheduledDate).toLocaleDateString('en-US', {
                      weekday: 'short',
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    })}
                  </p>
                  <p className="text-xs text-slate-500">{selectedWorkOrder.scheduledTime}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-4">
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Assigned Date</p>
                  <p className="text-sm font-medium text-slate-900">
                    {selectedWorkOrder.assignedAt
                      ? new Date(selectedWorkOrder.assignedAt).toLocaleDateString('en-US', {
                          weekday: 'short',
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })
                      : 'Not assigned'}
                  </p>
                </div>
              </div>

              {/* Timeline */}
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">Timeline</p>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                    <div>
                      <p className="text-xs text-slate-500">Scheduled</p>
                      <p className="text-sm text-slate-900">{new Date(selectedWorkOrder.scheduledDate).toLocaleString()}</p>
                    </div>
                  </div>
                  {selectedWorkOrder.startedAt && (
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                      <div>
                        <p className="text-xs text-slate-500">Started</p>
                        <p className="text-sm text-slate-900">{new Date(selectedWorkOrder.startedAt).toLocaleString()}</p>
                      </div>
                    </div>
                  )}
                  {selectedWorkOrder.completedAt && (
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-green-500"></div>
                      <div>
                        <p className="text-xs text-slate-500">Completed</p>
                        <p className="text-sm text-slate-900">{new Date(selectedWorkOrder.completedAt).toLocaleString()}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Financial Details */}
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">Financial Details</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500">Total Amount</p>
                    <p className="text-lg font-semibold text-slate-900">${(selectedWorkOrder.totalAmount || 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Labor</p>
                    <p className="text-lg font-semibold text-slate-900">${(selectedWorkOrder.laborAmount || 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Parts</p>
                    <p className="text-lg font-semibold text-slate-900">${(selectedWorkOrder.partsAmount || 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Contractor Pay</p>
                    <p className="text-lg font-semibold text-green-600">${(selectedWorkOrder.contractorTotalPay || 0).toLocaleString()}</p>
                  </div>
                </div>
              </div>

              {/* Payment Status */}
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">Payment Status</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500">Invoice Status</p>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      selectedWorkOrder.invoiceStatus === 'paid' ? 'bg-green-100 text-green-700' :
                      selectedWorkOrder.invoiceStatus === 'sent' ? 'bg-blue-100 text-blue-700' :
                      'bg-slate-200 text-slate-600'
                    }`}>
                      {(selectedWorkOrder.invoiceStatus || 'pending').toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Payment Status</p>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      selectedWorkOrder.paymentStatus === 'processed' ? 'bg-green-100 text-green-700' :
                      selectedWorkOrder.paymentStatus === 'approved' ? 'bg-blue-100 text-blue-700' :
                      'bg-slate-200 text-slate-600'
                    }`}>
                      {(selectedWorkOrder.paymentStatus || 'pending').replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {selectedWorkOrder.notes && (
                <div className="bg-slate-50 rounded-lg p-4">
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Notes</p>
                  <p className="text-sm text-slate-700">{selectedWorkOrder.notes}</p>
                </div>
              )}
            </div>

            <div className="sticky bottom-0 bg-white border-t border-slate-200 p-4">
              <button
                onClick={() => setSelectedWorkOrder(null)}
                className="w-full py-3 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Expense Modal */}
      {showExpenseModal && selectedContractor && (
        <AddExpenseModal
          contractor={selectedContractor}
          workOrders={contractorWorkOrders}
          onClose={() => setShowExpenseModal(false)}
          onSubmit={(expense) => {
            const updatedExpenses = [...(selectedContractor.expenses || []), expense];
            onUpdateStatus(selectedContractor.id, selectedContractor.status);
            setShowExpenseModal(false);
          }}
        />
      )}

      {/* Expense Detail Modal */}
      {selectedExpense && (
        <ExpenseDetailModal
          expense={selectedExpense}
          onClose={() => setSelectedExpense(null)}
        />
      )}
    </div>
  );
};

// Add Expense Modal Component
interface AddExpenseModalProps {
  contractor: Contractor;
  workOrders: ContractorJob[];
  onClose: () => void;
  onSubmit: (expense: ContractorExpense) => void;
}

const AddExpenseModal: React.FC<AddExpenseModalProps> = ({
  contractor,
  workOrders,
  onClose,
  onSubmit,
}) => {
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState('');
  const [dateIncurred, setDateIncurred] = useState(new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState<ExpenseCategory>('materials');
  const [amount, setAmount] = useState('');
  const [vendor, setVendor] = useState('');
  const [description, setDescription] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [showWorkOrderDropdown, setShowWorkOrderDropdown] = useState(false);

  const selectedWorkOrder = workOrders.find(wo => wo.id === selectedWorkOrderId);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setAttachments([...attachments, ...newFiles]);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(attachments.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkOrderId || !amount || attachments.length === 0) return;

    const expense: ContractorExpense = {
      id: `exp-${Date.now()}`,
      contractorId: contractor.id,
      workOrderId: selectedWorkOrderId,
      workOrderName: selectedWorkOrder?.serviceType || 'Unknown',
      dateIncurred,
      category,
      amount: parseFloat(amount),
      vendor: vendor || undefined,
      description: description || undefined,
      attachments: attachments.map((file, index) => ({
        id: `att-${Date.now()}-${index}`,
        fileName: file.name,
        fileType: file.type.startsWith('image/') ? 'image' : 'pdf',
        fileUrl: URL.createObjectURL(file),
        uploadedAt: new Date().toISOString(),
      })),
      status: 'pending',
      submittedAt: new Date().toISOString(),
    };

    onSubmit(expense);
  };

  const canSubmit = selectedWorkOrderId && amount && attachments.length > 0;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center">
      <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 p-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Add Expense</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Work Order Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Work Order *</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowWorkOrderDropdown(!showWorkOrderDropdown)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-left flex items-center justify-between"
              >
                <span className={selectedWorkOrderId ? 'text-slate-900' : 'text-slate-400'}>
                  {selectedWorkOrder ? `${selectedWorkOrder.serviceType} - ${selectedWorkOrder.address}` : 'Select Work Order'}
                </span>
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>
              {showWorkOrderDropdown && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {workOrders.map((wo) => (
                    <button
                      key={wo.id}
                      type="button"
                      onClick={() => {
                        setSelectedWorkOrderId(wo.id);
                        setShowWorkOrderDropdown(false);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-slate-50 text-sm"
                    >
                      <div className="font-medium">{wo.serviceType}</div>
                      <div className="text-xs text-slate-500">{wo.address}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Date and Amount */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date Incurred *</label>
              <input
                type="date"
                value={dateIncurred}
                onChange={(e) => setDateIncurred(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Amount *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-7 pr-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="materials">Materials</option>
              <option value="travel">Travel</option>
              <option value="permits">Permits</option>
              <option value="subcontractor">Subcontractor</option>
              <option value="equipment">Equipment</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Vendor */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Vendor/Merchant</label>
            <input
              type="text"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              placeholder="e.g., Home Depot, Lowe's"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add any additional details..."
              rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
            />
          </div>

          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Invoice/Receipt * <span className="text-slate-400 font-normal">(Image or PDF)</span>
            </label>
            <div className="border-2 border-dashed border-slate-200 rounded-lg p-4 text-center hover:border-orange-300 transition-colors">
              <input
                type="file"
                accept="image/*,.pdf"
                multiple
                onChange={handleFileUpload}
                className="hidden"
                id="expense-upload"
              />
              <label htmlFor="expense-upload" className="cursor-pointer">
                <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-sm text-slate-600">Click to upload or drag and drop</p>
                <p className="text-xs text-slate-400">JPG, PNG, PDF (max 10MB)</p>
              </label>
            </div>

            {/* Attached Files */}
            {attachments.length > 0 && (
              <div className="mt-3 space-y-2">
                {attachments.map((file, index) => (
                  <div key={index} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-slate-400" />
                      <span className="text-sm text-slate-600 truncate max-w-[200px]">{file.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttachment(index)}
                      className="p-1 text-red-500 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Submit */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 border border-slate-200 text-slate-600 font-semibold rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className={`flex-1 py-3 font-semibold rounded-lg ${
                canSubmit
                  ? 'bg-orange-500 text-white hover:bg-orange-600'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              Submit Expense
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Expense Detail Modal Component
interface ExpenseDetailModalProps {
  expense: ContractorExpense;
  onClose: () => void;
}

const ExpenseDetailModal: React.FC<ExpenseDetailModalProps> = ({ expense, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center">
      <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 p-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Expense Details</h2>
            <p className="text-sm text-slate-500">{expense.id}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <XCircle className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Status */}
          <div className="flex items-center justify-between">
            <span className={`text-xs px-3 py-1 rounded-full font-medium ${
              expense.status === 'approved' ? 'bg-green-100 text-green-700' :
              expense.status === 'pending' ? 'bg-amber-100 text-amber-700' :
              expense.status === 'rejected' ? 'bg-red-100 text-red-700' :
              expense.status === 'paid' ? 'bg-blue-100 text-blue-700' :
              'bg-slate-100 text-slate-700'
            }`}>
              {expense.status.toUpperCase()}
            </span>
          </div>

          {/* Work Order Info */}
          <div className="bg-slate-50 rounded-lg p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Work Order</p>
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-400" />
              <span className="font-medium text-slate-900">{expense.workOrderName}</span>
              <span className="text-sm text-slate-500">#{expense.workOrderId}</span>
            </div>
          </div>

          {/* Expense Details */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 rounded-lg p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Date Incurred</p>
              <p className="font-medium text-slate-900">{new Date(expense.dateIncurred).toLocaleDateString()}</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Amount</p>
              <p className="font-bold text-lg text-slate-900">${expense.amount.toFixed(2)}</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Category</p>
              <p className="font-medium text-slate-900 capitalize">{expense.category}</p>
            </div>
            {expense.vendor && (
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Vendor</p>
                <p className="font-medium text-slate-900">{expense.vendor}</p>
              </div>
            )}
          </div>

          {/* Description */}
          {expense.description && (
            <div className="bg-slate-50 rounded-lg p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Description</p>
              <p className="text-sm text-slate-700">{expense.description}</p>
            </div>
          )}

          {/* Attachments */}
          <div className="bg-slate-50 rounded-lg p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">Attachments ({expense.attachments.length})</p>
            <div className="space-y-2">
              {expense.attachments.map((attachment) => (
                <div key={attachment.id} className="flex items-center justify-between bg-white rounded-lg p-3 border border-slate-200">
                  <div className="flex items-center gap-3">
                    {attachment.fileType === 'image' ? (
                      <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center">
                        <FileText className="w-6 h-6 text-slate-400" />
                      </div>
                    ) : (
                      <div className="w-12 h-12 bg-red-50 rounded-lg flex items-center justify-center">
                        <FileText className="w-6 h-6 text-red-400" />
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium text-slate-900">{attachment.fileName}</p>
                      <p className="text-xs text-slate-500">{new Date(attachment.uploadedAt).toLocaleString()}</p>
                    </div>
                  </div>
                  <button className="text-blue-500 text-sm hover:underline">View</button>
                </div>
              ))}
            </div>
          </div>

          {/* Rejection Reason */}
          {expense.rejectionReason && (
            <div className="bg-red-50 rounded-lg p-4 border border-red-200">
              <p className="text-xs text-red-600 uppercase tracking-wide mb-2">Rejection Reason</p>
              <p className="text-sm text-red-700">{expense.rejectionReason}</p>
            </div>
          )}

          {/* Timeline */}
          <div className="bg-slate-50 rounded-lg p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">Timeline</p>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                <div>
                  <p className="text-xs text-slate-500">Submitted</p>
                  <p className="text-sm text-slate-900">{new Date(expense.submittedAt).toLocaleString()}</p>
                </div>
              </div>
              {expense.reviewedAt && (
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${expense.status === 'approved' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  <div>
                    <p className="text-xs text-slate-500">Reviewed</p>
                    <p className="text-sm text-slate-900">{new Date(expense.reviewedAt).toLocaleString()}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-slate-200 p-4">
          <button
            onClick={onClose}
            className="w-full py-3 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
