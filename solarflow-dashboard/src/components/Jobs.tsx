// SolarFlow MVP - Jobs Component
import React, { useState, useRef, useEffect } from 'react';
import {
  Plus, Search, Calendar, MapPin, User, Clock, X, Wrench, Zap,
} from 'lucide-react';
import { Job, Customer, User as UserType, JobStatus, UrgencyLevel, ServiceType } from '../types';
import { WorkOrderPanel } from './WorkOrderPanel';

// ─── Standalone sub-components (defined outside Jobs to prevent remount on parent re-render) ───

const serviceTypes: { value: ServiceType; label: string; color: string }[] = [
  { value: 'maintenance', label: 'Maintenance', color: 'bg-blue-100 text-blue-700' },
  { value: 'repair', label: 'Repair', color: 'bg-amber-100 text-amber-700' },
  { value: 'installation', label: 'Installation', color: 'bg-purple-100 text-purple-700' },
  { value: 'inspection', label: 'Inspection', color: 'bg-green-100 text-green-700' },
  { value: 'emergency', label: 'Emergency', color: 'bg-red-100 text-red-700' },
];

const statusColors: Record<JobStatus, string> = {
  new: 'bg-blue-100 text-blue-700 border-blue-200',
  assigned: 'bg-slate-100 text-slate-700 border-slate-200',
  in_progress: 'bg-amber-100 text-amber-700 border-amber-200',
  completed: 'bg-green-100 text-green-700 border-green-200',
  invoiced: 'bg-purple-100 text-purple-700 border-purple-200',
  paid: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

const urgencyColors: Record<UrgencyLevel, string> = {
  low: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  medium: 'bg-orange-100 text-orange-800 border-orange-200',
  high: 'bg-red-100 text-red-800 border-red-200',
  critical: 'bg-red-600 text-white border-red-600',
};

const urgencyLabels: Record<UrgencyLevel, string> = {
  low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical',
};

interface JobCardProps {
  job: Job;
  customer: Customer | undefined;
  technician: UserType | undefined;
  contractorName?: string;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent, jobId: string) => void;
  onDragEnd: () => void;
  onClick: (jobId: string) => void;
}

