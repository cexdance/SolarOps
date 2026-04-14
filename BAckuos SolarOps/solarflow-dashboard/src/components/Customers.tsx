// SolarFlow MVP - Customers Component (List View with Split Panel)
import React, { useState } from 'react';
import {
  Plus,
  Search,
  Users,
  MapPin,
  Phone,
  Mail,
  Building,
  Home,
  ChevronRight,
  X,
  Wrench,
  Calendar,
  FileText,
  Image,
  Clock,
  CheckCircle,
  Edit,
  ArrowLeft,
} from 'lucide-react';
import { Customer, Job, ClientStatus, Activity } from '../types';
import { ServiceRate } from '../types/contractor';

// Client Status Badge Component
const getStatusColor = (status: ClientStatus): string => {
  const colors: Record<ClientStatus, string> = {
    'Contacted': 'bg-blue-100 text-blue-700',
    'In Progress': 'bg-cyan-100 text-cyan-700',
    'Quote Sent': 'bg-purple-100 text-purple-700',
    'Quote Approved': 'bg-green-100 text-green-700',
    'WO Assigned': 'bg-amber-100 text-amber-700',
    'Standby': 'bg-gray-100 text-gray-700',
    'O&M': 'bg-teal-100 text-teal-700',
    'Invoiced': 'bg-indigo-100 text-indigo-700',
    'Pending Payment': 'bg-orange-100 text-orange-700',
    'OVERDUE': 'bg-red-100 text-red-700',
    'Pending Parts': 'bg-yellow-100 text-yellow-700',
    'WO Completed': 'bg-emerald-100 text-emerald-700',
    'Contact Client': 'bg-pink-100 text-pink-700',
  };
  return colors[status] || 'bg-gray-100 text-gray-700';
};

