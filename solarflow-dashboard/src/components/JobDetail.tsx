// SolarFlow MVP - Job Detail Component
import React, { useState } from 'react';
import {
  ArrowLeft,
  MapPin,
  Phone,
  Mail,
  Calendar,
  Clock,
  User,
  Wrench,
  Camera,
  CheckCircle,
  DollarSign,
  Edit,
  Trash2,
  Navigation,
  Send,
  FileText,
  ExternalLink,
} from 'lucide-react';
import { Job, Customer, User as UserType } from '../types';
import { createXeroInvoice } from '../lib/xeroService';

interface JobDetailProps {
  job: Job;
  customer: Customer;
  technician: UserType;
  onBack: () => void;
  onUpdateJob: (job: Job) => void;
  onCreateInvoice: (job: Job, xeroInvoiceId: string) => void;
  isMobile: boolean;
}

const statusFlow: { from: Job['status']; to: Job['status']; label: string }[] = [
  { from: 'new', to: 'assigned', label: 'Assign' },
  { from: 'assigned', to: 'in_progress', label: 'Start Job' },
  { from: 'in_progress', to: 'completed', label: 'Complete' },
  { from: 'completed', to: 'invoiced', label: 'Generate Invoice' },
  { from: 'invoiced', to: 'paid', label: 'Mark Paid' },
];

