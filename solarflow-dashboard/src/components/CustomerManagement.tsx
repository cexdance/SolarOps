// SolarFlow CRM - Customer Management Component
// Customer tracking with interaction history (calls, emails, SMS, notes)

import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  LayoutGrid,
  List,
  Paperclip,
  ImageIcon,
  FileText as FileIcon,
  Download,
  Upload,
  Receipt,
  ExternalLink,
} from 'lucide-react';
import {
  CRMCustomer,
  CRMAttachment,
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
import { rcCall, rcSMS } from '../lib/ringcentral';

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

// ── Kanban Board ─────────────────────────────────────────────────────────────

const KANBAN_COLS: {
  status: CustomerStatus;
  label: string;
  headerBg: string;
  headerText: string;
  colBg: string;
  colBorder: string;
}[] = [
  { status: 'lead',     label: 'Lead',     headerBg: 'bg-blue-100',   headerText: 'text-blue-700',   colBg: 'bg-blue-50/50',   colBorder: 'border-blue-200'  },
  { status: 'prospect', label: 'Prospect', headerBg: 'bg-purple-100', headerText: 'text-purple-700', colBg: 'bg-purple-50/50', colBorder: 'border-purple-200' },
  { status: 'customer', label: 'Customer', headerBg: 'bg-green-100',  headerText: 'text-green-700',  colBg: 'bg-green-50/50',  colBorder: 'border-green-200'  },
  { status: 'inactive', label: 'Inactive', headerBg: 'bg-slate-100',  headerText: 'text-slate-600',  colBg: 'bg-slate-50',     colBorder: 'border-slate-200'  },
];

interface KanbanBoardProps {
  customers: CRMCustomer[];
  onSelectCustomer: (id: string) => void;
  onStatusChange: (id: string, status: CustomerStatus) => void;
  dragOverCol: CustomerStatus | null;
  setDragOverCol: (col: CustomerStatus | null) => void;
  draggedId: React.MutableRefObject<string>;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  setViewMode: (mode: 'list' | 'kanban') => void;
  onAddCustomer: () => void;
  currentUserRole?: string;
  selectedCustomerId: string | null;
}

const KanbanBoard: React.FC<KanbanBoardProps> = ({
  customers,
  onSelectCustomer,
  onStatusChange,
  dragOverCol,
  setDragOverCol,
  draggedId,
  searchQuery,
  setSearchQuery,
  setViewMode,
  onAddCustomer,
  currentUserRole,
  selectedCustomerId,
}) => {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Board header */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <button
          onClick={() => setViewMode('list')}
          title="Switch to List view"
          className="p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors flex-shrink-0"
        >
          <List className="w-4 h-4" />
        </button>
        <h2 className="text-base font-semibold text-slate-900 flex-shrink-0">Pipeline Board</h2>
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search customers..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        {currentUserRole !== 'support' && (
          <button
            onClick={onAddCustomer}
            className="p-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors flex-shrink-0"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Columns */}
      <div className="flex-1 flex gap-3 overflow-x-auto p-4 min-h-0">
        {KANBAN_COLS.map(col => {
          const colCustomers = customers.filter(c => c.status === col.status);
          const isOver = dragOverCol === col.status;
          return (
            <div
              key={col.status}
              className="flex flex-col flex-shrink-0 w-64"
              onDragOver={e => { e.preventDefault(); setDragOverCol(col.status); }}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={() => {
                if (draggedId.current) onStatusChange(draggedId.current, col.status);
                setDragOverCol(null);
                draggedId.current = '';
              }}
            >
              {/* Column header */}
              <div className={`flex items-center justify-between px-3 py-2 rounded-t-xl ${col.headerBg}`}>
                <span className={`text-sm font-semibold ${col.headerText}`}>{col.label}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full bg-white/60 ${col.headerText}`}>
                  {colCustomers.length}
                </span>
              </div>

              {/* Drop zone */}
              <div className={`flex-1 rounded-b-xl border-2 border-t-0 p-2 overflow-y-auto transition-colors min-h-[120px] ${
                isOver
                  ? 'border-dashed border-amber-400 bg-amber-50'
                  : `${col.colBorder} ${col.colBg}`
              }`}>
                {colCustomers.map(customer => (
                  <div
                    key={customer.id}
                    draggable
                    onDragStart={() => { draggedId.current = customer.id; }}
                    onClick={() => onSelectCustomer(customer.id)}
                    className={`bg-white rounded-xl border p-3 mb-2 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow select-none ${
                      selectedCustomerId === customer.id
                        ? 'border-amber-400 ring-2 ring-amber-300'
                        : 'border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-7 h-7 bg-slate-200 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-[10px] font-medium text-slate-600">
                          {customer.firstName[0]}{customer.lastName[0]}
                        </span>
                      </div>
                      <span className="text-sm font-semibold text-slate-900 truncate">
                        {customer.firstName} {customer.lastName}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 truncate">{customer.phone}</p>
                    {customer.monthlyBill ? (
                      <p className="text-xs text-emerald-600 font-medium mt-1">${customer.monthlyBill}/mo</p>
                    ) : null}
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[10px] text-slate-400">{sourceLabels[customer.source]}</span>
                      {customer.lastContactAt && (
                        <span className="text-[10px] text-slate-400">{formatTimeAgo(customer.lastContactAt)}</span>
                      )}
                    </div>
                  </div>
                ))}

                {colCustomers.length === 0 && (
                  <div className={`h-16 flex items-center justify-center rounded-lg border-2 border-dashed text-xs ${
                    isOver ? 'border-amber-400 text-amber-500' : 'border-slate-200 text-slate-400'
                  }`}>
                    {isOver ? 'Drop here' : 'Empty'}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

interface CustomerManagementProps {
  currentUserId?: string;
  currentUserRole?: string;
}

export const CustomerManagement: React.FC<CustomerManagementProps> = ({ currentUserId = 'user-1', currentUserRole }) => {
  const [customers, setCustomers] = useState<CRMCustomer[]>([]);
  const [interactions, setInteractions] = useState<CustomerInteraction[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<CustomerStatus | 'all'>(currentUserRole === 'sales' ? 'lead' : 'all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showInteractionModal, setShowInteractionModal] = useState(false);
  const [interactionType, setInteractionType] = useState<InteractionType>('call');
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [dragOverCol, setDragOverCol] = useState<CustomerStatus | null>(null);
  const draggedId = useRef<string>('');
  const [isDragOverDetail, setIsDragOverDetail] = useState(false);

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
  }, [customers, statusFilter, searchQuery, currentUserRole]);

  // Kanban: all customers filtered by search only (columns group by status)
  const kanbanCustomers = useMemo(() => {
    if (!searchQuery) return customers;
    return searchCustomers(customers, searchQuery);
  }, [customers, searchQuery]);

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

  const handleUpdateCustomer = (patch: Partial<CRMCustomer>) => {
    if (!selectedCustomerId) return;
    const updated = updateCustomer(customers, selectedCustomerId, { ...patch, updatedAt: new Date().toISOString() });
    setCustomers(updated);
    setShowEditModal(false);
  };

  // Handle file drops on the detail panel
  const handleFileDrop = (files: FileList) => {
    if (!selectedCustomerId) return;
    const allowed = ['image/', 'application/pdf', 'text/', 'application/vnd'];
    const validFiles = Array.from(files).filter(f =>
      allowed.some(prefix => f.type.startsWith(prefix)) || f.name.endsWith('.docx') || f.name.endsWith('.xlsx')
    );
    if (!validFiles.length) return;

    validFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const attachment: CRMAttachment = {
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: file.name,
          mimeType: file.type,
          dataUrl,
          size: file.size,
          createdAt: new Date().toISOString(),
        };
        setCustomers(prev => {
          const updated = prev.map(c =>
            c.id === selectedCustomerId
              ? { ...c, attachments: [...(c.attachments ?? []), attachment], updatedAt: new Date().toISOString() }
              : c
          );
          saveCustomers(updated);
          return updated;
        });
      };
      reader.readAsDataURL(file);
    });
  };

  // Handle attachment delete
  const handleDeleteAttachment = (attachmentId: string) => {
    if (!selectedCustomerId) return;
    setCustomers(prev => {
      const updated = prev.map(c =>
        c.id === selectedCustomerId
          ? { ...c, attachments: (c.attachments ?? []).filter(a => a.id !== attachmentId) }
          : c
      );
      saveCustomers(updated);
      return updated;
    });
  };

  // Handle pasted images from InteractionModal
  const handleAddInteractionWithImages = (
    type: InteractionType,
    content: string,
    options?: { direction?: 'inbound' | 'outbound'; subject?: string; outcome?: InteractionOutcome; duration?: number; images?: CRMAttachment[] }
  ) => {
    handleAddInteraction(type, content, options);
    if (options?.images?.length && selectedCustomerId) {
      setCustomers(prev => {
        const updated = prev.map(c =>
          c.id === selectedCustomerId
            ? { ...c, attachments: [...(c.attachments ?? []), ...(options.images ?? [])], updatedAt: new Date().toISOString() }
            : c
        );
        saveCustomers(updated);
        return updated;
      });
    }
  };

  return (
    <div className="h-full flex bg-slate-50">
      {viewMode === 'kanban' ? (
        <KanbanBoard
          customers={kanbanCustomers}
          onSelectCustomer={setSelectedCustomerId}
          onStatusChange={handleStatusChange}
          dragOverCol={dragOverCol}
          setDragOverCol={setDragOverCol}
          draggedId={draggedId}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          setViewMode={setViewMode}
          onAddCustomer={() => setShowAddModal(true)}
          currentUserRole={currentUserRole}
          selectedCustomerId={selectedCustomerId}
        />
      ) : null}

      {/* Left Panel - Customer List (list mode only) */}
      {viewMode === 'list' && <div className="w-96 bg-white border-r border-slate-200 flex flex-col">
        {/* Search and Filter Header */}
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-slate-900">Customers</h2>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  setViewMode(v => {
                    if (v === 'list') { setStatusFilter('all'); return 'kanban'; }
                    return 'list';
                  });
                }}
                title={viewMode === 'list' ? 'Switch to Board view' : 'Switch to List view'}
                className="p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
              >
                {viewMode === 'list' ? <LayoutGrid className="w-4 h-4" /> : <List className="w-4 h-4" />}
              </button>
              {currentUserRole !== 'support' && (
                <button
                  onClick={() => setShowAddModal(true)}
                  className="p-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              )}
            </div>
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
      </div>}

      {/* Right Panel - Customer Detail */}
      {(viewMode === 'list' || selectedCustomer) && (
      <div
        className={`flex flex-col overflow-hidden relative ${viewMode === 'kanban' && selectedCustomer ? 'w-full md:w-[520px] border-l border-slate-200' : 'flex-1'}`}
        onDragOver={e => { e.preventDefault(); if (selectedCustomer) setIsDragOverDetail(true); }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOverDetail(false); }}
        onDrop={e => {
          e.preventDefault();
          setIsDragOverDetail(false);
          if (e.dataTransfer.files.length) handleFileDrop(e.dataTransfer.files);
        }}
      >
        {/* Drop overlay */}
        {isDragOverDetail && selectedCustomer && (
          <div className="absolute inset-0 z-30 bg-amber-500/10 border-4 border-dashed border-amber-500 rounded-lg flex items-center justify-center pointer-events-none">
            <div className="bg-white rounded-xl shadow-lg px-8 py-6 flex flex-col items-center gap-2">
              <Upload className="w-10 h-10 text-amber-500" />
              <p className="text-base font-semibold text-slate-900">Drop files to attach</p>
              <p className="text-sm text-slate-500">Images, PDFs, and documents supported</p>
            </div>
          </div>
        )}
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
                    <div className="flex items-center gap-3 flex-wrap">
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
                      {selectedCustomer.isPowercare && (
                        <span className="px-2.5 py-0.5 text-xs font-semibold bg-amber-100 text-amber-700 rounded-full border border-amber-300">
                          ⚡ Powercare
                        </span>
                      )}
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
                    onClick={() => setShowEditModal(true)}
                    className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
                    title="Edit customer"
                  >
                    <Edit className="w-4 h-4" />
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      if (selectedCustomer.phone) rcCall(selectedCustomer.phone);
                      setInteractionType('call'); setShowInteractionModal(true);
                    }}
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
                    onClick={() => {
                      if (selectedCustomer.phone) rcSMS(selectedCustomer.phone);
                      setInteractionType('sms'); setShowInteractionModal(true);
                    }}
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

                {/* Attachments Section */}
                {((selectedCustomer.attachments ?? []).length > 0) && (
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                        <Paperclip className="w-4 h-4" />
                        Attachments ({(selectedCustomer.attachments ?? []).length})
                      </h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(selectedCustomer.attachments ?? []).map(att => {
                        const isImage = att.mimeType.startsWith('image/');
                        return (
                          <div key={att.id} className="group relative bg-white border border-slate-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
                            {isImage ? (
                              <a href={att.dataUrl} download={att.name} className="block">
                                <img src={att.dataUrl} alt={att.name} className="w-24 h-24 object-cover" />
                              </a>
                            ) : (
                              <a href={att.dataUrl} download={att.name} className="flex flex-col items-center justify-center w-24 h-24 gap-1 text-slate-500 hover:text-slate-700">
                                <FileIcon className="w-8 h-8 text-slate-400" />
                                <span className="text-[10px] text-center px-1 truncate w-full text-center">{att.name}</span>
                              </a>
                            )}
                            {/* Hover overlay */}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                              <div className="flex gap-1">
                                <a
                                  href={att.dataUrl}
                                  download={att.name}
                                  className="p-1.5 bg-white rounded-lg shadow"
                                  title="Download"
                                >
                                  <Download className="w-3.5 h-3.5 text-slate-700" />
                                </a>
                                <button
                                  onClick={() => handleDeleteAttachment(att.id)}
                                  className="p-1.5 bg-white rounded-lg shadow"
                                  title="Remove"
                                >
                                  <X className="w-3.5 h-3.5 text-red-500" />
                                </button>
                              </div>
                            </div>
                            {isImage && (
                              <p className="text-[9px] text-slate-400 text-center px-1 pb-1 truncate">{att.name}</p>
                            )}
                          </div>
                        );
                      })}
                      {/* Drop hint tile */}
                      <div className="w-24 h-24 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center text-slate-300 text-[10px] gap-1">
                        <Paperclip className="w-5 h-5" />
                        Drop files
                      </div>
                    </div>
                  </div>
                )}

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
                          {interaction.type === 'quote' && <Receipt className={`w-4 h-4 ${interactionConfig[interaction.type].color}`} />}
                        </div>

                        {/* Content */}
                        <div className="bg-white rounded-lg border border-slate-200 p-4">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-slate-900 capitalize">
                                  {interaction.type === 'quote' ? 'Xero Quote' : interaction.type}
                                </span>
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
                              {interaction.type === 'quote' && (() => {
                                const urlMatch = interaction.content.match(/https?:\/\/\S+/);
                                const text = urlMatch ? interaction.content.replace(urlMatch[0], '').replace(/—\s*$/, '').trim() : interaction.content;
                                return (
                                  <div className="text-sm text-slate-700 mt-2">
                                    {text}
                                    {urlMatch && (
                                      <a
                                        href={urlMatch[0]}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="ml-2 inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 underline"
                                      >
                                        View in Xero <ExternalLink className="w-3 h-3" />
                                      </a>
                                    )}
                                  </div>
                                );
                              })()}
                              {interaction.type !== 'quote' && (
                                <div className="text-sm text-slate-700 mt-2">{interaction.content}</div>
                              )}
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
                        <p className="text-xs text-slate-400 mt-3 flex items-center justify-center gap-1">
                          <Upload className="w-3.5 h-3.5" /> Drop files anywhere here to attach them
                        </p>
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
      )}

      {/* Add Interaction Modal */}
      {showInteractionModal && selectedCustomer && (
        <InteractionModal
          type={interactionType}
          onClose={() => setShowInteractionModal(false)}
          onSubmit={handleAddInteractionWithImages}
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

      {/* Edit Customer Modal */}
      {showEditModal && selectedCustomer && (
        <EditCustomerModal
          customer={selectedCustomer}
          onClose={() => setShowEditModal(false)}
          onSave={handleUpdateCustomer}
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
  const [pastedImages, setPastedImages] = useState<CRMAttachment[]>([]);

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter(item => item.type.startsWith('image/'));
    if (!imageItems.length) return;
    e.preventDefault();
    imageItems.forEach(item => {
      const file = item.getAsFile();
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        setPastedImages(prev => [...prev, {
          id: `paste-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: `pasted-image-${Date.now()}.png`,
          mimeType: file.type,
          dataUrl,
          size: file.size,
          createdAt: new Date().toISOString(),
        }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() && pastedImages.length === 0) return;

    onSubmit(type, content, {
      direction,
      outcome: type === 'call' ? outcome : undefined,
      duration: type === 'call' ? duration : undefined,
      images: pastedImages.length ? pastedImages : undefined,
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
              onPaste={handlePaste}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 h-32 resize-none"
              placeholder={`Enter ${type} details...${type === 'note' ? ' — paste images directly here' : ''}`}
            />
            {/* Pasted image previews */}
            {pastedImages.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {pastedImages.map(img => (
                  <div key={img.id} className="relative group">
                    <img src={img.dataUrl} alt="pasted" className="w-20 h-20 object-cover rounded-lg border border-slate-200" />
                    <button
                      type="button"
                      onClick={() => setPastedImages(prev => prev.filter(p => p.id !== img.id))}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {type === 'note' && pastedImages.length === 0 && (
              <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                <ImageIcon className="w-3 h-3" /> Paste images directly into the note (Ctrl+V / Cmd+V)
              </p>
            )}
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
    isPowercare: false,
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

          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div
              onClick={() => setFormData(f => ({ ...f, isPowercare: !f.isPowercare }))}
              className={`relative w-10 h-6 rounded-full transition-colors ${formData.isPowercare ? 'bg-amber-500' : 'bg-slate-200'}`}
            >
              <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${formData.isPowercare ? 'translate-x-4' : ''}`} />
            </div>
            <span className="text-sm font-medium text-slate-700">Powercare Customer</span>
          </label>

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

// Edit Customer Modal Component
const EditCustomerModal: React.FC<{
  customer: CRMCustomer;
  onClose: () => void;
  onSave: (patch: Partial<CRMCustomer>) => void;
}> = ({ customer, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    firstName: customer.firstName,
    lastName: customer.lastName,
    email: customer.email,
    phone: customer.phone,
    address: customer.address,
    city: customer.city,
    state: customer.state,
    zip: customer.zip,
    status: customer.status,
    source: customer.source,
    monthlyBill: customer.monthlyBill ?? 0,
    notes: customer.notes,
    isPowercare: customer.isPowercare ?? false,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900">Edit Customer</h3>
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

          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div
              onClick={() => setFormData(f => ({ ...f, isPowercare: !f.isPowercare }))}
              className={`relative w-10 h-6 rounded-full transition-colors ${formData.isPowercare ? 'bg-amber-500' : 'bg-slate-200'}`}
            >
              <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${formData.isPowercare ? 'translate-x-4' : ''}`} />
            </div>
            <span className="text-sm font-medium text-slate-700">Powercare Customer</span>
          </label>

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
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CustomerManagement;
