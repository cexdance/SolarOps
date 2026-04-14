// SolarFlow CRM - Customer Management Component
// Customer tracking with interaction history (calls, emails, SMS, notes)

import React, { useState, useEffect, useMemo } from 'react';
import {
  Phone,
  Mail,
  MessageSquare,
  Calendar,
  FileText,
  Search,
  Plus,
  Filter,
  MoreVertical,
  Clock,
  User,
  MapPin,
  DollarSign,
  Home,
  Sun,
  X,
  Send,
  Save,
  ChevronRight,
  Star,
  Edit,
  Trash2,
  Tag,
  Bell,
  CheckCircle,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import {
  CRMCustomer,
  CustomerInteraction,
  CustomerStatus,
  InteractionType,
  InteractionOutcome,
  LeadSource,
} from '../types';
import {
  loadCustomers,
  loadInteractions,
  saveCustomers,
  saveInteractions,
  getCustomerById,
  getInteractionsByCustomer,
  addInteraction,
  updateCustomer,
  searchCustomers,
  filterCustomersByStatus,
  formatDuration,
  formatTimeAgo,
  statusColors,
  interactionConfig,
  outcomeLabels,
} from '../lib/customerStore';

// Users for the system
const users = [
  { id: 'user-1', name: 'Sarah (Admin)' },
  { id: 'user-2', name: 'Mike (Sales)' },
  { id: 'user-3', name: 'Joe (Sales)' },
  { id: 'user-4', name: 'Carlos (Manager)' },
];

const sourceLabels: Record<LeadSource, string> = {
  google_forms: 'Google Forms',
  website: 'Website',
  referral: 'Referral',
  cold_call: 'Cold Call',
  social_media: 'Social Media',
  advertising: 'Advertising',
  partner: 'Partner',
  other: 'Other',
};

interface CustomerManagementProps {
  currentUserId?: string;
}

export const CustomerManagement: React.FC<CustomerManagementProps> = ({ currentUserId = 'user-1' }) => {
  const [customers, setCustomers] = useState<CRMCustomer[]>([]);
  const [interactions, setInteractions] = useState<CustomerInteraction[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<CustomerStatus | 'all'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showInteractionModal, setShowInteractionModal] = useState(false);
  const [interactionType, setInteractionType] = useState<InteractionType>('call');

  const currentUser = users.find(u => u.id === currentUserId) || users[0];

  // Load data on mount
  useEffect(() => {
    setCustomers(loadCustomers());
    setInteractions(loadInteractions());
  }, []);

  // Save data on change
  useEffect(() => {
    if (customers.length > 0) {
      saveCustomers(customers);
    }
  }, [customers]);

  useEffect(() => {
    if (interactions.length > 0) {
      saveInteractions(interactions);
    }
  }, [interactions]);

  // Filter customers
  const filteredCustomers = useMemo(() => {
    let result = customers;
    if (statusFilter !== 'all') {
      result = filterCustomersByStatus(result, statusFilter);
    }
    if (searchQuery) {
      result = searchCustomers(result, searchQuery);
    }
    return result;
  }, [customers, statusFilter, searchQuery]);

  // Get selected customer
  const selectedCustomer = useMemo(() => {
    return selectedCustomerId ? getCustomerById(customers, selectedCustomerId) : null;
  }, [customers, selectedCustomerId]);

  // Get customer interactions
  const customerInteractions = useMemo(() => {
    return selectedCustomerId ? getInteractionsByCustomer(interactions, selectedCustomerId) : [];
  }, [interactions, selectedCustomerId]);

  // Handle add new interaction
  const handleAddInteraction = (
    type: InteractionType,
    content: string,
    options?: {
      direction?: 'inbound' | 'outbound';
      subject?: string;
      outcome?: InteractionOutcome;
      duration?: number;
    }
  ) => {
    if (!selectedCustomerId) return;

    const newInteractions = addInteraction(
      interactions,
      selectedCustomerId,
      type,
      content,
      currentUserId,
      currentUser.name,
      options
    );

    setInteractions(newInteractions);

    // Update customer last contact
    const updatedCustomers = updateCustomer(customers, selectedCustomerId, {
      lastContactAt: new Date().toISOString(),
    });
    setCustomers(updatedCustomers);
  };

  // Handle update customer status
  const handleStatusChange = (customerId: string, newStatus: CustomerStatus) => {
    const updatedCustomers = updateCustomer(customers, customerId, { status: newStatus });
    setCustomers(updatedCustomers);
  };

  // Handle add new customer
  const handleAddCustomer = (customerData: Partial<CRMCustomer>) => {
    const newCustomer: CRMCustomer = {
      id: `cust-${Date.now()}`,
      firstName: customerData.firstName || '',
      lastName: customerData.lastName || '',
      email: customerData.email || '',
      phone: customerData.phone || '',
      address: customerData.address || '',
      city: customerData.city || '',
      state: customerData.state || 'FL',
      zip: customerData.zip || '',
      status: customerData.status || 'lead',
      source: customerData.source || 'other',
      notes: customerData.notes || '',
      tags: customerData.tags || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setCustomers([newCustomer, ...customers]);
    setShowAddModal(false);
  };

  return (
    <div className="h-full flex bg-slate-50">
      {/* Left Panel - Customer List */}
      <div className="w-96 bg-white border-r border-slate-200 flex flex-col">
        {/* Search and Filter Header */}
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-slate-900">Customers</h2>
            <button
              onClick={() => setShowAddModal(true)}
              className="p-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search customers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {/* Status Filter */}
          <div className="flex gap-1 flex-wrap">
            {(['all', 'lead', 'prospect', 'customer', 'inactive'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                  statusFilter === status
                    ? 'bg-slate-800 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {status === 'all' ? 'All' : statusColors[status as CustomerStatus].label}
              </button>
            ))}
          </div>
        </div>

        {/* Customer List */}
        <div className="flex-1 overflow-y-auto">
          {filteredCustomers.map((customer) => (
            <button
              key={customer.id}
              onClick={() => setSelectedCustomerId(customer.id)}
              className={`w-full p-4 text-left border-b border-slate-100 hover:bg-slate-50 transition-colors ${
                selectedCustomerId === customer.id ? 'bg-amber-50 border-l-4 border-l-amber-500' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-medium text-slate-600">
                    {customer.firstName[0]}{customer.lastName[0]}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-900 truncate">
                      {customer.firstName} {customer.lastName}
                    </span>
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusColors[customer.status].bg} ${statusColors[customer.status].text}`}>
                      {statusColors[customer.status].label}
                    </span>
                  </div>
                  <div className="text-sm text-slate-500 truncate">{customer.city}, {customer.state}</div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                    {customer.lastContactAt && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatTimeAgo(customer.lastContactAt)}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <MessageSquare className="w-3 h-3" />
                      {customer.totalInteractions || 0}
                    </span>
                  </div>
                </div>
              </div>
            </button>
          ))}

          {filteredCustomers.length === 0 && (
            <div className="p-8 text-center text-slate-500">
              <User className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p>No customers found</p>
            </div>
          )}
        </div>

        {/* Stats Footer */}
        <div className="p-3 border-t border-slate-200 bg-slate-50">
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>{filteredCustomers.length} customers</span>
            <span className="flex items-center gap-1">
              <Star className="w-4 h-4 text-amber-500" />
              {filteredCustomers.filter(c => c.status === 'prospect').length} prospects
            </span>
          </div>
        </div>
      </div>

      {/* Right Panel - Customer Detail */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedCustomer ? (
          <>
            {/* Customer Header */}
            <div className="bg-white border-b border-slate-200 p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center">
                    <span className="text-xl font-bold text-white">
                      {selectedCustomer.firstName[0]}{selectedCustomer.lastName[0]}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center gap-3">
                      <h1 className="text-2xl font-bold text-slate-900">
                        {selectedCustomer.firstName} {selectedCustomer.lastName}
                      </h1>
                      <select
                        value={selectedCustomer.status}
                        onChange={(e) => handleStatusChange(selectedCustomer.id, e.target.value as CustomerStatus)}
                        className={`px-3 py-1 text-sm font-medium rounded-full border-0 cursor-pointer ${statusColors[selectedCustomer.status].bg} ${statusColors[selectedCustomer.status].text}`}
                      >
                        {Object.entries(statusColors).map(([key, value]) => (
                          <option key={key} value={key}>{value.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-4 h-4" />
                        {selectedCustomer.address}, {selectedCustomer.city}, {selectedCustomer.state}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-slate-500">
                      <span className="flex items-center gap-1">
                        <Phone className="w-4 h-4" />
                        {selectedCustomer.phone}
                      </span>
                      <span className="flex items-center gap-1">
                        <Mail className="w-4 h-4" />
                        {selectedCustomer.email}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setInteractionType('call'); setShowInteractionModal(true); }}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    <Phone className="w-4 h-4" />
                    Call
                  </button>
                  <button
                    onClick={() => { setInteractionType('email'); setShowInteractionModal(true); }}
                    className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                  >
                    <Mail className="w-4 h-4" />
                    Email
                  </button>
                  <button
                    onClick={() => { setInteractionType('sms'); setShowInteractionModal(true); }}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
                  >
                    <MessageSquare className="w-4 h-4" />
                    SMS
                  </button>
                </div>
              </div>

              {/* Customer Stats Row */}
              <div className="grid grid-cols-4 gap-4 mt-6">
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-xs text-slate-500 uppercase tracking-wide">Monthly Bill</div>
                  <div className="text-lg font-semibold text-slate-900">${selectedCustomer.monthlyBill || 0}</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-xs text-slate-500 uppercase tracking-wide">Roof Type</div>
                  <div className="text-lg font-semibold text-slate-900 capitalize">{selectedCustomer.roofType || 'N/A'}</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-xs text-slate-500 uppercase tracking-wide">Source</div>
                  <div className="text-lg font-semibold text-slate-900">{sourceLabels[selectedCustomer.source]}</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-xs text-slate-500 uppercase tracking-wide">Created</div>
                  <div className="text-lg font-semibold text-slate-900">{formatTimeAgo(selectedCustomer.createdAt)}</div>
                </div>
              </div>
            </div>

            {/* Interaction Timeline */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-3xl">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-slate-900">Activity Timeline</h3>
                  <button
                    onClick={() => { setInteractionType('note'); setShowInteractionModal(true); }}
                    className="flex items-center gap-1 text-sm text-amber-600 hover:text-amber-700"
                  >
                    <Plus className="w-4 h-4" />
                    Add Note
                  </button>
                </div>

                {/* Timeline */}
                <div className="relative">
                  {/* Vertical Line */}
                  <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-200" />

                  {/* Interactions */}
                  <div className="space-y-6">
                    {customerInteractions.map((interaction, index) => (
                      <div key={interaction.id} className="relative pl-10">
                        {/* Icon */}
                        <div className={`absolute left-0 w-8 h-8 rounded-full flex items-center justify-center ${interactionConfig[interaction.type].bg}`}>
                          {interaction.type === 'call' && <Phone className={`w-4 h-4 ${interactionConfig[interaction.type].color}`} />}
                          {interaction.type === 'email' && <Mail className={`w-4 h-4 ${interactionConfig[interaction.type].color}`} />}
                          {interaction.type === 'sms' && <MessageSquare className={`w-4 h-4 ${interactionConfig[interaction.type].color}`} />}
                          {interaction.type === 'note' && <FileText className={`w-4 h-4 ${interactionConfig[interaction.type].color}`} />}
                          {interaction.type === 'meeting' && <Calendar className={`w-4 h-4 ${interactionConfig[interaction.type].color}`} />}
                        </div>

                        {/* Content */}
                        <div className="bg-white rounded-lg border border-slate-200 p-4">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-slate-900 capitalize">{interaction.type}</span>
                                {interaction.direction && (
                                  <span className="text-xs text-slate-400">
                                    ({interaction.direction})
                                  </span>
                                )}
                                {interaction.duration && (
                                  <span className="text-xs text-slate-400 flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {formatDuration(interaction.duration)}
                                  </span>
                                )}
                              </div>
                              {interaction.subject && (
                                <div className="text-sm text-slate-600 mt-1">{interaction.subject}</div>
                              )}
                              <div className="text-sm text-slate-700 mt-2">{interaction.content}</div>
                              {interaction.outcome && (
                                <div className="mt-2">
                                  <span className="inline-flex items-center px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded">
                                    {outcomeLabels[interaction.outcome]}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="text-xs text-slate-400">
                              {formatTimeAgo(interaction.timestamp)}
                            </div>
                          </div>
                          <div className="text-xs text-slate-400 mt-2">
                            By {interaction.userName}
                          </div>
                        </div>
                      </div>
                    ))}

                    {customerInteractions.length === 0 && (
                      <div className="text-center py-8 text-slate-500">
                        <MessageSquare className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                        <p>No interactions yet</p>
                        <p className="text-sm">Start tracking by logging a call, email, or note</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-500">
            <div className="text-center">
              <User className="w-16 h-16 mx-auto mb-4 text-slate-300" />
              <p className="text-lg">Select a customer to view details</p>
              <p className="text-sm">Or add a new customer to get started</p>
            </div>
          </div>
        )}
      </div>

      {/* Add Interaction Modal */}
      {showInteractionModal && selectedCustomer && (
        <InteractionModal
          type={interactionType}
          onClose={() => setShowInteractionModal(false)}
          onSubmit={handleAddInteraction}
          customerName={`${selectedCustomer.firstName} ${selectedCustomer.lastName}`}
        />
      )}

      {/* Add Customer Modal */}
      {showAddModal && (
        <AddCustomerModal
          onClose={() => setShowAddModal(false)}
          onAdd={handleAddCustomer}
        />
      )}
    </div>
  );
};

// Interaction Modal Component
const InteractionModal: React.FC<{
  type: InteractionType;
  onClose: () => void;
  onSubmit: (type: InteractionType, content: string, options?: any) => void;
  customerName: string;
}> = ({ type, onClose, onSubmit, customerName }) => {
  const [content, setContent] = useState('');
  const [outcome, setOutcome] = useState<InteractionOutcome>('connected');
  const [duration, setDuration] = useState(300);
  const [direction, setDirection] = useState<'inbound' | 'outbound'>('outbound');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    onSubmit(type, content, {
      direction,
      outcome: type === 'call' ? outcome : undefined,
      duration: type === 'call' ? duration : undefined,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            {type === 'call' && <Phone className="w-5 h-5 text-blue-500" />}
            {type === 'email' && <Mail className="w-5 h-5 text-green-500" />}
            {type === 'sms' && <MessageSquare className="w-5 h-5 text-purple-500" />}
            {type === 'note' && <FileText className="w-5 h-5 text-yellow-500" />}
            {type === 'meeting' && <Calendar className="w-5 h-5 text-orange-500" />}
            Log {type.charAt(0).toUpperCase() + type.slice(1)}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-slate-500 mb-4">Recording interaction with {customerName}</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Direction for calls */}
          {type === 'call' && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDirection('outbound')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  direction === 'outbound'
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Outbound
              </button>
              <button
                type="button"
                onClick={() => setDirection('inbound')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  direction === 'inbound'
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Inbound
              </button>
            </div>
          )}

          {/* Duration for calls */}
          {type === 'call' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Duration (seconds)</label>
              <input
                type="number"
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          )}

          {/* Outcome for calls */}
          {type === 'call' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Outcome</label>
              <select
                value={outcome}
                onChange={(e) => setOutcome(e.target.value as InteractionOutcome)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {Object.entries(outcomeLabels).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Content */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {type === 'call' ? 'Call Notes' : type === 'email' ? 'Email Body' : type === 'sms' ? 'SMS Message' : 'Note'}
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 h-32 resize-none"
              placeholder={`Enter ${type} details...`}
              required
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors font-medium flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Add Customer Modal Component
const AddCustomerModal: React.FC<{
  onClose: () => void;
  onAdd: (customer: Partial<CRMCustomer>) => void;
}> = ({ onClose, onAdd }) => {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: 'FL',
    zip: '',
    status: 'lead' as CustomerStatus,
    source: 'other' as LeadSource,
    monthlyBill: 150,
    notes: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd(formData);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900">Add New Customer</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">First Name *</label>
              <input
                type="text"
                required
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Last Name *</label>
              <input
                type="text"
                required
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phone *</label>
              <input
                type="tel"
                required
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">State</label>
              <input
                type="text"
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">ZIP</label>
              <input
                type="text"
                value={formData.zip}
                onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as CustomerStatus })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {Object.entries(statusColors).map(([key, value]) => (
                  <option key={key} value={key}>{value.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Source</label>
              <select
                value={formData.source}
                onChange={(e) => setFormData({ ...formData, source: e.target.value as LeadSource })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {Object.entries(sourceLabels).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Monthly Bill ($)</label>
            <input
              type="number"
              value={formData.monthlyBill}
              onChange={(e) => setFormData({ ...formData, monthlyBill: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 h-20 resize-none"
              placeholder="Additional notes..."
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors font-medium"
            >
              Add Customer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CustomerManagement;
