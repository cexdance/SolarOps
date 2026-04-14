// SolarFlow MVP - Technician Mobile View
import React, { useState } from 'react';
import {
  Wrench,
  MapPin,
  Phone,
  Navigation,
  Play,
  CheckCircle,
  Camera,
  FileText,
  Clock,
  User,
  ChevronRight,
  Clock3,
} from 'lucide-react';
import { Job, Customer, User as UserType } from '../types';

interface TechnicianViewProps {
  jobs: Job[];
  customers: Customer[];
  currentUser: UserType;
  onUpdateJob: (job: Job) => void;
  onViewChange: (view: string) => void;
  isMobile: boolean;
}

export const TechnicianView: React.FC<TechnicianViewProps> = ({
  jobs,
  customers,
  currentUser,
  onUpdateJob,
  onViewChange,
  isMobile,
}) => {
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completionNotes, setCompletionNotes] = useState('');

  // Get today's jobs for current technician
  const today = new Date().toISOString().split('T')[0];
  const myJobs = jobs
    .filter((j) => j.technicianId === currentUser.id)
    .filter((j) => j.scheduledDate === today || j.status === 'in_progress')
    .sort((a, b) => {
      // Active jobs first
      if (a.status === 'in_progress' && b.status !== 'in_progress') return -1;
      if (b.status === 'in_progress' && a.status !== 'in_progress') return 1;
      // Then by scheduled time
      return a.scheduledTime.localeCompare(b.scheduledTime);
    });

  const activeJob = myJobs.find((j) => j.status === 'in_progress');
  const upcomingJobs = myJobs.filter((j) => j.status !== 'in_progress');

  const getCustomer = (customerId: string) => customers.find((c) => c.id === customerId);

  const handleStartJob = (job: Job) => {
    onUpdateJob({
      ...job,
      status: 'in_progress',
      startedAt: new Date().toISOString(),
    });
    setSelectedJob(job.id);
  };

  const handleCompleteJob = (job: Job) => {
    onUpdateJob({
      ...job,
      status: 'completed',
      completedAt: new Date().toISOString(),
      completionNotes,
    });
    setShowCompleteModal(false);
    setCompletionNotes('');
    setSelectedJob(null);
  };

  const JobCard: React.FC<{ job: Job; isActive?: boolean }> = ({ job, isActive }) => {
    const customer = getCustomer(job.customerId);
    const isSelected = selectedJob === job.id;

    return (
      <div
        className={`
          bg-white rounded-xl border-2 transition-all
          ${isActive
            ? 'border-orange-500 shadow-lg'
            : isSelected
            ? 'border-blue-500'
            : 'border-slate-200'
          }
        `}
      >
        {/* Header */}
        <div
          className="p-4 cursor-pointer"
          onClick={() => setSelectedJob(isSelected ? null : job.id)}
        >
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              {job.status === 'in_progress' && (
                <span className="flex items-center gap-1 text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded-full">
                  <Clock3 className="w-3 h-3 animate-pulse" />
                  In Progress
                </span>
              )}
              {job.status === 'assigned' && (
                <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
                  Scheduled
                </span>
              )}
              {job.status === 'completed' && (
                <span className="flex items-center gap-1 text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">
                  <CheckCircle className="w-3 h-3" />
                  Completed
                </span>
              )}
            </div>
            <span className="text-sm font-bold text-slate-900">${job.totalAmount}</span>
          </div>

          <h3 className="font-semibold text-slate-900 mb-1">{customer?.name}</h3>
          <p className="text-sm text-slate-500 flex items-center gap-1 mb-2">
            <MapPin className="w-4 h-4" />
            {customer?.address}, {customer?.city}
          </p>

          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600 capitalize flex items-center gap-1">
              <Wrench className="w-4 h-4" />
              {job.serviceType}
            </span>
            <span className="text-sm font-medium text-slate-700 flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {job.scheduledTime}
            </span>
          </div>
        </div>

        {/* Expanded Details */}
        {isSelected && job.status !== 'completed' && (
          <div className="px-4 pb-4 space-y-3">
            {/* Contact Info */}
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-500 mb-2">Contact</p>
              <div className="flex gap-2">
                <a
                  href={`tel:${customer?.phone}`}
                  className="flex-1 flex items-center justify-center gap-1 py-2 bg-blue-50 text-blue-600 rounded-lg text-sm font-medium"
                >
                  <Phone className="w-4 h-4" />
                  Call
                </a>
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(
                    `${customer?.address}, ${customer?.city}, ${customer?.state}`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-1 py-2 bg-green-50 text-green-600 rounded-lg text-sm font-medium"
                >
                  <Navigation className="w-4 h-4" />
                  Navigate
                </a>
              </div>
            </div>

            {/* Job Notes */}
            {job.notes && (
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-500 mb-1">Notes</p>
                <p className="text-sm text-slate-700">{job.notes}</p>
              </div>
            )}

            {/* Action Buttons */}
            {job.status === 'assigned' && (
              <button
                onClick={() => handleStartJob(job)}
                className="w-full flex items-center justify-center gap-2 py-3 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600 transition-colors"
              >
                <Play className="w-5 h-5" />
                Start Job
              </button>
            )}

            {job.status === 'in_progress' && (
              <button
                onClick={() => setShowCompleteModal(true)}
                className="w-full flex items-center justify-center gap-2 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors"
              >
                <CheckCircle className="w-5 h-5" />
                Complete Job
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">My Work Orders</h1>
        <p className="text-slate-500 mt-1">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      </div>

      {/* Active Job Hero */}
      {activeJob && (
        <div className="mb-6">
          <p className="text-sm font-medium text-slate-600 mb-2">Current Work Order</p>
          <JobCard job={activeJob} isActive />
        </div>
      )}

      {/* Upcoming Work Orders */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-slate-600">
            {activeJob ? 'Up Next' : "Today's Work Orders"}
          </p>
          <span className="text-sm text-slate-500">{upcomingJobs.length} work orders</span>
        </div>

        <div className="space-y-3">
          {upcomingJobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>

        {upcomingJobs.length === 0 && !activeJob && (
          <div className="text-center py-12">
            <Wrench className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">No work orders scheduled for today</p>
          </div>
        )}
      </div>

      {/* Complete Job Modal */}
      {showCompleteModal && activeJob && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center">
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-lg p-4 md:p-6 max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-2">Complete Job</h3>
            <p className="text-sm text-slate-500 mb-4">
              Please document the work completed before finishing.
            </p>

            {/* Required Checklist */}
            <div className="space-y-3 mb-4">
              <label className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer">
                <input type="checkbox" className="mt-1 w-5 h-5 rounded text-orange-500" />
                <div>
                  <p className="font-medium text-slate-900">Photo Documentation</p>
                  <p className="text-sm text-slate-500">Upload before/after photos</p>
                </div>
                <Camera className="w-5 h-5 text-slate-400 ml-auto" />
              </label>
            </div>

            <textarea
              value={completionNotes}
              onChange={(e) => setCompletionNotes(e.target.value)}
              placeholder="Describe what work was performed..."
              rows={4}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none mb-4"
            />

            <div className="flex gap-3">
              <button
                onClick={() => setShowCompleteModal(false)}
                className="flex-1 py-3 border border-slate-200 rounded-lg font-medium hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleCompleteJob(activeJob)}
                className="flex-1 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-5 h-5" />
                Complete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