const StatusBadge: React.FC<{ status: ClientStatus }> = ({ status }) => (
  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(status)}`}>
    {status}
  </span>
);

// Demo Service Rates
const demoServiceRates: ServiceRate[] = [
  {
    id: 'sr-1',
    serviceCode: 'PM-RES',
    serviceName: 'Residential Panel Maintenance',
    unit: 'flat',
    rate: 149.00,
    description: 'Standard residential panel maintenance service',
    active: true,
  },
  {
    id: 'sr-2',
    serviceCode: 'PM-COMM',
    serviceName: 'Commercial Panel Maintenance',
    unit: 'flat',
    rate: 299.00,
    description: 'Standard commercial panel maintenance service',
    active: true,
  },
  {
    id: 'sr-3',
    serviceCode: 'INV-REP',
    serviceName: 'Inverter Repair',
    unit: 'hour',
    rate: 125.00,
    description: 'Inverter repair service per hour',
    active: true,
  },
  {
    id: 'sr-4',
    serviceCode: 'SYS-INS',
    serviceName: 'System Inspection',
    unit: 'flat',
    rate: 199.00,
    description: 'Complete solar system inspection',
    active: true,
  },
  {
    id: 'sr-5',
    serviceCode: 'EMERG',
    serviceName: 'Emergency Service Call',
    unit: 'flat',
    rate: 250.00,
    description: 'Emergency service call out fee',
    active: true,
  },
  {
    id: 'sr-6',
    serviceCode: 'PWR-MON',
    serviceName: 'Power Monitoring Setup',
    unit: 'flat',
    rate: 175.00,
    description: 'Power monitoring system installation',
    active: true,
  },
  {
    id: 'sr-7',
    serviceCode: 'BAT-INS',
    serviceName: 'Battery Installation',
    unit: 'flat',
    rate: 1500.00,
    description: 'Battery backup system installation',
    active: true,
  },
  {
    id: 'sr-8',
    serviceCode: 'OPT-REP',
    serviceName: 'Optimizer Replacement',
    unit: 'flat',
    rate: 350.00,
    description: 'Solar optimizer replacement service',
    active: true,
  },
  {
    id: 'sr-9',
    serviceCode: 'ANNUAL',
    serviceName: 'Annual Maintenance Plan',
    unit: 'flat',
    rate: 399.00,
    description: 'Annual solar system maintenance contract',
    active: true,
  },
  {
    id: 'sr-10',
    serviceCode: 'UPGRADE',
    serviceName: 'System Upgrade Assessment',
    unit: 'flat',
    rate: 249.00,
    description: 'Solar system upgrade feasibility assessment',
    active: true,
  },
];

interface CustomersProps {
  customers: Customer[];
  jobs: Job[];
  onCreateCustomer: (customer: Partial<Customer>) => void;
  onUpdateCustomer: (customer: Customer) => void;
  onCreateJob: (job: Partial<Job>) => void;
  onViewCustomer: (customerId: string) => void;
  isMobile: boolean;
}

export const Customers: React.FC<CustomersProps> = ({
  customers,
  jobs,
  onCreateCustomer,
  onUpdateCustomer,
  onCreateJob,
  onViewCustomer,
  isMobile,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'residential' | 'commercial'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // Filter customers
  const filteredCustomers = customers.filter((customer) => {
    const matchesSearch =
      customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customer.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customer.phone.includes(searchQuery) ||
      customer.address.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || customer.type === filterType;
    return matchesSearch && matchesType;
  });

  const getCustomerStats = (customerId: string) => {
    const customerJobs = jobs.filter((j) => j.customerId === customerId);
    return {
      total: customerJobs.length,
      completed: customerJobs.filter((j) => j.status === 'completed' || j.status === 'invoiced' || j.status === 'paid').length,
      upcoming: customerJobs.filter((j) => j.status === 'new' || j.status === 'assigned').length,
    };
  };

  const handleRowClick = (customer: Customer) => {
    setSelectedCustomer(customer);
  };

  const closeDetail = () => {
    setSelectedCustomer(null);
  };

  // If a customer is selected, show the split panel view
  if (selectedCustomer) {
    return (
      <CustomerDetailPanel
        customer={selectedCustomer}
        jobs={jobs.filter(j => j.customerId === selectedCustomer.id)}
        onClose={closeDetail}
        onEdit={() => setShowEditModal(true)}
        onCloseEdit={() => setShowEditModal(false)}
        showEditModal={showEditModal}
        onUpdateCustomer={onUpdateCustomer}
        onCreateJob={onCreateJob}
      />
    );
  }

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Customers</h1>
          <p className="text-slate-500 mt-1">{filteredCustomers.length} customers</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 text-white font-medium rounded-lg hover:bg-orange-600 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span>Add Customer</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Search customers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setFilterType('all')}
            className={`px-4 py-2.5 rounded-lg font-medium transition-colors ${
              filterType === 'all'
                ? 'bg-slate-800 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilterType('residential')}
            className={`px-4 py-2.5 rounded-lg font-medium transition-colors ${
              filterType === 'residential'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            Residential
          </button>
          <button
            onClick={() => setFilterType('commercial')}
            className={`px-4 py-2.5 rounded-lg font-medium transition-colors ${
              filterType === 'commercial'
                ? 'bg-purple-600 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            Commercial
          </button>
        </div>
      </div>

      {/* Customer List - Table View */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Customer</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Client ID</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">System</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Location</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Phone</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Work Orders</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredCustomers.map((customer) => {
                const stats = getCustomerStats(customer.id);
                return (
                  <tr
                    key={customer.id}
                    onClick={() => handleRowClick(customer)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          customer.type === 'commercial' ? 'bg-purple-100' : 'bg-blue-100'
                        }`}>
                          {customer.type === 'commercial' ? (
                            <Building className="w-4 h-4 text-purple-600" />
                          ) : (
                            <Home className="w-4 h-4 text-blue-600" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{customer.name}</p>
                          <p className="text-xs text-slate-500">{customer.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-xs font-mono text-slate-600">
                        {customer.clientId || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        customer.type === 'commercial'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {customer.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {customer.systemType || customer.solarEdgeSiteId ? (
                        <span className="text-xs text-amber-600 font-medium">
                          {customer.systemType || 'SolarEdge'}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {customer.clientStatus ? (
                        <StatusBadge status={customer.clientStatus} />
                      ) : (
                        <span className="text-xs text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <p className="text-sm text-slate-600 truncate max-w-[150px]">
                        {customer.city}, {customer.state}
                      </p>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <p className="text-sm text-slate-600">{customer.phone}</p>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-slate-600">{stats.total} total</span>
                        {stats.upcoming > 0 && (
                          <span className="text-amber-600 text-xs">({stats.upcoming} pending)</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ChevronRight className="w-5 h-5 text-slate-400 ml-auto" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredCustomers.length === 0 && (
          <div className="text-center py-12">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">No customers found</p>
          </div>
        )}
      </div>

      {/* Create Customer Modal */}
      {showCreateModal && (
        <CreateCustomerModal
          onClose={() => setShowCreateModal(false)}
          onCreate={onCreateCustomer}
        />
      )}
    </div>
  );
};

// Split Panel Customer Detail Component
interface CustomerDetailPanelProps {
  customer: Customer;
  jobs: Job[];
  onClose: () => void;
  onEdit: () => void;
  onCloseEdit: () => void;
  showEditModal: boolean;
  onUpdateCustomer: (customer: Customer) => void;
  onCreateJob: (job: Partial<Job>) => void;
}

const CustomerDetailPanel: React.FC<CustomerDetailPanelProps> = ({
  customer,
  jobs,
  onClose,
  onEdit,
  onCloseEdit,
  showEditModal,
  onUpdateCustomer,
  onCreateJob,
}) => {
  const [activeTab, setActiveTab] = useState<'story' | 'jobs' | 'files' | 'activity'>('story');
  const [notes, setNotes] = useState(customer.notes || '');
  const [showCreateWorkOrder, setShowCreateWorkOrder] = useState(false);
  const [showSendMessage, setShowSendMessage] = useState(false);

  // Form states
  const [editForm, setEditForm] = useState<Customer>(customer);
  const [workOrderForm, setWorkOrderForm] = useState({
    title: '',
    description: '',
    priority: 'medium' as 'low' | 'medium' | 'high' | 'critical',
    dateDue: '',
    serviceRateId: '',
    isPowerCare: customer.isPowerCare || false,
    baseRate: 0,
    additionalAmount: 0,
    total: 0,
  });
  const [serviceSearch, setServiceSearch] = useState('');
  const [showServiceDropdown, setShowServiceDropdown] = useState(false);
  const [messageForm, setMessageForm] = useState({
    subject: '',
    body: '',
    method: 'email' as 'email' | 'sms',
  });

  // Demo story data
  const customerStory = customer.notes || `Customer since ${new Date(customer.createdAt || Date.now()).toLocaleDateString()}. Discovered Conexsol through referral from existing customer.`;

  // Filter service rates based on search
  const filteredServiceRates = demoServiceRates.filter(rate =>
    rate.serviceName.toLowerCase().includes(serviceSearch.toLowerCase()) ||
    rate.serviceCode.toLowerCase().includes(serviceSearch.toLowerCase())
  );

  // Handle service selection
  const handleServiceSelect = (rate: ServiceRate) => {
    setWorkOrderForm({
      ...workOrderForm,
      serviceRateId: rate.id,
      title: rate.serviceName,
      baseRate: rate.rate,
      total: rate.rate + workOrderForm.additionalAmount,
    });
    setServiceSearch(rate.serviceName);
    setShowServiceDropdown(false);
  };

  // Handle additional amount change
  const handleAdditionalAmountChange = (value: number) => {
    setWorkOrderForm({
      ...workOrderForm,
      additionalAmount: value,
      total: workOrderForm.baseRate + value,
    });
  };

  // Handle PowerCare toggle
  const handlePowerCareToggle = () => {
    setWorkOrderForm({
      ...workOrderForm,
      isPowerCare: !workOrderForm.isPowerCare,
    });
  };

  // Reset work order form when modal opens
  React.useEffect(() => {
    if (showCreateWorkOrder) {
      setWorkOrderForm({
        title: '',
        description: '',
        priority: 'medium',
        dateDue: '',
        serviceRateId: '',
        isPowerCare: customer.isPowerCare || false,
        baseRate: 0,
        additionalAmount: 0,
        total: 0,
      });
      setServiceSearch('');
    }
  }, [showCreateWorkOrder, customer.isPowerCare]);

  // Sync editForm with customer when modal opens
  React.useEffect(() => {
    if (showEditModal) {
      setEditForm(customer);
    }
  }, [showEditModal, customer]);

  const handleSaveEdit = () => {
    // Check if notes have changed and create activity entry
    const originalNotes = customer.notes || '';
    const newNotes = editForm.notes || '';

    let updatedCustomer = { ...editForm };

    // If notes changed, create an activity entry
    if (newNotes !== originalNotes && newNotes.trim() !== '') {
      const newActivity: Activity = {
        id: `activity-${Date.now()}`,
        type: 'note_added',
        description: newNotes,
        timestamp: new Date().toISOString(),
      };

      // Add to activity history
      const activityHistory = customer.activityHistory || [];
      updatedCustomer = {
        ...editForm,
        activityHistory: [newActivity, ...activityHistory],
      };
    }

    onUpdateCustomer(updatedCustomer);
    onCloseEdit(); // Close the modal
  };

  const handleCreateWorkOrder = () => {
    onCreateJob({
      customerId: customer.id,
      title: workOrderForm.title,
      description: workOrderForm.description,
      priority: workOrderForm.priority,
      status: 'new',
      date: workOrderForm.dateDue || new Date().toISOString(),
      laborRate: workOrderForm.baseRate,
      partsCost: workOrderForm.additionalAmount,
    });
    setShowCreateWorkOrder(false);
    setWorkOrderForm({
      title: '',
      description: '',
      priority: 'medium',
      dateDue: '',
      serviceRateId: '',
      isPowerCare: customer.isPowerCare || false,
      baseRate: 0,
      additionalAmount: 0,
      total: 0,
    });
    setServiceSearch('');
  };

  const handleSendMessage = () => {
    // In a real app, this would send via email/SMS service
    alert(`Message sent to ${customer.name} via ${messageForm.method.toUpperCase()}!\n\nSubject: ${messageForm.subject}\n\n${messageForm.body}`);
    setShowSendMessage(false);
    setMessageForm({ subject: '', body: '', method: 'email' });
  };

  return (
    <div className="h-[calc(100vh-80px)] flex flex-col md:flex-row">
      {/* Left Panel - Story & Details (60%) */}
      <div className="flex-1 flex flex-col border-r border-slate-200 bg-white overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-4 p-4 border-b border-slate-200">
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-slate-900">{customer.name}</h2>
            <p className="text-sm text-slate-500 capitalize">{customer.type} Customer</p>
          </div>
          <button
            onClick={onEdit}
            className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-200"
          >
            <Edit className="w-4 h-4" />
            Edit
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => setActiveTab('story')}
            className={`flex-1 py-3 text-sm font-medium border-b-2 ${
              activeTab === 'story'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Customer Story
          </button>
          <button
            onClick={() => setActiveTab('jobs')}
            className={`flex-1 py-3 text-sm font-medium border-b-2 ${
              activeTab === 'jobs'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Work Orders ({jobs.length})
          </button>
          <button
            onClick={() => setActiveTab('files')}
            className={`flex-1 py-3 text-sm font-medium border-b-2 ${
              activeTab === 'files'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Files & Photos
          </button>
          <button
            onClick={() => setActiveTab('activity')}
            className={`flex-1 py-3 text-sm font-medium border-b-2 ${
              activeTab === 'activity'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Activity
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'story' && (
            <div className="space-y-4">
              {/* How they found us */}
              <div className="bg-slate-50 rounded-lg p-4">
                <h3 className="font-semibold text-slate-900 mb-2 flex items-center gap-2">
                  <Users className="w-4 h-4 text-orange-500" />
                  How They Found Us
                </h3>
                <p className="text-sm text-slate-600">
                  {customer.referralSource || 'Referral from existing customer'}
                </p>
              </div>

              {/* Story */}
              <div className="bg-slate-50 rounded-lg p-4">
                <h3 className="font-semibold text-slate-900 mb-2 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-orange-500" />
                  Customer Story
                </h3>
                <p className="text-sm text-slate-600 whitespace-pre-line">
                  {customerStory}
                </p>
              </div>

              {/* Notes */}
              <div className="bg-slate-50 rounded-lg p-4">
                <h3 className="font-semibold text-slate-900 mb-2 flex items-center gap-2">
                  <Edit className="w-4 h-4 text-orange-500" />
                  Notes
                </h3>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes about this customer..."
                  className="w-full p-3 border border-slate-200 rounded-lg text-sm min-h-[100px]"
                />
              </div>

              {/* Activity Timeline */}
              <div className="bg-slate-50 rounded-lg p-4">
                <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-orange-500" />
                  Activity Timeline
                </h3>
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <div className="w-2 h-2 rounded-full bg-orange-500 mt-1.5" />
                    <div>
                      <p className="text-sm font-medium text-slate-900">Customer Created</p>
                      <p className="text-xs text-slate-500">
                        {customer.createdAt ? new Date(customer.createdAt).toLocaleDateString() : 'Unknown'}
                      </p>
                    </div>
                  </div>
                  {jobs.slice(0, 3).map((job) => (
                    <div key={job.id} className="flex gap-3">
                      <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5" />
                      <div>
                        <p className="text-sm font-medium text-slate-900">{job.serviceType}</p>
                        <p className="text-xs text-slate-500">{job.status} - {job.scheduledDate}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'jobs' && (
            <div className="space-y-3">
              {jobs.length === 0 ? (
                <div className="text-center py-8">
                  <Wrench className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500">No work orders yet</p>
                </div>
              ) : (
                jobs.map((job) => (
                  <div key={job.id} className="bg-slate-50 rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-slate-900">{job.serviceType}</p>
                      <p className="text-xs text-slate-500">{job.scheduledDate}</p>
                    </div>
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      job.status === 'completed' || job.status === 'paid'
                        ? 'bg-green-100 text-green-700'
                        : job.status === 'new' || job.status === 'assigned'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-slate-100 text-slate-700'
                    }`}>
                      {job.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'files' && (
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-lg p-4">
                <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <Image className="w-4 h-4 text-orange-500" />
                  Photos & Documents
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {/* Placeholder for customer photos */}
                  <div className="aspect-square bg-slate-200 rounded-lg flex items-center justify-center">
                    <Image className="w-6 h-6 text-slate-400" />
                  </div>
                  <div className="aspect-square bg-slate-200 rounded-lg flex items-center justify-center">
                    <Image className="w-6 h-6 text-slate-400" />
                  </div>
                  <div className="aspect-square bg-slate-200 rounded-lg flex items-center justify-center">
                    <Image className="w-6 h-6 text-slate-400" />
                  </div>
                </div>
                <button className="mt-3 w-full py-2 border-2 border-dashed border-slate-300 rounded-lg text-slate-500 text-sm hover:border-orange-500 hover:text-orange-500">
                  + Upload Files
                </button>
              </div>
            </div>
          )}

          {activeTab === 'activity' && (
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-lg p-4">
                <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-orange-500" />
                  Activity Timeline
                </h3>
                {(customer.activityHistory && customer.activityHistory.length > 0) ? (
                  <div className="space-y-3">
                    {customer.activityHistory.map((activity) => (
                      <div key={activity.id} className="border-l-2 border-orange-200 pl-3 py-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-orange-600 capitalize">
                            {activity.type.replace('_', ' ')}
                          </span>
                          <span className="text-xs text-slate-400">
                            {new Date(activity.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600">{activity.description}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">No activity yet. Add notes to create activity entries.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - Contact Info (40%) */}
      <div className="w-full md:w-[400px] bg-slate-50 p-4 overflow-y-auto">
        <h3 className="font-semibold text-slate-900 mb-4">Contact Information</h3>

        {/* Contact Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
              customer.type === 'commercial' ? 'bg-purple-100' : 'bg-blue-100'
            }`}>
              {customer.type === 'commercial' ? (
                <Building className="w-6 h-6 text-purple-600" />
              ) : (
                <Home className="w-6 h-6 text-blue-600" />
              )}
            </div>
            <div>
              <p className="font-semibold text-slate-900">{customer.name}</p>
              <p className="text-xs text-slate-500 capitalize">{customer.type}</p>
            </div>
          </div>

          <div className="space-y-3 pt-3 border-t border-slate-100">
            <a
              href={`tel:${customer.phone}`}
              className="flex items-center gap-3 text-sm text-slate-600 hover:text-orange-500"
            >
              <Phone className="w-4 h-4" />
              {customer.phone}
            </a>
            <a
              href={`mailto:${customer.email}`}
              className="flex items-center gap-3 text-sm text-slate-600 hover:text-orange-500"
            >
              <Mail className="w-4 h-4" />
              {customer.email}
            </a>
            <div className="flex items-start gap-3 text-sm text-slate-600">
              <MapPin className="w-4 h-4 mt-0.5" />
              <div>
                <p>{customer.address}</p>
                <p>{customer.city}, {customer.state} {customer.zip}</p>
              </div>
            </div>

            {/* System Info */}
            <div className="mt-3 flex flex-wrap gap-2">
              {customer.systemType && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                  {customer.systemType}
                </span>
              )}
              {customer.solarEdgeSiteId && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                  SolarEdge ID: {customer.solarEdgeSiteId}
                </span>
              )}
              {customer.clientStatus && (
                <StatusBadge status={customer.clientStatus} />
              )}
            </div>
          </div>

          {/* Map Placeholder */}
          <div className="h-32 bg-slate-100 rounded-lg flex items-center justify-center">
            <MapPin className="w-6 h-6 text-slate-400" />
            <span className="ml-2 text-xs text-slate-400">Map View</span>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="mt-4 bg-white rounded-xl border border-slate-200 p-4">
          <h4 className="font-semibold text-slate-900 mb-3">Quick Stats</h4>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Total Work Orders</span>
              <span className="font-medium">{jobs.length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Completed</span>
              <span className="font-medium text-green-600">
                {jobs.filter(j => j.status === 'completed' || j.status === 'paid').length}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Pending</span>
              <span className="font-medium text-amber-600">
                {jobs.filter(j => j.status === 'new' || j.status === 'assigned').length}
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-4 space-y-2">
          <button
            onClick={() => setShowCreateWorkOrder(true)}
            className="w-full py-2.5 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600"
          >
            Create Work Order
          </button>
          <button
            onClick={() => setShowSendMessage(true)}
            className="w-full py-2.5 border border-slate-200 text-slate-600 rounded-lg font-medium hover:bg-slate-50"
          >
            Send Message
          </button>
        </div>
      </div>

      {/* Edit Customer Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">Edit Customer</h2>
              <button onClick={onEdit} className="p-2 hover:bg-slate-100 rounded-lg">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Customer Name</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                <input
                  type="text"
                  value={editForm.address}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Customer Type</label>
                <select
                  value={editForm.type}
                  onChange={(e) => setEditForm({ ...editForm, type: e.target.value as 'residential' | 'commercial' })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                >
                  <option value="residential">Residential</option>
                  <option value="commercial">Commercial</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Client Status</label>
                <select
                  value={editForm.clientStatus || ''}
                  onChange={(e) => setEditForm({ ...editForm, clientStatus: e.target.value as ClientStatus || undefined })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                >
                  <option value="">Select status...</option>
                  <option value="Contacted">Contacted</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Quote Sent">Quote Sent</option>
                  <option value="Quote Approved">Quote Approved</option>
                  <option value="WO Assigned">WO Assigned</option>
                  <option value="Standby">Standby</option>
                  <option value="O&M">O&M</option>
                  <option value="Invoiced">Invoiced</option>
                  <option value="Pending Payment">Pending Payment</option>
                  <option value="OVERDUE">OVERDUE</option>
                  <option value="Pending Parts">Pending Parts</option>
                  <option value="WO Completed">WO Completed</option>
                  <option value="Contact Client">Contact Client</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">System Type</label>
                <select
                  value={editForm.systemType || ''}
                  onChange={(e) => setEditForm({ ...editForm, systemType: e.target.value as any || undefined })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                >
                  <option value="">Select system...</option>
                  <option value="SolarEdge">SolarEdge</option>
                  <option value="Enphase">Enphase</option>
                  <option value="SMA">SMA</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                <textarea
                  value={editForm.notes || ''}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  placeholder="Add notes about this client..."
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={onCloseEdit}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-lg font-medium hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="flex-1 py-2.5 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Work Order Modal */}
      {showCreateWorkOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">Create Work Order</h2>
              <button onClick={() => setShowCreateWorkOrder(false)} className="p-2 hover:bg-slate-100 rounded-lg">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {/* Customer Info Header */}
              <div className="bg-slate-50 rounded-lg p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">{customer.name}</p>
                  <p className="text-xs text-slate-500">{customer.address}</p>
                </div>
                <button
                  type="button"
                  onClick={handlePowerCareToggle}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    workOrderForm.isPowerCare
                      ? 'bg-amber-100 text-amber-700 border border-amber-300'
                      : 'bg-slate-100 text-slate-500 border border-slate-200'
                  }`}
                >
                  <span className="text-base">⚡</span>
                  {workOrderForm.isPowerCare ? 'PowerCare' : 'Standard'}
                </button>
              </div>

              {/* Service Selection */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Select Service *</label>
                <div className="relative">
                  <input
                    type="text"
                    value={serviceSearch}
                    onChange={(e) => {
                      setServiceSearch(e.target.value);
                      setShowServiceDropdown(true);
                    }}
                    onFocus={() => setShowServiceDropdown(true)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                    placeholder="Search services..."
                  />
                  {showServiceDropdown && filteredServiceRates.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {filteredServiceRates.map((rate) => (
                        <button
                          key={rate.id}
                          type="button"
                          onClick={() => handleServiceSelect(rate)}
                          className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center justify-between"
                        >
                          <div>
                            <p className="text-sm font-medium text-slate-900">{rate.serviceName}</p>
                            <p className="text-xs text-slate-500">{rate.serviceCode}</p>
                          </div>
                          <span className="text-sm font-medium text-green-600">${rate.rate.toFixed(2)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Pricing Section */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Base Rate</label>
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                    <input
                      type="number"
                      value={workOrderForm.baseRate}
                      readOnly
                      className="w-full pl-6 pr-2 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm text-slate-600"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Additional</label>
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={workOrderForm.additionalAmount || ''}
                      onChange={(e) => handleAdditionalAmountChange(parseFloat(e.target.value) || 0)}
                      className="w-full pl-6 pr-2 py-2 border border-slate-200 rounded-lg text-sm"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Total</label>
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                    <input
                      type="number"
                      value={workOrderForm.total}
                      readOnly
                      className="w-full pl-6 pr-2 py-2 bg-slate-800 border border-slate-800 rounded-lg text-sm text-white font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* Work Order Title (auto-filled from service) */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Work Order Title</label>
                <input
                  type="text"
                  value={workOrderForm.title}
                  onChange={(e) => setWorkOrderForm({ ...workOrderForm, title: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  placeholder="Auto-filled from service selection"
                />
              </div>

              {/* Priority */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
                <select
                  value={workOrderForm.priority}
                  onChange={(e) => setWorkOrderForm({ ...workOrderForm, priority: e.target.value as any })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>

              {/* Date Due */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date Due</label>
                <input
                  type="date"
                  value={workOrderForm.dateDue}
                  onChange={(e) => setWorkOrderForm({ ...workOrderForm, dateDue: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea
                  value={workOrderForm.description}
                  onChange={(e) => setWorkOrderForm({ ...workOrderForm, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg h-24"
                  placeholder="Describe the work to be done..."
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowCreateWorkOrder(false)}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-lg font-medium hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateWorkOrder}
                  disabled={!workOrderForm.title || !workOrderForm.serviceRateId}
                  className="flex-1 py-2.5 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 disabled:opacity-50"
                >
                  Create Order
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Send Message Modal */}
      {showSendMessage && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">Send Message to {customer.name}</h2>
              <button onClick={() => setShowSendMessage(false)} className="p-2 hover:bg-slate-100 rounded-lg">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Method</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="method"
                      value="email"
                      checked={messageForm.method === 'email'}
                      onChange={(e) => setMessageForm({ ...messageForm, method: 'email' })}
                    />
                    Email
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="method"
                      value="sms"
                      checked={messageForm.method === 'sms'}
                      onChange={(e) => setMessageForm({ ...messageForm, method: 'sms' })}
                    />
                    SMS
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Subject</label>
                <input
                  type="text"
                  value={messageForm.subject}
                  onChange={(e) => setMessageForm({ ...messageForm, subject: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  placeholder="Message subject..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Message</label>
                <textarea
                  value={messageForm.body}
                  onChange={(e) => setMessageForm({ ...messageForm, body: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg h-32"
                  placeholder="Type your message..."
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowSendMessage(false)}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-lg font-medium hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendMessage}
                  disabled={!messageForm.body}
                  className="flex-1 py-2.5 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Create Customer Modal Component
interface CreateCustomerModalProps {
  onClose: () => void;
  onCreate: (customer: Partial<Customer>) => void;
}

const CreateCustomerModal: React.FC<CreateCustomerModalProps> = ({ onClose, onCreate }) => {
  const [formData, setFormData] = useState({
    clientId: '',
    firstName: '',
    lastName: '',
    name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: 'FL',
    zip: '',
    type: 'residential' as 'residential' | 'commercial',
    systemType: '' as '' | 'SolarEdge' | 'Enphase' | 'SMA' | 'Other',
    clientStatus: '' as '' | 'Contacted' | 'In Progress' | 'Quote Sent' | 'Quote Approved' | 'WO Assigned' | 'Standby' | 'O&M' | 'Invoiced' | 'Pending Payment' | 'OVERDUE' | 'Pending Parts' | 'WO Completed' | 'Contact Client',
    notes: '',
    referralSource: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreate({
      ...formData,
      clientId: formData.clientId || undefined,
      systemType: formData.systemType || undefined,
      clientStatus: formData.clientStatus || undefined,
      createdAt: new Date().toISOString(),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">Add Customer</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Client ID and Name Row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Client ID</label>
              <input
                type="text"
                value={formData.clientId}
                onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                placeholder="US-10001"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Customer Name *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                placeholder="John Smith or ABC Company"
              />
            </div>
          </div>

          {/* First Name and Last Name Row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">First Name</label>
              <input
                type="text"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                placeholder="John"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Last Name</label>
              <input
                type="text"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                placeholder="Smith"
              />
            </div>
          </div>

          {/* Type, System Type, and Status Row */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Customer Type *</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as 'residential' | 'commercial' })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              >
                <option value="residential">Residential</option>
                <option value="commercial">Commercial</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">System Type</label>
              <select
                value={formData.systemType}
                onChange={(e) => setFormData({ ...formData, systemType: e.target.value as any })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              >
                <option value="">Select...</option>
                <option value="SolarEdge">SolarEdge</option>
                <option value="Enphase">Enphase</option>
                <option value="SMA">SMA</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Client Status</label>
              <select
                value={formData.clientStatus}
                onChange={(e) => setFormData({ ...formData, clientStatus: e.target.value as any })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              >
                <option value="">Select...</option>
                <option value="Contacted">Contacted</option>
                <option value="In Progress">In Progress</option>
                <option value="Quote Sent">Quote Sent</option>
                <option value="Quote Approved">Quote Approved</option>
                <option value="WO Assigned">WO Assigned</option>
                <option value="Standby">Standby</option>
                <option value="O&M">O&M</option>
                <option value="Invoiced">Invoiced</option>
                <option value="Pending Payment">Pending Payment</option>
                <option value="OVERDUE">OVERDUE</option>
                <option value="Pending Parts">Pending Parts</option>
                <option value="WO Completed">WO Completed</option>
                <option value="Contact Client">Contact Client</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phone *</label>
              <input
                type="tel"
                required
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Address *</label>
            <input
              type="text"
              required
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              placeholder="Street address"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-1">
              <label className="block text-sm font-medium text-slate-700 mb-1">City *</label>
              <input
                type="text"
                required
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">State *</label>
              <input
                type="text"
                required
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">ZIP *</label>
              <input
                type="text"
                required
                value={formData.zip}
                onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">How did they find us?</label>
            <input
              type="text"
              value={formData.referralSource}
              onChange={(e) => setFormData({ ...formData, referralSource: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              placeholder="Referral, Google, etc."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg min-h-[80px]"
              placeholder="Additional notes..."
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-lg font-medium hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600"
            >
              Create Customer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Customers;
