// SolarFlow MVP - Customers Component (List View with Split Panel)
import React, { useState, useRef, useEffect } from 'react';
import { authedFetch } from '../lib/supabase';
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
  Leaf,
  FileBarChart,
  Eye,
  Download,
  Link2,
  CheckCircle2,
  Copy,
  Smile,
  Undo2,
  Camera,
  Image as ImageIcon,
  Sparkles,
  Printer,
} from 'lucide-react';
import * as _recharts from 'recharts';
const { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip: RechartsTooltip, ResponsiveContainer, CartesianGrid, Legend } = _recharts as any;
import { Customer, CustomerFile, Job, ClientStatus, Activity, User, CustomerCategory, SystemType, SolarEdgeAlert } from '../types';
import { loadAlerts } from '../lib/operationsStore';
import { importTrelloCard, TrelloImportResult, fetchTrelloCard, extractContactInfo } from '../lib/trelloImporter';
import { FL_SITES, SolarEdgeSite } from '../lib/solarEdgeSites';
import { AddressAutocomplete } from './AddressAutocomplete';
import { AddressLink } from './AddressLink';
import { WorkOrderPanel } from './WorkOrderPanel';
import { PhoneLink } from './PhoneLink';
import { ActivityFeed } from './ui/ActivityFeed';
import { uploadCustomerFilesPartial, StoredCustomerFile, CustomerFileUpload } from '../lib/customerFileStorage';
import { fireMentionNotifications, parseMentionEmails } from './ui/MentionTextarea';
import { toast } from 'sonner';

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
    'PowerCare':   'bg-orange-100 text-orange-700',
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
  solarEdgeSites?: import('../lib/solarEdgeSites').SolarEdgeSite[];
  solarEdgeApiKey?: string;
  isMobile: boolean;
  initialCustomerId?: string;
  selectCustomerSeq?: number;
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
  solarEdgeSites = [],
  solarEdgeApiKey,
  initialCustomerId,
  selectCustomerSeq,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showDedupModal, setShowDedupModal] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── Live SolarEdge alert overrides (shared localStorage with SolarEdge Monitoring page) ──
  const [alertOverrides, setAlertOverrides] = React.useState<Map<string, { count: number; impact: string }>>(() => {
    try {
      const raw = localStorage.getItem('solarops_alert_overrides');
      return raw ? new Map(JSON.parse(raw) as [string, { count: number; impact: string }][]) : new Map();
    } catch { return new Map(); }
  });
  const [ackedSites, setAckedSites] = React.useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('solarops_acked_sites');
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch { return new Set(); }
  });
  const [isRefreshingAlerts, setIsRefreshingAlerts] = React.useState(false);
  const [alertRefreshMsg, setAlertRefreshMsg] = React.useState<string | null>(null);

  /** Pull fresh alert counts from SolarEdge /sites/list and store in localStorage */
  const fetchAlertCounts = React.useCallback(async () => {
    setIsRefreshingAlerts(true);
    setAlertRefreshMsg(null);
    try {
      const pageSize = 100;
      let page = 0;
      const newOverrides = new Map<string, { count: number; impact: string }>();
      const keyParam = solarEdgeApiKey ? `&api_key=${encodeURIComponent(solarEdgeApiKey)}` : '';
      while (true) {
        const res = await authedFetch(`/api/solaredge?path=/sites/list&size=${pageSize}&startIndex=${page * pageSize}&bust=${Date.now()}${keyParam}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as { sites?: { site?: { id: number; alertQuantity?: number; highestImpact?: number }[] } };
        const sites = data?.sites?.site ?? [];
        if (sites.length === 0) break;
        for (const s of sites) {
          newOverrides.set(String(s.id), { count: s.alertQuantity ?? 0, impact: String(s.highestImpact ?? '0') });
        }
        if (sites.length < pageSize) break;
        page++;
      }
      setAlertOverrides(newOverrides);
      localStorage.setItem('solarops_alert_overrides', JSON.stringify(Array.from(newOverrides.entries())));
      setAckedSites(prev => {
        const next = new Set(prev);
        for (const [siteId, { count }] of newOverrides) { if (count === 0) next.delete(siteId); }
        localStorage.setItem('solarops_acked_sites', JSON.stringify(Array.from(next)));
        return next;
      });
      const withAlerts = [...newOverrides.values()].filter(v => v.count > 0).length;
      setAlertRefreshMsg(`✓ ${withAlerts} site${withAlerts !== 1 ? 's' : ''} with active alerts`);
    } catch (err: unknown) {
      setAlertRefreshMsg(`✗ ${err instanceof Error ? err.message : 'Sync failed'}`);
    } finally {
      setIsRefreshingAlerts(false);
    }
  }, []);

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
    } catch (e) { console.error('[Customers] saveView failed', e); }
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

  // Build customerId → alerts map from two sources:
  // 1. Structured SolarEdgeAlert records (solarops_alerts store)
  // 2. Site-level alert counts from FL_SITES / solarEdgeSites (SE Monitoring data)
  const alertsByCustomer = React.useMemo(() => {
    const map = new Map<string, SolarEdgeAlert[]>();

    // Source 1: structured alert records
    loadAlerts().filter(a => !a.resolved).forEach(a => {
      if (!map.has(a.customerId)) map.set(a.customerId, []);
      map.get(a.customerId)!.push(a);
    });

    // Source 2: site-level counts — prefer live alertOverrides, fall back to static solarEdgeSites
    const siteMap = new Map<string, typeof solarEdgeSites[0]>();
    solarEdgeSites.forEach(s => siteMap.set(s.siteId, s));

    customers.forEach(customer => {
      if (!customer.solarEdgeSiteId) return;
      // Skip if we already have structured records for this customer
      if (map.has(customer.id)) return;
      // Skip if acknowledged locally
      if (ackedSites.has(customer.solarEdgeSiteId)) return;

      const override = alertOverrides.get(customer.solarEdgeSiteId);
      const site     = siteMap.get(customer.solarEdgeSiteId);

      // Live count takes priority over stale static value
      const count  = override?.count  ?? site?.alerts  ?? 0;
      const impactStr = override?.impact ?? site?.highestImpact ?? '0';
      if (count === 0) return;

      const impact = parseFloat(impactStr) || 0;
      const severity: 'critical' | 'warning' | 'info' =
        impact >= 4 ? 'critical' : impact >= 2 ? 'warning' : 'info';

      map.set(customer.id, [{
        id:               `site-${customer.solarEdgeSiteId}`,
        alertId:          `site-${customer.solarEdgeSiteId}`,
        siteId:           customer.solarEdgeSiteId,
        siteName:         site?.siteName ?? customer.solarEdgeSiteId,
        customerId:       customer.id,
        customerName:     customer.name,
        type:             'inverter_error' as const,
        severity,
        title:            `${count} Active Alert${count !== 1 ? 's' : ''}`,
        description:      impact > 0 ? `Highest impact level: ${impactStr}` : '',
        acknowledged:     false,
        resolved:         false,
        workOrderCreated: false,
        occurredAt:       site?.lastUpdate || new Date().toISOString(),
        createdAt:        site?.lastUpdate || new Date().toISOString(),
      }]);
    });

    return map;
  }, [customers, solarEdgeSites, alertOverrides, ackedSites]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(() =>
    initialCustomerId ? (customers.find(c => c.id === initialCustomerId) ?? null) : null
  );

  // React to global search selections — selectCustomerSeq increments each time,
  // ensuring the effect re-fires even when the same customer is selected twice
  useEffect(() => {
    if (!initialCustomerId) return;
    const c = customers.find(c => c.id === initialCustomerId);
    if (c) setSelectedCustomer(c);
  }, [initialCustomerId, selectCustomerSeq]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Duplicate detection ────────────────────────────────────────────────────
  type DupGroup = { signal: string; label: string; records: Customer[] };

  const dupGroups = React.useMemo((): DupGroup[] => {
    const groups: DupGroup[] = [];
    const scored = (c: Customer) =>
      [c.name, c.email, c.phone, c.address, c.clientId, c.solarEdgeSiteId, c.category, c.systemType, c.notes]
        .filter(v => v?.trim()).length;

    // 1. Same solarEdgeSiteId
    const bySE = new Map<string, Customer[]>();
    customers.forEach(c => { if (c.solarEdgeSiteId) { const g = bySE.get(c.solarEdgeSiteId) || []; g.push(c); bySE.set(c.solarEdgeSiteId, g); } });
    bySE.forEach((recs, id) => {
      if (recs.length > 1) groups.push({ signal: 'solarEdgeSiteId', label: `SE #${id}`, records: [...recs].sort((a,b) => scored(b)-scored(a)) });
    });

    // 2. Same clientId (after excluding already-grouped records)
    const groupedIds = new Set(groups.flatMap(g => g.records.map(r => r.id)));
    const byCI = new Map<string, Customer[]>();
    customers.filter(c => !groupedIds.has(c.id)).forEach(c => {
      const cid = c.clientId?.trim(); if (cid) { const g = byCI.get(cid) || []; g.push(c); byCI.set(cid, g); }
    });
    byCI.forEach((recs, cid) => {
      if (recs.length > 1) groups.push({ signal: 'clientId', label: `ID ${cid}`, records: [...recs].sort((a,b) => scored(b)-scored(a)) });
    });

    // 3. Same normalized address (non-empty, not already grouped)
    const grouped2 = new Set(groups.flatMap(g => g.records.map(r => r.id)));
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
    const byAddr = new Map<string, Customer[]>();
    customers.filter(c => !grouped2.has(c.id) && c.address?.trim()).forEach(c => {
      const key = norm(c.address); if (key.length > 5) { const g = byAddr.get(key) || []; g.push(c); byAddr.set(key, g); }
    });
    byAddr.forEach((recs) => {
      if (recs.length > 1) groups.push({ signal: 'address', label: `${recs[0].address}`, records: [...recs].sort((a,b) => scored(b)-scored(a)) });
    });

    return groups;
  }, [customers]);

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
    if (selectionMode) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.has(customer.id) ? next.delete(customer.id) : next.add(customer.id);
        return next;
      });
      return;
    }
    setSelectedCustomer(customer);
  };

  const closeDetail = () => {
    setSelectedCustomer(null);
  };

  const allFilteredSelected = sortedCustomers.length > 0 && sortedCustomers.every(c => selectedIds.has(c.id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedCustomers.map(c => c.id)));
    }
  };

  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(
      `Permanently delete ${selectedIds.size} customer${selectedIds.size !== 1 ? 's' : ''}?\n\nThey will be tombstoned and will not be re-imported from SolarEdge.`
    )) return;
    Array.from(selectedIds).forEach(id => onDeleteCustomer(id));
    setSelectedIds(new Set());
    setSelectionMode(false);
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
          {/* Alert Sync button — only show when any customer has a linked SE site */}
          {customers.some(c => c.solarEdgeSiteId) && (
            <div className="flex flex-col items-end gap-0.5">
              <button
                onClick={fetchAlertCounts}
                disabled={isRefreshingAlerts}
                className="flex items-center gap-2 px-3 py-2.5 bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white text-sm font-medium rounded-lg transition-colors"
                title="Pull fresh alert counts from SolarEdge for all linked sites"
              >
                <AlertTriangle className={`w-4 h-4 ${isRefreshingAlerts ? 'animate-pulse' : ''}`} />
                {isRefreshingAlerts ? 'Syncing…' : 'Sync Alerts'}
              </button>
              {alertRefreshMsg && (
                <span className={`text-xs ${alertRefreshMsg.startsWith('✓') ? 'text-emerald-600' : 'text-red-500'}`}>
                  {alertRefreshMsg}
                </span>
              )}
            </div>
          )}
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

        {/* Find Duplicates */}
        <button
          onClick={() => setShowDedupModal(true)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors cursor-pointer ${
            dupGroups.length > 0
              ? 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Copy className="w-4 h-4" />
          Duplicates
          {dupGroups.length > 0 && (
            <span className="ml-0.5 px-1.5 py-0.5 text-xs bg-amber-500 text-white rounded-full">{dupGroups.length}</span>
          )}
        </button>

        {/* Batch select toggle */}
        <button
          onClick={() => { setSelectionMode(m => !m); setSelectedIds(new Set()); }}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors cursor-pointer ${
            selectionMode
              ? 'bg-slate-800 text-white border-slate-800'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          Select
        </button>

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
                {selectionMode && (
                  <th className="px-3 py-2.5 w-10">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 accent-orange-500 cursor-pointer"
                      title="Select all filtered"
                    />
                  </th>
                )}
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
                {selectionMode && <th className="px-3 py-1.5 w-10" />}
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
                    className={`cursor-pointer transition-colors ${
                      selectionMode && selectedIds.has(customer.id)
                        ? 'bg-orange-50 border-l-2 border-l-orange-400'
                        : 'hover:bg-orange-50/40'
                    }`}
                  >
                    {selectionMode && (
                      <td className="px-3 py-2.5 w-10" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(customer.id)}
                          onChange={() => setSelectedIds(prev => {
                            const next = new Set(prev);
                            next.has(customer.id) ? next.delete(customer.id) : next.add(customer.id);
                            return next;
                          })}
                          className="w-4 h-4 accent-orange-500 cursor-pointer"
                        />
                      </td>
                    )}
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

                          // Sort: critical → warning → info, unacknowledged first
                          const sevOrder = { critical: 0, warning: 1, info: 2 };
                          const sorted = [...alerts].sort((a, b) => {
                            if (a.acknowledged !== b.acknowledged) return a.acknowledged ? 1 : -1;
                            return (sevOrder[a.severity] ?? 3) - (sevOrder[b.severity] ?? 3);
                          });
                          const top = sorted[0];
                          const rest = sorted.length - 1;

                          const sevStyle = top.severity === 'critical'
                            ? { dot: 'bg-red-500',    text: 'text-red-700',   badge: 'bg-red-100 text-red-700 border-red-200' }
                            : top.severity === 'warning'
                            ? { dot: 'bg-amber-500',  text: 'text-amber-700', badge: 'bg-amber-100 text-amber-700 border-amber-200' }
                            : { dot: 'bg-blue-400',   text: 'text-blue-700',  badge: 'bg-blue-100 text-blue-700 border-blue-200' };

                          return (
                            <div className="min-w-[160px] max-w-[220px]">
                              <div className={`flex items-start gap-1.5 ${top.acknowledged ? 'opacity-50' : ''}`}>
                                <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${sevStyle.dot}`} />
                                <div className="min-w-0">
                                  <p className={`text-xs font-medium leading-tight truncate ${sevStyle.text}`}>
                                    {top.title}
                                  </p>
                                  {top.description && (
                                    <p className="text-xs text-slate-400 leading-tight truncate mt-0.5">
                                      {top.description}
                                    </p>
                                  )}
                                </div>
                              </div>
                              {rest > 0 && (
                                <span className={`mt-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-semibold border ${sevStyle.badge}`}>
                                  +{rest} more
                                </span>
                              )}
                            </div>
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

      {/* ── Batch selection action bar ───────────────────────────────────────── */}
      {selectionMode && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 bg-slate-900 text-white rounded-2xl shadow-2xl border border-slate-700">
          <span className="text-sm font-medium">
            {selectedIds.size === 0
              ? 'No customers selected'
              : `${selectedIds.size} customer${selectedIds.size !== 1 ? 's' : ''} selected`}
          </span>
          {selectedIds.size > 0 && (
            <>
              <span className="w-px h-4 bg-slate-600" />
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-sm text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                Clear
              </button>
              <button
                onClick={handleBatchDelete}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete {selectedIds.size}
              </button>
            </>
          )}
          <button
            onClick={() => { setSelectionMode(false); setSelectedIds(new Set()); }}
            className="ml-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Exit selection mode"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

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

      {/* ── Find Duplicates Modal ──────────────────────────────────────────── */}
      {showDedupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Find Duplicates</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  {dupGroups.length === 0 ? 'No duplicates detected' : `${dupGroups.length} duplicate group${dupGroups.length !== 1 ? 's' : ''} found`}
                </p>
              </div>
              <button onClick={() => setShowDedupModal(false)} className="p-2 rounded-lg hover:bg-slate-100 cursor-pointer">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {dupGroups.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <CheckCircle className="w-10 h-10 text-green-500" />
                  <p className="text-slate-700 font-semibold">Database is clean</p>
                  <p className="text-slate-400 text-sm">No duplicate records detected.</p>
                </div>
              ) : (
                dupGroups.map((group, gi) => (
                  <div key={gi} className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className={`flex items-center gap-2 px-4 py-2.5 ${
                      group.signal === 'solarEdgeSiteId' ? 'bg-red-50' :
                      group.signal === 'clientId' ? 'bg-amber-50' : 'bg-blue-50'
                    }`}>
                      <Copy className={`w-3.5 h-3.5 ${
                        group.signal === 'solarEdgeSiteId' ? 'text-red-500' :
                        group.signal === 'clientId' ? 'text-amber-600' : 'text-blue-500'
                      }`} />
                      <span className={`text-xs font-bold uppercase tracking-wide ${
                        group.signal === 'solarEdgeSiteId' ? 'text-red-600' :
                        group.signal === 'clientId' ? 'text-amber-700' : 'text-blue-600'
                      }`}>
                        {group.signal === 'solarEdgeSiteId' ? 'Same SolarEdge Site' :
                         group.signal === 'clientId' ? 'Same Client ID' : 'Same Address'} — {group.label}
                      </span>
                      <span className="ml-auto text-xs text-slate-500">{group.records.length} records</span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {group.records.map((rec, ri) => (
                        <div key={rec.id} className="flex items-center gap-3 px-4 py-3 bg-white">
                          {ri === 0 ? (
                            <span className="flex-shrink-0 px-2 py-0.5 text-[10px] font-bold bg-green-100 text-green-700 rounded-full">KEEP</span>
                          ) : (
                            <span className="flex-shrink-0 px-2 py-0.5 text-[10px] font-bold bg-red-100 text-red-600 rounded-full">DUP</span>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">{rec.name || <span className="text-slate-400 italic">No name</span>}</p>
                            <p className="text-xs text-slate-400 truncate">{[rec.clientId, rec.address, rec.city].filter(Boolean).join(' · ')}</p>
                          </div>
                          <div className="flex gap-2 flex-shrink-0">
                            {ri > 0 && (
                              <button
                                onClick={() => onDeleteCustomer(rec.id)}
                                className="px-2.5 py-1 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 cursor-pointer"
                              >
                                Delete
                              </button>
                            )}
                            <button
                              onClick={() => { setShowDedupModal(false); onViewCustomer?.(rec.id); }}
                              className="px-2.5 py-1 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                            >
                              View
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    {group.records.length === 2 && (
                      <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex justify-end">
                        <button
                          onClick={() => onMergeCustomers(group.records[0].id, group.records[1].id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-500 text-white rounded-lg hover:bg-amber-600 cursor-pointer"
                        >
                          <GitMerge className="w-3.5 h-3.5" />
                          Merge → keep top record
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {dupGroups.length > 0 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
                <p className="text-sm text-slate-500">First record in each group is the <span className="font-semibold text-green-700">recommended keep</span> (most data filled).</p>
                <button onClick={() => setShowDedupModal(false)} className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-white cursor-pointer">
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
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
  rawDate: string; // YYYY-MM-DD
  kWh: number;
  psh?: number;    // Peak Sun Hours (kWh/m²/day) from Open-Meteo shortwave radiation
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
  const [siteDetails, setSiteDetails] = useState<{ peakPower: number; lat?: number; lng?: number } | null>(null);
  const [reportNotes, setReportNotes] = useState('');
  const [sendingReport, setSendingReport] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const [showReportPreview, setShowReportPreview] = useState(false);
  const [showEditPanel, setShowEditPanel] = useState(false);
  const [previewTrackingId, setPreviewTrackingId] = useState('');
  const [previewDowntimeDays, setPreviewDowntimeDays] = useState(0);
  const [previewServiceCalls, setPreviewServiceCalls] = useState(0);
  const [previewUptime, setPreviewUptime] = useState(100);
  const [previewGreeting, setPreviewGreeting] = useState('');
  const [previewAccountUpdates, setPreviewAccountUpdates] = useState('');
  const [previewEmail, setPreviewEmail] = useState('');

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
    } catch (e) { console.error('[Customers] getSiteInfo localStorage parse failed', e); }
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
    authedFetch(`/api/solaredge?path=/site/${siteId}/overview&api_key=${encodeURIComponent(apiKey)}`)
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
      .catch((e) => console.error('[Customers] SolarEdge overview fetch failed', e));

    // Details: peak power (kW)
    authedFetch(`/api/solaredge?path=/site/${siteId}/details&api_key=${encodeURIComponent(apiKey)}`)
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (!json || json.error) return;
        setSiteDetails({
          peakPower: json.details?.peakPower || 0,
          lat: json.details?.location?.lat,
          lng: json.details?.location?.lng,
        });
      })
      .catch((e) => console.error('[Customers] SolarEdge details fetch failed', e));
  }, [siteId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch Peak Sun Hours from Open-Meteo (free, no API key) ────────────────
  // Uses site lat/lng from SolarEdge details; shortwave_radiation_sum MJ/m² ÷ 3.6 = PSH
  useEffect(() => {
    if (!siteId) return;
    const fetchPsh = async () => {
      try {
        // Use site coords from SolarEdge details, fall back to South FL default
        const lat = siteDetails?.lat ?? 26.0;
        const lng = siteDetails?.lng ?? -80.2;
        const now = new Date();
        let baseUrl: string;

        if (graphPeriod === 'year') {
          const d = new Date(now); d.setFullYear(d.getFullYear() - 1);
          const startDate = d.toISOString().slice(0, 10);
          const endDate = now.toISOString().slice(0, 10);
          baseUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${startDate}&end_date=${endDate}&daily=shortwave_radiation_sum&timezone=America%2FNew_York`;
        } else {
          const pastDays = graphPeriod === 'quarter' ? 90 : graphPeriod === 'month' ? 30 : 7;
          baseUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=shortwave_radiation_sum&timezone=America%2FNew_York&past_days=${pastDays}&forecast_days=0`;
        }

        const resp = await fetch(baseUrl);
        if (!resp.ok) return;
        const json = await resp.json();
        const times: string[]   = json.daily?.time || [];
        const rads: number[]    = json.daily?.shortwave_radiation_sum || [];
        // MJ/m²/day ÷ 3.6 = kWh/m²/day = Peak Sun Hours
        const pshMap: Record<string, number> = {};
        times.forEach((t, i) => { pshMap[t] = Math.round((rads[i] / 3.6) * 10) / 10; });

        setEnergyCache(prev => {
          const points = prev[graphPeriod];
          if (!points || points.length === 0) return prev;
          const merged = points.map(p => ({ ...p, psh: pshMap[p.rawDate] ?? p.psh }));
          return { ...prev, [graphPeriod]: merged };
        });
      } catch { /* PSH is supplemental — silently skip on error */ }
    };
    fetchPsh();
  }, [siteId, graphPeriod, siteDetails?.lat, siteDetails?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

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

        const resp = await authedFetch(
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

  // Build the HTML report and open the preview modal
  // NLP-crafted greeting generator with timeframe and system state
  const buildGreeting = (kWh: number, savings: number, uptime: number) => {
    const firstName = customer.name?.split(' ')[0] || customer.name;
    const kwFmt = kWh >= 1000 ? `${(kWh / 1000).toFixed(1)} MWh` : `${Math.round(kWh).toLocaleString('en-US')} kWh`;
    const savFmt = `$${Math.round(savings).toLocaleString('en-US')}`;
    return `Dear ${firstName},\n\nWe're delighted to share your solar system performance report for the last 3 months. Your system is running at peak efficiency with ${uptime.toFixed(0)}% uptime, and over this period it generated ${kwFmt} of clean energy, delivering an estimated ${savFmt} in utility savings directly back to you.\n\nAnd whenever a question comes up, whether it is about a number on this report or anything else about your system, our team is genuinely glad to hear from you. Reach out any time.`;
  };

  const handleOpenPreview = () => {
    const tid = `prod-${customer.id}-${Date.now()}`;
    setPreviewTrackingId(tid);

    // Calculate uptime: percentage of days with production in the period
    const daysWithProduction = energyData.filter(d => d.kWh > 0).length;
    const uptime = energyData.length > 0 ? (daysWithProduction / energyData.length) * 100 : 100;

    setPreviewUptime(uptime);
    setPreviewGreeting(buildGreeting(displayKwh, dollarsSaved, uptime));
    setPreviewAccountUpdates(reportNotes);
    setPreviewDowntimeDays(0);
    setPreviewServiceCalls(0);
    setPreviewEmail(customer.email || '');
    setShowReportPreview(true);
  };

  // Live HTML generation — recomputes whenever any editable field changes
  const previewHtmlComputed = React.useMemo(() => {
    if (!showReportPreview || !previewTrackingId) return '';
    const tid = previewTrackingId;
    const trackingPixel = `https://solarflow-dashboard-sooty.vercel.app/api/track?event=open&id=${tid}`;
    const overdueInvs: any[] = [];
    const hasOverdue = false;

    const periodLabel = graphPeriod === 'week' ? 'Last 7 Days' : graphPeriod === 'month' ? 'Last 30 Days' : graphPeriod === 'quarter' ? 'Last 3 Months' : 'Last 12 Months';
    const systemSize  = siteData?.peakPower?.toFixed(1) || (peakPowerKw > 0 ? peakPowerKw.toFixed(1) : null);
    const reportDate  = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const isFirstReport = displayKwh === 0; // Smart empty state

    // Environmental impact equivalents (EPA conversions)
    const gallonsGasoline = Math.round(displayKwh * 0.000379 * 100) / 100; // kWh × CO2 lb/kWh ÷ gallons/CO2
    const treesPlantedEquiv = Math.round(co2Tons * 16); // 1 ton CO2 = ~16 trees-year
    const milesNotDriven = Math.round(displayKwh * 0.85); // EPA: 0.85 miles/kWh equivalent

    // Generate inline SVG production chart from energyData
    const chartData = energyData.slice(-30); // Last 30 data points
    const maxKwh = Math.max(...chartData.map(d => d.kWh || 0), 1);
    const chartWidth = 520;
    const chartHeight = 120;
    const barWidth = chartData.length > 0 ? chartWidth / chartData.length : 0;
    const productionChart = chartData.length > 0 ? `
      <svg width="100%" viewBox="0 0 ${chartWidth} ${chartHeight + 24}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" style="display:block;">
        <defs>
          <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#f97316" stop-opacity="0.95"/>
            <stop offset="100%" stop-color="#fb923c" stop-opacity="0.7"/>
          </linearGradient>
        </defs>
        ${chartData.map((d, i) => {
          const h = Math.max(2, (d.kWh / maxKwh) * chartHeight);
          const y = chartHeight - h;
          return `<rect x="${i * barWidth + 1}" y="${y}" width="${Math.max(2, barWidth - 2)}" height="${h}" fill="url(#barGrad)" rx="1.5"/>`;
        }).join('')}
        <line x1="0" y1="${chartHeight}" x2="${chartWidth}" y2="${chartHeight}" stroke="#e2e8f0" stroke-width="1"/>
        <text x="0" y="${chartHeight + 16}" font-size="9" font-weight="600" fill="#94a3b8" font-family="-apple-system,sans-serif">${chartData[0]?.date?.slice(5) || ''}</text>
        <text x="${chartWidth}" y="${chartHeight + 16}" text-anchor="end" font-size="9" font-weight="600" fill="#94a3b8" font-family="-apple-system,sans-serif">${chartData[chartData.length - 1]?.date?.slice(5) || ''}</text>
        <text x="${chartWidth}" y="10" text-anchor="end" font-size="9" font-weight="700" fill="#64748b" font-family="-apple-system,sans-serif">PEAK ${maxKwh.toFixed(1)} kWh</text>
      </svg>
    ` : '';

    /* SVG icon helpers — inline so no external requests */
    const svgBolt     = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
    const svgDollar   = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`;
    const svgGauge    = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 12L8 8"/><circle cx="12" cy="12" r="2"/></svg>`;
    const svgLeaf     = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>`;
    const svgStar     = `<svg width="20" height="20" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
    const svgCar      = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63A6 6 0 0 0 2 12.42V16h2"/><circle cx="6.5" cy="16.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/></svg>`;
    const svgGas      = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="22" x2="15" y2="22"/><line x1="4" y1="9" x2="14" y2="9"/><path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"/><path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2 2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5"/></svg>`;
    const svgTree     = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 14a5 5 0 1 0-10 0c0 4.4 5 8 5 8s5-3.6 5-8z"/><path d="M12 14V2"/></svg>`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Solar Production Report — ${customer.name}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=IBM+Plex+Sans:wght@400;500;600&display=swap');

    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { background: #f1f5f9; }
    body {
      font-family: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
      color: #1e293b; padding: 32px 16px;
      -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
    }
    .display { font-family: 'DM Sans', -apple-system, sans-serif; letter-spacing: -0.02em; }
    .wrap { max-width: 640px; margin: 0 auto; }
    .card { background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04), 0 4px 24px rgba(15, 23, 42, 0.06); }

    /* ── Header bar ── */
    .header {
      background: #0f172a; padding: 18px 36px;
      display: flex; align-items: center; justify-content: space-between;
    }
    .header img { height: 22px; filter: brightness(0) invert(1); display: block; }
    .header .tag {
      font-size: 9.5px; color: #94a3b8; letter-spacing: 1.6px;
      text-transform: uppercase; font-weight: 700;
    }

    /* ── Cover ── */
    .cover {
      background: linear-gradient(135deg, #f97316 0%, #ea580c 60%, #c2410c 100%);
      padding: 56px 36px 48px; position: relative; overflow: hidden;
    }
    .cover::before {
      content: ''; position: absolute; right: -120px; top: -120px;
      width: 360px; height: 360px; border-radius: 50%;
      background: radial-gradient(circle, rgba(255,255,255,0.12), transparent 70%);
    }
    .cover::after {
      content: ''; position: absolute; right: 40px; bottom: -100px;
      width: 220px; height: 220px; border-radius: 50%;
      background: radial-gradient(circle, rgba(255,255,255,0.08), transparent 70%);
    }
    .cover-eyebrow {
      display: inline-block;
      font-size: 9.5px; font-weight: 700; letter-spacing: 2.5px; text-transform: uppercase;
      color: rgba(255,255,255,0.85);
      padding: 5px 11px; background: rgba(255,255,255,0.15);
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 999px; margin-bottom: 18px;
    }
    .cover h1 {
      font-size: 36px; font-weight: 800; color: #fff; line-height: 1.1;
      letter-spacing: -0.04em; max-width: 80%;
    }
    .cover .subtitle {
      font-size: 14px; color: rgba(255,255,255,0.85); margin-top: 10px;
      font-weight: 500;
    }
    .cover-meta {
      display: flex; gap: 24px; margin-top: 28px;
      padding-top: 22px; border-top: 1px solid rgba(255,255,255,0.18);
      position: relative; z-index: 2;
    }
    .cover-meta-item .cm-label {
      font-size: 9.5px; font-weight: 700; letter-spacing: 1.4px;
      text-transform: uppercase; color: rgba(255,255,255,0.6);
      margin-bottom: 4px;
    }
    .cover-meta-item .cm-value {
      font-size: 13px; font-weight: 600; color: #fff;
    }

    /* ── Greeting ── */
    .greeting {
      padding: 32px 36px 0;
    }
    .greeting-text {
      font-size: 14.5px; color: #334155; line-height: 1.75;
      font-weight: 400;
    }
    .greeting-text strong { color: #0f172a; font-weight: 600; }

    /* ── Section labels (editorial style) ── */
    .section { padding: 36px 36px 0; }
    .section-eyebrow {
      display: flex; align-items: center; gap: 10px; margin-bottom: 22px;
    }
    .section-eyebrow .num {
      display: inline-flex; align-items: center; justify-content: center;
      width: 22px; height: 22px; border-radius: 50%;
      background: #fef3c7; color: #d97706;
      font-size: 11px; font-weight: 800; font-family: 'DM Sans', sans-serif;
    }
    .section-eyebrow .label {
      font-size: 10.5px; font-weight: 700; letter-spacing: 2px;
      text-transform: uppercase; color: #475569;
    }
    .section-title {
      font-size: 22px; font-weight: 700; color: #0f172a;
      letter-spacing: -0.02em; margin-bottom: 6px;
      font-family: 'DM Sans', sans-serif;
    }
    .section-sub {
      font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 24px;
    }

    /* ── Metrics grid ── */
    .metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .metric {
      padding: 22px 22px 24px;
      border: 1px solid #e2e8f0; border-radius: 14px;
      background: #fff; position: relative;
    }
    .metric .m-head {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 16px;
    }
    .metric .m-icon {
      width: 36px; height: 36px; border-radius: 10px;
      display: inline-flex; align-items: center; justify-content: center;
      background: #fef3c7;
    }
    .metric.green .m-icon  { background: #d1fae5; }
    .metric.blue  .m-icon  { background: #dbeafe; }
    .metric.teal  .m-icon  { background: #ccfbf1; }
    .metric .m-trend {
      font-size: 10px; font-weight: 700; padding: 3px 8px;
      border-radius: 999px; background: #f1f5f9; color: #64748b;
      letter-spacing: 0.3px;
    }
    .metric .m-value {
      font-size: 32px; font-weight: 800; color: #0f172a; line-height: 1;
      letter-spacing: -0.03em; font-family: 'DM Sans', sans-serif;
    }
    .metric .m-value .m-unit {
      font-size: 13px; font-weight: 500; color: #94a3b8;
      margin-left: 4px; letter-spacing: 0; font-family: 'IBM Plex Sans', sans-serif;
    }
    .metric .m-label {
      font-size: 11.5px; font-weight: 600; color: #475569;
      text-transform: uppercase; letter-spacing: 0.8px; margin-top: 8px;
    }
    .metric .m-sub {
      font-size: 11px; color: #94a3b8; margin-top: 4px; font-weight: 400;
    }
    .metric.green .m-value { color: #047857; }
    .metric.blue  .m-value { color: #1d4ed8; }
    .metric.teal  .m-value { color: #0f766e; }

    /* ── Chart section ── */
    .chart-card {
      margin-top: 18px; padding: 22px 24px 18px;
      border: 1px solid #e2e8f0; border-radius: 14px;
      background: linear-gradient(180deg, #fffbf5 0%, #ffffff 100%);
    }
    .chart-head {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 14px;
    }
    .chart-title {
      font-size: 12.5px; font-weight: 700; color: #334155;
      letter-spacing: 0.3px;
    }
    .chart-period {
      font-size: 10.5px; color: #94a3b8; font-weight: 600;
      letter-spacing: 0.6px; text-transform: uppercase;
    }

    /* ── Impact band ── */
    .impact-band {
      margin-top: 18px; padding: 20px 24px;
      background: #0f172a; border-radius: 14px;
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;
    }
    .impact-item {
      display: flex; align-items: center; gap: 12px;
    }
    .impact-item .ii-icon {
      width: 36px; height: 36px; border-radius: 10px;
      background: rgba(249, 115, 22, 0.15); border: 1px solid rgba(249, 115, 22, 0.3);
      display: inline-flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .impact-item .ii-icon svg { stroke: #fb923c !important; }
    .impact-item .ii-val {
      font-size: 18px; font-weight: 800; color: #fff;
      line-height: 1.05; font-family: 'DM Sans', sans-serif;
      letter-spacing: -0.02em;
    }
    .impact-item .ii-label {
      font-size: 10px; color: #94a3b8; margin-top: 2px;
      letter-spacing: 0.4px; line-height: 1.3;
    }

    /* ── First-report empty state ── */
    .first-report {
      margin-top: 16px; padding: 24px 26px;
      background: #fefce8; border: 1px solid #fde68a;
      border-radius: 14px;
    }
    .first-report .fr-eyebrow {
      font-size: 10px; font-weight: 700; color: #a16207;
      letter-spacing: 1.4px; text-transform: uppercase;
      margin-bottom: 6px;
    }
    .first-report .fr-title {
      font-size: 15px; font-weight: 700; color: #713f12;
      letter-spacing: -0.01em; margin-bottom: 6px;
      font-family: 'DM Sans', sans-serif;
    }
    .first-report .fr-body {
      font-size: 13px; color: #854d0e; line-height: 1.6;
    }

    /* ── Service stats ── */
    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .stat {
      padding: 20px 18px; text-align: center;
      border: 1px solid #e2e8f0; border-radius: 12px; background: #fafafa;
    }
    .stat .s-val {
      font-size: 28px; font-weight: 800; color: #0f172a;
      line-height: 1; letter-spacing: -0.02em;
      font-family: 'DM Sans', sans-serif;
    }
    .stat .s-val .s-unit { font-size: 13px; color: #94a3b8; font-weight: 500; }
    .stat .s-val.green { color: #047857; }
    .stat .s-val.amber { color: #b45309; }
    .stat .s-label {
      font-size: 10.5px; font-weight: 700; color: #475569;
      text-transform: uppercase; letter-spacing: 0.8px; margin-top: 8px;
    }
    .stat .s-sub {
      font-size: 10px; color: #94a3b8; margin-top: 3px;
    }

    /* ── Lifetime stat ── */
    .lifetime {
      margin-top: 18px; padding: 22px 26px;
      border: 1px solid #fed7aa;
      background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%);
      border-radius: 14px;
      display: flex; align-items: center; justify-content: space-between;
    }
    .lifetime .lt-left .lt-label {
      font-size: 10px; font-weight: 700; letter-spacing: 1.4px;
      text-transform: uppercase; color: #9a3412; margin-bottom: 4px;
    }
    .lifetime .lt-left .lt-sub {
      font-size: 12.5px; color: #7c2d12; font-weight: 500;
    }
    .lifetime .lt-val {
      font-size: 28px; font-weight: 800; color: #c2410c;
      letter-spacing: -0.02em; font-family: 'DM Sans', sans-serif;
    }
    .lifetime .lt-val .lt-unit { font-size: 13px; font-weight: 500; color: #ea580c; }

    /* ── System details ── */
    .details {
      display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;
    }
    .detail-cell {
      padding: 14px 16px; border: 1px solid #e2e8f0;
      border-radius: 10px; background: #fafafa;
    }
    .detail-cell .dl {
      font-size: 9.5px; font-weight: 700; color: #64748b;
      letter-spacing: 1.2px; text-transform: uppercase; margin-bottom: 4px;
    }
    .detail-cell .dv {
      font-size: 13px; font-weight: 600; color: #0f172a;
    }

    /* ── Account updates ── */
    .updates {
      margin: 28px 36px 0; padding: 22px 24px;
      border: 1px solid #fed7aa; border-radius: 14px;
      background: #fffbf5;
    }
    .updates-header {
      display: flex; align-items: center; gap: 8px; margin-bottom: 12px;
    }
    .updates-title {
      font-size: 11px; font-weight: 700; color: #9a3412;
      letter-spacing: 1.4px; text-transform: uppercase;
    }
    .updates-body {
      font-size: 13.5px; color: #374151; line-height: 1.75;
    }

    /* ── Review CTA ── */
    .review {
      margin: 36px 36px 0; padding: 36px 32px;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      border-radius: 16px; text-align: center; position: relative; overflow: hidden;
    }
    .review::before {
      content: ''; position: absolute; top: -50px; left: 50%;
      transform: translateX(-50%); width: 280px; height: 200px;
      background: radial-gradient(ellipse, rgba(249,115,22,0.15), transparent 70%);
    }
    .review-stars {
      display: flex; justify-content: center; gap: 4px; margin-bottom: 16px;
      position: relative; z-index: 1;
    }
    .review-headline {
      font-size: 20px; font-weight: 700; color: #fff;
      margin-bottom: 10px; letter-spacing: -0.02em;
      font-family: 'DM Sans', sans-serif; position: relative; z-index: 1;
    }
    .review-sub {
      font-size: 13px; color: #94a3b8; line-height: 1.65;
      margin-bottom: 22px; max-width: 380px;
      margin-left: auto; margin-right: auto; position: relative; z-index: 1;
    }
    .review-btn {
      display: inline-block; padding: 13px 32px;
      background: #fff; color: #0f172a !important;
      text-decoration: none; border-radius: 10px;
      font-size: 13px; font-weight: 700; letter-spacing: 0.3px;
      position: relative; z-index: 1;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
    }

    /* ── Alert ── */
    .alert {
      margin: 28px 36px 0; padding: 22px 24px;
      border: 1px solid #fcd34d; border-radius: 14px; background: #fffbeb;
    }
    .alert-title {
      font-size: 11px; font-weight: 700; color: #92400e;
      letter-spacing: 1.2px; text-transform: uppercase; margin-bottom: 8px;
    }
    .alert-body {
      font-size: 13.5px; color: #78350f; line-height: 1.7;
    }
    .alert-btn {
      display: inline-block; margin-top: 14px; padding: 10px 22px;
      background: #f59e0b; color: #fff !important;
      text-decoration: none; border-radius: 8px;
      font-size: 12px; font-weight: 700; letter-spacing: 0.3px;
    }

    /* ── Footer ── */
    .footer {
      margin-top: 40px; padding: 28px 36px;
      background: #f8fafc; border-top: 1px solid #e2e8f0;
      text-align: center;
    }
    .footer-logo {
      height: 18px; margin: 0 auto 12px; display: block;
      opacity: 0.6;
    }
    .footer p {
      font-size: 11px; color: #94a3b8; line-height: 1.85;
    }
    .footer a {
      color: #f97316 !important; text-decoration: none; font-weight: 600;
    }
    .footer .footer-unsub {
      color: #cbd5e1; font-size: 10px;
      display: inline-block; margin-top: 8px;
    }

    /* ── Print optimization ── */
    @page {
      size: letter;
      margin: 0.5in;
    }
    @media print {
      html, body { background: #fff !important; padding: 0 !important; }
      .wrap { max-width: 100% !important; }
      .card {
        box-shadow: none !important; border: 1px solid #e2e8f0 !important;
        border-radius: 0 !important;
      }
      .review, .header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .cover { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .impact-band { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .section { page-break-inside: avoid; }
      .review { page-break-before: avoid; }
      .footer { page-break-inside: avoid; }
      a { text-decoration: none !important; color: #0f172a !important; }
    }
  </style>
</head>
<body>
<div class="wrap">
  <div class="card">

    <!-- Header -->
    <div class="header">
      <img src="https://solarflow-dashboard-sooty.vercel.app/conexsol-logo.png" alt="Conexsol" />
      <span class="tag">Production Report · ${reportDate}</span>
    </div>

    <!-- Cover -->
    <div class="cover">
      <div class="cover-eyebrow">Solar Performance Report</div>
      <h1 class="display">${customer.name}</h1>
      <p class="subtitle">${siteData?.siteName || 'SolarEdge System'}${siteId ? '&nbsp;·&nbsp;Site #' + siteId : ''}</p>
      <div class="cover-meta">
        <div class="cover-meta-item">
          <div class="cm-label">Reporting Period</div>
          <div class="cm-value">${periodLabel}</div>
        </div>
        <div class="cover-meta-item">
          <div class="cm-label">System Size</div>
          <div class="cm-value">${systemSize ? systemSize + ' kW' : '—'}</div>
        </div>
        <div class="cover-meta-item">
          <div class="cm-label">Location</div>
          <div class="cm-value">${[customer.city, customer.state].filter(Boolean).join(', ') || 'Florida'}</div>
        </div>
      </div>
    </div>

    <!-- Greeting -->
    ${previewGreeting ? `
    <div class="greeting">
      <p class="greeting-text">${previewGreeting.replace(/\n/g, '<br/>')}</p>
    </div>` : ''}

    <!-- Section 01: Performance -->
    <div class="section">
      <div class="section-eyebrow">
        <span class="num">01</span>
        <span class="label">Performance Summary</span>
      </div>
      <h2 class="section-title">${isFirstReport ? 'System initialization in progress' : 'Your system delivered measurable results'}</h2>
      <p class="section-sub">${isFirstReport ? 'Data collection begins once your system completes its commissioning period. Detailed metrics will appear in your next report.' : `Below are the key performance indicators for the ${periodLabel.toLowerCase()}.`}</p>

      <div class="metrics">
        <div class="metric">
          <div class="m-head">
            <span class="m-icon">${svgBolt}</span>
            ${isFirstReport ? '' : '<span class="m-trend">' + periodLabel + '</span>'}
          </div>
          <div class="m-value">${displayKwh >= 1000 ? (displayKwh / 1000).toFixed(2) : (displayKwh > 0 ? Math.round(displayKwh) : '—')}<span class="m-unit">${displayKwh > 0 ? (displayKwh >= 1000 ? 'MWh' : 'kWh') : ''}</span></div>
          <div class="m-label">Energy Produced</div>
          <div class="m-sub">Clean solar electricity generated</div>
        </div>

        <div class="metric green">
          <div class="m-head">
            <span class="m-icon">${svgDollar}</span>
            ${dollarsSaved > 0 ? '<span class="m-trend">@ $' + COST_PER_KWH + '/kWh</span>' : ''}
          </div>
          <div class="m-value">${dollarsSaved > 0 ? '$' + dollarsSaved.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'}</div>
          <div class="m-label">Estimated Savings</div>
          <div class="m-sub">Versus grid electricity costs</div>
        </div>

        <div class="metric blue">
          <div class="m-head">
            <span class="m-icon">${svgGauge}</span>
            ${specificYield > 0 ? '<span class="m-trend">per kWp</span>' : ''}
          </div>
          <div class="m-value">${specificYield > 0 ? specificYield.toFixed(2) : '—'}<span class="m-unit">${specificYield > 0 ? 'kWh/kWp' : ''}</span></div>
          <div class="m-label">Specific Yield</div>
          <div class="m-sub">System efficiency benchmark</div>
        </div>

        <div class="metric teal">
          <div class="m-head">
            <span class="m-icon">${svgLeaf}</span>
            ${co2Tons > 0 ? '<span class="m-trend">CO₂</span>' : ''}
          </div>
          <div class="m-value">${co2Tons > 0 ? co2Tons.toFixed(2) : '—'}<span class="m-unit">${co2Tons > 0 ? 'tons' : ''}</span></div>
          <div class="m-label">CO₂ Offset</div>
          <div class="m-sub">Carbon emissions avoided</div>
        </div>
      </div>

      ${chartData.length > 0 && displayKwh > 0 ? `
      <div class="chart-card">
        <div class="chart-head">
          <span class="chart-title">Daily Production</span>
          <span class="chart-period">${periodLabel.toUpperCase()}</span>
        </div>
        ${productionChart}
      </div>` : ''}

      ${isFirstReport ? `
      <div class="first-report">
        <div class="fr-eyebrow">Welcome aboard</div>
        <div class="fr-title">Your solar journey begins now</div>
        <div class="fr-body">This is your initial performance baseline. Once the system has been actively producing for a full reporting period, you'll see detailed energy production, savings, and environmental impact data here. Most systems begin showing measurable production within 24-48 hours of commissioning.</div>
      </div>` : ''}

      ${lifetimeKwh > 0 ? `
      <div class="lifetime">
        <div class="lt-left">
          <div class="lt-label">Lifetime Production</div>
          <div class="lt-sub">Since ${siteData?.installDate || 'installation'}</div>
        </div>
        <div class="lt-val">${lifetimeKwh >= 1000 ? (lifetimeKwh / 1000).toFixed(1) : lifetimeKwh.toFixed(0)}<span class="lt-unit"> ${lifetimeKwh >= 1000 ? 'MWh' : 'kWh'}</span></div>
      </div>` : ''}
    </div>

    <!-- Section 02: Environmental Impact -->
    ${displayKwh > 0 ? `
    <div class="section">
      <div class="section-eyebrow">
        <span class="num">02</span>
        <span class="label">Real-World Impact</span>
      </div>
      <h2 class="section-title">What ${displayKwh >= 1000 ? (displayKwh / 1000).toFixed(1) + ' MWh' : Math.round(displayKwh) + ' kWh'} really means</h2>
      <p class="section-sub">Your clean energy generation translates into tangible environmental benefits.</p>

      <div class="impact-band">
        <div class="impact-item">
          <span class="ii-icon">${svgCar}</span>
          <div>
            <div class="ii-val">${milesNotDriven.toLocaleString('en-US')}</div>
            <div class="ii-label">Miles not driven<br/>in a gas vehicle</div>
          </div>
        </div>
        <div class="impact-item">
          <span class="ii-icon">${svgGas}</span>
          <div>
            <div class="ii-val">${gallonsGasoline.toFixed(1)}</div>
            <div class="ii-label">Gallons of gasoline<br/>equivalent</div>
          </div>
        </div>
        <div class="impact-item">
          <span class="ii-icon">${svgTree}</span>
          <div>
            <div class="ii-val">${treesPlantedEquiv}</div>
            <div class="ii-label">Trees planted<br/>(annual equiv.)</div>
          </div>
        </div>
      </div>
    </div>` : ''}

    <!-- Section 03: Service Availability -->
    <div class="section">
      <div class="section-eyebrow">
        <span class="num">${displayKwh > 0 ? '03' : '02'}</span>
        <span class="label">System Availability</span>
      </div>
      <h2 class="section-title">Service & uptime</h2>
      <p class="section-sub">A healthy system runs ${previewUptime >= 95 ? 'consistently — and yours is performing right on track.' : 'predictably. Here\'s how yours performed.'}</p>

      <div class="stats">
        <div class="stat">
          <div class="s-val ${previewUptime >= 95 ? 'green' : 'amber'}">${previewUptime.toFixed(0)}<span class="s-unit">%</span></div>
          <div class="s-label">System Uptime</div>
          <div class="s-sub">Days with production</div>
        </div>
        <div class="stat">
          <div class="s-val green">${previewServiceCalls}</div>
          <div class="s-label">Service Calls</div>
          <div class="s-sub">${periodLabel}</div>
        </div>
        <div class="stat">
          <div class="s-val ${previewDowntimeDays > 0 ? 'amber' : 'green'}">${previewDowntimeDays}</div>
          <div class="s-label">Downtime Days</div>
          <div class="s-sub">${periodLabel}</div>
        </div>
      </div>
    </div>

    <!-- Section 04: System Details -->
    <div class="section" style="padding-bottom: 8px;">
      <div class="section-eyebrow">
        <span class="num">${displayKwh > 0 ? '04' : '03'}</span>
        <span class="label">System Specifications</span>
      </div>
      <h2 class="section-title">Equipment & install details</h2>

      <div class="details">
        ${systemSize ? `<div class="detail-cell"><div class="dl">System Size</div><div class="dv">${systemSize} kW</div></div>` : ''}
        ${siteData?.installDate ? `<div class="detail-cell"><div class="dl">Install Date</div><div class="dv">${siteData.installDate}</div></div>` : ''}
        <div class="detail-cell"><div class="dl">System Type</div><div class="dv">${siteData?.systemType || 'SolarEdge'}</div></div>
        ${siteData?.module ? `<div class="detail-cell"><div class="dl">Module</div><div class="dv">${siteData.module}</div></div>` : ''}
        <div class="detail-cell"><div class="dl">Site ID</div><div class="dv">#${siteId}</div></div>
        ${(customer.city || customer.state) ? `<div class="detail-cell"><div class="dl">Location</div><div class="dv">${[customer.city, customer.state].filter(Boolean).join(', ')}</div></div>` : ''}
      </div>
    </div>

    ${previewAccountUpdates ? `
    <div class="updates">
      <div class="updates-header">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9a3412" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span class="updates-title">Account Updates</span>
      </div>
      <div class="updates-body">${previewAccountUpdates.replace(/\n/g, '<br/>')}</div>
    </div>` : ''}

    ${hasOverdue ? `
    <div class="alert">
      <div class="alert-title">Balance Reminder</div>
      <div class="alert-body">We noticed an open balance on your account. To ensure uninterrupted service monitoring and support, please submit payment at your earliest convenience.</div>
      <a href="https://solarflow-dashboard-sooty.vercel.app/api/track?event=click&target=invoice&id=${tid}&redirect=${encodeURIComponent(overdueInvs[0]?.InvoiceID ? 'https://invoicing.xero.com/view/' + overdueInvs[0].InvoiceID : '#')}" class="alert-btn">View Invoice →</a>
    </div>` : ''}

    <!-- Review CTA -->
    <div class="review">
      <div class="review-stars">${svgStar}${svgStar}${svgStar}${svgStar}${svgStar}</div>
      <div class="review-headline">Enjoying the savings?</div>
      <div class="review-sub">Your feedback helps us grow and serve more homeowners in your community. It takes less than 60 seconds.</div>
      <a href="https://solarflow-dashboard-sooty.vercel.app/api/track?event=click&target=review&id=${tid}&redirect=${encodeURIComponent('https://g.page/r/conexsol/review')}" class="review-btn">Leave Us a Google Review</a>
    </div>

    <!-- Footer -->
    <div class="footer">
      <img class="footer-logo" src="https://solarflow-dashboard-sooty.vercel.app/conexsol-logo.png" alt="Conexsol" />
      <p>
        <a href="https://solarflow-dashboard-sooty.vercel.app/api/track?event=click&target=website&id=${tid}&redirect=${encodeURIComponent('https://conexsol.us')}">conexsol.us</a>
        &nbsp;·&nbsp; Florida Solar Service &nbsp;·&nbsp; Report generated ${reportDate}
        <br/>
        <span class="footer-unsub">To stop receiving reports, reply to this email.</span>
      </p>
    </div>

  </div><!-- /card -->
</div>
<img src="${trackingPixel}" width="1" height="1" alt="" style="display:none;" />
</body>
</html>`;

    return html;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showReportPreview, previewTrackingId, previewGreeting, previewAccountUpdates, previewDowntimeDays, previewServiceCalls, previewUptime, displayKwh, dollarsSaved, specificYield, co2Tons, lifetimeKwh, graphPeriod, peakPowerKw, siteId, siteData, customer, energyData]);

  // Approve & Send — sends via SMTP API (IONOS) or falls back to mailto
  const [sendError, setSendError] = useState<string | null>(null);
  const handleSendReport = async () => {
    const recipientEmail = previewEmail.trim();
    if (!recipientEmail || !previewHtmlComputed) return;
    setSendingReport(true);
    setSendError(null);

    const smtpUser = localStorage.getItem('solarops_smtp_user');
    const smtpPass = sessionStorage.getItem('solarops_smtp_pass');
    const smtpHost = localStorage.getItem('solarops_smtp_host') || 'smtp.ionos.com';
    const smtpPort = parseInt(localStorage.getItem('solarops_smtp_port') || '465');
    const fromName = localStorage.getItem('solarops_smtp_from_name') || 'Conexsol Energy';
    const subject = `Solar Production Report — ${customer.name}`;

    localStorage.setItem(`solarops_report_${previewTrackingId}`, JSON.stringify({
      to: recipientEmail,
      bcc: 'cesar.jurado@conexsol.us',
      subject,
      trackingId: previewTrackingId,
      sentAt: new Date().toISOString(),
    }));

    if (smtpUser && smtpPass) {
      try {
        const res = await fetch('/api/send-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: recipientEmail,
            subject,
            html: previewHtmlComputed,
            smtpHost,
            smtpPort,
            smtpUser,
            smtpPass,
            fromName,
            bcc: 'cesar.jurado@conexsol.us',
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setSendError(data.error || 'Failed to send');
          setSendingReport(false);
          return;
        }
        setShowReportPreview(false);
        setReportSent(true);
        setTimeout(() => setReportSent(false), 4000);
      } catch (err) {
        console.error('SMTP send failed:', err);
        setSendError('Network error — check your connection');
      }
    } else {
      const subjectEnc = encodeURIComponent(subject);
      const bcc = encodeURIComponent('cesar.jurado@conexsol.us');
      window.open(
        `mailto:${recipientEmail}?subject=${subjectEnc}&bcc=${bcc}&body=${encodeURIComponent('Please view the attached HTML report for your solar production summary.\n\n— Conexsol Service Team')}`,
        '_blank'
      );
      setShowReportPreview(false);
      setReportSent(true);
      setTimeout(() => setReportSent(false), 4000);
    }
    setSendingReport(false);
  };


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
            <InfoTooltip text="Energy production (bars) and Peak Sun Hours (line) by site location. PSH = daily solar radiation ÷ 3.6 — higher PSH means more available solar energy." />
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
              {(() => {
                const hasPsh = energyData.some(d => d.psh != null);
                return (
                <ComposedChart data={energyData} margin={{ top: 18, right: hasPsh ? 8 : 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  {hasPsh && (
                    <YAxis
                      yAxisId="psh"
                      orientation="left"
                      domain={[0, (max: number) => Math.ceil(Math.max(max, 1) * 1.2)]}
                      tick={{ fontSize: 10, fill: '#d97706' }}
                      stroke="#d97706"
                      width={32}
                      label={{ value: 'PSH', angle: -90, position: 'insideLeft', style: { fontSize: 9, fill: '#d97706' }, offset: 6 }}
                    />
                  )}
                  <YAxis
                    yAxisId="kwh"
                    orientation="right"
                    tick={{ fontSize: 10 }}
                    stroke="#f97316"
                    unit=" kWh"
                    width={52}
                  />
                  <RechartsTooltip
                    contentStyle={{ borderRadius: 8, fontSize: 12 }}
                    formatter={(value: number, name: string) =>
                      name === 'psh'
                        ? [`${value?.toFixed(1)} kWh/m²`, 'Peak Sun Hours']
                        : [`${value?.toFixed(1)} kWh · $${(value * COST_PER_KWH).toFixed(2)}`, 'Production']
                    }
                  />
                  {hasPsh && (
                    <Legend
                      wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                      formatter={(val: string) => val === 'psh' ? 'Peak Sun Hours' : 'Production (kWh)'}
                    />
                  )}
                  <Bar
                    yAxisId="kwh" dataKey="kWh" fill="#f97316" opacity={0.85} radius={[3, 3, 0, 0]} name="kWh"
                    label={({ x, y, width: w, value: v }: { x: number; y: number; width: number; value: number }) =>
                      v > 0 ? (
                        <text x={x + w / 2} y={y - 4} textAnchor="middle" fontSize={8} fontWeight={600} fill="#16a34a">
                          ${(v * COST_PER_KWH).toFixed(0)}
                        </text>
                      ) : null
                    }
                  />
                  {hasPsh && (
                    <Line
                      yAxisId="psh"
                      type="monotone"
                      dataKey="psh"
                      stroke="#fbbf24"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: '#f59e0b', stroke: '#d97706', strokeWidth: 1 }}
                      activeDot={{ r: 5, fill: '#f59e0b' }}
                      connectNulls
                      name="psh"
                    />
                  )}
                </ComposedChart>
                );
              })()}

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
          className="fixed inset-0 z-[200] bg-black/70 flex items-start justify-center p-2 sm:p-4 overflow-y-auto"
          onClick={() => setShowReportPreview(false)}
        >
          <div
            className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col my-4"
            onClick={e => e.stopPropagation()}
          >
            {/* ── Modal Header ── */}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-900 text-white rounded-t-2xl flex-shrink-0">
              <div className="flex items-center gap-2">
                <FileBarChart className="w-4 h-4 text-orange-400" />
                <span className="font-semibold text-sm">Production Report</span>
                <span className="text-xs text-slate-400 hidden sm:inline">— {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowEditPanel(v => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                >
                  <Pencil className="w-3 h-3" />
                  Edit Fields
                  {showEditPanel ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
                <button onClick={() => setShowReportPreview(false)} className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* ── Collapsible Edit Panel ── */}
            {showEditPanel && (
              <div className="border-b border-orange-200 bg-orange-50 px-4 py-3 space-y-3 flex-shrink-0">
                <p className="text-[10px] font-bold text-orange-700 uppercase tracking-widest">Edit Fields — live preview updates below</p>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Greeting Message</label>
                  <textarea
                    value={previewGreeting}
                    onChange={e => setPreviewGreeting(e.target.value)}
                    rows={3}
                    className="w-full text-xs text-slate-700 border border-orange-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none bg-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Account Updates / Notes</label>
                  <textarea
                    value={previewAccountUpdates}
                    onChange={e => setPreviewAccountUpdates(e.target.value)}
                    rows={2}
                    placeholder="Add observations, recommendations, or updates…"
                    className="w-full text-xs text-slate-700 border border-orange-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none bg-white"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Service Calls</label>
                    <input type="number" min={0} value={previewServiceCalls}
                      onChange={e => setPreviewServiceCalls(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full text-sm font-semibold text-slate-800 border border-orange-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Downtime Days</label>
                    <input type="number" min={0} value={previewDowntimeDays}
                      onChange={e => setPreviewDowntimeDays(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full text-sm font-semibold text-slate-800 border border-orange-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Uptime %</label>
                    <input type="number" min={0} max={100} value={Math.round(previewUptime)}
                      onChange={e => setPreviewUptime(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                      className="w-full text-sm font-semibold text-slate-800 border border-orange-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white" />
                  </div>
                </div>
              </div>
            )}

            {/* ── Native Report Preview (scrollable) ── */}
            <div id="report-printable" className="flex-1 overflow-y-auto bg-slate-50" style={{ maxHeight: '72vh' }}>

              {/* Print-only logo header (hidden on screen, visible when printing) */}
              <div className="hidden print:flex items-center justify-between px-5 py-4 bg-white border-b border-slate-200">
                <img src="/conexsol-logo-color.svg" alt="Conexsol" className="h-10" />
                <div className="text-right">
                  <p className="text-sm font-bold text-slate-800">Solar Performance Report</p>
                  <p className="text-xs text-slate-500">{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                </div>
              </div>

              {/* 1 — Client Info Header */}
              <div className="bg-slate-900 px-5 py-5 flex flex-col sm:flex-row sm:items-start gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-orange-400 uppercase tracking-widest mb-1">Solar Production Report</p>
                  <h2 className="text-xl font-bold text-white leading-tight mb-0.5">{customer.name}</h2>
                  {(customer.address || customer.city) && (
                    <p className="text-sm text-slate-300 flex items-center gap-1.5 mt-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      {[customer.address, customer.city, customer.state].filter(Boolean).join(', ')}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                    {customer.phone && (
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <Phone className="w-3 h-3" />{customer.phone}
                      </span>
                    )}
                    {customer.email && (
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <Mail className="w-3 h-3" />{customer.email}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0 bg-slate-800 rounded-xl px-4 py-3 text-right min-w-[140px]">
                  {peakPowerKw > 0 && (
                    <div className="mb-2">
                      <p className="text-2xl font-bold text-orange-400 leading-none">{peakPowerKw.toFixed(1)}<span className="text-sm font-medium text-orange-300 ml-0.5">kW</span></p>
                      <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide mt-0.5">System Size</p>
                    </div>
                  )}
                  {siteId && (
                    <div className="mb-1.5">
                      <p className="text-xs font-bold text-slate-200">#{siteId}</p>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide">Site ID</p>
                    </div>
                  )}
                  {siteData?.installDate && (
                    <div>
                      <p className="text-xs font-medium text-slate-300">{new Date(siteData.installDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</p>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide">Installed</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Period badge */}
              <div className="px-5 pt-4 pb-1">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-semibold">
                  <Sun className="w-3.5 h-3.5" />
                  {graphPeriod === 'week' ? 'Last 7 Days' : graphPeriod === 'month' ? 'Last 30 Days' : graphPeriod === 'quarter' ? 'Last 3 Months' : 'Last 12 Months'} Performance
                </span>
              </div>

              {/* 2 — Production Metrics */}
              <div className="px-5 pt-3 pb-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { icon: <Zap className="w-4 h-4 text-orange-500" />, value: displayKwh >= 1000 ? `${(displayKwh/1000).toFixed(1)} MWh` : `${Math.round(displayKwh).toLocaleString()} kWh`, label: 'Energy Generated', color: 'orange' },
                  { icon: <DollarSign className="w-4 h-4 text-green-600" />, value: `$${Math.round(dollarsSaved).toLocaleString()}`, label: 'Est. Savings', color: 'green' },
                  { icon: <BarChart3 className="w-4 h-4 text-blue-500" />, value: specificYield > 0 ? `${specificYield.toFixed(2)}` : '—', label: 'Specific Yield', color: 'blue' },
                  { icon: <Leaf className="w-4 h-4 text-emerald-600" />, value: `${co2Tons.toFixed(2)} t`, label: 'CO₂ Offset', color: 'emerald' },
                ].map(({ icon, value, label, color }) => (
                  <div key={label} className="bg-white border border-slate-100 rounded-xl p-3 text-center shadow-sm">
                    <div className="flex justify-center mb-1.5">{icon}</div>
                    <p className={`text-lg font-bold leading-none text-${color}-600`}>{value}</p>
                    <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wide mt-1">{label}</p>
                  </div>
                ))}
              </div>

              {/* 3 — Production Time Graph */}
              {energyData.length > 0 && (
                <div className="mx-5 mb-4 bg-white rounded-xl border border-slate-100 shadow-sm p-3">
                  <p className="text-xs font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
                    <BarChart3 className="w-3.5 h-3.5 text-orange-500" />
                    Daily Production History
                  </p>
                  <div style={{ height: 160 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={energyData} margin={{ top: 16, right: 40, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="date" tick={{ fontSize: 9 }} stroke="#cbd5e1" interval="preserveStartEnd" />
                        <YAxis yAxisId="kwh" tick={{ fontSize: 9 }} stroke="#f97316" unit=" kWh" width={48} />
                        {energyData.some(d => d.psh) && (
                          <YAxis
                            yAxisId="psh"
                            orientation="right"
                            domain={[0, (max: number) => Math.ceil(Math.max(max, 1) * 1.2)]}
                            tick={{ fontSize: 9, fill: '#d97706' }}
                            stroke="#d97706"
                            width={36}
                            label={{ value: 'PSH', angle: 90, position: 'insideRight', style: { fontSize: 9, fill: '#d97706' }, offset: -2 }}
                          />
                        )}
                        <RechartsTooltip
                          contentStyle={{ borderRadius: 8, fontSize: 11, padding: '6px 10px' }}
                          formatter={(value: number, name: string) =>
                            name === 'psh' ? [`${value?.toFixed(1)} kWh/m²`, 'Peak Sun Hours'] : [`${value?.toFixed(1)} kWh · $${(value * COST_PER_KWH).toFixed(2)}`, 'Production']
                          }
                        />
                        <Bar
                          yAxisId="kwh" dataKey="kWh" fill="#f97316" opacity={0.85} radius={[3, 3, 0, 0]} name="kWh"
                          label={({ x, y, width: w, value: v }: { x: number; y: number; width: number; value: number }) =>
                            v > 0 ? (
                              <text x={x + w / 2} y={y - 3} textAnchor="middle" fontSize={7} fontWeight={600} fill="#16a34a">
                                ${(v * COST_PER_KWH).toFixed(0)}
                              </text>
                            ) : null
                          }
                        />
                        {energyData.some(d => d.psh) && (
                          <Line yAxisId="psh" type="monotone" dataKey="psh" stroke="#fbbf24" strokeWidth={2}
                            dot={false} connectNulls name="psh" />
                        )}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* 4 — Service Summary */}
              <div className="mx-5 mb-4 grid grid-cols-3 gap-3">
                {[
                  { value: `${Math.round(previewUptime)}%`, label: 'System Uptime', ok: previewUptime >= 95 },
                  { value: previewDowntimeDays, label: 'Downtime Days', ok: previewDowntimeDays === 0 },
                  { value: previewServiceCalls, label: 'Service Calls', ok: previewServiceCalls === 0 },
                ].map(({ value, label, ok }) => (
                  <div key={label} className="bg-white border border-slate-100 rounded-xl p-3 text-center shadow-sm">
                    <p className={`text-xl font-bold ${ok ? 'text-green-600' : 'text-amber-600'}`}>{value}</p>
                    <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wide mt-0.5">{label}</p>
                  </div>
                ))}
              </div>

              {/* 5 — Greeting */}
              {previewGreeting && (
                <div className="mx-5 mb-4 bg-white rounded-xl border border-slate-100 shadow-sm">
                  <div className="px-4 pt-3 pb-1 border-b border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Message to Client</p>
                  </div>
                  <div className="px-4 py-3">
                    {previewGreeting.split('\n').map((line, i) => (
                      <p key={i} className={`text-sm text-slate-600 leading-relaxed ${i > 0 ? 'mt-2' : ''}`}>{line || <br />}</p>
                    ))}
                  </div>
                </div>
              )}

              {/* 6 — Account Updates */}
              {previewAccountUpdates && (
                <div className="mx-5 mb-5 bg-orange-50 rounded-xl border border-orange-200 shadow-sm overflow-hidden">
                  <div className="px-4 py-2.5 bg-orange-100 border-b border-orange-200 flex items-center gap-2">
                    <Info className="w-3.5 h-3.5 text-orange-700" />
                    <p className="text-[10px] font-bold text-orange-800 uppercase tracking-widest">Account Updates</p>
                  </div>
                  <div className="px-4 py-3">
                    {previewAccountUpdates.split('\n').map((line, i) => (
                      <p key={i} className={`text-sm text-orange-900 leading-relaxed ${i > 0 ? 'mt-1.5' : ''}`}>{line}</p>
                    ))}
                  </div>
                </div>
              )}

              {/* Conexsol footer bar */}
              <div className="mx-5 mb-5 rounded-xl bg-slate-800 px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-white">Conexsol</p>
                  <p className="text-[10px] text-slate-400">Solar Performance Report</p>
                </div>
                <p className="text-[10px] text-slate-500">{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
              </div>
            </div>

            {/* ── Footer ── */}
            <div className="px-4 py-3 border-t border-slate-200 bg-white rounded-b-2xl flex-shrink-0 space-y-2">
              {sendError && (
                <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {sendError}
                </div>
              )}
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-slate-400 mb-0.5">To:</p>
                  <input
                    type="email"
                    value={previewEmail}
                    onChange={e => setPreviewEmail(e.target.value)}
                    placeholder="recipient@example.com"
                    className="w-full px-2 py-1 text-sm border border-slate-200 rounded-lg text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-orange-400"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {localStorage.getItem('solarops_smtp_user')
                      ? `via ${localStorage.getItem('solarops_smtp_user')}`
                      : 'via mailto — configure SMTP in Settings'}
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => { setShowReportPreview(false); setSendError(null); }}
                    className="px-4 py-2 text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => {
                      const win = window.open('', '_blank');
                      if (!win) return;
                      const reportDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
                      const periodLabel = graphPeriod === 'week' ? 'Last 7 Days' : graphPeriod === 'month' ? 'Last 30 Days' : graphPeriod === 'quarter' ? 'Last 3 Months' : 'Last 12 Months';
                      const fmtKwh = (v: number) => v >= 1000 ? `${(v/1000).toFixed(2)} MWh` : `${Math.round(v).toLocaleString()} kWh`;
                      const hasChart = energyData.some(d => d.kWh > 0);
                      const logoUrl  = `${window.location.origin}/conexsol-logo-color.svg`;

                      // ── SVG Bar Chart ─────────────────────────────────────
                      const chartData = energyData.filter(d => d.kWh > 0);
                      const svgW = 620, svgH = 200, padL = 52, padR = 12, padT = 16, padB = 36;
                      const chartW = svgW - padL - padR;
                      const chartH = svgH - padT - padB;
                      const maxKwh = Math.max(...chartData.map(d => d.kWh), 1);
                      const yMax   = Math.ceil(maxKwh / 10) * 10;
                      const barW   = Math.max(4, Math.floor((chartW / Math.max(chartData.length, 1)) * 0.72));
                      const gap    = chartW / Math.max(chartData.length, 1);
                      // Y-axis gridlines (4 lines)
                      const yLines = [0.25, 0.5, 0.75, 1.0].map(f => {
                        const val = Math.round(yMax * f);
                        const y   = padT + chartH - (val / yMax) * chartH;
                        return `<line x1="${padL}" x2="${svgW - padR}" y1="${y}" y2="${y}" stroke="#e2e8f0" stroke-width="1"/>
                                <text x="${padL - 4}" y="${y + 4}" text-anchor="end" font-size="8" fill="#94a3b8">${val}</text>`;
                      }).join('');
                      // Bars
                      const bars = chartData.map((d, i) => {
                        const bh  = (d.kWh / yMax) * chartH;
                        const bx  = padL + i * gap + (gap - barW) / 2;
                        const by  = padT + chartH - bh;
                        // Show label every N bars to avoid crowding
                        const step = chartData.length > 20 ? 5 : chartData.length > 10 ? 3 : 1;
                        const lbl = i % step === 0 ? `<text x="${bx + barW/2}" y="${svgH - padB + 14}" text-anchor="middle" font-size="7.5" fill="#64748b">${d.date.replace(/\d{4}/,'').trim()}</text>` : '';
                        return `<rect x="${bx}" y="${by}" width="${barW}" height="${bh}" rx="2" fill="#f97316"/>
                                <title>${d.date}: ${d.kWh.toFixed(1)} kWh</title>
                                ${lbl}`;
                      }).join('');
                      // Y-axis label
                      const yAxisLabel = `<text transform="rotate(-90)" x="${-(padT + chartH/2)}" y="12" text-anchor="middle" font-size="8" fill="#94a3b8">kWh</text>`;
                      const svgChart = hasChart ? `
                        <svg viewBox="0 0 ${svgW} ${svgH}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block;overflow:visible">
                          ${yAxisLabel}
                          ${yLines}
                          <line x1="${padL}" x2="${padL}" y1="${padT}" y2="${padT + chartH}" stroke="#cbd5e1" stroke-width="1.5"/>
                          <line x1="${padL}" x2="${svgW - padR}" y1="${padT + chartH}" y2="${padT + chartH}" stroke="#cbd5e1" stroke-width="1.5"/>
                          ${bars}
                        </svg>` : '';
                      win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Solar Performance Report — ${customer.name}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    @page { size: letter portrait; margin: 18mm 18mm 18mm 18mm; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 11pt;
      color: #1e293b;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page { max-width: 680px; margin: 0 auto; }

    /* ── Header ── */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 14px;
      border-bottom: 3px solid #1e293b;
      margin-bottom: 20px;
    }
    .header img { height: 80px; width: auto; }
    .header-right { text-align: right; }
    .header-right .report-title { font-size: 13pt; font-weight: 700; color: #1e293b; }
    .header-right .report-date  { font-size: 9pt;  color: #64748b; margin-top: 2px; }

    /* ── Section label ── */
    .section-label {
      font-size: 7.5pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: #94a3b8;
      margin-bottom: 8px;
      padding-bottom: 4px;
      border-bottom: 1px solid #e2e8f0;
    }
    .section { margin-bottom: 20px; }

    /* ── Client info box ── */
    .client-box {
      background: #0f172a;
      border-radius: 10px;
      padding: 16px 20px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 20px;
    }
    .client-name  { font-size: 15pt; font-weight: 700; color: #fff; margin-bottom: 4px; }
    .client-sub   { font-size: 9pt;  color: #94a3b8; margin-top: 3px; }
    .client-right { text-align: right; }
    .client-badge { font-size: 8pt; font-weight: 600; color: #fb923c; background: #431407; padding: 2px 8px; border-radius: 20px; display: inline-block; margin-bottom: 6px; }
    .system-size  { font-size: 20pt; font-weight: 700; color: #fb923c; line-height: 1; }
    .system-label { font-size: 7.5pt; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 2px; }

    /* ── Metrics grid ── */
    .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
    .metric-card {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px 8px;
      text-align: center;
      background: #f8fafc;
    }
    .metric-value { font-size: 13pt; font-weight: 700; color: #ea580c; }
    .metric-value.green   { color: #16a34a; }
    .metric-value.blue    { color: #2563eb; }
    .metric-value.emerald { color: #059669; }
    .metric-label { font-size: 7.5pt; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 4px; }

    /* ── Period badge ── */
    .period-badge {
      display: inline-block;
      background: #fff7ed;
      color: #c2410c;
      border: 1px solid #fed7aa;
      border-radius: 20px;
      font-size: 8.5pt;
      font-weight: 600;
      padding: 3px 12px;
      margin-bottom: 14px;
    }

    /* ── Data table ── */
    table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
    th {
      background: #f1f5f9;
      text-align: left;
      padding: 6px 10px;
      font-size: 8pt;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #64748b;
      border-bottom: 2px solid #e2e8f0;
    }
    th:not(:first-child) { text-align: right; }
    td { padding: 5px 10px; border-bottom: 1px solid #f1f5f9; color: #334155; }
    tr:last-child td { border-bottom: none; }

    /* ── Notes ── */
    .notes-box {
      background: #fff7ed;
      border: 1px solid #fed7aa;
      border-radius: 8px;
      padding: 12px 14px;
      font-size: 10pt;
      color: #7c2d12;
      white-space: pre-wrap;
      line-height: 1.6;
    }

    /* ── Footer ── */
    .footer {
      margin-top: 24px;
      padding-top: 12px;
      border-top: 2px solid #1e293b;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 8pt;
      color: #94a3b8;
    }
    .footer strong { color: #1e293b; }
  </style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <img src="${logoUrl}" alt="Conexsol" />
    <div class="header-right">
      <div class="report-title">Solar Performance Report</div>
      <div class="report-date">${reportDate}</div>
    </div>
  </div>

  <!-- Client Info -->
  <div class="client-box">
    <div>
      ${customer.clientId ? `<div class="client-badge">${customer.clientId}</div>` : ''}
      <div class="client-name">${customer.name}</div>
      ${[customer.address, customer.city, customer.state].filter(Boolean).length ? `<div class="client-sub">📍 ${[customer.address, customer.city, customer.state].filter(Boolean).join(', ')}</div>` : ''}
      ${customer.phone ? `<div class="client-sub">📞 ${customer.phone}</div>` : ''}
      ${customer.email ? `<div class="client-sub">✉️ ${customer.email}</div>` : ''}
    </div>
    <div class="client-right">
      ${peakPowerKw > 0 ? `<div class="system-size">${peakPowerKw.toFixed(1)}<span style="font-size:12pt"> kW</span></div><div class="system-label">System Size</div>` : ''}
      ${siteId ? `<div style="margin-top:8px;font-size:9pt;color:#94a3b8">Site ID: <strong style="color:#e2e8f0">${siteId}</strong></div>` : ''}
      ${siteData?.installDate ? `<div style="font-size:9pt;color:#94a3b8">Installed: <strong style="color:#e2e8f0">${new Date(siteData.installDate).toLocaleDateString('en-US',{month:'short',year:'numeric'})}</strong></div>` : ''}
    </div>
  </div>

  <!-- Period -->
  <div class="period-badge">☀ ${periodLabel} Performance</div>

  <!-- Metrics -->
  <div class="metrics">
    <div class="metric-card">
      <div class="metric-value">${fmtKwh(displayKwh)}</div>
      <div class="metric-label">Energy Generated</div>
    </div>
    <div class="metric-card">
      <div class="metric-value green">$${Math.round(dollarsSaved).toLocaleString()}</div>
      <div class="metric-label">Est. Savings</div>
    </div>
    <div class="metric-card">
      <div class="metric-value blue">${specificYield > 0 ? specificYield.toFixed(2) : '—'}</div>
      <div class="metric-label">Specific Yield</div>
    </div>
    <div class="metric-card">
      <div class="metric-value emerald">${co2Tons.toFixed(2)} t</div>
      <div class="metric-label">CO₂ Offset</div>
    </div>
  </div>

  <!-- Bar Chart -->
  ${hasChart ? `
  <div class="section">
    <div class="section-label">Daily Production — ${periodLabel}</div>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 8px 8px 8px;margin-bottom:0">
      ${svgChart}
    </div>
  </div>` : ''}

  <!-- Message to Client -->
  ${previewGreeting?.trim() ? `
  <div class="section" style="margin-top:20px">
    <div class="section-label">Message to Client</div>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;font-size:10.5pt;color:#334155;line-height:1.7;white-space:pre-wrap">${previewGreeting.trim().replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
  </div>` : ''}

  <!-- Account Updates -->
  ${previewAccountUpdates?.trim() ? `
  <div class="section">
    <div class="section-label">Account Updates</div>
    <div class="notes-box">${previewAccountUpdates.trim().replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
  </div>` : ''}

  <!-- Footer -->
  <div class="footer">
    <span><strong>Conexsol Energy</strong> · Solar Operations &amp; Service</span>
    <span>Generated ${reportDate}</span>
  </div>

</div>
</body>
</html>`);
                      win.document.close();
                      setTimeout(() => { win.print(); }, 500);
                    }}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium transition-colors cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" /> Print
                  </button>
                  <button
                    onClick={handleSendReport}
                    disabled={sendingReport || !previewEmail.trim()}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-orange-500 hover:bg-orange-600 rounded-lg font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {sendingReport ? 'Sending…' : <><Send className="w-3.5 h-3.5" /> Send Report</>}
                  </button>
                </div>
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

  // Activity edit/delete
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [editingActivityText, setEditingActivityText] = useState('');
  const [undoStack, setUndoStack] = useState<Array<{ action: 'delete' | 'edit'; entry: Activity; previousText?: string }>>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null);

  // Files tab — "+ Upload Files" upload (previously a dead button with no handler)
  const filesInputRef = useRef<HTMLInputElement>(null);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const handleUploadCustomerFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploadingFiles(true);
    try {
      // uploadCustomerFilesPartial expects CustomerFileUpload[] (name+dataUrl+meta),
      // so read each File to a base64 dataURL first.
      const toUpload: CustomerFileUpload[] = await Promise.all(
        Array.from(fileList).map(async (file) => ({
          id: `cf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name,
          dataUrl: await new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result as string);
            r.onerror = () => reject(r.error ?? new Error('read failed'));
            r.readAsDataURL(file);
          }),
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
        })),
      );
      const { uploaded, failed } = await uploadCustomerFilesPartial(toUpload, customer.id);
      if (uploaded.length > 0) {
        onUpdateCustomer({ ...customer, files: [...uploaded, ...(customer.files ?? [])] });
        toast.success(`${uploaded.length} file${uploaded.length !== 1 ? 's' : ''} uploaded`);
      }
      if (failed.length > 0) {
        toast.error(`${failed.length} file${failed.length !== 1 ? 's' : ''} failed to upload`);
      }
    } catch {
      toast.error('File upload failed. Please try again.');
    } finally {
      setUploadingFiles(false);
    }
  };

  const handleDeleteActivity = (id: string) => {
    const entry = (customer.activityHistory ?? []).find(a => a.id === id);
    if (entry) setUndoStack(prev => [...prev.slice(-4), { action: 'delete', entry }]);
    onUpdateCustomer({
      ...customer,
      activityHistory: (customer.activityHistory ?? []).filter(a => a.id !== id),
    });
  };

  const handleSaveActivity = (id: string, textOverride?: string) => {
    const newText = textOverride ?? editingActivityText;
    const entry = (customer.activityHistory ?? []).find(a => a.id === id);
    if (entry) setUndoStack(prev => [...prev.slice(-4), { action: 'edit', entry, previousText: entry.description }]);
    onUpdateCustomer({
      ...customer,
      activityHistory: (customer.activityHistory ?? []).map(a =>
        a.id === id ? { ...a, description: newText } : a
      ),
    });
    setEditingActivityId(null);
  };

  const handleUndoActivity = () => {
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    const history = customer.activityHistory ?? [];
    if (last.action === 'delete') {
      onUpdateCustomer({ ...customer, activityHistory: [last.entry, ...history] });
    } else {
      onUpdateCustomer({
        ...customer,
        activityHistory: history.map(a =>
          a.id === last.entry.id ? { ...a, description: last.previousText ?? a.description } : a
        ),
      });
    }
    setUndoStack(prev => prev.slice(0, -1));
  };

  const handleAddReaction = (activityId: string, emoji: string) => {
    const userId = currentUser?.id ?? 'anonymous';
    onUpdateCustomer({
      ...customer,
      activityHistory: (customer.activityHistory ?? []).map(a => {
        if (a.id !== activityId) return a;
        const reactions = { ...(a.reactions ?? {}) };
        const users = reactions[emoji] ?? [];
        if (users.includes(userId)) {
          const next = users.filter(u => u !== userId);
          if (next.length === 0) delete reactions[emoji];
          else reactions[emoji] = next;
        } else {
          reactions[emoji] = [...users, userId];
        }
        return { ...a, reactions };
      }),
    });
    setShowEmojiPicker(null);
  };

  // Customer story inline editing
  const [editingStory, setEditingStory] = useState(false);
  const [storyEditText, setStoryEditText] = useState('');

  const handleSaveStory = () => {
    const newText = storyEditText.trim();
    const logEntry: Activity = {
      id: `story-edit-${Date.now()}`,
      type: 'info_updated',
      description: `📝 Customer story updated by ${currentUser?.name ?? 'User'}`,
      timestamp: new Date().toISOString(),
      userName: currentUser?.name ?? 'User',
    };
    onUpdateCustomer({
      ...customer,
      notes: newText,
      activityHistory: [logEntry, ...(customer.activityHistory ?? [])],
    });
    setEditingStory(false);
  };

  // Trello import modal
  const [showTrelloModal, setShowTrelloModal]     = useState(false);
  const [trelloUrl, setTrelloUrl]                 = useState('');
  const [trelloLoading, setTrelloLoading]         = useState(false);
  const [trelloError, setTrelloError]             = useState('');
  const [trelloResult, setTrelloResult]           = useState<TrelloImportResult | null>(null);

  const handleTrelloImport = async () => {
    if (!trelloUrl.trim()) return;
    setTrelloLoading(true);
    setTrelloError('');
    setTrelloResult(null);
    try {
      const result = await importTrelloCard(trelloUrl.trim(), customer, currentUser?.name ?? 'Admin');
      setTrelloResult(result);
    } catch (err) {
      setTrelloError(err instanceof Error ? err.message : 'Failed to fetch card');
    } finally {
      setTrelloLoading(false);
    }
  };

  const confirmTrelloImport = () => {
    if (!trelloResult) return;
    onUpdateCustomer({ ...customer, ...trelloResult.updates });
    setShowTrelloModal(false);
    setTrelloUrl('');
    setTrelloResult(null);
  };

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
  const [pastedFiles, setPastedFiles] = useState<Array<{id: string; name: string; dataUrl: string; mimeType: string; size: number}>>([]);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const [mentionQuery, setMentionQuery] = useState('');
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const [showCreateWorkOrder, setShowCreateWorkOrder] = useState(false);
  const [showSendMessage, setShowSendMessage] = useState(false);
  const [deleteStep, setDeleteStep] = useState(0);

  // Form states
  const [editForm, setEditForm] = useState<Customer>(customer);
  const [, setWorkOrderForm] = useState({
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
  const [, setServiceSearch] = useState('');
  const [messageForm, setMessageForm] = useState({
    subject: '',
    body: '',
    method: 'email' as 'email' | 'sms',
  });

  // Demo story data
  const customerStory = customer.notes || `Customer since ${new Date(customer.createdAt || Date.now()).toLocaleDateString()}. Discovered Conexsol through referral from existing customer.`;

  // Reset work order form when modal opens
  React.useEffect(() => {
    if (showCreateWorkOrder) {
      setWorkOrderForm({
        title: '',
        description: '',
        priority: 'medium',
        dateDue: '',
        serviceRateId: '',
        isPowerCare: customer.isPowerCare || customer.category === 'PowerCare' || false,
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

  const handleNotePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const fileItems = Array.from(e.clipboardData.items).filter(i => i.kind === 'file');
    if (fileItems.length === 0) return;
    e.preventDefault();
    let processedCount = 0;
    let failedCount = 0;
    fileItems.forEach(item => {
      const file = item.getAsFile();
      if (!file) {
        failedCount++;
        return;
      }
      // Pre-validate size to give immediate feedback
      const MAX_SIZE = 20 * 1024 * 1024;
      if (file.size > MAX_SIZE) {
        toast.error(`"${file.name || 'file'}" is ${Math.round(file.size / 1024 / 1024)}MB — max 20MB`);
        failedCount++;
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => {
        toast.error(`Failed to read pasted file: ${file.name || 'unnamed'}`);
        failedCount++;
      };
      reader.onload = (ev) => {
        const raw = ev.target?.result as string;
        if (!raw) {
          toast.error('Paste failed — could not read clipboard data');
          failedCount++;
          return;
        }
        const id = `paste-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const name = file.name || (file.type.startsWith('image/') ? `image-${Date.now()}.jpg` : `file-${Date.now()}`);
        if (file.type.startsWith('image/')) {
          const img = new Image();
          img.onerror = () => {
            toast.error('Pasted image is corrupt or unsupported format');
            failedCount++;
          };
          img.onload = () => {
            try {
              const canvas = document.createElement('canvas');
              const max = 1400;
              const scale = Math.min(1, max / Math.max(img.width, img.height));
              canvas.width = Math.round(img.width * scale);
              canvas.height = Math.round(img.height * scale);
              canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
              const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
              setPastedFiles(prev => [...prev, { id, name, dataUrl, mimeType: 'image/jpeg', size: Math.round(dataUrl.length * 0.75) }]);
              processedCount++;
              if (processedCount === 1) {
                toast.success('📎 Image pasted — click "Save Note" to upload');
              }
            } catch (err) {
              toast.error('Failed to process pasted image');
              failedCount++;
            }
          };
          img.src = raw;
        } else {
          setPastedFiles(prev => [...prev, { id, name, dataUrl: raw, mimeType: file.type || 'application/octet-stream', size: file.size }]);
          processedCount++;
          toast.success(`📎 File "${name}" attached — click "Save Note" to upload`);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleSaveNote = async () => {
    if (!notes.trim() && pastedFiles.length === 0) return;
    const mentionedIds = parseMentions(notes);
    const noteText = notes.trim();
    const newActivity: Activity = {
      id: `activity-${Date.now()}`,
      type: 'note_added',
      // Keep the body as the typed note only — attached files render as
      // thumbnails (below), not as "📎 filename" text.
      description: noteText,
      timestamp: new Date().toISOString(),
      userId: currentUser?.id,
      userName: currentUser?.name,
      mentions: mentionedIds.length > 0 ? mentionedIds : undefined,
    };

    // Save pastedFiles to local variable BEFORE clearing state
    // This ensures we can restore them if upload fails
    const filesToUpload = pastedFiles;

    // Upload files with partial-success semantics
    // (lets us save successful uploads + show errors for failures)
    let uploadedFiles: StoredCustomerFile[] = [];
    if (filesToUpload.length > 0) {
      const { uploaded, failed } = await uploadCustomerFilesPartial(filesToUpload, customer.id);
      uploadedFiles = uploaded;

      // Report failures (keep failed files in state for retry)
      if (failed.length > 0) {
        const firstError = failed[0].error;
        toast.error(`${failed.length} of ${filesToUpload.length} file${filesToUpload.length !== 1 ? 's' : ''} failed: ${firstError}`);
        // Keep only the failed files in state so user can retry
        setPastedFiles(failed.map(f => f.file));
        // If ALL failed, don't proceed with note save
        if (uploaded.length === 0) {
          return;
        }
      } else {
        toast.success(`📎 ${uploaded.length} file${uploaded.length !== 1 ? 's' : ''} uploaded`);
        setPastedFiles([]);
      }
    }

    // Upload succeeded (fully or partially) - NOW clear UI state and save note
    setNotes('');
    if (uploadedFiles.length === filesToUpload.length) {
      setPastedFiles([]);
    }
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 2000);

    // Save the note with uploaded file URLs
    const newFiles: CustomerFile[] = uploadedFiles.map(f => ({
      id: f.id,
      name: f.name,
      url: f.url,
      mimeType: f.mimeType,
      size: f.size,
      source: 'upload' as const,
      createdAt: f.createdAt,
    }));
    // Link the uploaded files to this comment so they render as thumbnails.
    if (uploadedFiles.length > 0) {
      newActivity.attachments = uploadedFiles.map(f => ({
        id: f.id, name: f.name, url: f.url, mimeType: f.mimeType,
      }));
    }
    const activityHistory = customer.activityHistory || [];
    onUpdateCustomer({
      ...customer,
      activityHistory: [newActivity, ...activityHistory],
      files: [...newFiles, ...(customer.files ?? [])],
    });

    // Fire @mention notifications (async, non-blocking)
    // Uses centralized helper: writes to local mentions inbox + Supabase + email
    if (mentionedIds.length > 0) {
      const mentionedEmails = parseMentionEmails(noteText, users);
      fireMentionNotifications({
        mentionedUserIds:    mentionedIds,
        mentionedUserEmails: mentionedEmails,
        notifierName: currentUser?.name || 'A teammate',
        context: `${customer.clientId ?? ''} ${customer.name}`.trim(),
        contextId: customer.id,
        contextType: 'customer',
        message: noteText,
      }).catch((e) => console.error('[Customers] createMention failed', e));
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
      const oldVal = customer[key as keyof Customer] ?? '';
      const newVal = editForm[key as keyof Customer] ?? '';
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
            onClick={() => { setShowTrelloModal(true); setTrelloUrl(''); setTrelloResult(null); setTrelloError(''); }}
            className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-100 cursor-pointer transition-colors"
            title="Import from Trello card"
          >
            <Download className="w-4 h-4" />
            Trello
          </button>
          <button
            onClick={onEdit}
            className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-200 cursor-pointer transition-colors"
          >
            <Edit className="w-4 h-4" />
            Edit
          </button>
        </div>

        {/* Contact strip — always visible above tabs */}
        <div className="flex items-center gap-4 px-1 py-2.5 border-b border-slate-100 flex-shrink-0 flex-wrap">
          {customer.phone ? (
            <PhoneLink phone={customer.phone} size="sm" />
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-slate-400 italic"><Phone className="w-3.5 h-3.5" />No phone</span>
          )}
          {customer.email ? (
            <a href={`mailto:${customer.email}`} className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-orange-500 truncate">
              <Mail className="w-3.5 h-3.5 flex-shrink-0" />{customer.email}
            </a>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-slate-400 italic"><Mail className="w-3.5 h-3.5" />No email</span>
          )}
          {customer.address && (
            <span className="flex items-center gap-1.5 text-xs text-slate-500 truncate">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0" />{customer.city || customer.address}
            </span>
          )}
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
              {/* Customer Story — with inline edit */}
              <div className="bg-slate-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-orange-500" />
                    Customer Story
                  </h3>
                  {!editingStory && (
                    <button
                      onClick={() => { setStoryEditText(customer.notes ?? ''); setEditingStory(true); }}
                      className="flex items-center gap-1 text-xs text-slate-500 hover:text-orange-500 transition-colors"
                      title="Edit customer story"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Edit
                    </button>
                  )}
                </div>
                {editingStory ? (
                  <div className="space-y-2">
                    <textarea
                      value={storyEditText}
                      onChange={e => setStoryEditText(e.target.value)}
                      rows={5}
                      placeholder="Write the customer story…"
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-orange-400"
                    />
                    <div className="flex gap-2">
                      <button onClick={handleSaveStory} className="px-3 py-1 bg-orange-500 text-white text-xs font-medium rounded-lg hover:bg-orange-600">Save</button>
                      <button onClick={() => setEditingStory(false)} className="px-3 py-1 bg-slate-200 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-300">Cancel</button>
                    </div>
                  </div>
                ) : customerStory ? (
                  <p className="text-sm text-slate-600 whitespace-pre-line">{customerStory}</p>
                ) : (
                  <p className="text-sm italic text-slate-400">No story added yet. Click Edit to add one.</p>
                )}
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
                    onPaste={handleNotePaste}
                    onKeyDown={(e) => {
                      if (showMentionDropdown && e.key === 'Escape') {
                        setShowMentionDropdown(false);
                      }
                    }}
                    placeholder="Add notes… type @ to mention a teammate · Ctrl+V to paste images/files"
                    className="w-full p-3 border border-slate-200 rounded-lg text-sm min-h-[100px] focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                  {/* Pasted file previews */}
                  {pastedFiles.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {pastedFiles.map(f => (
                        <div key={f.id} className="relative group/paste border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
                          {f.mimeType.startsWith('image/') ? (
                            <img src={f.dataUrl} alt={f.name} className="w-20 h-20 object-cover" />
                          ) : (
                            <div className="w-20 h-20 flex flex-col items-center justify-center gap-1 bg-slate-50 px-1">
                              <Paperclip className="w-5 h-5 text-slate-400" />
                              <span className="text-[9px] text-slate-500 text-center truncate w-full px-1">{f.name}</span>
                            </div>
                          )}
                          <button
                            onClick={() => setPastedFiles(prev => prev.filter(p => p.id !== f.id))}
                            className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover/paste:opacity-100 transition-opacity"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
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
                    disabled={!notes.trim() && pastedFiles.length === 0}
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

              {/* Comments and Activity */}
              <div className="bg-slate-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-orange-500" />
                    Comments and Activity
                  </h3>
                  {undoStack.length > 0 && (
                    <button
                      onClick={handleUndoActivity}
                      className="flex items-center gap-1 text-xs text-slate-500 hover:text-orange-500 transition-colors"
                      title="Undo last change"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                      Undo
                    </button>
                  )}
                </div>
                <div>
                  <ActivityFeed
                    activities={customer.activityHistory || []}
                    users={users}
                    currentUser={currentUser}
                    files={customer.files}
                    onEdit={(id, newText) => handleSaveActivity(id, newText)}
                    onDelete={handleDeleteActivity}
                    onReact={handleAddReaction}
                    onMentionClick={(userId) => {
                      const u = users.find(x => x.id === userId);
                      if (u) toast.info(`${u.name}${u.username ? ' (@' + u.username + ')' : ''}${u.role ? ' · ' + u.role : ''}`);
                    }}
                  />
                </div>
                <div className="space-y-3 mt-4">
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

              {/* How They Found Us — pinned to bottom of story stack */}
              <div className="bg-slate-50 rounded-lg p-4">
                <h3 className="font-semibold text-slate-900 mb-2 flex items-center gap-2">
                  <Users className="w-4 h-4 text-orange-500" />
                  How They Found Us
                </h3>
                <p className="text-sm text-slate-600">
                  {customer.referralSource || 'Referral from existing customer'}
                </p>
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
                (() => {
                  const WO_PIPELINE = [
                    { key: 'draft',          label: 'Draft',        short: 'Draft',    getDate: (j: Job) => j.createdAt,         action: 'Send quote to client' },
                    { key: 'quote_sent',     label: 'Quote Sent',   short: 'Q.Sent',   getDate: (j: Job) => j.quoteSentAt,       action: 'Follow up on quote' },
                    { key: 'quote_approved', label: 'Approved',     short: 'Apprvd',   getDate: (j: Job) => j.quoteApprovedAt,   action: 'Schedule a technician' },
                    { key: 'scheduled',      label: 'Scheduled',    short: 'Sched.',   getDate: (j: Job) => j.scheduledDate,     action: 'Begin service call' },
                    { key: 'in_progress',    label: 'In Progress',  short: 'Active',   getDate: (j: Job) => j.startedAt,         action: 'Complete & submit report' },
                    { key: 'completed',      label: 'Completed',    short: 'Done',     getDate: (j: Job) => j.completedAt,       action: 'Send invoice to client' },
                    { key: 'invoiced',       label: 'Invoiced',     short: 'Invcd.',   getDate: (j: Job) => j.invoicedAt,        action: 'Follow up on payment' },
                    { key: 'paid',           label: 'Paid',         short: 'Paid',     getDate: (j: Job) => j.clientPaidAt,      action: '' },
                  ] as const;
                  const stageOrder = WO_PIPELINE.map(s => s.key);
                  const fmtD = (s: string | undefined) => {
                    if (!s) return null;
                    try { return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch { return null; }
                  };
                  const woStatusColor = (ws: string | undefined) =>
                    ws === 'paid'           ? 'bg-green-100 text-green-700'
                    : ws === 'invoiced'     ? 'bg-blue-100 text-blue-700'
                    : ws === 'completed'    ? 'bg-teal-100 text-teal-700'
                    : ws === 'in_progress'  ? 'bg-orange-100 text-orange-700'
                    : ws === 'scheduled'    ? 'bg-purple-100 text-purple-700'
                    : ws === 'quote_approved' ? 'bg-cyan-100 text-cyan-700'
                    : ws === 'quote_sent'   ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-slate-100 text-slate-600';
                  return jobs.map((job) => {
                    const ws = job.woStatus ?? 'draft';
                    const curIdx = Math.max(0, stageOrder.indexOf(ws as typeof stageOrder[number]));
                    const isDone = ws === 'paid';
                    const nextAction = !isDone ? WO_PIPELINE[curIdx]?.action : '';
                    const wsLabel = WO_PIPELINE[curIdx]?.label ?? formatStatus(job.status);
                    const addr = job.siteAddress || customer.address;
                    const amount = (job.quoteAmount || job.totalAmount) || 0;
                    return (
                      <div key={job.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-md transition-shadow">

                        {/* ── Header ──────────────────────────────────── */}
                        <div className="flex items-start justify-between px-4 pt-4 pb-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              {job.woNumber && (
                                <span className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">{job.woNumber}</span>
                              )}
                              <span className={`px-2 py-0.5 text-[10px] rounded-full font-semibold ${woStatusColor(ws)}`}>{wsLabel}</span>
                            </div>
                            <p className="font-semibold text-slate-900 text-sm leading-tight">{job.title || job.serviceType}</p>
                            {addr && (
                              <p className="flex items-center gap-1 text-xs text-slate-500 mt-1 truncate">
                                <MapPin className="w-3 h-3 flex-shrink-0 text-slate-400" />
                                {addr}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => setEditingJob(job)}
                            className="ml-3 p-1.5 text-slate-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-colors flex-shrink-0"
                            title="Open work order"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* ── Meta row ────────────────────────────────── */}
                        <div className="flex items-center gap-4 px-4 pb-3 text-xs text-slate-500 flex-wrap">
                          {amount > 0 && (
                            <span className="flex items-center gap-1 font-semibold text-emerald-700">
                              <DollarSign className="w-3 h-3" />
                              ${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                            </span>
                          )}
                          {job.laborHours > 0 && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />{job.laborHours}h
                            </span>
                          )}
                          {job.scheduledDate && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />{job.scheduledDate.split('T')[0]}
                            </span>
                          )}
                        </div>

                        {/* ── Stage pipeline ──────────────────────────── */}
                        <div className="px-3 pb-3 border-t border-slate-50 pt-3">
                          <div className="flex items-start">
                            {WO_PIPELINE.map((stage, i) => {
                              const done  = i < curIdx;
                              const active = i === curIdx;
                              const dateStr = (done || active) ? fmtD(stage.getDate(job)) : null;
                              return (
                                <div key={stage.key} className="contents">
                                  {i > 0 && (
                                    <div className={`flex-1 h-[2px] mt-[8px] transition-colors ${i <= curIdx ? 'bg-orange-400' : 'bg-slate-200'}`} />
                                  )}
                                  <div className="flex flex-col items-center" style={{ flexShrink: 0, minWidth: 0 }}>
                                    <div className={`w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center text-[8px] font-bold transition-all ${
                                      done  ? 'bg-orange-500 border-orange-500 text-white'
                                      : active ? 'bg-white border-orange-500 text-orange-600 ring-2 ring-orange-100'
                                      : 'bg-white border-slate-200 text-slate-300'
                                    }`}>
                                      {done ? '✓' : i + 1}
                                    </div>
                                    <span className={`text-[7px] mt-[2px] font-medium leading-tight text-center ${active ? 'text-orange-600' : done ? 'text-slate-500' : 'text-slate-300'}`}>
                                      {stage.short}
                                    </span>
                                    {dateStr ? (
                                      <span className="text-[7px] text-slate-400 leading-tight text-center">{dateStr}</span>
                                    ) : <span className="text-[7px] leading-tight">&nbsp;</span>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* ── Next action ─────────────────────────────── */}
                        {!isDone && nextAction && (
                          <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border-t border-amber-100">
                            <ArrowRight className="w-3 h-3 text-amber-600 flex-shrink-0" />
                            <span className="text-xs font-semibold text-amber-800">{nextAction}</span>
                          </div>
                        )}
                        {isDone && (
                          <div className="flex items-center gap-2 px-4 py-2.5 bg-green-50 border-t border-green-100">
                            <CheckCircle className="w-3 h-3 text-green-600 flex-shrink-0" />
                            <span className="text-xs font-semibold text-green-700">Work order complete — paid in full</span>
                          </div>
                        )}
                      </div>
                    );
                  });
                })()
              )}
            </div>
          )}

          {activeTab === 'files' && (
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-lg p-4">
                <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-orange-500" />
                  Photos & Documents
                  {(customer.files?.length ?? 0) > 0 && (
                    <span className="ml-auto text-xs text-slate-400 font-normal">{customer.files!.length} file{customer.files!.length !== 1 ? 's' : ''}</span>
                  )}
                </h3>

                {(customer.files?.length ?? 0) === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-6">No files yet. Import a Trello card to pull in attachments.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {customer.files!.map(file => {
                      const isImage = file.mimeType.startsWith('image/') || /\.(png|jpg|jpeg|webp|gif|heic)$/i.test(file.name);
                      return (
                        <a
                          key={file.id}
                          href={file.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group relative aspect-square rounded-lg overflow-hidden border border-slate-200 bg-slate-100 flex items-center justify-center hover:border-orange-400 transition-colors"
                          title={file.name}
                        >
                          {isImage ? (
                            <>
                              <img
                                src={file.url}
                                alt={file.name}
                                className="w-full h-full object-cover"
                                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                                <ExternalLink className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                            </>
                          ) : (
                            <div className="flex flex-col items-center gap-1 p-2">
                              <FileText className="w-8 h-8 text-slate-400" />
                              <span className="text-[10px] text-slate-500 text-center leading-tight line-clamp-2">{file.name}</span>
                            </div>
                          )}
                          {file.source === 'trello' && (
                            <span className="absolute top-1 left-1 bg-blue-600 text-white text-[9px] px-1 py-0.5 rounded font-bold">T</span>
                          )}
                        </a>
                      );
                    })}
                  </div>
                )}

                <button
                  onClick={() => filesInputRef.current?.click()}
                  disabled={uploadingFiles}
                  className="mt-3 w-full py-2 border-2 border-dashed border-slate-300 rounded-lg text-slate-500 text-sm hover:border-orange-500 hover:text-orange-500 cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-wait"
                >
                  {uploadingFiles ? 'Uploading…' : '+ Upload Files'}
                </button>
                <input
                  ref={filesInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={e => { handleUploadCustomerFiles(e.target.files); e.target.value = ''; }}
                />
              </div>
            </div>
          )}

          {activeTab === 'activity' && (
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-orange-500" />
                    Comments and Activity
                  </h3>
                  {undoStack.length > 0 && (
                    <button
                      onClick={handleUndoActivity}
                      className="flex items-center gap-1 text-xs text-slate-500 hover:text-orange-500 transition-colors"
                      title="Undo last change"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                      Undo
                    </button>
                  )}
                </div>
                {(customer.activityHistory && customer.activityHistory.length > 0) ? (
                  <div className="space-y-1">
                    {customer.activityHistory.map((activity) => (
                      <div key={activity.id} className="border-l-2 border-orange-200 pl-3 py-2 group relative">
                        {/* Header row: name · datetime + action icons */}
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs font-semibold text-slate-700">
                            {activity.userName || formatActivityType(activity.type)}
                            <span className="font-normal text-slate-400 ml-1">·</span>
                            <span className="font-normal text-slate-400 ml-1">
                              {new Date(activity.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                            </span>
                          </span>
                          {/* Action icons — revealed on hover */}
                          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 relative">
                            <button
                              onClick={() => setShowEmojiPicker(showEmojiPicker === activity.id ? null : activity.id)}
                              className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-yellow-500"
                              title="Add reaction"
                            >
                              <Smile className="w-3.5 h-3.5" />
                            </button>
                            {activity.type === 'note_added' && (
                              <>
                                <button
                                  onClick={() => { setEditingActivityId(activity.id); setEditingActivityText(activity.description); }}
                                  className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600"
                                  title="Edit note"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteActivity(activity.id)}
                                  className="p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-500"
                                  title="Delete entry"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                            {/* Emoji picker popover */}
                            {showEmojiPicker === activity.id && (
                              <div className="absolute right-0 top-6 z-50 bg-white border border-slate-200 rounded-xl shadow-lg p-2 flex gap-1">
                                {['👍','❤️','😂','🔥','✅','👀'].map(emoji => (
                                  <button
                                    key={emoji}
                                    onClick={() => handleAddReaction(activity.id, emoji)}
                                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-base transition-colors"
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        {editingActivityId === activity.id ? (
                          <div className="space-y-2">
                            <textarea
                              value={editingActivityText}
                              onChange={e => setEditingActivityText(e.target.value)}
                              rows={4}
                              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-orange-400"
                            />
                            <div className="flex gap-2">
                              <button onClick={() => handleSaveActivity(activity.id)} className="px-3 py-1 bg-orange-500 text-white text-xs font-medium rounded-lg hover:bg-orange-600">Save</button>
                              <button onClick={() => setEditingActivityId(null)} className="px-3 py-1 bg-slate-200 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-300">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">
                            {activity.description.split(/(@\S+)/g).map((part, i) =>
                              part.startsWith('@')
                                ? <span key={i} className="text-orange-600 font-semibold bg-orange-50 px-0.5 rounded">{part}</span>
                                : part
                            )}
                          </p>
                        )}
                        {/* Reactions */}
                        {activity.reactions && Object.keys(activity.reactions).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {Object.entries(activity.reactions).map(([emoji, users]) => (
                              <button
                                key={emoji}
                                onClick={() => handleAddReaction(activity.id, emoji)}
                                className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs border transition-colors ${
                                  users.includes(currentUser?.id ?? '') ? 'bg-orange-50 border-orange-300 text-orange-700' : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
                                }`}
                              >
                                {emoji} <span className="font-medium">{users.length}</span>
                              </button>
                            ))}
                          </div>
                        )}
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
            {/* Top-right: Trello import + alert badge */}
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <button
                onClick={() => { setShowTrelloModal(true); setTrelloUrl(''); setTrelloResult(null); setTrelloError(''); }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium hover:bg-blue-100 cursor-pointer transition-colors"
                title="Import from Trello card"
              >
                <Download className="w-3.5 h-3.5" />
                Import Trello
              </button>
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
                  <option value="PowerCare">PowerCare</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">System Type</label>
                <select
                  value={editForm.systemType || ''}
                  onChange={(e) => setEditForm({ ...editForm, systemType: e.target.value as SystemType || undefined })}
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

      {/* ── Trello Import Modal ─────────────────────────────────────────── */}
      {showTrelloModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
                  <Link2 className="w-4 h-4 text-white" />
                </div>
                <span className="font-semibold text-slate-900">Import from Trello</span>
              </div>
              <button onClick={() => setShowTrelloModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* URL input */}
              {!trelloResult && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Trello card URL</label>
                    <input
                      autoFocus
                      type="url"
                      placeholder="https://trello.com/c/xxxxxxxx/..."
                      value={trelloUrl}
                      onChange={e => setTrelloUrl(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleTrelloImport()}
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 text-slate-900 placeholder:text-slate-400"
                    />
                  </div>
                  {trelloError && (
                    <p className="text-xs text-red-500 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {trelloError}
                    </p>
                  )}
                  <button
                    onClick={handleTrelloImport}
                    disabled={!trelloUrl.trim() || trelloLoading}
                    className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                  >
                    {trelloLoading ? (
                      <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Fetching card…</>
                    ) : (
                      <><Download className="w-4 h-4" /> Fetch card</>
                    )}
                  </button>
                </>
              )}

              {/* Preview result */}
              {trelloResult && (
                <div className="space-y-3">
                  <div className="bg-blue-50 rounded-xl p-4 space-y-2">
                    <p className="text-sm font-semibold text-slate-900">{trelloResult.card.name}</p>
                    {trelloResult.card.labels.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {trelloResult.card.labels.map(l => (
                          <span key={l} className="text-[10px] px-2 py-0.5 bg-blue-200 text-blue-800 rounded-full font-medium">{l}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="text-xs text-slate-600 space-y-1.5">
                    <p className="font-semibold text-slate-800 mb-1">What will be imported:</p>
                    {trelloResult.activities.length > 0 && (
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                        <span>{trelloResult.activities.length} activity note{trelloResult.activities.length > 1 ? 's' : ''} added to timeline</span>
                      </div>
                    )}
                    {trelloResult.files.length > 0 && (
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                        <span>{trelloResult.files.length} photo/file{trelloResult.files.length > 1 ? 's' : ''} imported into Files tab</span>
                      </div>
                    )}
                    {trelloResult.updates.phone && (
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                        <span>Phone updated → {trelloResult.updates.phone}</span>
                      </div>
                    )}
                    {trelloResult.updates.email && (
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                        <span>Email updated → {trelloResult.updates.email}</span>
                      </div>
                    )}
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                      <span>Trello card URL saved to profile</span>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => setTrelloResult(null)}
                      className="flex-1 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
                    >
                      ← Back
                    </button>
                    <button
                      onClick={confirmTrelloImport}
                      className="flex-1 py-2 text-sm font-semibold text-white bg-emerald-500 rounded-xl hover:bg-emerald-600 transition-colors"
                    >
                      Confirm import
                    </button>
                  </div>
                </div>
              )}
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
                        (resolvedFields as Record<keyof Customer, Customer[keyof Customer]>)[f.key] = primaryCustomer![f.key];
                      } else if (choice === 'secondary') {
                        (resolvedFields as Record<keyof Customer, Customer[keyof Customer]>)[f.key] = otherCustomer![f.key];
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
                      onChange={() => setMessageForm({ ...messageForm, method: 'email' })}
                    />
                    Email
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="method"
                      value="sms"
                      checked={messageForm.method === 'sms'}
                      onChange={() => setMessageForm({ ...messageForm, method: 'sms' })}
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

  // Trello import (pre-fills form fields from a Trello card)
  const [trelloUrl,     setTrelloUrl]     = useState('');
  const [trelloLoading, setTrelloLoading] = useState(false);
  const [trelloError,   setTrelloError]   = useState('');
  const [trelloOk,      setTrelloOk]      = useState('');
  const [trelloOpen,    setTrelloOpen]    = useState(false);

  // Screenshot import — parse a lead email screenshot with Claude Vision
  const [screenshotOpen,    setScreenshotOpen]    = useState(false);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [screenshotLoading, setScreenshotLoading] = useState(false);
  const [screenshotError,   setScreenshotError]   = useState('');
  const [screenshotOk,      setScreenshotOk]      = useState('');
  const screenshotInputRef = useRef<HTMLInputElement>(null);

  const handleScreenshotFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setScreenshotError('Please select an image file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setScreenshotPreview(ev.target?.result as string);
      setScreenshotError('');
      setScreenshotOk('');
    };
    reader.readAsDataURL(file);
  };

  const handleScreenshotPaste = (e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'));
    if (item) {
      const file = item.getAsFile();
      if (file) { e.preventDefault(); handleScreenshotFile(file); }
    }
  };

  const handleScreenshotParse = async () => {
    if (!screenshotPreview) return;
    setScreenshotLoading(true);
    setScreenshotError('');
    setScreenshotOk('');
    try {
      // Strip the "data:image/xxx;base64," prefix
      const [header, imageBase64] = screenshotPreview.split(',');
      const mimeType = header.match(/data:([^;]+);/)?.[1] ?? 'image/jpeg';

      const resp = await authedFetch('/api/parse-lead-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, mimeType }),
      });

      const data = await resp.json() as {
        firstName?: string; lastName?: string; email?: string; phone?: string;
        address?: string; city?: string; state?: string; zip?: string;
        notes?: string; hsId?: string; contractName?: string; error?: string;
      };

      if (!resp.ok || data.error) {
        setScreenshotError(data.error ?? 'Failed to parse image. Try again.');
        return;
      }

      const firstName = data.firstName ?? '';
      const lastName  = data.lastName  ?? '';
      setFormData(prev => ({
        ...prev,
        firstName,
        lastName,
        name:          `${firstName} ${lastName}`.trim() || prev.name,
        email:         data.email   || prev.email,
        phone:         data.phone   || prev.phone,
        address:       data.address || prev.address,
        city:          data.city    || prev.city,
        state:         data.state   || prev.state,
        zip:           data.zip     || prev.zip,
        notes:         [data.notes, data.hsId ? `HS_ID: ${data.hsId}` : '', data.contractName ? `Contract: ${data.contractName}` : ''].filter(Boolean).join('\n') || prev.notes,
        referralSource: prev.referralSource || 'SolarEdge Leads',
        clientStatus:  (prev.clientStatus || 'Contacted') as typeof prev.clientStatus,
      }));

      setScreenshotOk(`Parsed! Check fields below and save.`);
    } catch (err) {
      setScreenshotError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setScreenshotLoading(false);
    }
  };

  const handleTrelloImport = async () => {
    const url = trelloUrl.trim();
    if (!url) return;
    setTrelloLoading(true);
    setTrelloError('');
    setTrelloOk('');
    try {
      const card    = await fetchTrelloCard(url);
      const contact = extractContactInfo(card);
      // Strip leading "US-XXXXX " from card title to extract human name
      const namePart = card.name.replace(/^US-\d+\s*/i, '').trim();
      const parts    = namePart.split(/\s+/);
      const first    = parts[0] ?? '';
      const last     = parts.slice(1).join(' ');
      const us       = card.name.match(/US-\d+/i)?.[0] ?? '';

      setFormData(prev => ({
        ...prev,
        clientId:  us || prev.clientId,
        firstName: first || prev.firstName,
        lastName:  last  || prev.lastName,
        name:      namePart || prev.name,
        phone:     contact.phone || prev.phone,
        email:     contact.email || prev.email,
        notes:     card.desc?.slice(0, 1000) || prev.notes,
        referralSource: prev.referralSource || 'Trello',
      }));
      setTrelloOk(`Imported "${card.name}"`);
    } catch (err) {
      setTrelloError(err instanceof Error ? err.message : 'Failed to fetch card');
    } finally {
      setTrelloLoading(false);
    }
  };

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

          {/* ── Import from Screenshot ─────────────────────────────────── */}
          <div className="border-2 border-orange-200 rounded-xl bg-orange-50/40">
            <button
              type="button"
              onClick={() => { setScreenshotOpen(v => !v); setScreenshotError(''); setScreenshotOk(''); }}
              className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold text-orange-800 hover:bg-orange-100/60 rounded-xl transition-colors"
            >
              <span className="flex items-center gap-2">
                <Camera className="w-3.5 h-3.5 text-orange-500" />
                Import from Screenshot
                <span className="bg-orange-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">NEW</span>
              </span>
              {screenshotOpen ? <ChevronUp className="w-3.5 h-3.5 text-orange-500" /> : <ChevronDown className="w-3.5 h-3.5 text-orange-500" />}
            </button>

            {screenshotOpen && (
              <div className="px-3 pb-3 space-y-2.5" onPaste={handleScreenshotPaste}>
                <p className="text-[11px] text-orange-700">
                  Take a screenshot of a SolarEdge lead email, then upload or paste it here. AI will extract all the contact info.
                </p>

                {/* Drop zone / file picker */}
                <div
                  className={`relative border-2 border-dashed rounded-lg overflow-hidden transition-colors cursor-pointer ${screenshotPreview ? 'border-orange-300 bg-orange-50' : 'border-slate-300 bg-white hover:border-orange-400 hover:bg-orange-50/30'}`}
                  onClick={() => screenshotInputRef.current?.click()}
                >
                  {screenshotPreview ? (
                    <div className="relative">
                      <img src={screenshotPreview} alt="Lead screenshot preview" className="w-full max-h-48 object-contain" />
                      <div className="absolute inset-0 bg-black/30 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                        <p className="text-white text-xs font-medium">Click to change image</p>
                      </div>
                    </div>
                  ) : (
                    <div className="py-6 flex flex-col items-center gap-2">
                      <ImageIcon className="w-8 h-8 text-slate-300" />
                      <p className="text-xs text-slate-500 font-medium">Tap to select screenshot</p>
                      <p className="text-[10px] text-slate-400">or paste from clipboard (⌘V / Ctrl+V)</p>
                    </div>
                  )}
                  <input
                    ref={screenshotInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleScreenshotFile(f); e.target.value = ''; }}
                  />
                </div>

                {screenshotPreview && (
                  <button
                    type="button"
                    onClick={handleScreenshotParse}
                    disabled={screenshotLoading}
                    className="w-full py-2 text-xs font-semibold bg-orange-500 hover:bg-orange-600 disabled:bg-slate-300 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {screenshotLoading
                      ? (<><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Parsing with AI…</>)
                      : (<><Sparkles className="w-3.5 h-3.5" /> Extract Lead Info</>)
                    }
                  </button>
                )}

                {screenshotError && <p className="text-[11px] text-red-600 font-medium">⚠ {screenshotError}</p>}
                {screenshotOk    && <p className="text-[11px] text-green-700 font-medium">✓ {screenshotOk}</p>}
              </div>
            )}
          </div>

          {/* Import from Trello — pre-fills form from a Trello card */}
          <div className="border border-slate-200 rounded-lg bg-slate-50/60">
            <button
              type="button"
              onClick={() => setTrelloOpen(v => !v)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <span className="flex items-center gap-2">
                <Link2 className="w-3.5 h-3.5 text-blue-600" />
                Import from Trello
              </span>
              {trelloOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {trelloOpen && (
              <div className="px-3 pb-3 space-y-2">
                <p className="text-[11px] text-slate-500">Paste a Trello card URL to pre-fill name, phone, email, and notes.</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={trelloUrl}
                    onChange={(e) => { setTrelloUrl(e.target.value); setTrelloError(''); setTrelloOk(''); }}
                    placeholder="https://trello.com/c/..."
                    className="flex-1 px-3 py-1.5 text-xs border border-slate-200 rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={handleTrelloImport}
                    disabled={!trelloUrl.trim() || trelloLoading}
                    className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg transition-colors"
                  >
                    {trelloLoading ? 'Fetching…' : 'Fetch'}
                  </button>
                </div>
                {trelloError && <p className="text-[11px] text-red-600">{trelloError}</p>}
                {trelloOk    && <p className="text-[11px] text-green-700">{trelloOk}</p>}
              </div>
            )}
          </div>

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
                onChange={(e) => setFormData({ ...formData, category: e.target.value as '' | CustomerCategory })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              >
                <option value="">Select...</option>
                <option value="O&M">O&amp;M</option>
                <option value="New Install">New Install</option>
                <option value="Prospect">Prospect</option>
                <option value="PowerCare">PowerCare</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">System Type</label>
              <select
                value={formData.systemType}
                onChange={(e) => setFormData({ ...formData, systemType: e.target.value as '' | SystemType })}
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
                onChange={(e) => setFormData({ ...formData, clientStatus: e.target.value as '' | ClientStatus })}
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
