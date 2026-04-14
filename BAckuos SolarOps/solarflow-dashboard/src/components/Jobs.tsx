// SolarFlow MVP - Jobs Component
import React, { useState } from 'react';
import {
  Plus,
  Search,
  Filter,
  Calendar,
  MapPin,
  User,
  Clock,
  DollarSign,
  ChevronRight,
  X,
  Check,
  Camera,
  Edit,
  Trash2,
  MoreVertical,
  Phone,
  Mail,
  Wrench,
  Zap,
} from 'lucide-react';
import { Job, Customer, User as UserType, ServiceType, JobStatus, UrgencyLevel } from '../types';
import { ServiceRate } from '../types/contractor';
import { loadServiceRates } from '../lib/contractorStore';

interface JobsProps {
  jobs: Job[];
  customers: Customer[];
  users: UserType[];
  onCreateJob: (job: Partial<Job>) => void;
  onUpdateJob: (job: Job) => void;
  onDeleteJob: (jobId: string) => void;
  onViewChange: (view: string, jobId?: string) => void;
  isMobile: boolean;
  currentUser: UserType | null;
}

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
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

export const Jobs: React.FC<JobsProps> = ({
  jobs,
  customers,
  users,
  onCreateJob,
  onUpdateJob,
  onViewChange,
  isMobile,
  currentUser,
}) => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<JobStatus | 'all'>('all');
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('kanban');

  const technicians = users.filter((u) => u.role === 'technician' || u.role === 'coo');

  // Filter jobs
  const filteredJobs = jobs.filter((job) => {
    const customer = customers.find((c) => c.id === job.customerId);
    const matchesSearch =
      customer?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customer?.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.notes.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'all' || job.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const getCustomer = (customerId: string) => customers.find((c) => c.id === customerId);
  const getTechnician = (techId: string) => users.find((u) => u.id === techId);

  const getServiceTypeColor = (type: ServiceType) =>
    serviceTypes.find((s) => s.value === type)?.color || 'bg-slate-100';

  const JobCard: React.FC<{ job: Job }> = ({ job }) => {
    const customer = getCustomer(job.customerId);
    const technician = getTechnician(job.technicianId);

    return (
      <div
        onClick={() => onViewChange('jobDetail', job.id)}
        className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h3 className="font-semibold text-slate-900">{customer?.name}</h3>
            <p className="text-sm text-slate-500 flex items-center gap-1 mt-1">
              <MapPin className="w-3 h-3" />
              {customer?.address}, {customer?.city}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span
              className={`text-xs px-2 py-1 rounded-full border ${statusColors[job.status]}`}
            >
              {job.status.replace('_', ' ')}
            </span>
            {job.urgency && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full border ${urgencyColors[job.urgency]}`}
              >
                {urgencyLabels[job.urgency]}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <span className={`text-xs px-2 py-1 rounded-full ${getServiceTypeColor(job.serviceType)}`}>
            {job.serviceType}
          </span>
          {job.isPowercare && (
            <span className="text-xs px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 flex items-center gap-1">
              <Zap className="w-3 h-3" />
              PowerCare
            </span>
          )}
          {technician && (
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <User className="w-3 h-3" />
              {technician.name}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {job.scheduledDate}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {job.scheduledTime}
            </span>
          </div>
          <span className="font-semibold text-slate-900">${job.totalAmount.toFixed(0)}</span>
        </div>
      </div>
    );
  };

  const KanbanColumn: React.FC<{ status: JobStatus; title: string; jobs: Job[] }> = ({
    status,
    title,
    jobs: columnJobs,
  }) => {
    const colors: Record<JobStatus, string> = {
      new: 'bg-blue-50 border-blue-200',
      assigned: 'bg-slate-50 border-slate-200',
      in_progress: 'bg-amber-50 border-amber-200',
      completed: 'bg-green-50 border-green-200',
      invoiced: 'bg-purple-50 border-purple-200',
      paid: 'bg-emerald-50 border-emerald-200',
    };

    return (
      <div className={`flex-1 min-w-[280px] rounded-xl border ${colors[status]} p-3`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-800 capitalize">
            {title.replace('_', ' ')}
          </h3>
          <span className="text-xs font-medium text-slate-500 bg-white px-2 py-1 rounded-full">
            {columnJobs.length}
          </span>
        </div>
        <div className="space-y-3 overflow-y-auto max-h-[calc(100vh-300px)]">
          {columnJobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
          {columnJobs.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-4">No jobs</p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Work Orders</h1>
          <p className="text-slate-500 mt-1">{filteredJobs.length} total work orders</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 text-white font-medium rounded-lg hover:bg-orange-600 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span>New Job</span>
        </button>
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
          <KanbanColumn status="new" title="New" jobs={filteredJobs.filter((j) => j.status === 'new')} />
          <KanbanColumn status="assigned" title="Assigned" jobs={filteredJobs.filter((j) => j.status === 'assigned')} />
          <KanbanColumn status="in_progress" title="In Progress" jobs={filteredJobs.filter((j) => j.status === 'in_progress')} />
          <KanbanColumn status="completed" title="Completed" jobs={filteredJobs.filter((j) => j.status === 'completed')} />
          <KanbanColumn status="invoiced" title="Invoiced" jobs={filteredJobs.filter((j) => j.status === 'invoiced')} />
          <KanbanColumn status="paid" title="Paid" jobs={filteredJobs.filter((j) => j.status === 'paid')} />
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <div className="space-y-3">
          {filteredJobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
          {filteredJobs.length === 0 && (
            <div className="text-center py-12">
              <Wrench className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">No jobs found</p>
            </div>
          )}
        </div>
      )}

      {/* Create Job Modal */}
      {showCreateModal && (
        <CreateJobModal
          customers={customers}
          technicians={technicians}
          onClose={() => setShowCreateModal(false)}
          onCreate={onCreateJob}
        />
      )}
    </div>
  );
};

// Create Job Modal Component
interface CreateJobModalProps {
  customers: Customer[];
  technicians: UserType[];
  onClose: () => void;
  onCreate: (job: Partial<Job>) => void;
}

const CreateJobModal: React.FC<CreateJobModalProps> = ({
  customers,
  technicians,
  onClose,
  onCreate,
}) => {
  const serviceRates = loadServiceRates().filter(r => r.active);

  const [formData, setFormData] = useState({
    customerId: '',
    technicianId: '',
    serviceType: 'maintenance' as ServiceType,
    scheduledDate: new Date().toISOString().split('T')[0],
    scheduledTime: '09:00',
    notes: '',
    laborHours: 1,
    laborRate: 125,
    partsCost: 0,
    urgency: 'medium' as UrgencyLevel,
    isPowercare: false,
    serviceCode: '',
  });

  const handleServiceCodeChange = (serviceCode: string) => {
    const selectedRate = serviceRates.find(r => r.serviceCode === serviceCode);
    if (selectedRate) {
      setFormData({
        ...formData,
        serviceCode: selectedRate.serviceCode,
        laborHours: selectedRate.estimatedHours || 1,
        laborRate: selectedRate.laborCost || 125,
        partsCost: selectedRate.partsCost || 0,
        isPowercare: selectedRate.isPowercareEligible || false,
        notes: formData.notes
          ? `${formData.notes}\n\nService: ${selectedRate.serviceName}\n${selectedRate.description || ''}`
          : `Service: ${selectedRate.serviceName}\n${selectedRate.description || ''}`,
      });
    } else {
      setFormData({ ...formData, serviceCode: '' });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const customer = customers.find((c) => c.id === formData.customerId);
    if (!customer || !formData.technicianId) return;

    const totalAmount = formData.laborHours * formData.laborRate + formData.partsCost;

    onCreate({
      customerId: formData.customerId,
      technicianId: formData.technicianId,
      serviceType: formData.serviceType,
      status: 'new',
      scheduledDate: formData.scheduledDate,
      scheduledTime: formData.scheduledTime,
      notes: formData.notes,
      laborHours: formData.laborHours,
      laborRate: formData.laborRate,
      partsCost: formData.partsCost,
      totalAmount,
      createdAt: new Date().toISOString(),
      photos: [],
      urgency: formData.urgency,
      isPowercare: formData.isPowercare,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white">
          <h2 className="text-lg font-semibold">New Job</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Customer</label>
            <select
              required
              value={formData.customerId}
              onChange={(e) => setFormData({ ...formData, customerId: e.target.value })}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="">Select customer...</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name} - {customer.address}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Technician</label>
            <select
              required
              value={formData.technicianId}
              onChange={(e) => setFormData({ ...formData, technicianId: e.target.value })}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="">Select technician...</option>
              {technicians.map((tech) => (
                <option key={tech.id} value={tech.id}>
                  {tech.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Service Code
              <span className="text-xs text-slate-500 ml-2">(Optional - auto-fills details)</span>
            </label>
            <select
              value={formData.serviceCode}
              onChange={(e) => handleServiceCodeChange(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="">Select a service code...</option>
              {serviceRates.map((rate) => (
                <option key={rate.id} value={rate.serviceCode}>
                  {rate.serviceCode} - {rate.serviceName}
                </option>
              ))}
            </select>
            {formData.serviceCode && (
              <p className="text-xs text-green-600 mt-1">
                ✓ Auto-populated: {formData.laborHours} hrs @ ${formData.laborRate}/hr + ${formData.partsCost} parts
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Service Type</label>
              <select
                value={formData.serviceType}
                onChange={(e) => setFormData({ ...formData, serviceType: e.target.value as ServiceType })}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                {serviceTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Labor Hours</label>
              <input
                type="number"
                min="0.5"
                step="0.5"
                value={formData.laborHours}
                onChange={(e) => setFormData({ ...formData, laborHours: parseFloat(e.target.value) })}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
              <input
                type="date"
                value={formData.scheduledDate}
                onChange={(e) => setFormData({ ...formData, scheduledDate: e.target.value })}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Time</label>
              <input
                type="time"
                value={formData.scheduledTime}
                onChange={(e) => setFormData({ ...formData, scheduledTime: e.target.value })}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Labor Rate ($)</label>
              <input
                type="number"
                value={formData.laborRate}
                onChange={(e) => setFormData({ ...formData, laborRate: parseFloat(e.target.value) })}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Parts Cost ($)</label>
              <input
                type="number"
                value={formData.partsCost}
                onChange={(e) => setFormData({ ...formData, partsCost: parseFloat(e.target.value) })}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Urgency</label>
              <select
                value={formData.urgency}
                onChange={(e) => setFormData({ ...formData, urgency: e.target.value as UrgencyLevel })}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div className="flex items-center">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isPowercare}
                  onChange={(e) => setFormData({ ...formData, isPowercare: e.target.checked })}
                  className="w-5 h-5 text-orange-500 rounded focus:ring-orange-500"
                />
                <span className="text-sm font-medium text-slate-700 flex items-center gap-1">
                  <Zap className="w-4 h-4 text-indigo-500" />
                  PowerCare Client
                </span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              placeholder="Job details..."
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
            />
          </div>

          <div className="bg-slate-50 p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">Estimated Total:</span>
              <span className="text-xl font-bold text-slate-900">
                ${((formData.laborHours * formData.laborRate) + formData.partsCost).toFixed(2)}
              </span>
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600 transition-colors"
          >
            Create Job
          </button>
        </form>
      </div>
    </div>
  );
};
