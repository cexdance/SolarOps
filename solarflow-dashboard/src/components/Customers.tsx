// SolarFlow MVP - Customers Component (List View with Split Panel)
import React, { useState, useRef, useCallback } from 'react';
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
} from 'lucide-react';
import { Customer, Job, ClientStatus, Activity, User, CustomerCategory, SolarEdgeAlert } from '../types';
import { ServiceRate } from '../types/contractor';
import { loadServiceRates } from '../lib/contractorStore';
import { loadAlerts } from '../lib/operationsStore';
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
  const [activeTab, setActiveTab] = useState<'story' | 'jobs' | 'files' | 'activity'>('story');
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
  const parseMentions = (text: string): string[] => {
    const mentioned: string[] = [];
    const matches = text.match(/@([\w\s]+?)(?=\s@|\s[^@\w]|$)/g) || [];
    matches.forEach(m => {
      const name = m.slice(1).trim();
      const user = users.find(u => u.name.toLowerCase() === name.toLowerCase());
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

  const handleMentionSelect = (user: User) => {
    const before = notes.slice(0, mentionStartIndex);
    const after = notes.slice(textareaRef.current?.selectionStart ?? notes.length);
    const inserted = `@${user.name} `;
    setNotes(before + inserted + after);
    setShowMentionDropdown(false);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const filteredMentionUsers = mentionQuery
    ? users.filter(u => u.name.toLowerCase().startsWith(mentionQuery.toLowerCase()))
    : users;

  const handleSaveNote = () => {
    if (!notes.trim()) return;
    const mentionedIds = parseMentions(notes);
    const newActivity: Activity = {
      id: `activity-${Date.now()}`,
      type: 'note_added',
      description: notes.trim(),
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
                    <div className="absolute left-0 bottom-full mb-1 w-56 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
                      <p className="text-[10px] text-slate-400 px-3 pt-2 pb-1 uppercase tracking-wide font-medium">Mention a teammate</p>
                      {filteredMentionUsers.map(u => (
                        <button
                          key={u.id}
                          onMouseDown={(e) => { e.preventDefault(); handleMentionSelect(u); }}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-orange-50 text-left text-sm"
                        >
                          <div className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold shrink-0">
                            {u.name.charAt(0)}
                          </div>
                          <span className="font-medium text-slate-800">{u.name}</span>
                          <span className="text-xs text-slate-400 capitalize ml-auto">{u.role}</span>
                        </button>
                      ))}
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
