// SolarEdge Monitoring — Florida Sites Table
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Sun,
  AlertTriangle,
  Search,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Zap,
  Calendar,
  ExternalLink,
  Filter,
  Wrench,
  ClipboardList,
  ChevronRight,
  Plus,
  TrendingUp,
  TrendingDown,
  FileText,
  MessageSquare,
  RefreshCw,
  Trash2,
  Download,
} from 'lucide-react';
import { FL_SITES, SolarEdgeSite } from '../lib/solarEdgeSites';
import { getProfile, CLIENT_STATUS_CONFIG, SiteClientStatus } from '../lib/siteProfileStore';
import { getRemovedSiteIds, addRemovedSiteId } from '../lib/removedSitesStore';
import { COLUMN_REGISTRY, getDefaultColumnConfig } from '../lib/monitoringColumns';
import type { CellCtx } from '../lib/monitoringColumns';
import { getColumnConfig, saveColumnConfig, resetColumnConfig } from '../lib/monitoringColumnStore';
import { MonitoringColumnPicker } from './MonitoringColumnPicker';
import { SolarEdgeExtraSite } from '../types';
import { Job, Customer } from '../types';
import { SiteProfilePanel } from './SiteProfilePanel';
import { Contractor, ContractorJob } from '../types/contractor';
import { SolarEdgeImportModal, DiffItem } from './SolarEdgeImportModal';

type SortKey = keyof SolarEdgeSite;
type SortDir = 'asc' | 'desc' | null;

const STATUS_COLORS: Record<string, string> = {
  Active: 'bg-emerald-100 text-emerald-700',
  Pending: 'bg-amber-100 text-amber-700',
  PendingCommunication: 'bg-orange-100 text-orange-700',
  Error: 'bg-red-100 text-red-700',
};

const IMPACT_COLORS: Record<string, string> = {
  '0': 'bg-slate-100 text-slate-500',
  '1': 'bg-blue-100 text-blue-600',
  '2': 'bg-yellow-100 text-yellow-700',
  '3': 'bg-orange-100 text-orange-700',
  '4': 'bg-red-100 text-red-700',
  '5': 'bg-red-200 text-red-800',
  '6': 'bg-red-300 text-red-900',
};

const WO_STATUS_COLORS: Record<string, string> = {
  new:         'bg-blue-100 text-blue-700',
  assigned:    'bg-indigo-100 text-indigo-700',
  in_progress: 'bg-amber-100 text-amber-700',
  completed:   'bg-emerald-100 text-emerald-700',
  invoiced:    'bg-purple-100 text-purple-700',
  paid:        'bg-green-100 text-green-700',
};

const WO_STATUS_LABEL: Record<string, string> = {
  new:         'New',
  assigned:    'Assigned',
  in_progress: 'In Progress',
  completed:   'Completed',
  invoiced:    'Invoiced',
  paid:        'Paid',
};

const AlertBadge: React.FC<{ alerts: number; impact: string }> = ({ alerts, impact }) => {
  if (alerts === 0) return <span className="text-slate-400 text-xs">—</span>;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${IMPACT_COLORS[impact] || 'bg-red-100 text-red-700'}`}>
      <AlertTriangle className="w-3 h-3" />
      {alerts}
    </span>
  );
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => (
  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status] || 'bg-slate-100 text-slate-600'}`}>
    {status}
  </span>
);

const EnergyCell: React.FC<{ value: number }> = ({ value }) => {
  if (!value) return <span className="text-slate-300">—</span>;
  const display = value >= 1000 ? `${(value / 1000).toFixed(1)} MWh` : `${value.toFixed(1)} kWh`;
  return <span className="font-mono text-xs text-slate-700">{display}</span>;
};

// Use contractorPayRate when available — it's the actual labor cost paid out
// Parts are always deducted (they are real consumable costs)
// SE Compensation is added back as revenue when claimed
const jobProfit = (job: Job): number => {
  const revenue    = job.totalAmount || 0;
  const laborRate  = job.contractorPayRate ?? job.laborRate;
  const laborCost  = job.laborHours * laborRate;
  const partsCost  = job.partsCost || 0;
  const seComp     = job.seCompensationClaimed ? (job.seCompensationAmount || 0) : 0;
  return revenue - laborCost - partsCost + seComp;
};

