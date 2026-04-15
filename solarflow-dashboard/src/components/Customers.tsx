// SolarFlow MVP - Customers Component (List View with Split Panel)
import React, { useState, useRef, useCallback, useEffect } from 'react';
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
  Paperclip,
  Save,
  Columns,
  GripVertical,
  ChevronDown,
  ChevronUp,
  Filter,
  Trash2,
  GitMerge,
  ArrowRight,
  Crown,
  Briefcase,
  Sun,
  Pencil,
  AlertTriangle,
  Zap,
  Info,
  BarChart3,
  DollarSign,
  Send,
  ExternalLink,
  TrendingUp,
  Leaf,
  FileBarChart,
  Eye,
} from 'lucide-react';
import * as _recharts from 'recharts';
const { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip: RechartsTooltip, ResponsiveContainer, CartesianGrid, Legend } = _recharts as any;
import { Customer, Job, ClientStatus, Activity, User, CustomerCategory, SolarEdgeAlert } from '../types';
import { ServiceRate } from '../types/contractor';
import { loadServiceRates } from '../lib/contractorStore';
import { loadAlerts } from '../lib/operationsStore';
import { FL_SITES, SolarEdgeSite } from '../lib/solarEdgeSites';
import { AddressAutocomplete } from './AddressAutocomplete';
import { AddressLink } from './AddressLink';
import { WorkOrderPanel } from './WorkOrderPanel';
import { PhoneLink } from './PhoneLink';

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

const getCategoryColor = (category: CustomerCategory): string => {
  const colors: Record<CustomerCategory, string> = {
    'O&M':         'bg-teal-100 text-teal-700',
    'New Install': 'bg-blue-100 text-blue-700',
    'Prospect':    'bg-purple-100 text-purple-700',
  };
  return colors[category];
};

const CategoryBadge: React.FC<{ category: CustomerCategory }> = ({ category }) => (
  <span className={`px-2 py-1 text-xs font-medium rounded-full whitespace-nowrap ${getCategoryColor(category)}`}>
    {category}
  </span>
);

// ── Referral source suggestions ────────────────────────────────────────────
const REFERRAL_OPTIONS = [
  'Customer Referral',
  'Google Search',
  'Facebook',
  'Instagram',
  'Nextdoor',
  'Door Knock / Canvassing',
  'Home Show / Event',
  'Yelp',
  'SolarEdge',
  'Installer Referral',
  'Email Campaign',
  'Postcard / Mailer',
  'YouTube',
  'Word of Mouth',
  'LinkedIn',
  'HOA',
  'TV / Radio',
];