const JobCard: React.FC<JobCardProps> = ({ job, customer, technician, contractorName, isDragging, onDragStart, onDragEnd, onClick }) => {
  const handleCardClick = (e: React.MouseEvent) => {
    // Only trigger click if not dragging and no drag is in progress
    if (!isDragging) {
      onClick(job.id);
    }
  };

  return (
  <div
    draggable
    onDragStart={e => onDragStart(e, job.id)}
    onDragEnd={onDragEnd}
    onClick={handleCardClick}
    className={`bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-all ${isDragging ? 'cursor-grabbing opacity-40 scale-95' : 'cursor-pointer hover:border-orange-300'} select-none`}
  >
    <div className="flex items-start justify-between mb-3">
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-slate-900 truncate">{customer?.name}</h3>
        <p className="text-sm text-slate-500 flex items-center gap-1 mt-1 truncate">
          <MapPin className="w-3 h-3 shrink-0" />
          {customer?.address}, {customer?.city}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1 ml-2 shrink-0">
        <span className={`text-xs px-2 py-1 rounded-full border ${statusColors[job.status]}`}>
          {job.status.replace('_', ' ')}
        </span>
        {job.urgency && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${urgencyColors[job.urgency]}`}>
            {urgencyLabels[job.urgency]}
          </span>
        )}
      </div>
    </div>
    <div className="flex items-center gap-2 mb-3 flex-wrap">
      <span className={`text-xs px-2 py-1 rounded-full ${serviceTypes.find(s => s.value === job.serviceType)?.color ?? 'bg-slate-100'}`}>
        {job.serviceType}
      </span>
      {job.isPowercare && (
        <span className="text-xs px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 flex items-center gap-1">
          <Zap className="w-3 h-3" />PowerCare
        </span>
      )}
      {contractorName && (
        <span className="text-xs text-slate-500 flex items-center gap-1">
          <User className="w-3 h-3" />{contractorName}
        </span>
      )}
    </div>
    <div className="flex items-center justify-between pt-3 border-t border-slate-100">
      <div className="flex items-center gap-3 text-xs text-slate-500">
        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{job.scheduledDate?.split('T')[0] ?? job.scheduledDate}</span>
        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{job.scheduledTime}</span>
      </div>
      <span className="font-semibold text-slate-900">${job.totalAmount.toFixed(0)}</span>
    </div>
  </div>
  );
};

interface KanbanColumnProps {
  status: JobStatus;
  title: string;
  columnJobs: Job[];
  allJobs: Job[];
  draggedJobId: string | null;
  customers: Customer[];
  users: UserType[];
  contractors: import('../types/contractor').Contractor[];
  onUpdateJob: (job: Job) => void;
  onDragStart: (e: React.DragEvent, jobId: string) => void;
  onDragEnd: () => void;
  onCardClick: (jobId: string) => void;
}

const colColors: Record<JobStatus, string> = {
  new: 'bg-blue-50 border-blue-200',
  assigned: 'bg-slate-50 border-slate-200',
  in_progress: 'bg-amber-50 border-amber-200',
  completed: 'bg-green-50 border-green-200',
  invoiced: 'bg-purple-50 border-purple-200',
  paid: 'bg-emerald-50 border-emerald-200',
};

const KanbanColumn: React.FC<KanbanColumnProps> = ({
  status, title, columnJobs, allJobs, draggedJobId,
  customers, users, contractors, onUpdateJob, onDragStart, onDragEnd, onCardClick,
}) => {
  const [isOver, setIsOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsOver(true); };
  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if leaving the column itself, not a child
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsOver(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(false);
    const jobId = e.dataTransfer.getData('jobId');
    if (!jobId) return;
    const job = allJobs.find(j => j.id === jobId);
    if (job && job.status !== status) onUpdateJob({ ...job, status });
  };

  return (
    <div
      className={`flex-1 min-w-[280px] rounded-xl border-2 transition-colors duration-150 p-3 ${
        isOver ? 'border-orange-400 bg-orange-50' : colColors[status]
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-800">{title}</h3>
        <span className="text-xs font-medium text-slate-500 bg-white px-2 py-1 rounded-full">{columnJobs.length}</span>
      </div>
      <div className="space-y-3 overflow-y-auto max-h-[calc(100vh-300px)]">
        {columnJobs.map(job => (
          <JobCard
            key={job.id}
            job={job}
            customer={customers.find(c => c.id === job.customerId)}
            technician={users.find(u => u.id === job.technicianId)}
            contractorName={contractors.find(c => c.id === job.contractorId)?.contactName}
            isDragging={draggedJobId === job.id}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onClick={onCardClick}
          />
        ))}
        {columnJobs.length === 0 && (
          <div className={`border-2 border-dashed rounded-lg py-6 text-center text-sm transition-colors ${
            isOver ? 'border-orange-400 text-orange-500' : 'border-slate-200 text-slate-400'
          }`}>
            {isOver ? '↓ Drop here' : 'No jobs'}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

interface JobsProps {
  jobs: Job[];
  customers: Customer[];
  users: UserType[];
  contractors?: import('../types/contractor').Contractor[];
  onCreateJob: (job: Partial<Job>) => Job;
  onUpdateJob: (job: Job) => void;
  onDeleteJob: (jobId: string) => void;
  onViewChange: (view: string, jobId?: string) => void;
  isMobile: boolean;
  currentUser: UserType | null;
}

export const Jobs: React.FC<JobsProps> = ({
  jobs,
  customers,
  users,
  contractors = [],
  onCreateJob,
  onUpdateJob,
  onViewChange,
  isMobile,
  currentUser,
}) => {
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [createCustomer, setCreateCustomer] = useState<Customer | null>(null);
  const [editingCreatedJob, setEditingCreatedJob] = useState<Job | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<JobStatus | 'all'>('all');
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>(isMobile ? 'list' : 'kanban');
  const [draggedJobId, setDraggedJobId] = useState<string | null>(null);

  const technicians = users.filter((u) => u.role === 'technician' || u.role === 'coo');

  const filteredJobs = jobs.filter((job) => {
    const customer = customers.find((c) => c.id === job.customerId);
    const matchesSearch =
      !searchQuery ||
      customer?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customer?.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.notes.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'all' || job.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const handleDragStart = (e: React.DragEvent, jobId: string) => {
    e.dataTransfer.setData('jobId', jobId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedJobId(jobId);
  };

  const handleCardClick = (jobId: string) => onViewChange('jobDetail', jobId);

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Work Orders</h1>
          <p className="text-slate-500 mt-1">{filteredJobs.length} total work orders</p>
        </div>
        {currentUser?.role !== 'support' && (
          <button
            onClick={() => setShowCustomerPicker(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 text-white font-medium rounded-lg hover:bg-orange-600 transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>New Job</span>
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Search jobs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as JobStatus | 'all')}
            className="px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="all">All Status</option>
            <option value="new">New</option>
            <option value="assigned">Assigned</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="invoiced">Invoiced</option>
            <option value="paid">Paid</option>
          </select>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            <button
              onClick={() => setViewMode('kanban')}
              className={`px-4 py-2.5 ${viewMode === 'kanban' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600'}`}
            >
              Kanban
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-4 py-2.5 ${viewMode === 'list' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600'}`}
            >
              List
            </button>
          </div>
        </div>
      </div>

      {/* Kanban View */}
      {viewMode === 'kanban' && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {(['new', 'assigned', 'in_progress', 'completed', 'invoiced', 'paid'] as JobStatus[]).map(status => (
            <KanbanColumn
              key={status}
              status={status}
              title={status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
              columnJobs={filteredJobs.filter(j => j.status === status)}
              allJobs={jobs}
              draggedJobId={draggedJobId}
              customers={customers}
              users={users}
              contractors={contractors}
              onUpdateJob={onUpdateJob}
              onDragStart={handleDragStart}
              onDragEnd={() => setDraggedJobId(null)}
              onCardClick={handleCardClick}
            />
          ))}
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <div className="space-y-3">
          {filteredJobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              customer={customers.find(c => c.id === job.customerId)}
              technician={users.find(u => u.id === job.technicianId)}
              contractorName={contractors.find(c => c.id === job.contractorId)?.contactName}
              isDragging={draggedJobId === job.id}
              onDragStart={handleDragStart}
              onDragEnd={() => setDraggedJobId(null)}
              onClick={handleCardClick}
            />
          ))}
          {filteredJobs.length === 0 && (
            <div className="text-center py-12">
              <Wrench className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">No jobs found</p>
            </div>
          )}
        </div>
      )}

      {/* Step 1: Customer Picker */}
      {showCustomerPicker && !createCustomer && (
        <CustomerPickerModal
          customers={customers}
          onSelect={(c) => { setCreateCustomer(c); setShowCustomerPicker(false); }}
          onClose={() => setShowCustomerPicker(false)}
        />
      )}

      {/* Step 2: New WO creation */}
      {createCustomer && !editingCreatedJob && (
        <WorkOrderPanel
          siteId={createCustomer.id}
          siteName={createCustomer.name}
          clientId={createCustomer.clientId}
          siteAddress={`${createCustomer.address}, ${createCustomer.city}, ${createCustomer.state} ${createCustomer.zip}`}
          contractors={contractors}
          technicians={technicians.map(u => ({ id: u.id, name: u.name }))}
          currentUserName={currentUser?.name}
          currentUserRole={currentUser?.role}
          customer={createCustomer}
          onClose={() => setCreateCustomer(null)}
          onSave={(jobData) => {
            const newJob = onCreateJob({ ...jobData, customerId: createCustomer.id });
            setCreateCustomer(null);
            setEditingCreatedJob(newJob);
          }}
        />
      )}

      {/* Step 3: Edit mode after WO creation — panel stays open */}
      {editingCreatedJob && (
        <WorkOrderPanel
          job={editingCreatedJob}
          siteId={editingCreatedJob.solarEdgeSiteId ?? editingCreatedJob.customerId}
          siteName={editingCreatedJob.clientName ?? editingCreatedJob.customerId}
          clientId={editingCreatedJob.solarEdgeClientId}
          siteAddress={editingCreatedJob.siteAddress}
          contractors={contractors}
          technicians={technicians.map(u => ({ id: u.id, name: u.name }))}
          currentUserName={currentUser?.name}
          currentUserRole={currentUser?.role}
          onClose={() => setEditingCreatedJob(null)}
          onSave={(jobData) => {
            const updated = { ...editingCreatedJob, ...jobData } as Job;
            onUpdateJob(updated);
            setEditingCreatedJob(updated);
          }}
        />
      )}
    </div>
  );
};

// Customer Picker Modal — step 1 of new WO flow
interface CustomerPickerModalProps {
  customers: Customer[];
  onSelect: (customer: Customer) => void;
  onClose: () => void;
}

const CustomerPickerModal: React.FC<CustomerPickerModalProps> = ({ customers, onSelect, onClose }) => {
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = search.trim()
    ? customers.filter(c => {
        const q = search.toLowerCase();
        return c.name.toLowerCase().includes(q)
          || (c.clientId ?? '').toLowerCase().includes(q)
          || c.address.toLowerCase().includes(q);
      }).slice(0, 10)
    : customers.slice(0, 10);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">New Work Order</h2>
            <p className="text-xs text-slate-500 mt-0.5">Select a customer to continue</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg cursor-pointer">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        <div className="p-4">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search by name or client ID…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
            />
          </div>
          <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-400 text-center">No customers found</p>
            ) : filtered.map(c => (
              <button
                key={c.id}
                onClick={() => onSelect(c)}
                className="w-full text-left px-4 py-3 hover:bg-orange-50 transition-colors cursor-pointer"
              >
                <p className="font-medium text-slate-900 text-sm">{c.name}</p>
                <p className="text-xs text-slate-500">{c.address}{c.clientId ? ` · ${c.clientId}` : ''}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