const ProfitCell: React.FC<{ jobs: Job[] }> = ({ jobs }) => {
  if (jobs.length === 0) return <span className="text-slate-300 text-xs">—</span>;

  const revenue = jobs.reduce((s, j) => s + (j.totalAmount || 0), 0);
  const cost    = jobs.reduce((s, j) => {
    const laborRate = j.contractorPayRate ?? j.laborRate;
    return s + (j.laborHours * laborRate) + (j.partsCost || 0);
  }, 0);
  const profit  = revenue - cost;
  const margin  = revenue > 0 ? (profit / revenue) * 100 : 0;

  if (revenue === 0) return <span className="text-slate-300 text-xs">—</span>;

  const isPos = profit >= 0;
  return (
    <div className="text-right">
      <div className={`flex items-center justify-end gap-1 text-xs font-semibold ${isPos ? 'text-emerald-600' : 'text-red-500'}`}>
        {isPos ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
        ${Math.abs(profit).toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </div>
      <div className="text-xs text-slate-400">{margin.toFixed(0)}% margin</div>
    </div>
  );
};

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey | null; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown className="w-3 h-3 text-slate-400" />;
  if (sortDir === 'asc') return <ChevronUp className="w-3 h-3 text-orange-500" />;
  return <ChevronDown className="w-3 h-3 text-orange-500" />;
}

// Work Orders badge + inline expand
const WOCell: React.FC<{
  siteId: string;
  jobs: Job[];
  expanded: boolean;
  onToggle: () => void;
  onNavigateToJobs: () => void;
}> = ({ jobs, expanded, onToggle, onNavigateToJobs }) => {
  if (jobs.length === 0) {
    return (
      <button
        onClick={onNavigateToJobs}
        className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-orange-500 transition-colors cursor-pointer"
        title="Create work order"
      >
        <Plus className="w-3.5 h-3.5" />
        Add WO
      </button>
    );
  }

  const open   = jobs.filter(j => !['completed','invoiced','paid'].includes(j.status)).length;
  const closed = jobs.length - open;

  return (
    <button
      onClick={onToggle}
      className="inline-flex items-center gap-1.5 cursor-pointer group"
      title={`${jobs.length} work order${jobs.length !== 1 ? 's' : ''} — click to expand`}
    >
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors
        ${open > 0 ? 'bg-amber-100 text-amber-700 group-hover:bg-amber-200' : 'bg-emerald-100 text-emerald-700 group-hover:bg-emerald-200'}`}>
        <Wrench className="w-3 h-3" />
        {jobs.length}
      </span>
      {open > 0 && <span className="text-xs text-amber-600">{open} open</span>}
      {open === 0 && <span className="text-xs text-slate-400">{closed} done</span>}
      <ChevronRight className={`w-3 h-3 text-slate-400 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`} />
    </button>
  );
};

// Derive group from address state abbreviation
const deriveGroup = (address: string): string => {
  const upper = address.toUpperCase();
  // Check for state abbreviations in the address (typically ", FL, " or ", FL 3xxxx")
  if (/\bFL\b/.test(upper)) return 'Conexsol Florida';
  if (/\bPR\b/.test(upper)) return 'Puerto Rico';
  if (/\bAZ\b/.test(upper)) return 'Arizona';
  if (/\bTX\b/.test(upper)) return 'Texas';
  if (/\bCA\b/.test(upper)) return 'California';
  if (/\bNY\b/.test(upper)) return 'New York';
  return 'Other';
};

interface Props {
  jobs: Job[];
  customers: Customer[];
  contractors?: Contractor[];
  onViewChange: (view: string) => void;
  onViewCustomer?: (customerId: string) => void;
  currentUserName?: string;
  currentUserRole?: string;
  onCreateJob?: (job: Partial<Job>) => void;
  onUpdateJob?: (job: Job) => void;
  onDispatchContractorJob?: (job: ContractorJob) => void;
  onUpdateSites?: () => Promise<{ newCount: number; total: number }>;
  extraSites?: SolarEdgeExtraSite[];
  solarEdgeApiKey?: string;
  onImportApply?: (accepted: DiffItem[]) => void;
}

export const SolarEdgeMonitoring: React.FC<Props> = ({
  jobs, customers, contractors = [], onViewChange, onViewCustomer, currentUserName = 'Staff',
  currentUserRole, onCreateJob, onUpdateJob, onDispatchContractorJob, onUpdateSites, extraSites = [],
  solarEdgeApiKey, onImportApply,
}) => {
  const [showImportModal, setShowImportModal] = useState(false);
  // removedIds MUST be declared before ALL_SITES useMemo (deps array evaluates immediately)
  const [removedIds, setRemovedIds]       = useState<Set<string>>(() => getRemovedSiteIds());
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  // Merge static FL_SITES with any new sites pulled from the API, then exclude removed
  const ALL_SITES: SolarEdgeSite[] = useMemo(() => {
    const flIds = new Set(FL_SITES.map(s => s.siteId));
    const extras = extraSites.filter(s => !flIds.has(s.siteId)) as SolarEdgeSite[];
    return [...FL_SITES, ...extras].filter(s => !removedIds.has(s.siteId));
  }, [extraSites, removedIds]);
  // Build lookup: siteId → customer (for navigation)
  const customerBySiteId = useMemo(() => {
    const bySiteId   = new Map<string, Customer>();
    const byClientId = new Map<string, Customer>();
    for (const c of customers) {
      if (c.solarEdgeSiteId) bySiteId.set(c.solarEdgeSiteId, c);
      if (c.clientId)        byClientId.set(c.clientId, c);
    }
    return { bySiteId, byClientId };
  }, [customers]);
  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [alertFilter, setAlertFilter]   = useState<string>('all');
  const [woFilter, setWoFilter]             = useState<string>('all');
  const [clientStatusFilter, setClientStatusFilter] = useState<string>('all');
  const [sortKey, setSortKey]           = useState<SortKey | null>('clientId');
  const [sortDir, setSortDir]           = useState<SortDir>('asc');
  const [expandedSite, setExpandedSite] = useState<string | null>(null);
  const [panelSite, setPanelSite]       = useState<SolarEdgeSite | null>(null);
  const [isUpdating, setIsUpdating]     = useState(false);
  const [updateMsg, setUpdateMsg]       = useState<string | null>(null);
  const [groupFilter, setGroupFilter]   = useState<string>('Conexsol Florida');
  const isAdmin = currentUserRole === 'admin';

  // ── Column customization ──────────────────────────────────────────────────
  const [colConfig, setColConfig] = useState(() => {
    const saved = getColumnConfig();
    if (saved) {
      // Merge any new columns from registry that aren't in saved order
      const savedSet = new Set(saved.order);
      const defaults = getDefaultColumnConfig();
      const newCols = defaults.order.filter(id => !savedSet.has(id));
      if (newCols.length > 0) {
        return {
          order: [...saved.order, ...newCols],
          hidden: [...saved.hidden, ...newCols.filter(id => {
            const def = COLUMN_REGISTRY.find(c => c.id === id);
            return def && !def.defaultVisible;
          })],
        };
      }
      return saved;
    }
    return getDefaultColumnConfig();
  });

  const handleColConfigChange = useCallback((next: typeof colConfig) => {
    setColConfig(next);
    saveColumnConfig(next);
  }, []);

  const handleColReset = useCallback(() => {
    const defaults = getDefaultColumnConfig();
    setColConfig(defaults);
    resetColumnConfig();
  }, []);

  // Visible columns in user-defined order
  const visibleColumns = useMemo(() => {
    const hiddenSet = new Set(colConfig.hidden);
    return colConfig.order
      .map(id => COLUMN_REGISTRY.find(c => c.id === id))
      .filter((c): c is typeof COLUMN_REGISTRY[number] =>
        !!c && !hiddenSet.has(c.id) && (!c.adminOnly || isAdmin)
      );
  }, [colConfig, isAdmin]);

  // Drag-and-drop state for table headers
  const [dragColId, setDragColId] = useState<string | null>(null);
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);

  const handleHeaderDragStart = (id: string) => setDragColId(id);
  const handleHeaderDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    setDragOverColId(id);
  };
  const handleHeaderDrop = (targetId: string) => {
    if (!dragColId || dragColId === targetId) { setDragColId(null); setDragOverColId(null); return; }
    const newOrder = [...colConfig.order];
    const fromIdx = newOrder.indexOf(dragColId);
    const toIdx = newOrder.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) { setDragColId(null); setDragOverColId(null); return; }
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, dragColId);
    const next = { ...colConfig, order: newOrder };
    setColConfig(next);
    saveColumnConfig(next);
    setDragColId(null);
    setDragOverColId(null);
  };

  const handleRemoveSite = (siteId: string) => {
    addRemovedSiteId(siteId);
    setRemovedIds(getRemovedSiteIds());
    setConfirmRemove(null);
  };

  const handleUpdateClick = useCallback(async () => {
    if (!onUpdateSites || isUpdating) return;
    setIsUpdating(true);
    setUpdateMsg(null);
    try {
      const { newCount, total } = await onUpdateSites();
      setUpdateMsg(
        newCount > 0
          ? `✓ Added ${newCount} new site${newCount !== 1 ? 's' : ''} (${total} total in group)`
          : `✓ Up to date — ${total} site${total !== 1 ? 's' : ''} in group, no new additions`
      );
    } catch (err: any) {
      setUpdateMsg(`✗ ${err?.message || 'Update failed'}`);
    } finally {
      setIsUpdating(false);
    }
  }, [onUpdateSites, isUpdating]);

  const [profileMeta, setProfileMeta] = useState<Record<string, { noteCount: number; hasDesc: boolean; clientStatus?: string }>>({});

  const refreshProfileMeta = useCallback(() => {
    const meta: Record<string, { noteCount: number; hasDesc: boolean; clientStatus?: string }> = {};
    for (const site of ALL_SITES) {
      const p = getProfile(site.siteId);
      meta[site.siteId] = { noteCount: p.notes.length, hasDesc: !!p.description.trim(), clientStatus: p.clientStatus };
    }
    setProfileMeta(meta);
  }, []);

  useEffect(() => { refreshProfileMeta(); }, [refreshProfileMeta]);

  // Build lookup: siteId → jobs
  // Join path 1: via customer.solarEdgeSiteId or customer.clientId → job.customerId
  // Join path 2: directly via job.solarEdgeSiteId (WOs created from the WO panel)
  const wosBySite = useMemo(() => {
    const map = new Map<string, Job[]>();

    // Index customers
    const bySiteId   = new Map<string, Customer>();
    const byClientId = new Map<string, Customer>();
    for (const c of customers) {
      if (c.solarEdgeSiteId) bySiteId.set(c.solarEdgeSiteId, c);
      if (c.clientId)        byClientId.set(c.clientId, c);
    }

    // Index jobs that have solarEdgeSiteId set directly (WO-panel created)
    const directBySiteId = new Map<string, Job[]>();
    for (const j of jobs) {
      if (j.solarEdgeSiteId) {
        const list = directBySiteId.get(j.solarEdgeSiteId) ?? [];
        list.push(j);
        directBySiteId.set(j.solarEdgeSiteId, list);
      }
    }

    for (const site of ALL_SITES) {
      const customer     = bySiteId.get(site.siteId) ?? byClientId.get(site.clientId);
      const customerJobs = customer ? jobs.filter(j => j.customerId === customer.id) : [];
      const directJobs   = directBySiteId.get(site.siteId) ?? [];

      // Merge, deduplicate by id
      const seen    = new Set<string>();
      const merged: Job[] = [];
      for (const j of [...customerJobs, ...directJobs]) {
        if (!seen.has(j.id)) { seen.add(j.id); merged.push(j); }
      }
      map.set(site.siteId, merged);
    }
    return map;
  }, [jobs, customers]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : d === 'desc' ? null : 'asc');
      if (sortDir === 'desc') setSortKey(null);
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const filtered = useMemo(() => {
    let rows = [...ALL_SITES];

    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(s =>
        (s.clientId || '').toLowerCase().includes(q) ||
        (s.siteName || '').toLowerCase().includes(q) ||
        (s.address || '').toLowerCase().includes(q) ||
        (s.siteId || '').includes(q)
      );
    }
    if (statusFilter !== 'all') rows = rows.filter(s => s.status === statusFilter);
    if (alertFilter === 'alerts') rows = rows.filter(s => s.alerts > 0);
    else if (alertFilter === 'none') rows = rows.filter(s => s.alerts === 0);
    if (clientStatusFilter !== 'all') {
      rows = rows.filter(s => profileMeta[s.siteId]?.clientStatus === clientStatusFilter);
    }
    if (woFilter === 'has_wo') rows = rows.filter(s => (wosBySite.get(s.siteId)?.length ?? 0) > 0);
    else if (woFilter === 'open_wo') rows = rows.filter(s =>
      (wosBySite.get(s.siteId) ?? []).some(j => !['completed','invoiced','paid'].includes(j.status))
    );
    else if (woFilter === 'no_wo') rows = rows.filter(s => (wosBySite.get(s.siteId)?.length ?? 0) === 0);

    // Group filter
    if (groupFilter !== 'all') {
      rows = rows.filter(s => deriveGroup(s.address) === groupFilter);
    }

    if (sortKey && sortDir) {
      rows.sort((a, b) => {
        const av = a[sortKey], bv = b[sortKey];
        const cmp = typeof av === 'number' && typeof bv === 'number'
          ? av - bv : String(av).localeCompare(String(bv));
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
    return rows;
  }, [search, statusFilter, alertFilter, woFilter, clientStatusFilter, groupFilter, sortKey, sortDir, wosBySite, profileMeta]);

  const stats = useMemo(() => {
    const allJobs  = [...wosBySite.values()].flat();
    const totalWOs = allJobs.length;
    const openWOs  = allJobs.filter(j => !['completed','invoiced','paid'].includes(j.status)).length;
    const totalRevenue    = allJobs.reduce((s, j) => s + (j.totalAmount || 0), 0);
    const totalCost       = allJobs.reduce((s, j) => {
      const laborRate = j.contractorPayRate ?? j.laborRate;
      return s + (j.laborHours * laborRate) + (j.partsCost || 0);
    }, 0);
    const totalProfit     = totalRevenue - totalCost;
    return {
      total:         ALL_SITES.length,
      active:        ALL_SITES.filter(s => s.status === 'Active').length,
      withAlerts:    ALL_SITES.filter(s => s.alerts > 0).length,
      totalMonthKwh: ALL_SITES.reduce((s, x) => s + x.monthKwh, 0),
      totalWOs,
      openWOs,
      totalRevenue,
      totalProfit,
    };
  }, [wosBySite, ALL_SITES]);

  const TH: React.FC<{ col: SortKey; label: string }> = ({ col, label }) => (
    <th
      className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer select-none hover:text-slate-800 whitespace-nowrap"
      onClick={() => handleSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
      </span>
    </th>
  );

  const COLS = visibleColumns.length;

  return (
    <>
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-amber-100 rounded-lg flex items-center justify-center">
            <Sun className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">SolarEdge Monitoring</h1>
            <p className="text-sm text-slate-500">Florida — Account #64793</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImportModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors"
            >
              <Download className="w-4 h-4" />
              Import SolarEdge
            </button>
            {onUpdateSites && (
              <button
                onClick={handleUpdateClick}
                disabled={isUpdating}
                className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors"
                title="Pull new sites from the Florida SolarEdge group and add them to the client database"
              >
                <RefreshCw className={`w-4 h-4 ${isUpdating ? 'animate-spin' : ''}`} />
                {isUpdating ? 'Updating…' : 'Update Sites'}
              </button>
            )}
          </div>
          {updateMsg && (
            <p className={`text-xs ${updateMsg.startsWith('✓') ? 'text-emerald-600' : 'text-red-500'}`}>
              {updateMsg}
            </p>
          )}
        </div>
      </div>

      {/* Stats Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {[
          { label: 'Total Sites',       value: stats.total,                                                    icon: Sun,           color: 'text-amber-600 bg-amber-50' },
          { label: 'Active',            value: stats.active,                                                   icon: Zap,           color: 'text-emerald-600 bg-emerald-50' },
          { label: 'With Alerts',       value: stats.withAlerts,                                               icon: AlertTriangle, color: 'text-red-600 bg-red-50' },
          { label: 'Month Production',  value: `${(stats.totalMonthKwh / 1000).toFixed(1)} MWh`,              icon: Calendar,      color: 'text-blue-600 bg-blue-50' },
          { label: 'Total Work Orders', value: stats.totalWOs,                                                 icon: ClipboardList, color: 'text-violet-600 bg-violet-50' },
          { label: 'Open Work Orders',  value: stats.openWOs,                                                  icon: Wrench,        color: 'text-orange-600 bg-orange-50' },
          { label: 'Total Revenue',     value: `$${stats.totalRevenue.toLocaleString(undefined,{maximumFractionDigits:0})}`, icon: TrendingUp, color: 'text-blue-600 bg-blue-50' },
          { label: 'Total Profit',      value: `$${stats.totalProfit.toLocaleString(undefined,{maximumFractionDigits:0})}`, icon: stats.totalProfit >= 0 ? TrendingUp : TrendingDown, color: stats.totalProfit >= 0 ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-500 truncate">{label}</p>
              <p className="text-base font-bold text-slate-900 leading-tight">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search site ID, name, address…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 text-slate-400" />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400 cursor-pointer">
            <option value="all">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Pending">Pending</option>
            <option value="PendingCommunication">Pending Comm.</option>
          </select>

          <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400 cursor-pointer font-medium">
            <option value="all">All Groups</option>
            <option value="Conexsol Florida">Conexsol Florida</option>
            <option value="Puerto Rico">Puerto Rico</option>
            <option value="Arizona">Arizona</option>
            <option value="Texas">Texas</option>
            <option value="Other">Other</option>
          </select>

          <select value={alertFilter} onChange={e => setAlertFilter(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400 cursor-pointer">
            <option value="all">All Sites</option>
            <option value="alerts">With Alerts</option>
            <option value="none">No Alerts</option>
          </select>

          <select value={woFilter} onChange={e => setWoFilter(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400 cursor-pointer">
            <option value="all">All WO Status</option>
            <option value="has_wo">Has Work Orders</option>
            <option value="open_wo">Open Work Orders</option>
            <option value="no_wo">No Work Orders</option>
          </select>

          <select value={clientStatusFilter} onChange={e => setClientStatusFilter(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400 cursor-pointer">
            <option value="all">All Client Status</option>
            {/* Predefined options */}
            {(Object.entries(CLIENT_STATUS_CONFIG) as [SiteClientStatus, typeof CLIENT_STATUS_CONFIG[SiteClientStatus]][]).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.label}</option>
            ))}
            {/* Any custom values in use */}
            {Array.from(new Set(
              Object.values(profileMeta)
                .map(m => m.clientStatus)
                .filter((s): s is string => !!s && !CLIENT_STATUS_CONFIG[s as SiteClientStatus])
            )).map(custom => (
              <option key={custom} value={custom}>{custom}</option>
            ))}
          </select>
        </div>

        <MonitoringColumnPicker
          columns={COLUMN_REGISTRY}
          config={colConfig}
          isAdmin={isAdmin}
          onChange={handleColConfigChange}
          onReset={handleColReset}
        />

        <span className="text-xs text-slate-400 ml-auto">
          {filtered.length} of {ALL_SITES.length} sites
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {visibleColumns.map(col => (
                  <th
                    key={col.id}
                    draggable
                    onDragStart={() => handleHeaderDragStart(col.id)}
                    onDragOver={(e) => handleHeaderDragOver(e, col.id)}
                    onDrop={() => handleHeaderDrop(col.id)}
                    onDragEnd={() => { setDragColId(null); setDragOverColId(null); }}
                    className={`px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap cursor-grab active:cursor-grabbing select-none
                      ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}
                      ${dragOverColId === col.id ? 'border-l-2 border-orange-400' : ''}
                      ${dragColId === col.id ? 'opacity-40' : ''}`}
                  >
                    {col.sortKey ? (
                      <button
                        onClick={() => {
                          if (sortKey === col.sortKey) {
                            setSortDir(sortDir === 'asc' ? 'desc' : sortDir === 'desc' ? null : 'asc');
                            if (sortDir === 'desc') setSortKey(null);
                          } else {
                            setSortKey(col.sortKey!);
                            setSortDir('asc');
                          }
                        }}
                        className="inline-flex items-center gap-1 hover:text-orange-600 transition-colors"
                      >
                        {col.label}
                        <SortIcon col={col.sortKey} sortKey={sortKey} sortDir={sortDir} />
                      </button>
                    ) : (
                      col.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={COLS} className="px-4 py-12 text-center text-slate-400 text-sm">
                    No sites match your filters.
                  </td>
                </tr>
              ) : (
                filtered.map((site) => {
                  const siteJobs   = wosBySite.get(site.siteId) ?? [];
                  const isExpanded = expandedSite === site.siteId;

                  return (
                    <React.Fragment key={site.siteId}>
                      <tr className={`hover:bg-slate-50 transition-colors duration-150 ${site.alerts > 0 ? 'border-l-2 border-l-orange-400' : ''}`}>
                        {visibleColumns.map(col => {
                          const ctx: CellCtx = {
                            site,
                            siteJobs,
                            isExpanded,
                            profileMeta,
                            customerBySiteId,
                            onViewCustomer,
                            onViewChange,
                            onToggleExpand: () => setExpandedSite(isExpanded ? null : site.siteId),
                            onOpenPanel: () => setPanelSite(site),
                            isAdmin,
                            confirmRemove,
                            onConfirmRemove: (id) => setConfirmRemove(id),
                            onCancelRemove: () => setConfirmRemove(null),
                            onRemove: handleRemoveSite,
                          };
                          return (
                            <td
                              key={col.id}
                              className={`px-3 py-2.5 whitespace-nowrap ${col.maxWidth || ''} ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''}`}
                            >
                              {col.render(ctx)}
                            </td>
                          );
                        })}
                      </tr>

                      {/* Expandable Work Orders panel */}
                      {isExpanded && siteJobs.length > 0 && (
                        <tr className="bg-slate-50">
                          <td colSpan={COLS} className="px-4 py-3">
                            <div className="flex items-center gap-2 mb-2">
                              <ClipboardList className="w-4 h-4 text-slate-500" />
                              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                                Work Orders — {site.clientId || site.siteName}
                              </span>
                            </div>
                            <div className="grid gap-2">
                              {siteJobs.map(job => (
                                <div key={job.id} className="bg-white rounded-lg border border-slate-200 px-3 py-2 flex flex-wrap items-center gap-3 text-xs">
                                  <span className="font-mono text-slate-400">{job.id.slice(0,8)}</span>
                                  <span className="font-medium text-slate-800">{job.title || job.serviceType}</span>
                                  <span className={`px-2 py-0.5 rounded-full font-medium ${WO_STATUS_COLORS[job.status] || 'bg-slate-100 text-slate-600'}`}>
                                    {WO_STATUS_LABEL[job.status] || job.status}
                                  </span>
                                  {job.urgency && (
                                    <span className={`px-2 py-0.5 rounded-full font-medium ${
                                      job.urgency === 'critical' ? 'bg-red-100 text-red-700' :
                                      job.urgency === 'high'     ? 'bg-orange-100 text-orange-700' :
                                      job.urgency === 'medium'   ? 'bg-yellow-100 text-yellow-700' :
                                      'bg-slate-100 text-slate-500'}`}>
                                      {job.urgency}
                                    </span>
                                  )}
                                  {job.scheduledDate && (
                                    <span className="text-slate-400 flex items-center gap-1">
                                      <Calendar className="w-3 h-3" />
                                      {job.scheduledDate}
                                    </span>
                                  )}
                                  {job.totalAmount > 0 && (
                                    <span className="ml-auto font-medium text-slate-700">
                                      ${job.totalAmount.toLocaleString()}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                            <button
                              onClick={() => onViewChange('jobs')}
                              className="mt-2 text-xs text-orange-500 hover:text-orange-700 transition-colors cursor-pointer"
                            >
                              View all in Work Orders →
                            </button>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
          <span>Data from SolarEdge Monitoring API · Account 64793</span>
          <span>{filtered.length} sites shown</span>
        </div>
      </div>
    </div>

    {/* Site Profile Slide-over */}
    {panelSite && (
      <SiteProfilePanel
        site={panelSite}
        jobs={jobs}
        customers={customers}
        contractors={contractors}
        currentUserName={currentUserName}
        currentUserRole={currentUserRole}
        onClose={() => { setPanelSite(null); refreshProfileMeta(); }}
        onNavigateToJobs={() => { setPanelSite(null); onViewChange('jobs'); }}
        onCreateJob={onCreateJob}
        onUpdateJob={onUpdateJob}
        onDispatchContractorJob={onDispatchContractorJob}
      />
    )}
    {showImportModal && (
      <SolarEdgeImportModal
        apiKey={solarEdgeApiKey}
        currentCustomers={customers}
        onClose={() => setShowImportModal(false)}
        onApply={(accepted) => {
          onImportApply?.(accepted);
          setShowImportModal(false);
        }}
      />
    )}
    </>
  );
};