const ReferralCombobox: React.FC<{
  value: string;
  onChange: (val: string) => void;
}> = ({ value, onChange }) => {
  const [open, setOpen] = React.useState(false);
  const [input, setInput] = React.useState(value);
  const ref = React.useRef<HTMLDivElement>(null);

  // Sync input when value changes externally (e.g. modal open)
  React.useEffect(() => { setInput(value); }, [value]);

  // Close on outside click
  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = input.trim()
    ? REFERRAL_OPTIONS.filter(o => o.toLowerCase().includes(input.toLowerCase()))
    : REFERRAL_OPTIONS;

  const select = (option: string) => {
    setInput(option);
    onChange(option);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={input}
        placeholder="Type or select…"
        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
        onChange={(e) => { setInput(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {filtered.map(option => (
            <li
              key={option}
              onMouseDown={() => select(option)}
              className={`px-3 py-2 text-sm cursor-pointer hover:bg-orange-50 hover:text-orange-700 ${option === value ? 'bg-orange-50 font-medium text-orange-700' : 'text-slate-700'}`}
            >
              {option}
            </li>
          ))}
          {input.trim() && !REFERRAL_OPTIONS.some(o => o.toLowerCase() === input.toLowerCase()) && (
            <li
              onMouseDown={() => select(input.trim())}
              className="px-3 py-2 text-sm cursor-pointer text-slate-500 hover:bg-slate-50 border-t border-slate-100 italic"
            >
              Add "{input.trim()}"
            </li>
          )}
        </ul>
      )}
    </div>
  );
};

// Load live service rates from store (same data as Service Rates page)
const liveServiceRates: ServiceRate[] = loadServiceRates().filter(r => r.active);

interface CustomersProps {
  customers: Customer[];
  jobs: Job[];
  users: User[];
  contractors?: import('../types/contractor').Contractor[];
  currentUser: User | null;
  onCreateCustomer: (customer: Partial<Customer>) => void;
  onUpdateCustomer: (customer: Customer) => void;
  onDeleteCustomer: (customerId: string) => void;
  onMergeCustomers: (primaryId: string, secondaryId: string, resolvedFields?: Partial<Customer>) => void;
  onCreateJob: (job: Partial<Job>) => void;
  onUpdateJob?: (job: Job) => void;
  onDeleteJob?: (jobId: string) => void;
  onDispatch?: (job: import('../types/contractor').ContractorJob) => void;
  onViewCustomer: (customerId: string) => void;
  onSolarEdgeSites?: () => void;
  isMobile: boolean;
  initialCustomerId?: string;
}

export const Customers: React.FC<CustomersProps> = ({
  customers,
  jobs,
  users,
  contractors = [],
  currentUser,
  onCreateCustomer,
  onUpdateCustomer,
  onDeleteCustomer,
  onMergeCustomers,
  onCreateJob,
  onUpdateJob,
  onDeleteJob,
  onDispatch,
  onViewCustomer,
  onSolarEdgeSites,
  isMobile,
  initialCustomerId,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  // ── Column system ──────────────────────────────────────────────────────────
  type ColId = 'name' | 'clientId' | 'type' | 'category' | 'system' | 'status' | 'location' | 'phone' | 'email' | 'workOrders' | 'powerCare' | 'seAlerts';
  const ALL_COLUMNS: { id: ColId; label: string }[] = [
    { id: 'name',       label: 'Customer'    },
    { id: 'clientId',   label: 'Client ID'   },
    { id: 'type',       label: 'Type'        },
    { id: 'category',   label: 'Category'    },
    { id: 'system',     label: 'System'      },
    { id: 'seAlerts',   label: 'SE Alerts'   },
    { id: 'status',     label: 'Status'      },
    { id: 'location',   label: 'Location'    },
    { id: 'phone',      label: 'Phone'       },
    { id: 'email',      label: 'Email'       },
    { id: 'workOrders', label: 'Work Orders' },
    { id: 'powerCare',  label: 'PowerCare'   },
  ];

  // ── Persist view config to localStorage ────────────────────────────────────
  const STORAGE_KEY = 'solarops_customers_view';
  const loadView = <T,>(key: string, fallback: T): T => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const saved = JSON.parse(raw);
      return key in saved ? saved[key] : fallback;
    } catch { return fallback; }
  };
  const saveView = (patch: Record<string, unknown>) => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const saved = raw ? JSON.parse(raw) : {};
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...saved, ...patch }));
    } catch {}
  };

  const [filterType, setFilterType] = useState<'all' | 'residential' | 'commercial'>(
    () => loadView('filterType', 'all' as 'all' | 'residential' | 'commercial')
  );
  const [colOrder, setColOrder] = useState<ColId[]>(
    () => loadView('colOrder', ['name','clientId','type','category','system','seAlerts','status','location','phone','email','workOrders','powerCare'] as ColId[])
  );
  const [hiddenCols, setHiddenCols] = useState<Set<ColId>>(
    () => new Set<ColId>(loadView('hiddenCols', ['email','powerCare','type'] as ColId[]))
  );
  const [colFilters, setColFilters] = useState<Partial<Record<ColId, string>>>(
    () => loadView('colFilters', {} as Partial<Record<ColId, string>>)
  );
  const [sortCol, setSortCol] = useState<ColId | null>(
    () => loadView('sortCol', null as ColId | null)
  );
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(
    () => loadView('sortDir', 'asc' as 'asc' | 'desc')
  );

  // Persist whenever view config changes
  React.useEffect(() => { saveView({ filterType }); }, [filterType]);
  React.useEffect(() => { saveView({ colOrder }); }, [colOrder]);
  React.useEffect(() => { saveView({ hiddenCols: Array.from(hiddenCols) }); }, [hiddenCols]);
  React.useEffect(() => { saveView({ colFilters }); }, [colFilters]);
  React.useEffect(() => { saveView({ sortCol }); }, [sortCol]);
  React.useEffect(() => { saveView({ sortDir }); }, [sortDir]);

  // Load SolarEdge alerts and build customerId → alerts map (active/unresolved only)
  const alertsByCustomer = React.useMemo(() => {
    const alerts = loadAlerts().filter(a => !a.resolved);
    const map = new Map<string, SolarEdgeAlert[]>();
    alerts.forEach(a => {
      if (!map.has(a.customerId)) map.set(a.customerId, []);
      map.get(a.customerId)!.push(a);
    });
    return map;
  }, []);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(() =>
    initialCustomerId ? (customers.find(c => c.id === initialCustomerId) ?? null) : null
  );
  const [showEditModal, setShowEditModal] = useState(false);
  const [showColPicker, setShowColPicker] = useState(false);
  const dragSrc = useRef<ColId | null>(null);
  const [page, setPage] = useState(1);

  const visibleCols = colOrder.filter(id => !hiddenCols.has(id));

  const toggleCol = (id: ColId) => {
    setHiddenCols(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleDragStart = (id: ColId) => { dragSrc.current = id; };
  const handleDragOver = (e: React.DragEvent, id: ColId) => {
    e.preventDefault();
    if (!dragSrc.current || dragSrc.current === id) return;
    setColOrder(prev => {
      const next = [...prev];
      const from = next.indexOf(dragSrc.current!);
      const to = next.indexOf(id);
      if (from === -1 || to === -1) return prev;
      next.splice(from, 1);
      next.splice(to, 0, dragSrc.current!);
      return next;
    });
  };

  const handleSort = (id: ColId) => {
    if (sortCol === id) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(id); setSortDir('asc'); }
  };

  const getCellValue = (c: Customer, id: ColId, stats: { total: number }): string => {
    switch (id) {
      case 'name': return c.name;
      case 'clientId': return c.clientId || '';
      case 'type': return c.type;
      case 'category': return c.category || '';
      case 'system': return c.systemType || (c.solarEdgeSiteId ? 'SolarEdge' : '');
      case 'seAlerts': return String(alertsByCustomer.get(c.id)?.length ?? 0);
      case 'status': return c.clientStatus || '';
      case 'location': return `${c.city} ${c.state}`;
      case 'phone': return c.phone;
      case 'email': return c.email;
      case 'workOrders': return String(stats.total);
      case 'powerCare': return c.isPowerCare ? 'yes' : 'no';
      default: return '';
    }
  };

  const getCustomerStats = (customerId: string) => {
    const customerJobs = jobs.filter((j) => j.customerId === customerId);
    return {
      total: customerJobs.length,
      completed: customerJobs.filter((j) => j.status === 'completed' || j.status === 'invoiced' || j.status === 'paid').length,
      upcoming: customerJobs.filter((j) => j.status === 'new' || j.status === 'assigned').length,
    };
  };

  // Filter customers
  const filteredCustomers = customers.filter((customer) => {
    const matchesSearch =
      customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customer.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customer.phone.includes(searchQuery) ||
      customer.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (customer.clientId || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || customer.type === filterType;
    // Per-column filters
    const matchesCols = Object.entries(colFilters).every(([col, val]) => {
      if (!val) return true;
      const stats = getCustomerStats(customer.id);
      return getCellValue(customer, col as ColId, stats).toLowerCase().includes(val.toLowerCase());
    });
    return matchesSearch && matchesType && matchesCols;
  });

  // Sort
  const sortedCustomers = sortCol
    ? [...filteredCustomers].sort((a, b) => {
        const statsA = getCustomerStats(a.id);
        const statsB = getCustomerStats(b.id);
        const va = getCellValue(a, sortCol, statsA);
        const vb = getCellValue(b, sortCol, statsB);
        const cmp = va.localeCompare(vb, undefined, { numeric: true });
        return sortDir === 'asc' ? cmp : -cmp;
      })
    : filteredCustomers;

  // Reset page when filters change
  React.useEffect(() => { setPage(1); }, [searchQuery, filterType, colFilters]);

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
        allCustomers={customers}
        jobs={jobs.filter(j => j.customerId === selectedCustomer.id)}
        allJobs={jobs}
        users={users}
        contractors={contractors}
        currentUser={currentUser}
        onClose={closeDetail}
        onEdit={() => setShowEditModal(true)}
        onCloseEdit={() => setShowEditModal(false)}
        showEditModal={showEditModal}
        onUpdateCustomer={(updatedCustomer) => {
          setSelectedCustomer(updatedCustomer);
          onUpdateCustomer(updatedCustomer);
        }}
        onDeleteCustomer={(customerId) => {
          onDeleteCustomer(customerId);
          closeDetail();
        }}
        onMergeCustomers={(primaryId, secondaryId, resolvedFields) => {
          onMergeCustomers(primaryId, secondaryId, resolvedFields);
          closeDetail();
        }}
        onCreateJob={onCreateJob}
        onUpdateJob={onUpdateJob}
        onDeleteJob={onDeleteJob}
        onDispatch={onDispatch}
      />
    );
  }

  const activeFilterCount = Object.values(colFilters).filter(Boolean).length;

  // Pagination
  const PAGE_SIZE = 50;
  const totalPages = Math.max(1, Math.ceil(sortedCustomers.length / PAGE_SIZE));
  const pagedCustomers = sortedCustomers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Customers</h1>
          <p className="text-slate-500 mt-1">{sortedCustomers.length} of {customers.length} customers</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 text-white font-medium rounded-lg hover:bg-orange-600 transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>Add Customer</span>
          </button>
        </div>
      </div>

      {/* Sub-tab navigation */}
      <div className="flex gap-0 mb-5 border-b border-slate-200">
        <button className="px-4 py-2 text-sm font-semibold border-b-2 border-orange-500 text-orange-600 -mb-px">
          Customer Accounts
        </button>
        {onSolarEdgeSites && (
          <button
            onClick={onSolarEdgeSites}
            className="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 -mb-px transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Sun className="w-3.5 h-3.5" />
            SolarEdge Sites
          </button>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row gap-3 mb-4">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search name, email, phone, client ID…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>

        {/* Type filter chips */}
        <div className="flex gap-1.5 items-center">
          {(['all','residential','commercial'] as const).map(t => (
            <button key={t} onClick={() => setFilterType(t)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterType === t
                  ? t === 'all' ? 'bg-slate-800 text-white'
                    : t === 'residential' ? 'bg-blue-600 text-white'
                    : 'bg-purple-600 text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Column picker */}
        <div className="relative">
          <button
            onClick={() => setShowColPicker(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors cursor-pointer ${
              showColPicker ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Columns className="w-4 h-4" />
            Columns
            {hiddenCols.size > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-orange-500 text-white rounded-full">{ALL_COLUMNS.length - hiddenCols.size}</span>
            )}
          </button>
          {showColPicker && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-slate-200 rounded-xl shadow-xl z-30 p-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2 py-1">Show / Hide</p>
              {ALL_COLUMNS.map(col => (
                <label key={col.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!hiddenCols.has(col.id)}
                    onChange={() => toggleCol(col.id)}
                    className="accent-orange-500 w-3.5 h-3.5"
                  />
                  <span className="text-sm text-slate-700">{col.label}</span>
                </label>
              ))}
              {activeFilterCount > 0 && (
                <button onClick={() => setColFilters({})}
                  className="w-full mt-1 px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg text-left">
                  Clear {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              {/* Column headers — draggable */}
              <tr className="bg-slate-50 border-b border-slate-200">
                {visibleCols.map(id => {
                  const col = ALL_COLUMNS.find(c => c.id === id)!;
                  const isSort = sortCol === id;
                  return (
                    <th
                      key={id}
                      draggable
                      onDragStart={() => handleDragStart(id)}
                      onDragOver={e => handleDragOver(e, id)}
                      onDragEnd={() => { dragSrc.current = null; }}
                      className="px-3 py-2.5 text-left select-none"
                    >
                      <div className="flex items-center gap-1 group">
                        <GripVertical className="w-3 h-3 text-slate-300 group-hover:text-slate-400 cursor-grab shrink-0" />
                        <button
                          onClick={() => handleSort(id)}
                          className="flex items-center gap-0.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hover:text-slate-800 cursor-pointer"
                        >
                          {col.label}
                          {isSort ? (
                            sortDir === 'asc'
                              ? <ChevronUp className="w-3 h-3 text-orange-500" />
                              : <ChevronDown className="w-3 h-3 text-orange-500" />
                          ) : (
                            <ChevronDown className="w-3 h-3 opacity-0 group-hover:opacity-30" />
                          )}
                        </button>
                      </div>
                    </th>
                  );
                })}
                <th className="px-3 py-2.5 w-8" />
              </tr>
              {/* Filter row */}
              <tr className="border-b border-slate-100 bg-white">
                {visibleCols.map(id => (
                  <th key={id} className="px-3 py-1.5">
                    <input
                      type="text"
                      placeholder="Filter…"
                      value={colFilters[id] || ''}
                      onChange={e => setColFilters(prev => ({ ...prev, [id]: e.target.value }))}
                      onClick={e => e.stopPropagation()}
                      className={`w-full px-2 py-1 text-xs border rounded-md focus:outline-none focus:ring-1 focus:ring-orange-400 ${
                        colFilters[id] ? 'border-orange-300 bg-orange-50' : 'border-slate-200 bg-slate-50'
                      }`}
                    />
                  </th>
                ))}
                <th className="px-3 py-1.5">
                  {activeFilterCount > 0 && (
                    <button onClick={() => setColFilters({})} title="Clear filters"
                      className="text-slate-400 hover:text-red-500 transition-colors cursor-pointer">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagedCustomers.map((customer) => {
                const stats = getCustomerStats(customer.id);
                return (
                  <tr
                    key={customer.id}
                    onClick={() => handleRowClick(customer)}
                    className="hover:bg-orange-50/40 cursor-pointer transition-colors"
                  >
                    {visibleCols.map(id => (
                      <td key={id} className="px-3 py-2.5">
                        {id === 'name' && (
                          <div className="flex items-center gap-2.5 min-w-[160px]">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                              customer.type === 'commercial' ? 'bg-purple-100' : 'bg-blue-100'
                            }`}>
                              {customer.type === 'commercial'
                                ? <Building className="w-3.5 h-3.5 text-purple-600" />
                                : <Home className="w-3.5 h-3.5 text-blue-600" />}
                            </div>
                            <div>
                              <p className="font-medium text-slate-900 leading-tight">{customer.name}</p>
                              {customer.email && <p className="text-xs text-slate-400">{customer.email}</p>}
                            </div>
                          </div>
                        )}
                        {id === 'clientId' && (
                          <span className="text-xs font-mono text-slate-600">{customer.clientId || '—'}</span>
                        )}
                        {id === 'type' && (
                          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                            customer.type === 'commercial' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {customer.type}
                          </span>
                        )}
                        {id === 'category' && (
                          customer.category
                            ? <CategoryBadge category={customer.category} />
                            : <span className="text-xs text-slate-300">—</span>
                        )}
                        {id === 'system' && (
                          customer.systemType || customer.solarEdgeSiteId
                            ? <span className="text-xs text-amber-600 font-medium">{customer.systemType || 'SolarEdge'}</span>
                            : <span className="text-xs text-slate-300">—</span>
                        )}
                        {id === 'status' && (
                          customer.clientStatus
                            ? <StatusBadge status={customer.clientStatus} />
                            : <span className="text-xs text-slate-300">—</span>
                        )}
                        {id === 'location' && (
                          <span className="text-slate-600 whitespace-nowrap">{customer.city}{customer.city && customer.state ? ', ' : ''}{customer.state}</span>
                        )}
                        {id === 'phone' && (
                          <div onClick={e => e.stopPropagation()}>
                            {customer.phone
                              ? <PhoneLink phone={customer.phone} />
                              : <span className="text-slate-400">—</span>
                            }
                          </div>
                        )}
                        {id === 'email' && (
                          <span className="text-slate-600 text-xs">{customer.email || '—'}</span>
                        )}
                        {id === 'workOrders' && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-600">{stats.total}</span>
                            {stats.upcoming > 0 && (
                              <span className="text-xs text-amber-600">({stats.upcoming} pending)</span>
                            )}
                          </div>
                        )}
                        {id === 'powerCare' && (
                          customer.isPowerCare
                            ? <span className="text-xs px-2 py-0.5 bg-teal-100 text-teal-700 rounded-full font-medium">Active</span>
                            : <span className="text-xs text-slate-300">—</span>
                        )}
                        {id === 'seAlerts' && (() => {
                          const alerts = alertsByCustomer.get(customer.id) ?? [];
                          if (alerts.length === 0) return <span className="text-xs text-slate-300">—</span>;
                          const hasCritical = alerts.some(a => a.severity === 'critical');
                          const hasWarning  = alerts.some(a => a.severity === 'warning');
                          const colorClass  = hasCritical
                            ? 'bg-red-100 text-red-700 border-red-200'
                            : hasWarning
                            ? 'bg-amber-100 text-amber-700 border-amber-200'
                            : 'bg-blue-100 text-blue-700 border-blue-200';
                          return (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${colorClass}`}>
                              <AlertTriangle className="w-3 h-3" />
                              {alerts.length}
                            </span>
                          );
                        })()}
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-right">
                      <ChevronRight className="w-4 h-4 text-slate-300 ml-auto" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {sortedCustomers.length === 0 && (
          <div className="text-center py-12">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">No customers found</p>
            {activeFilterCount > 0 && (
              <button onClick={() => setColFilters({})} className="mt-2 text-sm text-orange-500 hover:text-orange-600">
                Clear column filters
              </button>
            )}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50">
            <span className="text-xs text-slate-500">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sortedCustomers.length)} of {sortedCustomers.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(1)}
                disabled={page === 1}
                className="px-2 py-1 text-xs rounded border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-30 cursor-pointer disabled:cursor-default"
              >«</button>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-2 py-1 text-xs rounded border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-30 cursor-pointer disabled:cursor-default"
              >‹</button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                const p = start + i;
                return p <= totalPages ? (
                  <button key={p} onClick={() => setPage(p)}
                    className={`px-2.5 py-1 text-xs rounded border cursor-pointer ${
                      p === page ? 'bg-orange-500 text-white border-orange-500' : 'border-slate-200 text-slate-600 hover:bg-white'
                    }`}>
                    {p}
                  </button>
                ) : null;
              })}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-2 py-1 text-xs rounded border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-30 cursor-pointer disabled:cursor-default"
              >›</button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={page === totalPages}
                className="px-2 py-1 text-xs rounded border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-30 cursor-pointer disabled:cursor-default"
              >»</button>
            </div>
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreateCustomerModal
          onClose={() => setShowCreateModal(false)}
          onCreate={onCreateCustomer}
          nextClientId={(() => {
            // Find highest US-XXXXX number across all customers
            let max = 15565;
            customers.forEach(c => {
              const m = c.clientId?.match(/^US-(\d+)$/);
              if (m) max = Math.max(max, parseInt(m[1], 10));
            });
            return `US-${max + 1}`;
          })()}
        />
      )}

      {/* Close col picker on outside click */}
      {showColPicker && (
        <div className="fixed inset-0 z-20" onClick={() => setShowColPicker(false)} />
      )}
    </div>
  );
};

// Split Panel Customer Detail Component
// ── Info Tooltip ──────────────────────────────────────────────────────────────
const InfoTooltip: React.FC<{ text: string }> = ({ text }) => {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className="w-4 h-4 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center hover:bg-orange-100 hover:text-orange-600 transition-colors cursor-pointer"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow(!show)}
      >
        <Info className="w-3 h-3" />
      </button>
      {show && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-800 text-white text-xs rounded-lg shadow-lg w-56 text-center">
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 bg-slate-800 rotate-45" />
        </div>
      )}
    </span>
  );
};

// ── Production Section ────────────────────────────────────────────────────────
const COST_PER_KWH = 0.16;

interface EnergyDataPoint {
  date: string;
  rawDate: string; // YYYY-MM-DD — used to merge UV data
  kWh: number;
  uv?: number;     // UV index max for that day
}

const ProductionSection: React.FC<{ customer: Customer }> = ({ customer }) => {
  const siteId = customer.solarEdgeSiteId;
  // Single period toggle drives BOTH widgets and graph
  const [graphPeriod, setGraphPeriod] = useState<'week' | 'month' | 'quarter' | 'year'>('month');
  // Cache energy+UV data per period — toggling tabs never re-fetches
  const [energyCache, setEnergyCache] = useState<Record<string, EnergyDataPoint[]>>({});
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');
  // Live data from SolarEdge API (overrides the 0-filled FL_SITES static data)
  const [siteOverview, setSiteOverview] = useState<{
    lifetimeKwh: number; yearKwh: number; monthKwh: number; todayKwh: number;
  } | null>(null);
  const [siteDetails, setSiteDetails] = useState<{ peakPower: number } | null>(null);
  const [reportNotes, setReportNotes] = useState('');
  const [sendingReport, setSendingReport] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const [showReportPreview, setShowReportPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewTrackingId, setPreviewTrackingId] = useState('');
  const [xeroInvoices, setXeroInvoices] = useState<any[]>([]);
  const [xeroLoading, setXeroLoading] = useState(false);
  const [xeroError, setXeroError] = useState('');

  const energyData = energyCache[graphPeriod] || [];

  // Find site data from FL_SITES or localStorage extras
  const siteData = React.useMemo(() => {
    const fromStatic = FL_SITES.find(s => s.siteId === siteId);
    if (fromStatic) return fromStatic;
    try {
      const raw = localStorage.getItem('solarflow_data');
      if (raw) {
        const state = JSON.parse(raw);
        const extras: SolarEdgeSite[] = state.solarEdgeExtraSites || [];
        return extras.find(s => s.siteId === siteId) || null;
      }
    } catch {}
    return null;
  }, [siteId]);

  // Helper: read SolarEdge API key from localStorage
  const getApiKey = () => {
    try {
      const raw = localStorage.getItem('solarflow_data');
      return raw ? JSON.parse(raw).solarEdgeConfig?.apiKey?.trim() : '';
    } catch { return ''; }
  };

  // Peak power — from live API or static FL_SITES
  const peakPowerKw = siteDetails?.peakPower || siteData?.peakPower || 0;
  const peakPowerWp = peakPowerKw * 1000;

  // Period kWh = sum of energy data already loaded for the selected period.
  // This drives ALL four widgets so everything stays in sync with the graph.
  const periodKwh = React.useMemo(() => {
    const pts = energyCache[graphPeriod] || [];
    return pts.reduce((s, p) => s + p.kWh, 0);
  }, [energyCache, graphPeriod]);

  // Fallback when graph data isn't loaded yet — use siteOverview bucket values
  const fallbackKwh = React.useMemo(() => {
    if (graphPeriod === 'year')    return siteOverview?.yearKwh  || 0;
    if (graphPeriod === 'month')   return siteOverview?.monthKwh || 0;
    if (graphPeriod === 'week')    return siteOverview?.todayKwh !== undefined ? 0 : 0; // no week bucket in overview
    return 0;
  }, [graphPeriod, siteOverview]);

  const displayKwh    = periodKwh > 0 ? periodKwh : fallbackKwh;
  const dollarsSaved  = displayKwh * COST_PER_KWH;
  const specificYield = peakPowerWp > 0 ? displayKwh / peakPowerWp : 0;
  const co2Tons       = (displayKwh * 0.42) / 1000;

  // Still need lifetime for the HTML report
  const lifetimeKwh = siteOverview?.lifetimeKwh || siteData?.lifetimeKwh || 0;

  // ── Fetch site overview + details (widgets) ───────────────────────────────
  useEffect(() => {
    if (!siteId) return;
    const apiKey = getApiKey();
    if (!apiKey) return;

    // Overview: lifetime / year / month / today kWh
    fetch(`/api/solaredge?path=/site/${siteId}/overview&api_key=${encodeURIComponent(apiKey)}`)
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (!json || json.error) return;
        const ov = json.overview;
        setSiteOverview({
          lifetimeKwh: (ov?.lifeTimeData?.energy   || 0) / 1000,
          yearKwh:     (ov?.lastYearData?.energy    || 0) / 1000,
          monthKwh:    (ov?.lastMonthData?.energy   || 0) / 1000,
          todayKwh:    (ov?.lastDayData?.energy     || 0) / 1000,
        });
      })
      .catch(() => {});

    // Details: peak power (kW)
    fetch(`/api/solaredge?path=/site/${siteId}/details&api_key=${encodeURIComponent(apiKey)}`)
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (!json || json.error) return;
        setSiteDetails({ peakPower: json.details?.peakPower || 0 });
      })
      .catch(() => {});
  }, [siteId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch UV index from Open-Meteo (free, no API key) ────────────────────
  // Merges UV data into cached energy points for the current period
  useEffect(() => {
    if (!siteId) return;
    const fetchUv = async () => {
      try {
        const now = new Date();
        let startDate: string;
        let baseUrl: string;

        if (graphPeriod === 'year') {
          // Archive API for historical yearly data
          const d = new Date(now); d.setFullYear(d.getFullYear() - 1);
          startDate = d.toISOString().slice(0, 10);
          const endDate = now.toISOString().slice(0, 10);
          baseUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=26.0&longitude=-80.2&start_date=${startDate}&end_date=${endDate}&daily=uv_index_max&timezone=America%2FNew_York`;
        } else {
          const pastDays = graphPeriod === 'quarter' ? 90 : graphPeriod === 'month' ? 30 : 7;
          baseUrl = `https://api.open-meteo.com/v1/forecast?latitude=26.0&longitude=-80.2&daily=uv_index_max&timezone=America%2FNew_York&past_days=${pastDays}&forecast_days=0`;
        }

        const resp = await fetch(baseUrl);
        if (!resp.ok) return;
        const json = await resp.json();
        const times: string[] = json.daily?.time || [];
        const uvs: number[]   = json.daily?.uv_index_max || [];
        // Build date → uv map
        const uvMap: Record<string, number> = {};
        times.forEach((t, i) => { uvMap[t] = uvs[i]; });

        // Merge into existing cached energy points
        setEnergyCache(prev => {
          const points = prev[graphPeriod];
          if (!points || points.length === 0) return prev;
          const merged = points.map(p => ({ ...p, uv: uvMap[p.rawDate] ?? p.uv }));
          return { ...prev, [graphPeriod]: merged };
        });
      } catch { /* UV is supplemental — silently skip on error */ }
    };
    fetchUv();
  }, [siteId, graphPeriod]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch energy time-series — skip if already cached ────────────────────
  useEffect(() => {
    if (!siteId) return;
    if (energyCache[graphPeriod]) return;
    const fetchEnergy = async () => {
      setLoading(true);
      setFetchError('');
      try {
        const apiKey = getApiKey();
        if (!apiKey) {
          setFetchError('No SolarEdge API key — add it in Settings → SolarEdge.');
          setLoading(false);
          return;
        }

        const now = new Date();
        let startDate: string;
        let timeUnit: string;
        if (graphPeriod === 'week') {
          const d = new Date(now); d.setDate(d.getDate() - 7);
          startDate = d.toISOString().slice(0, 10);
          timeUnit = 'DAY';
        } else if (graphPeriod === 'month') {
          const d = new Date(now); d.setDate(d.getDate() - 30);
          startDate = d.toISOString().slice(0, 10);
          timeUnit = 'DAY';
        } else if (graphPeriod === 'quarter') {
          const d = new Date(now); d.setMonth(d.getMonth() - 3);
          startDate = d.toISOString().slice(0, 10);
          timeUnit = 'WEEK';
        } else {
          const d = new Date(now); d.setFullYear(d.getFullYear() - 1);
          startDate = d.toISOString().slice(0, 10);
          timeUnit = 'MONTH';
        }
        const endDate = now.toISOString().slice(0, 10);

        const resp = await fetch(
          `/api/solaredge?path=/site/${siteId}/energy&startDate=${startDate}&endDate=${endDate}&timeUnit=${timeUnit}&api_key=${encodeURIComponent(apiKey)}`
        );
        if (resp.ok) {
          const json = await resp.json();
          if (json.error || json.message) {
            setFetchError(`SolarEdge: ${json.error || json.message}`);
          } else {
            const values = json.energy?.values || [];
            const points: EnergyDataPoint[] = values
              .filter((v: any) => v.value != null)
              .map((v: any) => {
                const raw = (v.date as string).slice(0, 10); // YYYY-MM-DD
                return {
                  rawDate: raw,
                  date: graphPeriod === 'year'
                    ? new Date(v.date).toLocaleDateString('en-US', { month: 'short' })
                    : graphPeriod === 'quarter'
                    ? new Date(v.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : graphPeriod === 'month'
                    ? new Date(v.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : new Date(v.date).toLocaleDateString('en-US', { weekday: 'short' }),
                  kWh: Math.round((v.value || 0) / 1000 * 100) / 100,
                };
              });
            setEnergyCache(prev => ({ ...prev, [graphPeriod]: points }));
          }
        } else {
          const body = await resp.json().catch(() => ({}));
          setFetchError(`API error ${resp.status}: ${body.error || 'check API key'}`);
        }
      } catch (err) {
        console.warn('Failed to fetch energy data:', err);
        setFetchError('Network error — check connection');
      }
      setLoading(false);
    };
    fetchEnergy();
  }, [siteId, graphPeriod]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch Xero invoices for this customer
  useEffect(() => {
    const fetchXeroInvoices = async () => {
      setXeroLoading(true);
      setXeroError('');
      try {
        const accessToken = localStorage.getItem('solarops_xero_access_token');
        const tenantId = localStorage.getItem('solarops_xero_tenant_id');
        if (!accessToken || !tenantId) {
          setXeroLoading(false);
          return;
        }
        const contactName = encodeURIComponent(customer.name);
        const resp = await fetch(
          `/api/xero-api/api.xro/2.0/Invoices?where=Contact.Name=="${contactName}"&Statuses=AUTHORISED,OVERDUE&order=DueDate`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'xero-tenant-id': tenantId,
              Accept: 'application/json',
            },
          }
        );
        if (resp.ok) {
          const data = await resp.json();
          setXeroInvoices(data.Invoices || []);
        } else {
          setXeroError('Could not fetch billing status');
        }
      } catch {
        setXeroError('Xero not connected');
      }
      setXeroLoading(false);
    };
    fetchXeroInvoices();
  }, [customer.name]);

  // Build the HTML report and open the preview modal
  const handleOpenPreview = () => {
    const tid = `prod-${customer.id}-${Date.now()}`;
    const trackingPixel = `https://solarflow-dashboard-sooty.vercel.app/api/track?event=open&id=${tid}`;
    const overdueInvs = xeroInvoices.filter(inv => inv.Status === 'OVERDUE');
    const hasOverdue = overdueInvs.length > 0;

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 16px; background: #f8fafc; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
    .header { background: linear-gradient(135deg, #f97316, #ea580c); padding: 32px 24px; text-align: center; color: white; }
    .header h1 { margin: 0 0 4px; font-size: 22px; }
    .header p { margin: 0; opacity: 0.9; font-size: 14px; }
    .body { padding: 24px; }
    .metric-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px; }
    .metric { background: #f8fafc; border-radius: 8px; padding: 16px; text-align: center; border: 1px solid #e2e8f0; }
    .metric .value { font-size: 24px; font-weight: 700; color: #0f172a; }
    .metric .label { font-size: 12px; color: #64748b; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
    .section { margin-bottom: 20px; }
    .section h3 { font-size: 14px; font-weight: 600; color: #334155; margin: 0 0 8px; border-bottom: 2px solid #f97316; padding-bottom: 4px; display: inline-block; }
    .section p { font-size: 14px; color: #475569; line-height: 1.6; margin: 0; }
    .alert-box { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; margin-bottom: 20px; }
    .alert-box p { color: #92400e; font-size: 13px; }
    .btn { display: inline-block; padding: 12px 24px; background: #f97316; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; }
    .footer { background: #f8fafc; padding: 20px 24px; text-align: center; border-top: 1px solid #e2e8f0; }
    .footer p { font-size: 11px; color: #94a3b8; margin: 0; }
    .green { color: #16a34a; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>☀️ Solar Production Report</h1>
      <p>${customer.name} — ${siteData?.siteName || 'SolarEdge System'}</p>
    </div>
    <div class="body">
      <div class="metric-grid">
        <div class="metric">
          <div class="value">${lifetimeKwh >= 1000 ? (lifetimeKwh / 1000).toFixed(1) + ' MWh' : lifetimeKwh.toFixed(0) + ' kWh'}</div>
          <div class="label">Lifetime Production</div>
        </div>
        <div class="metric">
          <div class="value green">$${dollarsSaved.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
          <div class="label">Estimated Savings</div>
        </div>
        <div class="metric">
          <div class="value">${specificYield.toFixed(2)}</div>
          <div class="label">Specific Yield (kWh/Wp)</div>
        </div>
        <div class="metric">
          <div class="value">${siteData?.peakPower?.toFixed(1) || (peakPowerKw > 0 ? peakPowerKw.toFixed(1) : '—')} kW</div>
          <div class="label">System Size</div>
        </div>
      </div>

      ${reportNotes ? `
      <div class="section">
        <h3>Notes from Your Service Team</h3>
        <p>${reportNotes.replace(/\n/g, '<br/>')}</p>
      </div>` : ''}

      ${hasOverdue ? `
      <div class="alert-box">
        <p><strong>⚠️ Friendly Reminder:</strong> We noticed an open balance on your account. To avoid any interruptions in service monitoring, please submit payment at your earliest convenience.</p>
        <p style="margin-top: 12px;">
          <a href="https://solarflow-dashboard-sooty.vercel.app/api/track?event=click&target=invoice&id=${tid}&redirect=${encodeURIComponent(overdueInvs[0]?.InvoiceID ? 'https://invoicing.xero.com/view/' + overdueInvs[0].InvoiceID : '#')}" class="btn" style="color: white;">View Invoice →</a>
        </p>
      </div>` : ''}

      <div class="section">
        <h3>System Details</h3>
        <p>
          Install Date: ${siteData?.installDate || 'N/A'}<br/>
          System Type: ${siteData?.systemType || 'SolarEdge'}<br/>
          Module: ${siteData?.module || 'N/A'}<br/>
          Site ID: ${siteId}
        </p>
      </div>
    </div>
    <div class="footer">
      <p>Powered by Conexsol — Your Solar Service Partner</p>
      <p style="margin-top: 8px;"><a href="https://solarflow-dashboard-sooty.vercel.app/api/track?event=click&target=website&id=${tid}&redirect=${encodeURIComponent('https://conexsol.us')}" style="color: #f97316; text-decoration: none;">conexsol.us</a></p>
    </div>
  </div>
  <img src="${trackingPixel}" width="1" height="1" alt="" style="display:none;" />
</body>
</html>`;

    setPreviewHtml(html);
    setPreviewTrackingId(tid);
    setShowReportPreview(true);
  };

  // Approve & Send — called from inside the preview modal
  const handleSendReport = async () => {
    if (!customer.email || !previewHtml) return;
    setSendingReport(true);
    try {
      const subject = encodeURIComponent(`Solar Production Report — ${customer.name}`);
      const bcc = encodeURIComponent('cesar.jurado@conexsol.us');
      localStorage.setItem(`solarops_report_${previewTrackingId}`, JSON.stringify({
        to: customer.email,
        bcc: 'cesar.jurado@conexsol.us',
        subject: `Solar Production Report — ${customer.name}`,
        html: previewHtml,
        trackingId: previewTrackingId,
        sentAt: new Date().toISOString(),
      }));
      window.open(
        `mailto:${customer.email}?subject=${subject}&bcc=${bcc}&body=${encodeURIComponent('Please view the attached HTML report for your solar production summary.\n\n— Conexsol Service Team')}`,
        '_blank'
      );
      setShowReportPreview(false);
      setReportSent(true);
      setTimeout(() => setReportSent(false), 4000);
    } catch (err) {
      console.error('Failed to send report:', err);
    }
    setSendingReport(false);
  };

  const overdueInvoices = xeroInvoices.filter(inv => inv.Status === 'OVERDUE');

  return (
    <div className="space-y-4">
      {/* ── Production Metrics ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-4 border border-amber-200">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
              {graphPeriod === 'week' ? '7-Day Production' : graphPeriod === 'month' ? '30-Day Production' : graphPeriod === 'quarter' ? '3-Month Production' : 'Annual Production'}
            </span>
            <InfoTooltip text="Total energy produced by this solar system for the selected time period, measured at the inverter level." />
          </div>
          <p className="text-2xl font-bold text-slate-900">
            {displayKwh > 0
              ? (displayKwh >= 1000 ? `${(displayKwh / 1000).toFixed(1)} MWh` : `${displayKwh.toFixed(0)} kWh`)
              : <span className="text-slate-400 text-lg">Loading…</span>}
          </p>
          <p className="text-xs text-amber-600 mt-1">
            {graphPeriod === 'week' ? 'Last 7 days' : graphPeriod === 'month' ? 'Last 30 days' : graphPeriod === 'quarter' ? 'Last 3 months' : 'Last 12 months'}
          </p>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-4 border border-green-200">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">$ Saved to Date</span>
            <InfoTooltip text={`Estimated savings based on $${COST_PER_KWH}/kWh average utility rate × lifetime production.`} />
          </div>
          <p className="text-2xl font-bold text-green-700">
            {dollarsSaved > 0
              ? `$${dollarsSaved.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
              : <span className="text-slate-400 text-lg">Loading…</span>}
          </p>
          <p className="text-xs text-green-600 mt-1">@ ${COST_PER_KWH}/kWh</p>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Specific Yield</span>
            <InfoTooltip text="Energy produced per watt of installed capacity (kWh/Wp). Think of it like MPG on a car — the higher the number, the more efficiently your system is turning sunlight into savings." />
          </div>
          <p className="text-2xl font-bold text-slate-900">
            {specificYield > 0 ? <>{specificYield.toFixed(2)} <span className="text-sm font-normal text-slate-500">kWh/Wp</span></> : <span className="text-slate-400 text-lg">—</span>}
          </p>
          <p className="text-xs text-blue-600 mt-1">System: {peakPowerKw > 0 ? `${peakPowerKw.toFixed(1)} kW` : '—'}</p>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-fuchsia-50 rounded-xl p-4 border border-purple-200">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-xs font-semibold text-purple-700 uppercase tracking-wide">CO₂ Offset</span>
            <InfoTooltip text="CO₂ offset estimate for the selected period based on 0.42 kg CO₂ per kWh (US average grid emission factor)." />
          </div>
          <p className="text-2xl font-bold text-slate-900">
            {co2Tons > 0
              ? <>{co2Tons.toFixed(2)} <span className="text-sm font-normal text-slate-500">tons CO₂</span></>
              : <span className="text-slate-400 text-lg">—</span>}
          </p>
          <p className="text-xs text-purple-600 mt-1 flex items-center gap-1"><Leaf className="w-3 h-3" /> Period offset</p>
        </div>
      </div>

      {/* ── Production Graph ──────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-orange-500" />
            Production History
            <InfoTooltip text="Energy production (bars) and daily UV index (line) over time. UV index gives an estimate of solar irradiance — higher UV generally means more production." />
          </h3>
          <div className="flex gap-1">
            {(['week', 'month', 'quarter', 'year'] as const).map(p => (
              <button
                key={p}
                onClick={() => setGraphPeriod(p)}
                className={`px-3 py-1 text-xs font-medium rounded-lg cursor-pointer transition-colors ${
                  graphPeriod === p
                    ? 'bg-orange-500 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {p === 'week' ? '7D' : p === 'month' ? '30D' : p === 'quarter' ? '3M' : '1Y'}
              </button>
            ))}
          </div>
        </div>
        <div className="h-56">
          {loading ? (
            <div className="h-full flex items-center justify-center gap-2 text-sm text-slate-400">
              <span className="animate-spin inline-block w-4 h-4 border-2 border-orange-300 border-t-orange-500 rounded-full" />
              Loading energy data…
            </div>
          ) : fetchError ? (
            <div className="h-full flex flex-col items-center justify-center gap-1 text-center px-4">
              <span className="text-sm font-medium text-red-500">⚠ {fetchError}</span>
            </div>
          ) : energyData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={energyData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                {/* Left axis: kWh production */}
                <YAxis
                  yAxisId="kwh"
                  tick={{ fontSize: 10 }}
                  stroke="#f97316"
                  unit=" kWh"
                  width={52}
                />
                {/* Right axis: UV index */}
                <YAxis
                  yAxisId="uv"
                  orientation="right"
                  domain={[0, 14]}
                  tick={{ fontSize: 10, fill: '#d97706' }}
                  stroke="#fbbf24"
                  unit=""
                  width={28}
                />
                <RechartsTooltip
                  contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  formatter={(value: number, name: string) =>
                    name === 'uv'
                      ? [`${value?.toFixed(1)}`, 'UV Index']
                      : [`${value?.toFixed(1)} kWh`, 'Production']
                  }
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                  formatter={(val: string) => val === 'uv' ? 'UV Index' : 'Production (kWh)'}
                />
                <Bar yAxisId="kwh" dataKey="kWh" fill="#f97316" opacity={0.85} radius={[3, 3, 0, 0]} name="kWh" />
                <Line
                  yAxisId="uv"
                  type="monotone"
                  dataKey="uv"
                  stroke="#fbbf24"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#f59e0b', stroke: '#d97706', strokeWidth: 1 }}
                  activeDot={{ r: 5, fill: '#f59e0b' }}
                  connectNulls
                  name="uv"
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-1 text-center px-4">
              <span className="text-sm text-slate-400">No production data returned for this period.</span>
              <span className="text-xs text-slate-300">Verify the SolarEdge API key is active in Settings.</span>
            </div>
          )}
        </div>
        {/* Quick stats row — reference values from live API */}
        {(siteOverview || siteData) && (
          <div className="flex gap-4 mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
            <span>Today: <strong className="text-slate-700">{(siteOverview?.todayKwh ?? siteData?.todayKwh ?? 0).toFixed(1)} kWh</strong></span>
            <span>This Month: <strong className="text-slate-700">{(siteOverview?.monthKwh ?? siteData?.monthKwh ?? 0).toFixed(1)} kWh</strong></span>
            <span>Lifetime: <strong className="text-slate-700">{lifetimeKwh >= 1000 ? `${(lifetimeKwh / 1000).toFixed(1)} MWh` : `${lifetimeKwh.toFixed(0)} kWh`}</strong></span>
          </div>
        )}
      </div>

      {/* ── Xero Billing Status ───────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-orange-500" />
          Billing Status
          <InfoTooltip text="Live billing status from Xero. Shows overdue or open invoices for this customer." />
        </h3>
        {xeroLoading ? (
          <p className="text-sm text-slate-400">Checking Xero…</p>
        ) : xeroError ? (
          <p className="text-sm text-slate-400">{xeroError}</p>
        ) : overdueInvoices.length > 0 ? (
          <div className="space-y-2">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-sm text-amber-800 font-medium">
                ⚠️ {overdueInvoices.length} overdue invoice{overdueInvoices.length > 1 ? 's' : ''}
              </p>
              <p className="text-xs text-amber-600 mt-1">
                Friendly reminder will be included in the production report.
              </p>
            </div>
            {overdueInvoices.map((inv: any) => (
              <div key={inv.InvoiceID} className="flex items-center justify-between bg-slate-50 rounded-lg p-3">
                <div>
                  <p className="text-sm font-medium text-slate-700">{inv.InvoiceNumber}</p>
                  <p className="text-xs text-slate-500">Due: {new Date(inv.DueDate).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-red-600">${inv.AmountDue?.toFixed(2)}</span>
                  <a
                    href={`https://invoicing.xero.com/view/${inv.InvoiceID}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg hover:bg-slate-200 transition-colors"
                    title="View in Xero"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        ) : xeroInvoices.length > 0 ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-sm text-green-700 font-medium flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4" /> All invoices current
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate-400">No invoices found for this customer in Xero.</p>
        )}
      </div>

      {/* ── Report Notes ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h3 className="font-semibold text-slate-900 mb-2 flex items-center gap-2">
          <FileBarChart className="w-4 h-4 text-orange-500" />
          Client Report Notes
          <InfoTooltip text="Add personalized notes that will be included in the HTML production report sent to the client." />
        </h3>
        <textarea
          value={reportNotes}
          onChange={(e) => setReportNotes(e.target.value)}
          placeholder="Add notes for the client report (e.g., system performance observations, maintenance recommendations)…"
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-orange-300 resize-y"
        />
      </div>

      {/* ── Report Preview Button ──────────────────────────────────── */}
      <div className="flex gap-2">
        <button
          onClick={handleOpenPreview}
          disabled={!customer.email}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-colors cursor-pointer ${
            reportSent
              ? 'bg-green-500 text-white'
              : !customer.email
              ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
              : 'bg-orange-500 text-white hover:bg-orange-600'
          }`}
        >
          {reportSent ? (
            <><CheckCircle className="w-4 h-4" /> Report Sent!</>
          ) : (
            <><Eye className="w-4 h-4" /> Report Preview</>
          )}
        </button>
        <a
          href={`https://monitoring.solaredge.com/one#/residential/dashboard?siteId=${siteId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-4 py-3 bg-slate-100 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-200 transition-colors"
        >
          <Sun className="w-4 h-4" />
          SolarEdge
        </a>
      </div>
      {!customer.email && (
        <p className="text-xs text-amber-600 text-center">Add an email address to this customer to send reports.</p>
      )}

      {/* ── Report Preview Modal ───────────────────────────────────── */}
      {showReportPreview && (
        <div
          className="fixed inset-0 z-[200] bg-black/70 flex items-start justify-center p-4 overflow-y-auto"
          onClick={() => setShowReportPreview(false)}
        >
          <div
            className="bg-white w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl flex flex-col my-auto"
            style={{ minHeight: '80vh', maxHeight: '92vh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-900 text-white flex-shrink-0">
              <div className="flex items-center gap-2">
                <FileBarChart className="w-4 h-4 text-orange-400" />
                <span className="font-semibold text-sm">Report Preview</span>
                <span className="text-xs text-slate-400">— exactly as the client will see it</span>
              </div>
              <button
                onClick={() => setShowReportPreview(false)}
                className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* iframe renders the exact HTML email */}
            <div className="flex-1 overflow-hidden">
              <iframe
                srcDoc={previewHtml}
                className="w-full h-full border-0"
                title="Report Preview"
                sandbox="allow-same-origin"
                style={{ minHeight: 'calc(80vh - 112px)' }}
              />
            </div>

            {/* Footer: recipient info + actions */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50 flex-shrink-0">
              <p className="text-xs text-slate-500">
                To: <strong className="text-slate-700">{customer.email}</strong>
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowReportPreview(false)}
                  className="px-4 py-2 text-sm text-slate-600 bg-slate-200 hover:bg-slate-300 rounded-lg font-medium transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendReport}
                  disabled={sendingReport}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-orange-500 hover:bg-orange-600 rounded-lg font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {sendingReport
                    ? 'Sending…'
                    : <><Send className="w-3.5 h-3.5" /> Approve &amp; Send</>
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface CustomerDetailPanelProps {
  customer: Customer;
  allCustomers: Customer[];
  jobs: Job[];
  allJobs: Job[];
  users: User[];
  contractors?: import('../types/contractor').Contractor[];
  currentUser: User | null;
  onClose: () => void;
  onEdit: () => void;
  onCloseEdit: () => void;
  showEditModal: boolean;
  onUpdateCustomer: (customer: Customer) => void;
  onDeleteCustomer: (customerId: string) => void;
  onMergeCustomers: (primaryId: string, secondaryId: string, resolvedFields?: Partial<Customer>) => void;
  onCreateJob: (job: Partial<Job>) => void;
  onUpdateJob?: (job: Job) => void;
  onDeleteJob?: (jobId: string) => void;
  onDispatch?: (job: import('../types/contractor').ContractorJob) => void;
}

// Format raw status strings into readable labels
const formatStatus = (status: string): string => {
  const map: Record<string, string> = {
    new: 'New',
    assigned: 'Assigned',
    in_progress: 'In Progress',
    completed: 'Completed',
    invoiced: 'Invoiced',
    paid: 'Paid',
    cancelled: 'Cancelled',
    on_hold: 'On Hold',
  };
  return map[status] ?? status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};

const formatActivityType = (type: string): string =>
  type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const CustomerDetailPanel: React.FC<CustomerDetailPanelProps> = ({
  customer,
  allCustomers,
  jobs,
  allJobs,
  users,
  contractors = [],
  currentUser,
  onClose,
  onEdit,
  onCloseEdit,
  showEditModal,
  onDeleteCustomer,
  onMergeCustomers,
  onUpdateCustomer,
  onCreateJob,
  onUpdateJob,
  onDeleteJob,
  onDispatch,
}) => {
  const [activeTab, setActiveTab] = useState<'story' | 'jobs' | 'files' | 'activity' | 'production'>('story');
  const [editingJob, setEditingJob] = useState<Job | null>(null);

  // SolarEdge alerts for this customer
  const customerAlerts = React.useMemo(() =>
    loadAlerts().filter(a => a.customerId === customer.id && !a.resolved),
  [customer.id]);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeSearch, setMergeSearch] = useState('');
  const [mergeTarget, setMergeTarget] = useState<Customer | null>(null);
  const [primaryId, setPrimaryId] = useState<string>(customer.id);
  const [conflictChoices, setConflictChoices] = useState<Record<string, 'primary' | 'secondary'>>({});

  // Reset conflict choices when merge target or primary changes
  React.useEffect(() => {
    setConflictChoices({});
  }, [mergeTarget?.id, primaryId]);
  const [notes, setNotes] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const [mentionQuery, setMentionQuery] = useState('');
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const [showCreateWorkOrder, setShowCreateWorkOrder] = useState(false);
  const [showSendMessage, setShowSendMessage] = useState(false);
  const [deleteStep, setDeleteStep] = useState(0);

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
  const filteredServiceRates = liveServiceRates.filter(rate =>
    rate.serviceName.toLowerCase().includes(serviceSearch.toLowerCase()) ||
    rate.serviceCode.toLowerCase().includes(serviceSearch.toLowerCase())
  );

  // Handle service selection — uses clientRateStandard (Client $) as base rate
  const handleServiceSelect = (rate: ServiceRate) => {
    const clientRate = rate.clientRateStandard ?? rate.rate ?? 0;
    setWorkOrderForm({
      ...workOrderForm,
      serviceRateId: rate.id,
      title: rate.serviceName,
      baseRate: clientRate,
      total: clientRate + workOrderForm.additionalAmount,
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

  // Parse @mentions from note text and resolve to user IDs
  // Resolve @username or @Name mentions → user IDs
  const parseMentions = (text: string): string[] => {
    const mentioned: string[] = [];
    // Match @word (username) or @First Last style — stop at whitespace-then-non-word or end
    const matches = text.match(/@([\w.]+)/g) || [];
    matches.forEach(m => {
      const handle = m.slice(1).trim().toLowerCase();
      // Try matching by username first, then by name (first word match)
      const user = users.find(u =>
        (u.username && u.username.toLowerCase() === handle) ||
        u.name.toLowerCase().replace(/\s+/g, '') === handle ||
        u.name.toLowerCase() === handle
      );
      if (user && !mentioned.includes(user.id)) mentioned.push(user.id);
    });
    return mentioned;
  };

  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setNotes(val);
    const cursor = e.target.selectionStart ?? val.length;
    const textBefore = val.slice(0, cursor);
    const atMatch = textBefore.match(/@(\w*)$/);
    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setMentionStartIndex(cursor - atMatch[0].length);
      setShowMentionDropdown(true);
    } else {
      setShowMentionDropdown(false);
    }
  };

  // Insert @username when a user is selected from the dropdown
  const handleMentionSelect = (user: User) => {
    const before = notes.slice(0, mentionStartIndex);
    const after = notes.slice(textareaRef.current?.selectionStart ?? notes.length);
    const handle = user.username?.trim() || user.name.replace(/\s+/g, '').toLowerCase();
    const inserted = `@${handle} `;
    setNotes(before + inserted + after);
    setShowMentionDropdown(false);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const filteredMentionUsers = mentionQuery
    ? users.filter(u => {
        const q = mentionQuery.toLowerCase();
        return (
          (u.username && u.username.toLowerCase().startsWith(q)) ||
          u.name.toLowerCase().startsWith(q)
        );
      })
    : users;

  const handleSaveNote = () => {
    if (!notes.trim()) return;
    const mentionedIds = parseMentions(notes);
    const noteText = notes.trim();
    const newActivity: Activity = {
      id: `activity-${Date.now()}`,
      type: 'note_added',
      description: noteText,
      timestamp: new Date().toISOString(),
      userId: currentUser?.id,
      userName: currentUser?.name,
      mentions: mentionedIds.length > 0 ? mentionedIds : undefined,
    };
    const activityHistory = customer.activityHistory || [];
    onUpdateCustomer({
      ...customer,
      activityHistory: [newActivity, ...activityHistory],
    });
    setNotes('');
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 2000);

    // Fire @mention notifications (async, non-blocking)
    if (mentionedIds.length > 0) {
      import('../lib/supabase').then(({ supabase }) => {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (!session?.access_token) return;
          fetch('/api/notify', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              mentionedUserIds: mentionedIds,
              notifierName: currentUser?.name || 'A teammate',
              customerName: customer.name,
              customerId: customer.id,
              message: noteText,
            }),
          }).catch(() => {});
        });
      });
    }
  };

  const handleSaveEdit = () => {
    const changes: string[] = [];

    const fieldLabel: Record<string, string> = {
      name: 'Name', email: 'Email', phone: 'Phone',
      address: 'Address', city: 'City', state: 'State', zip: 'ZIP',
      type: 'Type', category: 'Category', clientStatus: 'Status',
      systemType: 'System Type', referralSource: 'Referral Source',
      isPowerCare: 'PowerCare', clientId: 'Client ID',
    };

    for (const [key, label] of Object.entries(fieldLabel)) {
      const oldVal = (customer as any)[key] ?? '';
      const newVal = (editForm as any)[key] ?? '';
      if (String(oldVal) !== String(newVal)) {
        changes.push(`${label}: "${oldVal || '—'}" → "${newVal || '—'}"`);
      }
    }

    // Notes change: log as note_added
    const originalNotes = customer.notes || '';
    const newNotes = editForm.notes || '';
    const notesChanged = newNotes !== originalNotes && newNotes.trim() !== '';

    const activityHistory = customer.activityHistory || [];
    const newEntries: Activity[] = [];

    if (changes.length > 0) {
      newEntries.push({
        id: `activity-${Date.now()}`,
        type: notesChanged && changes.length === 1 && changes[0].startsWith('Notes') ? 'note_added' : 'info_updated',
        description: `Updated: ${changes.join('; ')}`,
        timestamp: new Date().toISOString(),
        userId: currentUser?.id,
        userName: currentUser?.name,
      });
    }

    if (notesChanged) {
      newEntries.push({
        id: `activity-${Date.now() + 1}`,
        type: 'note_added',
        description: newNotes,
        timestamp: new Date().toISOString(),
        userId: currentUser?.id,
        userName: currentUser?.name,
      });
    }

    onUpdateCustomer({
      ...editForm,
      activityHistory: newEntries.length > 0 ? [...newEntries, ...activityHistory] : activityHistory,
    });
    onCloseEdit();
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
    <div className="flex flex-col md:flex-row md:h-[calc(100vh-80px)]">
      {/* Left Panel - Story & Details (60%) */}
      <div className="flex flex-col md:flex-1 border-r border-slate-200 bg-white md:overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-4 p-4 border-b border-slate-200">
          <button
            onClick={onClose}
            className="p-3 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div className="flex-1 min-w-0">
            {customer.clientId && (
              <p className="text-xs font-mono font-semibold text-orange-600 uppercase tracking-wide mb-0.5">
                {customer.clientId}
              </p>
            )}
            <h2 className="text-xl font-bold text-slate-900 leading-tight">{customer.name}</h2>
            <p className="text-sm text-slate-500 capitalize">{customer.type} Customer</p>
          </div>
          <button
            onClick={onEdit}
            className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-200 cursor-pointer transition-colors"
          >
            <Edit className="w-4 h-4" />
            Edit
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => setActiveTab('story')}
            className={`flex-1 py-3 text-sm font-medium border-b-2 cursor-pointer transition-colors ${
              activeTab === 'story'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Customer Story
          </button>
          <button
            onClick={() => setActiveTab('jobs')}
            className={`flex-1 py-3 text-sm font-medium border-b-2 cursor-pointer transition-colors ${
              activeTab === 'jobs'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Work Orders ({jobs.length})
          </button>
          <button
            onClick={() => setActiveTab('files')}
            className={`flex-1 py-3 text-sm font-medium border-b-2 cursor-pointer transition-colors ${
              activeTab === 'files'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Files &amp; Photos
          </button>
          <button
            onClick={() => setActiveTab('activity')}
            className={`flex-1 py-3 text-sm font-medium border-b-2 cursor-pointer transition-colors ${
              activeTab === 'activity'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Activity
          </button>
          {customer.solarEdgeSiteId && (
            <button
              onClick={() => setActiveTab('production')}
              className={`flex-1 py-3 text-sm font-medium border-b-2 cursor-pointer transition-colors ${
                activeTab === 'production'
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Production
            </button>
          )}
        </div>

        {/* Content */}
        <div className="md:flex-1 md:overflow-y-auto p-4">
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
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                    <Edit className="w-4 h-4 text-orange-500" />
                    Notes
                  </h3>
                  <button
                    onClick={() => setActiveTab('files')}
                    title="Add files & photos"
                    className="flex items-center gap-1 text-xs text-slate-500 hover:text-orange-500 transition-colors cursor-pointer"
                  >
                    <Paperclip className="w-4 h-4" />
                    Add Files
                  </button>
                </div>
                <div className="relative">
                  <textarea
                    ref={textareaRef}
                    value={notes}
                    onChange={handleNotesChange}
                    onKeyDown={(e) => {
                      if (showMentionDropdown && e.key === 'Escape') {
                        setShowMentionDropdown(false);
                      }
                    }}
                    placeholder="Add notes… type @ to mention a teammate"
                    className="w-full p-3 border border-slate-200 rounded-lg text-sm min-h-[100px] focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                  {/* @ Mention dropdown */}
                  {showMentionDropdown && filteredMentionUsers.length > 0 && (
                    <div className="absolute left-0 bottom-full mb-1 w-64 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
                      <p className="text-[10px] text-slate-400 px-3 pt-2 pb-1 uppercase tracking-wide font-medium">Mention a teammate</p>
                      {filteredMentionUsers.map(u => {
                        const handle = u.username?.trim() || u.name.replace(/\s+/g, '').toLowerCase();
                        return (
                          <button
                            key={u.id}
                            onMouseDown={(e) => { e.preventDefault(); handleMentionSelect(u); }}
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-orange-50 text-left text-sm"
                          >
                            <div className="w-7 h-7 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold shrink-0">
                              {u.name.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-slate-800 text-sm truncate">{u.name}</div>
                              <div className="text-xs text-orange-500 font-mono">@{handle}</div>
                            </div>
                            <span className="text-xs text-slate-400 capitalize shrink-0">{u.role}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-slate-400">Type @ to mention a teammate</p>
                  <button
                    onClick={handleSaveNote}
                    disabled={!notes.trim()}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      noteSaved
                        ? 'bg-green-500 text-white'
                        : 'bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed'
                    }`}
                  >
                    <Save className="w-3.5 h-3.5" />
                    {noteSaved ? 'Saved!' : 'Save Note'}
                  </button>
                </div>
              </div>

              {/* Activity Timeline */}
              <div className="bg-slate-50 rounded-lg p-4">
                <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-orange-500" />
                  Activity Timeline
                </h3>
                <div className="space-y-3">
                  {/* activityHistory entries */}
                  {(customer.activityHistory || []).map((activity) => (
                    <div key={activity.id} className="flex gap-3">
                      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                        activity.type === 'note_added' ? 'bg-blue-500'
                        : activity.type === 'job_updated' ? 'bg-amber-500'
                        : activity.type === 'job_created' ? 'bg-green-500'
                        : 'bg-orange-500'
                      }`} />
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          {formatActivityType(activity.type)}
                        </p>
                        <p className="text-xs text-slate-600 line-clamp-2">
                          {activity.description.split(/(@\S+)/g).map((part, i) =>
                            part.startsWith('@')
                              ? <span key={i} className="text-orange-600 font-medium">{part}</span>
                              : part
                          )}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {activity.userName && (
                            <span className="text-xs text-slate-400">by {activity.userName}</span>
                          )}
                          <span className="text-xs text-slate-400">
                            {new Date(activity.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {/* Work orders */}
                  {jobs.slice(0, 3).map((job) => (
                    <div key={job.id} className="flex gap-3">
                      <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-slate-900">{job.serviceType} Work Order</p>
                        <p className="text-xs text-slate-500">{formatStatus(job.status)} · {job.scheduledDate?.split('T')[0] ?? job.scheduledDate}</p>
                      </div>
                    </div>
                  ))}
                  {/* Customer created (always last) */}
                  <div className="flex gap-3">
                    <div className="w-2 h-2 rounded-full bg-slate-400 mt-1.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-slate-900">Customer Created</p>
                      <p className="text-xs text-slate-500">
                        {customer.createdAt ? new Date(customer.createdAt).toLocaleDateString() : 'Unknown'}
                      </p>
                    </div>
                  </div>
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
                      <p className="font-medium text-slate-900">{job.title || job.serviceType}</p>
                      <p className="text-xs text-slate-500">{job.scheduledDate?.split('T')[0] ?? job.scheduledDate}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                        job.status === 'completed' || job.status === 'paid'
                          ? 'bg-green-100 text-green-700'
                          : job.status === 'new' || job.status === 'assigned'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-slate-100 text-slate-700'
                      }`}>
                        {formatStatus(job.status)}
                      </span>
                      <button
                        onClick={() => setEditingJob(job)}
                        className="p-1.5 text-slate-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-colors"
                        title="Edit work order"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
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
                <button className="mt-3 w-full py-2 border-2 border-dashed border-slate-300 rounded-lg text-slate-500 text-sm hover:border-orange-500 hover:text-orange-500 cursor-pointer transition-colors">
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
                          <span className="text-xs font-medium text-orange-600">
                            {formatActivityType(activity.type)}
                          </span>
                          <span className="text-xs text-slate-400">
                            {new Date(activity.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
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

          {activeTab === 'production' && customer.solarEdgeSiteId && (
            <ProductionSection customer={customer} />
          )}
        </div>
      </div>

      {/* Right Panel - Contact Info (40%) */}
      <div className="w-full md:w-[400px] bg-slate-50 p-4 md:overflow-y-auto border-t md:border-t-0 border-slate-200">
        <h3 className="font-semibold text-slate-900 mb-4">Contact Information</h3>

        {/* Contact Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
                customer.type === 'commercial' ? 'bg-purple-100' : 'bg-blue-100'
              }`}>
                {customer.type === 'commercial' ? (
                  <Building className="w-6 h-6 text-purple-600" />
                ) : (
                  <Home className="w-6 h-6 text-blue-600" />
                )}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-slate-900 truncate">{customer.name}</p>
                <p className="text-xs text-slate-500 capitalize">{customer.type}</p>
              </div>
            </div>
            {/* SolarEdge alert badge — top right of card */}
            {customerAlerts.length > 0 && (() => {
              const hasCritical = customerAlerts.some(a => a.severity === 'critical');
              const hasWarning  = customerAlerts.some(a => a.severity === 'warning');
              return (
                <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold border shrink-0 ${
                  hasCritical
                    ? 'bg-red-100 text-red-700 border-red-300'
                    : hasWarning
                    ? 'bg-amber-100 text-amber-700 border-amber-300'
                    : 'bg-blue-100 text-blue-700 border-blue-300'
                }`}>
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>{customerAlerts.length} Alert{customerAlerts.length > 1 ? 's' : ''}</span>
                </div>
              );
            })()}
          </div>

          <div className="space-y-3 pt-3 border-t border-slate-100">
            {customer.phone ? (
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <PhoneLink phone={customer.phone} size="md" />
              </div>
            ) : (
              <span className="flex items-center gap-3 text-sm text-slate-500 italic">
                <Phone className="w-4 h-4" />
                No phone on file
              </span>
            )}
            {customer.email ? (
              <a href={`mailto:${customer.email}`} className="flex items-center gap-3 text-sm text-slate-600 hover:text-orange-500">
                <Mail className="w-4 h-4" />
                {customer.email}
              </a>
            ) : (
              <span className="flex items-center gap-3 text-sm text-slate-500 italic">
                <Mail className="w-4 h-4" />
                No email on file
              </span>
            )}
            <AddressLink
              address={customer.address}
              city={customer.city}
              state={customer.state}
              zip={customer.zip}
            />

            {/* System Info */}
            <div className="mt-3 flex flex-wrap gap-2">
              {customer.category && (
                <CategoryBadge category={customer.category} />
              )}
              {customer.systemType && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                  {customer.systemType}
                </span>
              )}
              {customer.solarEdgeSiteId && (
                <a
                  href={`https://monitoring.solaredge.com/one#/residential/dashboard?siteId=${customer.solarEdgeSiteId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors cursor-pointer"
                  title="Open in SolarEdge Monitoring"
                >
                  SolarEdge ID: {customer.solarEdgeSiteId}
                </a>
              )}
              {customer.clientStatus && (
                <StatusBadge status={customer.clientStatus} />
              )}
            </div>
          </div>

          {/* PowerCare Details */}
          {customer.isPowerCare && (customer.powerCareCaseNumber || customer.powerCareTrackingNumber) && (
            <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
              <p className="text-xs font-semibold text-teal-600 uppercase tracking-wide">PowerCare Program</p>
              {customer.powerCareCaseNumber && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-slate-500 text-xs w-20 shrink-0">Case #</span>
                  <span className="font-mono text-slate-700">{customer.powerCareCaseNumber}</span>
                </div>
              )}
              {customer.powerCareTrackingNumber && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-slate-500 text-xs w-20 shrink-0">Tracking #</span>
                  <span className="font-mono text-slate-700 text-xs break-all">{customer.powerCareTrackingNumber}</span>
                </div>
              )}
            </div>
          )}

          {/* SolarEdge Active Alerts */}
          {customerAlerts.length > 0 && (
            <div className="pt-3 border-t border-slate-100 space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                Active SolarEdge Alerts
              </p>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {customerAlerts.map(alert => (
                  <div
                    key={alert.id}
                    className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-xs ${
                      alert.severity === 'critical'
                        ? 'bg-red-50 border-red-200 text-red-800'
                        : alert.severity === 'warning'
                        ? 'bg-amber-50 border-amber-200 text-amber-800'
                        : 'bg-blue-50 border-blue-200 text-blue-800'
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-semibold leading-tight truncate">{alert.title}</p>
                      <p className="text-[10px] opacity-75 mt-0.5">
                        {new Date(alert.occurredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <span className={`ml-auto shrink-0 uppercase font-bold text-[10px] tracking-wide px-1.5 py-0.5 rounded ${
                      alert.severity === 'critical'
                        ? 'bg-red-200 text-red-700'
                        : alert.severity === 'warning'
                        ? 'bg-amber-200 text-amber-700'
                        : 'bg-blue-200 text-blue-700'
                    }`}>
                      {alert.severity}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Map — opens Google Maps */}
          {customer.address && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${customer.address}, ${customer.city}, ${customer.state} ${customer.zip}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-28 bg-slate-100 rounded-xl items-center justify-center gap-3 group hover:bg-orange-50 transition-colors cursor-pointer border border-slate-200"
              title="Open in Google Maps"
            >
              <div className="flex flex-col items-center gap-1.5">
                <MapPin className="w-6 h-6 text-slate-400 group-hover:text-orange-500 transition-colors" />
                <span className="text-xs text-slate-500 group-hover:text-orange-600 transition-colors font-medium">
                  Open in Google Maps
                </span>
                <span className="text-[11px] text-slate-400 group-hover:text-orange-400 text-center px-4 truncate max-w-[180px]">
                  {customer.address}, {customer.city}
                </span>
              </div>
            </a>
          )}
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
            className="w-full py-2.5 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 cursor-pointer transition-colors"
          >
            Create Work Order
          </button>
          <button
            onClick={() => setShowSendMessage(true)}
            className="w-full py-2.5 border border-slate-200 text-slate-600 rounded-lg font-medium hover:bg-slate-50 cursor-pointer transition-colors"
          >
            Send Message
          </button>
        </div>
      </div>

      {/* Edit Customer Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Modal header with Client ID (left) and Status (right) */}
            <div className="p-4 border-b border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-bold text-slate-900">Edit Customer</h2>
                <button onClick={onCloseEdit} className="p-2 hover:bg-slate-100 rounded-lg cursor-pointer">
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-orange-600 uppercase tracking-wide mb-1">Client Number</label>
                  <input
                    type="text"
                    value={editForm.clientId || ''}
                    onChange={(e) => setEditForm({ ...editForm, clientId: e.target.value })}
                    placeholder="e.g. US-15015"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Client Status</label>
                  <select
                    value={editForm.clientStatus || ''}
                    onChange={(e) => setEditForm({ ...editForm, clientStatus: e.target.value as ClientStatus || undefined })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
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
              </div>
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
                <AddressAutocomplete
                  value={editForm.address}
                  onChange={(val) => setEditForm({ ...editForm, address: val })}
                  onAddressSelect={(result) => setEditForm(prev => ({
                    ...prev,
                    address: result.address || prev.address,
                    city: result.city || prev.city,
                    state: result.state || prev.state,
                    zip: result.zip || prev.zip,
                  }))}
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
                <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                <select
                  value={editForm.category || ''}
                  onChange={(e) => setEditForm({ ...editForm, category: e.target.value as CustomerCategory || undefined })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                >
                  <option value="">Select category...</option>
                  <option value="O&M">O&amp;M</option>
                  <option value="New Install">New Install</option>
                  <option value="Prospect">Prospect</option>
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
                <label className="block text-sm font-medium text-slate-700 mb-1">How They Found Us</label>
                <ReferralCombobox
                  value={editForm.referralSource || ''}
                  onChange={(val) => setEditForm({ ...editForm, referralSource: val })}
                />
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
              {/* Danger zone — golden ratio split: merge (61.8%) | delete (38.2%) */}
              <div className="pt-3 border-t border-slate-100">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2 text-center">Danger Zone</p>
                <div className="flex gap-2" style={{ '--phi': '1.618' } as React.CSSProperties}>
                  <button
                    onClick={() => { onCloseEdit(); setTimeout(() => setShowMergeModal(true), 150); }}
                    className="flex items-center justify-center gap-1.5 py-2.5 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg text-sm font-medium hover:bg-amber-100 transition-colors cursor-pointer"
                    style={{ flex: '1.618' }}
                  >
                    <GitMerge className="w-4 h-4" />
                    Merge Accounts
                  </button>
                  {deleteStep === 0 ? (
                    <button
                      onClick={() => setDeleteStep(1)}
                      className="flex items-center justify-center gap-1.5 py-2.5 text-red-600 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors cursor-pointer"
                      style={{ flex: '1' }}
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5 px-2 py-1.5 bg-red-50 border border-red-300 rounded-lg" style={{ flex: '1' }}>
                      <span className="text-xs text-red-700 font-medium flex-1">Sure?</span>
                      <button
                        onClick={() => { onDeleteCustomer(customer.id); onCloseEdit(); }}
                        className="px-2 py-1 bg-red-600 text-white text-xs font-semibold rounded cursor-pointer hover:bg-red-700"
                      >Yes</button>
                      <button
                        onClick={() => setDeleteStep(0)}
                        className="px-2 py-1 bg-slate-200 text-slate-700 text-xs font-semibold rounded cursor-pointer hover:bg-slate-300"
                      >No</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Merge Accounts Modal ────────────────────────────────────────── */}
      {showMergeModal && (() => {
        // φ = 1.618 — used for flex ratios and spacing rhythm
        const secondary = mergeTarget;
        const otherCustomer = primaryId === customer.id ? secondary : customer;
        const primaryCustomer = primaryId === customer.id ? customer : secondary;

        // Fields to check for conflicts
        const MERGE_FIELDS: Array<{ key: keyof Customer; label: string }> = [
          { key: 'email', label: 'Email' },
          { key: 'phone', label: 'Phone' },
          { key: 'address', label: 'Address' },
          { key: 'city', label: 'City / State' },
          { key: 'zip', label: 'ZIP' },
          { key: 'notes', label: 'Notes' },
          { key: 'referralSource', label: 'How Found Us' },
          { key: 'solarEdgeSiteId', label: 'SolarEdge Site ID' },
          { key: 'systemType', label: 'System Type' },
          { key: 'clientStatus', label: 'Client Status' },
          { key: 'category', label: 'Category' },
        ];

        const conflicts = primaryCustomer && otherCustomer
          ? MERGE_FIELDS.filter(f => {
              const aVal = primaryCustomer[f.key];
              const bVal = otherCustomer[f.key];
              return aVal && bVal && String(aVal).trim() !== String(bVal).trim();
            })
          : [];

        const unresolvedConflicts = conflicts.filter(f => !conflictChoices[f.key as string]);

        const mergeResults = mergeSearch.trim().length >= 1
          ? allCustomers.filter(c =>
              c.id !== customer.id &&
              (c.name.toLowerCase().includes(mergeSearch.toLowerCase()) ||
               (c.clientId || '').toLowerCase().includes(mergeSearch.toLowerCase()) ||
               (c.address || '').toLowerCase().includes(mergeSearch.toLowerCase()))
            ).slice(0, 8)
          : [];

        const woCount = (cId: string) => allJobs.filter(j => j.customerId === cId).length;

        const MergeCard: React.FC<{ c: Customer; badge: 'primary' | 'secondary'; onSwap: () => void }> = ({ c, badge, onSwap }) => (
          <div className={`rounded-xl border-2 p-4 transition-all ${badge === 'primary' ? 'border-orange-400 bg-orange-50/40' : 'border-slate-200 bg-slate-50/60'}`}>
            <div className="flex items-start justify-between mb-3">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${badge === 'primary' ? 'bg-orange-100 text-orange-700' : 'bg-slate-200 text-slate-500'}`}>
                {badge === 'primary' ? <><Crown className="w-2.5 h-2.5" /> Keep</> : 'Absorb'}
              </span>
              {badge === 'secondary' && (
                <button onClick={onSwap} className="text-[10px] text-orange-600 hover:underline cursor-pointer font-medium">
                  Make Primary
                </button>
              )}
            </div>
            {c.clientId && (
              <p className="text-[11px] font-mono font-bold text-orange-600 mb-0.5">{c.clientId}</p>
            )}
            <p className="font-semibold text-slate-900 text-sm leading-snug mb-2">{c.name}</p>
            <div className="space-y-1 text-xs text-slate-500">
              {c.clientStatus && (
                <p className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-teal-400 inline-block" />{c.clientStatus}</p>
              )}
              {c.address && <p className="flex items-center gap-1"><MapPin className="w-3 h-3 shrink-0" /><span className="truncate">{c.city || c.address}</span></p>}
              {c.email && <p className="flex items-center gap-1"><Mail className="w-3 h-3 shrink-0" /><span className="truncate">{c.email}</span></p>}
              {c.phone && <p className="flex items-center gap-1"><Phone className="w-3 h-3 shrink-0" />{c.phone}</p>}
            </div>
            <div className="mt-3 pt-2 border-t border-slate-200 flex items-center gap-1 text-xs text-slate-400">
              <Briefcase className="w-3 h-3" />
              <span>{woCount(c.id)} work order{woCount(c.id) !== 1 ? 's' : ''}</span>
            </div>
          </div>
        );

        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                    <GitMerge className="w-4 h-4 text-amber-600" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Merge Accounts</h2>
                    <p className="text-xs text-slate-400">Jobs transfer to the primary. The absorbed account is removed.</p>
                  </div>
                </div>
                <button onClick={() => { setShowMergeModal(false); setMergeTarget(null); setMergeSearch(''); setPrimaryId(customer.id); setConflictChoices({}); }} className="p-2 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors">
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>

              <div className="px-6 py-5 space-y-5">
                {/* Search */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Find Account to Merge</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search by name, client ID, or address…"
                      value={mergeSearch}
                      onChange={e => { setMergeSearch(e.target.value); if (mergeTarget) setMergeTarget(null); }}
                      className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                      autoFocus
                    />
                  </div>
                  {/* Results dropdown */}
                  {mergeResults.length > 0 && !mergeTarget && (
                    <ul className="mt-1 border border-slate-200 rounded-xl overflow-hidden shadow-lg">
                      {mergeResults.map(c => (
                        <li
                          key={c.id}
                          onMouseDown={() => { setMergeTarget(c); setMergeSearch(c.name); }}
                          className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-orange-50 cursor-pointer border-b border-slate-100 last:border-0 transition-colors"
                        >
                          <div>
                            <span className="font-medium text-slate-900">{c.name}</span>
                            {c.clientId && <span className="ml-2 text-xs font-mono text-orange-600">{c.clientId}</span>}
                          </div>
                          <span className="text-xs text-slate-400">{c.city || c.state}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Side-by-side comparison — φ ratio layout */}
                {mergeTarget && primaryCustomer && otherCustomer && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Review & Choose Primary</label>
                    {/* grid: 1.618fr auto 1fr — golden ratio column widths */}
                    <div className="grid gap-3" style={{ gridTemplateColumns: '1.618fr auto 1fr' }}>
                      <MergeCard
                        c={primaryCustomer}
                        badge="primary"
                        onSwap={() => setPrimaryId(otherCustomer.id)}
                      />
                      {/* Arrow */}
                      <div className="flex flex-col items-center justify-center gap-1 text-slate-300">
                        <ArrowRight className="w-5 h-5" />
                        <span className="text-[9px] uppercase tracking-widest text-slate-300 -rotate-90 whitespace-nowrap" style={{ marginTop: 4 }}>merge</span>
                      </div>
                      <MergeCard
                        c={otherCustomer}
                        badge="secondary"
                        onSwap={() => setPrimaryId(otherCustomer!.id)}
                      />
                    </div>
                    <p className="mt-3 text-xs text-slate-400 text-center">
                      <strong className="text-slate-600">{otherCustomer.name}</strong>'s {woCount(otherCustomer.id)} work order{woCount(otherCustomer.id) !== 1 ? 's' : ''} will move to <strong className="text-slate-600">{primaryCustomer.name}</strong>.
                    </p>
                  </div>
                )}

                {/* Conflict Resolution */}
                {mergeTarget && conflicts.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide">Resolve Conflicts</label>
                      {unresolvedConflicts.length > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 text-[10px] font-bold">
                          {unresolvedConflicts.length} remaining
                        </span>
                      )}
                    </div>
                    <div className="space-y-3 max-h-[240px] overflow-y-auto pr-1">
                      {conflicts.map(f => {
                        const chosen = conflictChoices[f.key as string];
                        return (
                          <div key={f.key as string}>
                            <p className="text-[11px] font-semibold text-slate-500 mb-1.5">{f.label}</p>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                onClick={() => setConflictChoices(prev => ({ ...prev, [f.key as string]: 'primary' }))}
                                className={`p-2.5 rounded-lg border-2 text-left text-xs transition-all cursor-pointer ${
                                  chosen === 'primary'
                                    ? 'border-orange-400 bg-orange-50 text-slate-900'
                                    : 'border-slate-200 text-slate-500 hover:border-orange-200'
                                }`}
                              >
                                <span className="block font-mono text-[10px] text-orange-500 mb-0.5 uppercase">Keep (Primary)</span>
                                <span className="break-words">{String(primaryCustomer![f.key] ?? '')}</span>
                              </button>
                              <button
                                onClick={() => setConflictChoices(prev => ({ ...prev, [f.key as string]: 'secondary' }))}
                                className={`p-2.5 rounded-lg border-2 text-left text-xs transition-all cursor-pointer ${
                                  chosen === 'secondary'
                                    ? 'border-amber-400 bg-amber-50 text-slate-900'
                                    : 'border-slate-200 text-slate-500 hover:border-amber-200'
                                }`}
                              >
                                <span className="block font-mono text-[10px] text-amber-600 mb-0.5 uppercase">Use (Secondary)</span>
                                <span className="break-words">{String(otherCustomer![f.key] ?? '')}</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Confirm */}
                <button
                  disabled={!mergeTarget || unresolvedConflicts.length > 0}
                  onClick={() => {
                    if (!mergeTarget) return;
                    const secondaryCustomer = primaryId === customer.id ? mergeTarget : customer;
                    // Build resolved fields from user choices
                    const resolvedFields: Partial<Customer> = {};
                    conflicts.forEach(f => {
                      const choice = conflictChoices[f.key as string];
                      if (choice === 'primary') {
                        (resolvedFields as any)[f.key] = primaryCustomer![f.key];
                      } else if (choice === 'secondary') {
                        (resolvedFields as any)[f.key] = otherCustomer![f.key];
                      }
                    });
                    onMergeCustomers(primaryId, secondaryCustomer.id, resolvedFields);
                    setShowMergeModal(false);
                    setMergeTarget(null);
                    setMergeSearch('');
                    setConflictChoices({});
                    setPrimaryId(customer.id);
                  }}
                  className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all ${
                    mergeTarget && unresolvedConflicts.length === 0
                      ? 'bg-amber-500 hover:bg-amber-600 text-white cursor-pointer shadow-md shadow-amber-200'
                      : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <GitMerge className="w-4 h-4" />
                  {unresolvedConflicts.length > 0 ? `Resolve ${unresolvedConflicts.length} conflict${unresolvedConflicts.length !== 1 ? 's' : ''} first` : 'Confirm Merge'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Create Work Order — full WorkOrderPanel */}
      {showCreateWorkOrder && (
        <WorkOrderPanel
          siteId={customer.id}
          siteName={customer.name}
          siteAddress={`${customer.address}, ${customer.city}, ${customer.state} ${customer.zip}`}
          clientId={customer.clientId}
          job={null}
          onClose={() => setShowCreateWorkOrder(false)}
          onSave={(jobData) => {
            onCreateJob({ ...jobData, customerId: customer.id });
            setShowCreateWorkOrder(false);
          }}
          onDispatch={onDispatch}
          contractors={contractors}
          technicians={users.filter(u => u.role === 'technician' || u.role === 'admin').map(u => ({ id: u.id, name: u.name }))}
          customer={customer}
        />
      )}

      {/* Edit Work Order — full WorkOrderPanel */}
      {editingJob && (
        <WorkOrderPanel
          siteId={customer.id}
          siteName={customer.name}
          siteAddress={`${customer.address}, ${customer.city}, ${customer.state} ${customer.zip}`}
          clientId={customer.clientId}
          job={editingJob}
          onClose={() => setEditingJob(null)}
          onSave={(jobData) => {
            if (onUpdateJob) onUpdateJob({ ...editingJob, ...jobData } as Job);
            setEditingJob(null);
          }}
          onDeleteJob={(jobId) => {
            onDeleteJob?.(jobId);
            setEditingJob(null);
          }}
          onDispatch={onDispatch}
          contractors={contractors}
          technicians={users.filter(u => u.role === 'technician' || u.role === 'admin').map(u => ({ id: u.id, name: u.name }))}
          customer={customer}
        />
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
  nextClientId: string;
}

const CreateCustomerModal: React.FC<CreateCustomerModalProps> = ({ onClose, onCreate, nextClientId }) => {
  const [formData, setFormData] = useState({
    clientId: nextClientId,
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
    category: '' as '' | CustomerCategory,
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
      category: formData.category || undefined,
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

          {/* Type, Category, System Type, and Status Row */}
          <div className="grid grid-cols-2 gap-4">
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
              <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              >
                <option value="">Select...</option>
                <option value="O&M">O&amp;M</option>
                <option value="New Install">New Install</option>
                <option value="Prospect">Prospect</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
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
            <AddressAutocomplete
              value={formData.address}
              onChange={(val) => setFormData({ ...formData, address: val })}
              onAddressSelect={(result) => setFormData(prev => ({
                ...prev,
                address: result.address || prev.address,
                city: result.city || prev.city,
                state: result.state || prev.state,
                zip: result.zip || prev.zip,
              }))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              required
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
            <ReferralCombobox
              value={formData.referralSource}
              onChange={(val) => setFormData({ ...formData, referralSource: val })}
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