export const JobDetail: React.FC<JobDetailProps> = ({
  job,
  customer,
  technician,
  onBack,
  onUpdateJob,
  onCreateInvoice,
  isMobile,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completionNotes, setCompletionNotes] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    scheduledDate: job.scheduledDate,
    scheduledTime: job.scheduledTime,
    notes: job.notes,
    laborHours: job.laborHours,
    laborRate: job.laborRate,
    partsCost: job.partsCost,
  });

  const getNextAction = () => {
    return statusFlow.find((s) => s.from === job.status);
  };

  const handleStatusChange = async () => {
    const action = getNextAction();
    if (!action) return;

    if (action.to === 'in_progress') {
      onUpdateJob({ ...job, status: action.to, startedAt: new Date().toISOString() });
    } else if (action.to === 'completed') {
      setShowCompleteModal(true);
    } else if (action.to === 'invoiced') {
      setIsLoading(true);
      try {
        const result = await createXeroInvoice({ customer, job });
        if (result.success && result.invoiceId) {
          onUpdateJob({ ...job, status: action.to, xeroInvoiceId: result.invoiceId });
          onCreateInvoice(job, result.invoiceId);
        }
      } catch (error) {
        console.error('Invoice creation failed:', error);
      } finally {
        setIsLoading(false);
      }
    } else if (action.to === 'paid') {
      onUpdateJob({ ...job, status: action.to });
    } else {
      onUpdateJob({ ...job, status: action.to });
    }
  };

  const handleCompleteJob = () => {
    onUpdateJob({
      ...job,
      status: 'completed',
      completedAt: new Date().toISOString(),
      completionNotes,
    });
    setShowCompleteModal(false);
  };

  const nextAction = getNextAction();
  const canEdit = ['new', 'assigned'].includes(job.status);

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-900">Job Details</h1>
          <p className="text-sm text-slate-500">ID: {job.id}</p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowEditModal(true)}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <Edit className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Status Banner */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500">Current Status</p>
            <p className="text-lg font-semibold capitalize text-slate-900">
              {job.status.replace('_', ' ')}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-500">Service Type</p>
            <p className="text-lg font-semibold capitalize text-slate-900">{job.serviceType}</p>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="mt-4 flex items-center gap-1">
          {['new', 'assigned', 'in_progress', 'completed', 'invoiced', 'paid'].map((status, index) => {
            const isActive = ['new', 'assigned', 'in_progress', 'completed', 'invoiced', 'paid'].indexOf(job.status) >= index;
            const isCurrent = job.status === status;
            return (
              <div key={status} className="flex-1 flex items-center">
                <div
                  className={`
                    flex-1 h-1.5 rounded-full
                    ${isActive ? 'bg-orange-500' : 'bg-slate-200'}
                  `}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Customer Info */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
        <h3 className="font-semibold text-slate-900 mb-3">Customer</h3>
        <div className="space-y-2">
          <p className="font-medium text-slate-900">{customer.name}</p>
          <p className="text-sm text-slate-500 flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            {customer.address}, {customer.city}, {customer.state} {customer.zip}
          </p>
          <div className="flex gap-3">
            <a
              href={`tel:${customer.phone}`}
              className="text-sm text-blue-600 flex items-center gap-1 hover:underline"
            >
              <Phone className="w-4 h-4" />
              {customer.phone}
            </a>
            <a
              href={`mailto:${customer.email}`}
              className="text-sm text-blue-600 flex items-center gap-1 hover:underline"
            >
              <Mail className="w-4 h-4" />
              {customer.email}
            </a>
          </div>
        </div>
        <a
          href={`https://maps.google.com/?q=${encodeURIComponent(
            `${customer.address}, ${customer.city}, ${customer.state}`
          )}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex items-center justify-center gap-2 w-full py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
        >
          <Navigation className="w-4 h-4" />
          <span className="text-sm font-medium">Navigate</span>
        </a>
      </div>

      {/* Technician */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
        <h3 className="font-semibold text-slate-900 mb-3">Assigned Technician</h3>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
            <User className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <p className="font-medium text-slate-900">{technician.name}</p>
            <p className="text-sm text-slate-500">{technician.phone}</p>
          </div>
        </div>
      </div>

      {/* Schedule */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
        <h3 className="font-semibold text-slate-900 mb-3">Schedule</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-slate-400" />
            <div>
              <p className="text-xs text-slate-500">Date</p>
              <p className="text-sm font-medium">{job.scheduledDate}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-slate-400" />
            <div>
              <p className="text-xs text-slate-500">Time</p>
              <p className="text-sm font-medium">{job.scheduledTime}</p>
            </div>
          </div>
        </div>
        {job.startedAt && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <p className="text-xs text-slate-500">
              Started: {new Date(job.startedAt).toLocaleString()}
            </p>
          </div>
        )}
        {job.completedAt && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <p className="text-xs text-slate-500">
              Completed: {new Date(job.completedAt).toLocaleString()}
            </p>
          </div>
        )}
      </div>

      {/* Notes */}
      {(job.notes || job.completionNotes) && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
          <h3 className="font-semibold text-slate-900 mb-3">Notes</h3>
          {job.notes && (
            <div className="mb-3">
              <p className="text-xs text-slate-500 mb-1">Original Notes:</p>
              <p className="text-sm text-slate-700">{job.notes}</p>
            </div>
          )}
          {job.completionNotes && (
            <div>
              <p className="text-xs text-slate-500 mb-1">Completion Notes:</p>
              <p className="text-sm text-slate-700">{job.completionNotes}</p>
            </div>
          )}
        </div>
      )}

      {/* Photos */}
      {job.photos.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
          <h3 className="font-semibold text-slate-900 mb-3">Photos ({job.photos.length})</h3>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {job.photos.map((photo, index) => (
              <div
                key={index}
                className="w-20 h-20 bg-slate-100 rounded-lg flex-shrink-0 flex items-center justify-center"
              >
                <Camera className="w-8 h-8 text-slate-400" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Billing */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
        <h3 className="font-semibold text-slate-900 mb-3">Billing</h3>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Labor ({job.laborHours} hrs @ ${job.laborRate}/hr)</span>
            <span>${(job.laborHours * job.laborRate).toFixed(2)}</span>
          </div>
          {job.partsCost > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Parts</span>
              <span>${job.partsCost.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold text-lg pt-2 border-t border-slate-100">
            <span>Total</span>
            <span>${job.totalAmount.toFixed(2)}</span>
          </div>
        </div>

        {job.xeroInvoiceId && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="w-4 h-4" />
                <span className="text-sm font-medium">Invoiced</span>
              </div>
              <button className="text-sm text-blue-600 flex items-center gap-1 hover:underline">
                <ExternalLink className="w-3 h-3" />
                View in Xero
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Action Button */}
      {nextAction && (
        <button
          onClick={handleStatusChange}
          disabled={isLoading}
          className={`
            w-full py-4 rounded-xl font-semibold text-lg transition-colors
            ${nextAction.to === 'invoiced'
              ? 'bg-green-600 text-white hover:bg-green-700'
              : nextAction.to === 'completed'
              ? 'bg-amber-500 text-white hover:bg-amber-600'
              : 'bg-orange-500 text-white hover:bg-orange-600'
            }
            ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Processing...
            </span>
          ) : (
            <>
              {nextAction.to === 'invoiced' && <DollarSign className="w-5 h-5 inline mr-2" />}
              {nextAction.to === 'completed' && <CheckCircle className="w-5 h-5 inline mr-2" />}
              {nextAction.label}
            </>
          )}
        </button>
      )}

      {/* Complete Job Modal */}
      {showCompleteModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center">
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-lg p-4 md:p-6">
            <h3 className="text-lg font-semibold mb-4">Complete Job</h3>
            <p className="text-sm text-slate-500 mb-4">
              Please provide completion notes before marking the job as complete.
            </p>
            <textarea
              value={completionNotes}
              onChange={(e) => setCompletionNotes(e.target.value)}
              placeholder="Describe what was done..."
              rows={4}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setShowCompleteModal(false)}
                className="flex-1 py-3 border border-slate-200 rounded-lg font-medium hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCompleteJob}
                className="flex-1 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
              >
                Complete Job
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Job Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center">
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-lg p-4 md:p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Edit Work Order</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={editForm.scheduledDate}
                    onChange={(e) => setEditForm({ ...editForm, scheduledDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Time</label>
                  <input
                    type="time"
                    value={editForm.scheduledTime}
                    onChange={(e) => setEditForm({ ...editForm, scheduledTime: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Labor Hours</label>
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={editForm.laborHours}
                    onChange={(e) => setEditForm({ ...editForm, laborHours: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Labor Rate ($)</label>
                  <input
                    type="number"
                    value={editForm.laborRate}
                    onChange={(e) => setEditForm({ ...editForm, laborRate: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Parts Cost ($)</label>
                <input
                  type="number"
                  value={editForm.partsCost}
                  onChange={(e) => setEditForm({ ...editForm, partsCost: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                <textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                />
              </div>
              <div className="bg-slate-50 p-3 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">Total:</span>
                  <span className="text-lg font-bold text-slate-900">
                    ${((editForm.laborHours * editForm.laborRate) + editForm.partsCost).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowEditModal(false)}
                className="flex-1 py-3 border border-slate-200 rounded-lg font-medium hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const updatedJob = {
                    ...job,
                    ...editForm,
                    totalAmount: (editForm.laborHours * editForm.laborRate) + editForm.partsCost,
                  };
                  onUpdateJob(updatedJob);
                  setShowEditModal(false);
                }}
                className="flex-1 py-3 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
