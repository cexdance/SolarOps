// SolarOps — OPS CENTER Dashboard
// 4 columns × 3 rows = 12 configurable widget slots
import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  Crosshair, AlertTriangle, Zap, Wrench, Plus, X, Sun,
  Clock, MapPin, LayoutGrid, Search, ChevronRight,
  TrendingUp, UserCog, ClipboardList, User, Check, Inbox,
  Phone, Mail, CheckSquare, Trash2, Calendar, GripVertical,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { FL_SITES, SolarEdgeSite } from '../lib/solarEdgeSites';
import { Job, Customer, LeadSource } from '../types';
import { loadCRMData, saveCRMData, addLead, CRMData } from '../lib/crmStore';
import { loadTodos, saveTodos, TodoItem } from '../lib/todoStore';
import { Lead } from '../types';
import { Contractor } from '../types/contractor';

// ── Types ─────────────────────────────────────────────────────────────────────

type WidgetType =
  | 'alert-state'
  | 'current-production'
  | 'work-order'
  | 'single-wo'
  | 'customer-production'
  | 'contractor-wo'
  | 'daily-production-graph'
  | 'lead-pipeline'
  | 'single-lead'
  | 'todo-list';

interface WidgetConfig {
  type: WidgetType;
  customerId?: string;
  contractorId?: string;
  jobId?: string;
  leadId?: string;
}

interface DispatchDashboardProps {
  customers: Customer[];
  jobs: Job[];
  contractors: Contractor[];
  isMobile: boolean;
  currentUserId: string;
}

// ── Widget catalog ─────────────────────────────────────────────────────────────

interface WidgetCatalogEntry {
  type: WidgetType;
  label: string;
  description: string;
  icon: React.ElementType;
  colorClass: string;
  bgClass: string;
  requires?: 'customer' | 'contractor' | 'job' | 'lead';
}

const WIDGET_CATALOG: WidgetCatalogEntry[] = [
  {
    type: 'single-wo',
    label: 'Single Work Order',
    description: 'Track one specific work order',
    icon: ClipboardList,
    colorClass: 'text-blue-600',
    bgClass: 'bg-blue-50',
    requires: 'job',
  },
  {
    type: 'customer-production',
    label: 'Customer Production',
    description: 'Production stats for one site',
    icon: Sun,
    colorClass: 'text-orange-500',
    bgClass: 'bg-orange-50',
    requires: 'customer',
  },
  {
    type: 'daily-production-graph',
    label: 'Daily Production Graph',
    description: '24-hour chart for one site',
    icon: TrendingUp,
    colorClass: 'text-emerald-600',
    bgClass: 'bg-emerald-50',
    requires: 'customer',
  },
  {
    type: 'contractor-wo',
    label: 'Contractor Work Orders',
    description: "One contractor's open WOs",
    icon: UserCog,
    colorClass: 'text-purple-600',
    bgClass: 'bg-purple-50',
    requires: 'contractor',
  },
  {
    type: 'work-order',
    label: 'Work Orders',
    description: 'All open work orders',
    icon: Wrench,
    colorClass: 'text-slate-600',
    bgClass: 'bg-slate-100',
  },
  {
    type: 'alert-state',
    label: 'Alert State',
    description: 'Sites with active SolarEdge alerts',
    icon: AlertTriangle,
    colorClass: 'text-red-500',
    bgClass: 'bg-red-50',
  },
  {
    type: 'current-production',
    label: 'Fleet Production',
    description: 'Total production across all sites',
    icon: Zap,
    colorClass: 'text-amber-500',
    bgClass: 'bg-amber-50',
  },
  {
    type: 'lead-pipeline',
    label: 'Lead Pipeline',
    description: 'CRM funnel summary + quick-add lead',
    icon: Inbox,
    colorClass: 'text-violet-400',
    bgClass: 'bg-violet-900/30',
  },
  {
    type: 'single-lead',
    label: 'Single Lead Card',
    description: 'Track one specific lead from the lobby',
    icon: User,
    colorClass: 'text-teal-600',
    bgClass: 'bg-teal-50',
    requires: 'lead' as any,
  },
  {
    type: 'todo-list',
    label: 'My To-Do List',
    description: 'Personal tasks with due dates — private per user',
    icon: CheckSquare,
    colorClass: 'text-indigo-600',
    bgClass: 'bg-indigo-50',
  },
];

// ── Layout persistence ─────────────────────────────────────────────────────────

const TOTAL_SLOTS = 12;
const STORAGE_KEY = 'solarops_dispatch_layout_v2';

const defaultLayout = (): (WidgetConfig | null)[] => {
  const s: (WidgetConfig | null)[] = Array(TOTAL_SLOTS).fill(null);
  s[0] = { type: 'alert-state' };
  s[1] = { type: 'current-production' };
  s[2] = { type: 'work-order' };
  return s;
};

const loadLayout = (): (WidgetConfig | null)[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return defaultLayout();
};

const saveLayout = (layout: (WidgetConfig | null)[]) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(layout)); } catch {}
};

// ── Shared style constants ─────────────────────────────────────────────────────

const IMPACT_COLORS: Record<string, string> = {
  '0': 'bg-slate-100 text-slate-500',
  '1': 'bg-blue-100 text-blue-600',
  '2': 'bg-yellow-100 text-yellow-700',
  '3': 'bg-orange-100 text-orange-700',
  '4': 'bg-red-100 text-red-700',
  '5': 'bg-red-200 text-red-800',
  '6': 'bg-red-300 text-red-900',
};

const JOB_STATUS_COLORS: Record<string, string> = {
  new:         'bg-blue-100 text-blue-700',
  assigned:    'bg-indigo-100 text-indigo-700',
  in_progress: 'bg-amber-100 text-amber-700',
  completed:   'bg-emerald-100 text-emerald-700',
  invoiced:    'bg-purple-100 text-purple-700',
  paid:        'bg-green-100 text-green-700',
};
const JOB_STATUS_LABEL: Record<string, string> = {
  new: 'New', assigned: 'Assigned', in_progress: 'In Progress',
  completed: 'Completed', invoiced: 'Invoiced', paid: 'Paid',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-slate-100 text-slate-500',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const fmtKwh = (kwh: number) =>
  kwh >= 1_000_000 ? `${(kwh / 1_000_000).toFixed(2)} GWh`
  : kwh >= 1_000   ? `${(kwh / 1_000).toFixed(1)} MWh`
  : `${kwh.toFixed(0)} kWh`;

const fmtDate = (d: string | undefined) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';

/** Generate simulated 24-hour solar production curve */
const generateHourlyData = (site: SolarEdgeSite) => {
  const peakKw   = site.peakPower > 0 ? site.peakPower : 8;
  const nowHour  = new Date().getHours();
  return Array.from({ length: 24 }, (_, h) => {
    let kw = 0;
    if (h >= 6 && h <= 20) {
      const x = (h - 13) / 3.8;
      kw = Math.max(0, peakKw * Math.exp(-x * x * 0.9));
      // Add subtle harmonic variation for realism
      kw *= 0.88 + Math.sin(h * 2.1 + site.siteId.length * 0.3) * 0.12;
    }
    return {
      hour: `${String(h).padStart(2, '0')}:00`,
      kw: h <= nowHour ? parseFloat(kw.toFixed(2)) : null,
    };
  });
};

// ── Individual Widgets ─────────────────────────────────────────────────────────

const AlertStateWidget: React.FC<{ customers: Customer[] }> = ({ customers }) => {
  const custBySiteId = useMemo(() => {
    const m = new Map<string, Customer>();
    customers.forEach(c => { if (c.solarEdgeSiteId) m.set(c.solarEdgeSiteId, c); });
    return m;
  }, [customers]);

  const alertSites = useMemo(() =>
    FL_SITES.filter(s => s.alerts > 0)
      .sort((a, b) => Number(b.highestImpact) - Number(a.highestImpact)),
    []
  );

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          <span className="text-sm font-semibold text-slate-900">Alert State</span>
        </div>
        <span className="text-[11px] font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
          {alertSites.length} sites · {alertSites.reduce((s, x) => s + x.alerts, 0)} alerts
        </span>
      </div>
      <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
        {alertSites.length === 0
          ? <p className="text-xs text-slate-400 text-center pt-6">No active alerts</p>
          : alertSites.slice(0, 10).map(site => {
              const cust = custBySiteId.get(site.siteId);
              const impact = Number(site.highestImpact);
              return (
                <div key={site.siteId} className="flex items-center gap-2 py-1.5 px-2 rounded-lg bg-slate-50 hover:bg-white border border-transparent hover:border-slate-200 transition-all">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${impact >= 4 ? 'bg-red-500' : impact >= 3 ? 'bg-orange-400' : 'bg-yellow-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-800 truncate leading-tight">{cust?.name || site.siteName}</p>
                    {cust?.clientId && <p className="text-[10px] font-mono text-orange-600 leading-tight">{cust.clientId}</p>}
                  </div>
                  <span className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${IMPACT_COLORS[site.highestImpact] || 'bg-red-100 text-red-700'}`}>{site.alerts}</span>
                  <span className={`flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${site.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{site.status}</span>
                </div>
              );
            })
        }
      </div>
    </div>
  );
};

const FleetProductionWidget: React.FC = () => {
  const t = useMemo(() => ({
    total:    FL_SITES.length,
    active:   FL_SITES.filter(s => s.status === 'Active').length,
    alerts:   FL_SITES.filter(s => s.alerts > 0).length,
    todayKwh: FL_SITES.reduce((s, x) => s + (x.todayKwh || 0), 0),
    monthKwh: FL_SITES.reduce((s, x) => s + (x.monthKwh || 0), 0),
    yearKwh:  FL_SITES.reduce((s, x) => s + (x.yearKwh || 0), 0),
    lifetime: FL_SITES.reduce((s, x) => s + (x.lifetimeKwh || 0), 0),
  }), []);
  const lastUpdate = FL_SITES.reduce((l, s) => s.lastUpdate > l ? s.lastUpdate : l, '');

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <Zap className="w-4 h-4 text-amber-500" />
          <span className="text-sm font-semibold text-slate-900">Fleet Production</span>
        </div>
        <span className="text-[10px] text-slate-400">{t.active}/{t.total} sites</span>
      </div>
      <div className="flex-1 space-y-2 min-h-0">
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-amber-50 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Today</p>
            <p className="text-base font-bold text-amber-700 leading-tight">{fmtKwh(t.todayKwh)}</p>
          </div>
          <div className="bg-orange-50 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">This Month</p>
            <p className="text-base font-bold text-orange-700 leading-tight">{fmtKwh(t.monthKwh)}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-50 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">This Year</p>
            <p className="text-sm font-bold text-slate-700">{fmtKwh(t.yearKwh)}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Lifetime</p>
            <p className="text-sm font-bold text-slate-700">{fmtKwh(t.lifetime)}</p>
          </div>
        </div>
        <div className="flex items-center justify-between pt-1 border-t border-slate-100">
          <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-red-400" /><span className="text-[10px] text-slate-500">{t.alerts} with alerts</span></div>
          {lastUpdate && <span className="text-[10px] text-slate-400"><Clock className="w-3 h-3 inline mr-0.5" />{lastUpdate.slice(0, 10)}</span>}
        </div>
      </div>
    </div>
  );
};

const AllWorkOrdersWidget: React.FC<{ jobs: Job[]; customers: Customer[] }> = ({ jobs, customers }) => {
  const custById = useMemo(() => { const m = new Map<string, Customer>(); customers.forEach(c => m.set(c.id, c)); return m; }, [customers]);
  const active = useMemo(() =>
    jobs.filter(j => j.status !== 'paid')
      .sort((a, b) => new Date(b.scheduledDate || b.date || b.createdAt || 0).getTime() - new Date(a.scheduledDate || a.date || a.createdAt || 0).getTime())
      .slice(0, 8),
    [jobs]
  );
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <div className="flex items-center gap-1.5"><Wrench className="w-4 h-4 text-slate-600" /><span className="text-sm font-semibold text-slate-900">Work Orders</span></div>
        <span className="text-[11px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full font-medium">{jobs.filter(j => j.status !== 'paid' && j.status !== 'completed').length} open</span>
      </div>
      <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
        {active.length === 0
          ? <p className="text-xs text-slate-400 text-center pt-6">No work orders</p>
          : active.map(job => {
              const cust = custById.get(job.customerId);
              return (
                <div key={job.id} className="py-1.5 px-2 rounded-lg bg-slate-50 hover:bg-white border border-transparent hover:border-slate-200 transition-all">
                  <div className="flex items-center gap-2 mb-0.5">
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      {cust?.clientId && <span className="text-[10px] font-mono text-orange-600 bg-orange-50 px-1 rounded flex-shrink-0">{cust.clientId}</span>}
                      <span className="text-xs font-semibold text-slate-800 truncate">{cust?.name || job.clientName || 'Unknown'}</span>
                    </div>
                    <span className={`flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${JOB_STATUS_COLORS[job.status] || 'bg-slate-100 text-slate-500'}`}>{JOB_STATUS_LABEL[job.status] || job.status}</span>
                  </div>
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1 min-w-0"><MapPin className="w-3 h-3 text-slate-400 flex-shrink-0" /><span className="text-[10px] text-slate-400 truncate">{cust?.city ? `${cust.city}, ${cust.state}` : cust?.address || job.siteAddress || '—'}</span></div>
                    <div className="flex items-center gap-1 flex-shrink-0"><Clock className="w-3 h-3 text-slate-300" /><span className="text-[10px] text-slate-400">{fmtDate(job.scheduledDate || job.date)}</span></div>
                  </div>
                </div>
              );
            })
        }
      </div>
    </div>
  );
};

const SingleWOWidget: React.FC<{ jobId: string; jobs: Job[]; customers: Customer[] }> = ({ jobId, jobs, customers }) => {
  const job  = jobs.find(j => j.id === jobId);
  const cust = job ? customers.find(c => c.id === job.customerId) : null;

  if (!job) return (
    <div className="h-full flex items-center justify-center">
      <p className="text-xs text-slate-400">Work order not found</p>
    </div>
  );

  const dateStr = job.scheduledDate || job.date;
  const priority = job.priority || job.urgency;

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* WO badge + status */}
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <ClipboardList className="w-4 h-4 text-blue-500" />
          <span className="text-xs font-mono font-bold text-slate-500">{job.woNumber || job.id.slice(-6).toUpperCase()}</span>
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${JOB_STATUS_COLORS[job.status] || 'bg-slate-100 text-slate-500'}`}>{JOB_STATUS_LABEL[job.status] || job.status}</span>
      </div>
      {/* Customer */}
      <div className="mb-2 flex-shrink-0">
        {cust?.clientId && <p className="text-[10px] font-mono text-orange-600 leading-tight">{cust.clientId}</p>}
        <p className="text-sm font-bold text-slate-900 leading-tight">{cust?.name || job.clientName || 'Unknown Customer'}</p>
      </div>
      {/* Details */}
      <div className="space-y-1.5 flex-1">
        <div className="flex items-start gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
          <span className="text-xs text-slate-600">{cust?.address || job.siteAddress || '—'}{cust?.city ? `, ${cust.city}, ${cust.state}` : ''}</span>
        </div>
        {(job.title || job.serviceType) && (
          <div className="flex items-start gap-1.5">
            <Wrench className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
            <span className="text-xs text-slate-600">{job.title || job.serviceType}</span>
          </div>
        )}
        <div className="flex items-center justify-between pt-1.5 border-t border-slate-100">
          {priority && (
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${PRIORITY_COLORS[priority] || 'bg-slate-100 text-slate-500'}`}>{priority}</span>
          )}
          {dateStr && (
            <div className="flex items-center gap-1 ml-auto">
              <Clock className="w-3 h-3 text-slate-300" />
              <span className="text-[10px] text-slate-400">{fmtDate(dateStr)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const CustomerProductionWidget: React.FC<{ customerId: string; customers: Customer[] }> = ({ customerId, customers }) => {
  const cust = customers.find(c => c.id === customerId);
  const site = cust?.solarEdgeSiteId ? FL_SITES.find(s => s.siteId === cust.solarEdgeSiteId) : null;

  if (!cust) return <div className="h-full flex items-center justify-center"><p className="text-xs text-slate-400">Customer not found</p></div>;
  if (!site) return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-1.5 mb-2"><Sun className="w-4 h-4 text-orange-400" /><span className="text-xs font-semibold text-slate-900 truncate">{cust.name}</span></div>
      <div className="flex-1 flex items-center justify-center"><p className="text-xs text-slate-400">No SolarEdge site linked</p></div>
    </div>
  );

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <Sun className="w-4 h-4 text-orange-400 flex-shrink-0" />
          <div className="min-w-0">
            {cust.clientId && <p className="text-[10px] font-mono text-orange-600 leading-tight">{cust.clientId}</p>}
            <p className="text-xs font-bold text-slate-900 truncate">{cust.name}</p>
          </div>
        </div>
        <span className={`flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${site.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{site.status}</span>
      </div>
      <div className="flex-1 space-y-2 min-h-0">
        <div className="grid grid-cols-2 gap-1.5">
          <div className="bg-amber-50 rounded-lg p-2 text-center">
            <p className="text-[9px] text-slate-500 uppercase tracking-wide">Today</p>
            <p className="text-sm font-bold text-amber-700">{fmtKwh(site.todayKwh)}</p>
          </div>
          <div className="bg-orange-50 rounded-lg p-2 text-center">
            <p className="text-[9px] text-slate-500 uppercase tracking-wide">Month</p>
            <p className="text-sm font-bold text-orange-700">{fmtKwh(site.monthKwh)}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <div className="bg-slate-50 rounded-lg p-2 text-center">
            <p className="text-[9px] text-slate-500 uppercase tracking-wide">Year</p>
            <p className="text-sm font-bold text-slate-700">{fmtKwh(site.yearKwh)}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-2 text-center">
            <p className="text-[9px] text-slate-500 uppercase tracking-wide">Peak</p>
            <p className="text-sm font-bold text-slate-700">{site.peakPower > 0 ? `${site.peakPower} kW` : '—'}</p>
          </div>
        </div>
        {site.alerts > 0 && (
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg ${IMPACT_COLORS[site.highestImpact] || 'bg-red-50 text-red-600'}`}>
            <AlertTriangle className="w-3 h-3 flex-shrink-0" />
            <span className="text-[10px] font-medium">{site.alerts} alert{site.alerts !== 1 ? 's' : ''} · Impact {site.highestImpact}</span>
          </div>
        )}
      </div>
    </div>
  );
};

const ContractorWOWidget: React.FC<{ contractorId: string; contractors: Contractor[]; jobs: Job[]; customers: Customer[] }> = ({ contractorId, contractors, jobs, customers }) => {
  const contractor = contractors.find(c => c.id === contractorId);
  const custById   = useMemo(() => { const m = new Map<string, Customer>(); customers.forEach(c => m.set(c.id, c)); return m; }, [customers]);
  const openJobs   = useMemo(() =>
    jobs.filter(j => j.contractorId === contractorId && j.status !== 'completed' && j.status !== 'paid')
        .sort((a, b) => new Date(b.scheduledDate || b.date || 0).getTime() - new Date(a.scheduledDate || a.date || 0).getTime()),
    [jobs, contractorId]
  );

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <UserCog className="w-4 h-4 text-purple-500" />
          <div className="min-w-0"><p className="text-xs font-bold text-slate-900 truncate">{contractor?.contactName || 'Unknown Contractor'}</p></div>
        </div>
        <span className="text-[11px] text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full font-medium">{openJobs.length} open</span>
      </div>
      <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
        {openJobs.length === 0
          ? <p className="text-xs text-slate-400 text-center pt-6">No open work orders</p>
          : openJobs.slice(0, 8).map(job => {
              const cust = custById.get(job.customerId);
              return (
                <div key={job.id} className="py-1.5 px-2 rounded-lg bg-slate-50 hover:bg-white border border-transparent hover:border-slate-200 transition-all">
                  <div className="flex items-center gap-2 mb-0.5">
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      {cust?.clientId && <span className="text-[10px] font-mono text-orange-600 bg-orange-50 px-1 rounded flex-shrink-0">{cust.clientId}</span>}
                      <span className="text-xs font-semibold text-slate-800 truncate">{cust?.name || job.clientName || '—'}</span>
                    </div>
                    <span className={`flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${JOB_STATUS_COLORS[job.status] || 'bg-slate-100'}`}>{JOB_STATUS_LABEL[job.status] || job.status}</span>
                  </div>
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1 min-w-0"><MapPin className="w-3 h-3 text-slate-400 flex-shrink-0" /><span className="text-[10px] text-slate-400 truncate">{cust?.city ? `${cust.city}, ${cust.state}` : '—'}</span></div>
                    <span className="text-[10px] text-slate-400 flex-shrink-0">{fmtDate(job.scheduledDate || job.date)}</span>
                  </div>
                </div>
              );
            })
        }
      </div>
    </div>
  );
};

const DailyProductionGraphWidget: React.FC<{ customerId: string; customers: Customer[] }> = ({ customerId, customers }) => {
  const cust = customers.find(c => c.id === customerId);
  const site = cust?.solarEdgeSiteId ? FL_SITES.find(s => s.siteId === cust.solarEdgeSiteId) : null;
  const data = useMemo(() => site ? generateHourlyData(site) : [], [site?.siteId]);

  if (!cust) return <div className="h-full flex items-center justify-center"><p className="text-xs text-slate-400">Customer not found</p></div>;
  if (!site) return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-1.5 mb-2"><TrendingUp className="w-4 h-4 text-emerald-500" /><span className="text-xs font-semibold text-slate-900 truncate">{cust.name}</span></div>
      <div className="flex-1 flex items-center justify-center"><p className="text-xs text-slate-400">No SolarEdge site linked</p></div>
    </div>
  );

  const peakKw = Math.max(...data.map(d => d.kw || 0));

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-1.5 flex-shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <TrendingUp className="w-4 h-4 text-emerald-500 flex-shrink-0" />
          <div className="min-w-0">
            {cust.clientId && <p className="text-[10px] font-mono text-orange-600 leading-tight">{cust.clientId}</p>}
            <p className="text-xs font-bold text-slate-900 truncate">{cust.name}</p>
          </div>
        </div>
        <div className="text-right flex-shrink-0 ml-2">
          <p className="text-[10px] text-slate-400">Today</p>
          <p className="text-xs font-bold text-emerald-700">{fmtKwh(site.todayKwh)}</p>
        </div>
      </div>
      <div className="flex-1 min-h-0" style={{ minHeight: 80 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
            <defs>
              <linearGradient id={`grad-${site.siteId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis dataKey="hour" tick={{ fontSize: 8, fill: '#94a3b8' }} interval={5} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 8, fill: '#94a3b8' }} tickLine={false} axisLine={false} domain={[0, Math.ceil(peakKw * 1.1) || 10]} />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 11 }}
              labelStyle={{ color: '#94a3b8' }}
              itemStyle={{ color: '#34d399' }}
              formatter={(v: number | null) => v !== null ? [`${v} kW`, 'Power'] : ['—', 'Power']}
            />
            {/* @ts-expect-error recharts v2 type compat */}
            <Area type="monotone" dataKey="kw" stroke="#10b981" strokeWidth={2} fill={`url(#grad-${site.siteId})`} dot={false} connectNulls={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {site.alerts > 0 && (
        <div className="flex items-center gap-1 mt-1 flex-shrink-0">
          <AlertTriangle className="w-3 h-3 text-orange-400" />
          <span className="text-[10px] text-orange-500">{site.alerts} alerts · Impact {site.highestImpact}</span>
        </div>
      )}
    </div>
  );
};

// ── Single Lead Widget ────────────────────────────────────────────────────────

const LEAD_STATUS_LABELS: Record<string, string> = {
  new: 'New', attempting: 'Attempting', connected: 'Connected',
  appointment: 'Appt', qualified: 'Qualified', proposal: 'Proposal',
  closed_won: 'Won', closed_lost: 'Lost', not_interested: 'Not Interested',
};

const LEAD_STATUS_COLORS: Record<string, string> = {
  new:             'bg-blue-100 text-blue-700',
  attempting:      'bg-amber-100 text-amber-700',
  connected:       'bg-cyan-100 text-cyan-700',
  appointment:     'bg-violet-100 text-violet-700',
  qualified:       'bg-emerald-100 text-emerald-700',
  proposal:        'bg-orange-100 text-orange-700',
  closed_won:      'bg-green-100 text-green-700',
  closed_lost:     'bg-red-100 text-red-700',
  not_interested:  'bg-slate-100 text-slate-500',
};

const LEAD_PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-red-500', high: 'bg-orange-500', medium: 'bg-amber-400', low: 'bg-slate-400',
};

const SingleLeadWidget: React.FC<{ leadId: string }> = ({ leadId }) => {
  const [crmData, setCrmData] = useState<CRMData>(() => loadCRMData());
  const lead: Lead | undefined = crmData.leads.find(l => l.id === leadId);

  if (!lead) return (
    <div className="h-full flex items-center justify-center">
      <p className="text-xs text-slate-400">Lead not found</p>
    </div>
  );

  const leadType = lead.leadType ?? 'sales';

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-teal-100 rounded-full flex items-center justify-center flex-shrink-0">
            <User className="w-4 h-4 text-teal-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 leading-tight truncate">
              {lead.firstName} {lead.lastName}
            </p>
            <p className="text-[10px] text-slate-400 leading-tight capitalize">{leadType} lead</p>
          </div>
        </div>
        <span className={`flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${LEAD_STATUS_COLORS[lead.status] ?? 'bg-slate-100 text-slate-500'}`}>
          {LEAD_STATUS_LABELS[lead.status] ?? lead.status}
        </span>
      </div>

      {/* Priority + source */}
      <div className="flex items-center gap-2 mb-3 flex-shrink-0">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${LEAD_PRIORITY_DOT[lead.priority] ?? 'bg-slate-400'}`} />
        <span className="text-[10px] text-slate-500 capitalize">{lead.priority}</span>
        <span className="text-[10px] text-slate-300">·</span>
        <span className="text-[10px] text-slate-500 capitalize">{lead.source?.replace(/_/g, ' ')}</span>
      </div>

      {/* Contact info */}
      <div className="space-y-1.5 flex-1">
        {lead.phone && (
          <a
            href={`tel:${lead.phone}`}
            className="flex items-center gap-2 px-2.5 py-2 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors group"
          >
            <Phone className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
            <span className="text-xs text-blue-700 font-medium">{lead.phone}</span>
          </a>
        )}
        {lead.email && (
          <a
            href={`mailto:${lead.email}`}
            className="flex items-center gap-2 px-2.5 py-2 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <Mail className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <span className="text-xs text-slate-600 truncate">{lead.email}</span>
          </a>
        )}
        {(lead.city || lead.state) && (
          <div className="flex items-center gap-2 px-2.5 py-1.5">
            <MapPin className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
            <span className="text-xs text-slate-500">{[lead.city, lead.state].filter(Boolean).join(', ')}</span>
          </div>
        )}
        {lead.notes && (
          <div className="px-2.5 py-2 bg-amber-50 rounded-lg border-l-2 border-amber-300">
            <p className="text-[10px] text-amber-700 line-clamp-3 whitespace-pre-wrap">{lead.notes}</p>
          </div>
        )}
      </div>

      {/* Footer: created date */}
      <div className="flex-shrink-0 pt-2 border-t border-slate-100 mt-2">
        <p className="text-[10px] text-slate-400">
          Added {new Date(lead.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </p>
      </div>
    </div>
  );
};

// ── Add Widget Modal ──────────────────────────────────────────────────────────

const AddWidgetModal: React.FC<{
  customers: Customer[];
  jobs: Job[];
  contractors: Contractor[];
  leads: Lead[];
  placedSingletonTypes: Set<WidgetType>;
  onAdd: (config: WidgetConfig) => void;
  onClose: () => void;
}> = ({ customers, jobs, contractors, leads, placedSingletonTypes, onAdd, onClose }) => {
  const [step, setStep]           = useState<'type' | 'configure'>('type');
  const [selectedType, setType]   = useState<WidgetCatalogEntry | null>(null);
  const [search, setSearch]       = useState('');
  const [selection, setSelection] = useState<string>('');

  const catalog = selectedType;

  const filteredCustomers = useMemo(() =>
    customers.filter(c =>
      !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.clientId || '').toLowerCase().includes(search.toLowerCase())
    ).slice(0, 30),
    [customers, search]
  );
  const filteredContractors = useMemo(() =>
    contractors.filter(c =>
      !search || c.contactName.toLowerCase().includes(search.toLowerCase())
    ),
    [contractors, search]
  );
  const filteredJobs = useMemo(() =>
    jobs.filter(j =>
      !search ||
      (j.woNumber || '').toLowerCase().includes(search.toLowerCase()) ||
      (j.clientName || '').toLowerCase().includes(search.toLowerCase()) ||
      (j.title || '').toLowerCase().includes(search.toLowerCase())
    ).slice(0, 30),
    [jobs, search]
  );

  const filteredLeads = useMemo(() =>
    leads.filter(l =>
      !search ||
      `${l.firstName} ${l.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
      l.phone.includes(search) ||
      l.email.toLowerCase().includes(search.toLowerCase())
    ).slice(0, 30),
    [leads, search]
  );

  const handleTypeSelect = (entry: WidgetCatalogEntry) => {
    if (!entry.requires) {
      onAdd({ type: entry.type });
      return;
    }
    setType(entry);
    setSearch('');
    setSelection('');
    setStep('configure');
  };

  const handleConfirm = () => {
    if (!catalog || !selection) return;
    const config: WidgetConfig = { type: catalog.type };
    if (catalog.requires === 'customer')   config.customerId    = selection;
    if (catalog.requires === 'contractor') config.contractorId  = selection;
    if (catalog.requires === 'job')        config.jobId         = selection;
    if (catalog.requires === 'lead')       config.leadId        = selection;
    onAdd(config);
  };

  const custMap    = useMemo(() => { const m = new Map<string, Customer>(); customers.forEach(c => m.set(c.id, c)); return m; }, [customers]);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[80] p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          {step === 'configure' && catalog ? (
            <button onClick={() => setStep('type')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 cursor-pointer">
              <ChevronRight className="w-4 h-4 rotate-180" />
              Back
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-slate-900 flex items-center justify-center"><Crosshair className="w-3.5 h-3.5 text-orange-400" /></div>
              <h2 className="text-base font-bold text-slate-900">Add Widget</h2>
            </div>
          )}
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg cursor-pointer"><X className="w-4 h-4 text-slate-400" /></button>
        </div>

        <div className="p-5">
          {/* ── Step 1: Pick type ── */}
          {step === 'type' && (
            <div className="grid grid-cols-2 gap-2">
              {WIDGET_CATALOG.map(entry => {
                const Icon = entry.icon;
                const alreadyPlaced = !entry.requires && placedSingletonTypes.has(entry.type);
                return (
                  <button
                    key={entry.type}
                    onClick={() => !alreadyPlaced && handleTypeSelect(entry)}
                    disabled={alreadyPlaced}
                    className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                      alreadyPlaced
                        ? 'border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed'
                        : 'border-slate-200 hover:border-orange-300 hover:bg-orange-50/30 cursor-pointer group'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg ${entry.bgClass} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                      <Icon className={`w-4 h-4 ${entry.colorClass}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 leading-tight">{entry.label}</p>
                      <p className="text-xs text-slate-400 mt-0.5 leading-snug">{entry.description}</p>
                      {alreadyPlaced
                        ? <p className="text-[10px] text-slate-400 mt-0.5 font-medium">✓ Already on board</p>
                        : entry.requires && <p className="text-[10px] text-orange-500 mt-0.5 font-medium">Select {entry.requires} →</p>
                      }
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Step 2: Configure (pick customer / contractor / job) ── */}
          {step === 'configure' && catalog && (
            <div className="space-y-4">
              <div>
                {catalog.requires === 'customer'    && <p className="text-sm font-semibold text-slate-700 mb-3">Select Customer</p>}
                {catalog.requires === 'contractor'  && <p className="text-sm font-semibold text-slate-700 mb-3">Select Contractor</p>}
                {catalog.requires === 'job'         && <p className="text-sm font-semibold text-slate-700 mb-3">Select Work Order</p>}
                {catalog.requires === 'lead'        && <p className="text-sm font-semibold text-slate-700 mb-3">Select Lead</p>}
                {/* Search */}
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    autoFocus
                    type="text"
                    placeholder={catalog.requires === 'job' ? 'Search WO number, client…' : `Search ${catalog.requires}…`}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-orange-300"
                  />
                </div>
                {/* List */}
                <div className="space-y-1 max-h-56 overflow-y-auto">
                  {catalog.requires === 'customer' && filteredCustomers.map(c => (
                    <button key={c.id} onClick={() => setSelection(c.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer ${selection === c.id ? 'bg-orange-500 text-white' : 'hover:bg-slate-50 border border-transparent hover:border-slate-200'}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {c.clientId && <span className={`text-[10px] font-mono ${selection === c.id ? 'text-orange-100' : 'text-orange-600'}`}>{c.clientId}</span>}
                          <span className={`text-sm font-medium truncate ${selection === c.id ? 'text-white' : 'text-slate-800'}`}>{c.name}</span>
                        </div>
                        <p className={`text-xs ${selection === c.id ? 'text-orange-100' : 'text-slate-400'} truncate`}>{c.city}, {c.state}{c.solarEdgeSiteId ? ' · SolarEdge ✓' : ''}</p>
                      </div>
                      {selection === c.id && <Check className="w-4 h-4 text-white flex-shrink-0" />}
                    </button>
                  ))}
                  {catalog.requires === 'contractor' && (
                    filteredContractors.length === 0
                      ? <p className="text-xs text-slate-400 text-center py-4">No contractors found</p>
                      : filteredContractors.map(c => (
                          <button key={c.id} onClick={() => setSelection(c.id)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer ${selection === c.id ? 'bg-orange-500 text-white' : 'hover:bg-slate-50 border border-transparent hover:border-slate-200'}`}>
                            <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0"><User className="w-4 h-4 text-purple-600" /></div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium ${selection === c.id ? 'text-white' : 'text-slate-800'}`}>{c.contactName}</p>
                              <p className={`text-xs truncate ${selection === c.id ? 'text-orange-100' : 'text-slate-400'}`}>{c.email}</p>
                            </div>
                            {selection === c.id && <Check className="w-4 h-4 text-white flex-shrink-0" />}
                          </button>
                        ))
                  )}
                  {catalog.requires === 'job' && (
                    filteredJobs.length === 0
                      ? <p className="text-xs text-slate-400 text-center py-4">No work orders found</p>
                      : filteredJobs.map(job => {
                          const cust = custMap.get(job.customerId);
                          return (
                            <button key={job.id} onClick={() => setSelection(job.id)}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer ${selection === job.id ? 'bg-orange-500 text-white' : 'hover:bg-slate-50 border border-transparent hover:border-slate-200'}`}>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {job.woNumber && <span className={`text-[10px] font-mono ${selection === job.id ? 'text-orange-100' : 'text-slate-400'}`}>{job.woNumber}</span>}
                                  {cust?.clientId && <span className={`text-[10px] font-mono ${selection === job.id ? 'text-orange-100' : 'text-orange-600'}`}>{cust.clientId}</span>}
                                </div>
                                <p className={`text-sm font-medium truncate ${selection === job.id ? 'text-white' : 'text-slate-800'}`}>{cust?.name || job.clientName || 'Unknown'}</p>
                                <p className={`text-xs ${selection === job.id ? 'text-orange-100' : 'text-slate-400'}`}>{JOB_STATUS_LABEL[job.status] || job.status} · {fmtDate(job.scheduledDate || job.date)}</p>
                              </div>
                              {selection === job.id && <Check className="w-4 h-4 text-white flex-shrink-0" />}
                            </button>
                          );
                        })
                  )}
                  {catalog.requires === 'lead' && (
                    filteredLeads.length === 0
                      ? <p className="text-xs text-slate-400 text-center py-4">No leads found</p>
                      : filteredLeads.map(lead => (
                          <button key={lead.id} onClick={() => setSelection(lead.id)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer ${selection === lead.id ? 'bg-orange-500 text-white' : 'hover:bg-slate-50 border border-transparent hover:border-slate-200'}`}>
                            <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
                              <User className="w-4 h-4 text-teal-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium truncate ${selection === lead.id ? 'text-white' : 'text-slate-800'}`}>
                                {lead.firstName} {lead.lastName}
                              </p>
                              <p className={`text-xs ${selection === lead.id ? 'text-orange-100' : 'text-slate-400'}`}>
                                {lead.phone} · {(lead.leadType ?? 'sales')} · {LEAD_STATUS_LABELS[lead.status] ?? lead.status}
                              </p>
                            </div>
                            {selection === lead.id && <Check className="w-4 h-4 text-white flex-shrink-0" />}
                          </button>
                        ))
                  )}
                </div>
              </div>
              <div>
                <button
                  disabled={!selection}
                  onClick={handleConfirm}
                  className={`w-full py-2.5 rounded-xl font-semibold text-sm transition-all ${selection ? 'bg-orange-500 hover:bg-orange-600 text-white cursor-pointer shadow-sm' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                >
                  Add Widget
                </button>
                {!selection && (
                  <p className="text-center text-xs text-slate-400 mt-2">
                    ↑ Select a {catalog?.requires} above to continue
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Lead Pipeline Widget ──────────────────────────────────────────────────────

const ACTIVE_STAGES = ['new', 'attempting', 'connected', 'appointment', 'qualified', 'proposal'] as const;
const STAGE_LABELS: Record<string, string> = {
  new: 'New', attempting: 'Attempting', connected: 'Connected',
  appointment: 'Appt', qualified: 'Qualified', proposal: 'Proposal',
};

const LeadPipelineWidget: React.FC = () => {
  const [crmData, setCrmData] = useState<CRMData>(() => loadCRMData());
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [form, setForm] = useState({ firstName: '', phone: '', leadType: 'sales' as 'service' | 'sales', source: 'other' as LeadSource });

  const activeLeads = useMemo(() => crmData.leads.filter(l => ACTIVE_STAGES.includes(l.status as any)), [crmData.leads]);

  const stageCounts = useMemo(() =>
    ACTIVE_STAGES.reduce((acc, s) => ({ ...acc, [s]: activeLeads.filter(l => l.status === s).length }), {} as Record<string, number>),
    [activeLeads]
  );

  const totalActive = activeLeads.length;
  const maxCount = Math.max(...Object.values(stageCounts), 1);

  const closePotential = useMemo(() =>
    activeLeads.reduce((sum, l) => sum + (l.monthlyBill ?? 0) * 240, 0),
    [activeLeads]
  );

  const handleAdd = () => {
    if (!form.firstName || !form.phone) return;
    const updated = addLead(crmData, {
      firstName: form.firstName, lastName: '', email: '', phone: form.phone,
      address: '', city: '', state: 'FL', zip: '',
      status: 'new', source: form.source, priority: 'medium', notes: '',
      leadType: form.leadType, homeowner: false,
    });
    setCrmData(updated);
    saveCRMData(updated);
    setForm({ firstName: '', phone: '', leadType: 'sales', source: 'other' });
    setShowQuickAdd(false);
  };

  return (
    <div className="h-full flex flex-col min-h-0 text-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <Inbox className="w-4 h-4 text-violet-400" />
          <span className="text-xs font-bold text-slate-900">Lead Pipeline</span>
        </div>
        <span className="text-[11px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">{totalActive} active</span>
      </div>

      {/* Close potential */}
      <div className="bg-emerald-50 rounded-lg px-3 py-2 mb-2 flex-shrink-0">
        <p className="text-[10px] text-emerald-600 font-medium">Close Potential</p>
        <p className="text-base font-bold text-emerald-700">${closePotential.toLocaleString()}</p>
      </div>

      {/* Funnel bars */}
      <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0">
        {ACTIVE_STAGES.map(stage => {
          const count = stageCounts[stage] ?? 0;
          const pct = Math.round((count / maxCount) * 100);
          return (
            <div key={stage} className="flex items-center gap-2">
              <span className="text-[10px] text-slate-500 w-16 flex-shrink-0">{STAGE_LABELS[stage]}</span>
              <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
                <div
                  className="h-full bg-violet-400 rounded-full transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-[10px] font-semibold text-slate-700 w-4 text-right flex-shrink-0">{count}</span>
            </div>
          );
        })}
      </div>

      {/* Quick Add toggle */}
      <div className="flex-shrink-0 mt-2">
        {!showQuickAdd ? (
          <button
            onClick={() => setShowQuickAdd(true)}
            className="w-full flex items-center justify-center gap-1 py-1.5 bg-violet-50 text-violet-700 rounded-lg text-xs font-medium hover:bg-violet-100 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Quick Add Lead
          </button>
        ) : (
          <div className="space-y-1.5 border-t border-slate-100 pt-2">
            <input
              placeholder="First name*"
              value={form.firstName}
              onChange={e => setForm(p => ({ ...p, firstName: e.target.value }))}
              className="w-full px-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-400 text-slate-900"
            />
            <input
              placeholder="Phone*"
              value={form.phone}
              onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
              className="w-full px-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-400 text-slate-900"
            />
            <div className="flex gap-1">
              <select
                value={form.leadType}
                onChange={e => setForm(p => ({ ...p, leadType: e.target.value as 'service' | 'sales' }))}
                className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none"
              >
                <option value="sales">Sales</option>
                <option value="service">Service</option>
              </select>
              <select
                value={form.source}
                onChange={e => setForm(p => ({ ...p, source: e.target.value as LeadSource }))}
                className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none"
              >
                <option value="google_forms">Google Forms</option>
                <option value="website">Website</option>
                <option value="referral">Referral</option>
                <option value="cold_call">Cold Call</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="flex gap-1">
              <button
                onClick={handleAdd}
                disabled={!form.firstName || !form.phone}
                className="flex-1 py-1 bg-violet-500 text-white text-xs font-medium rounded-lg hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Add
              </button>
              <button
                onClick={() => setShowQuickAdd(false)}
                className="flex-1 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ── To-Do List Widget ─────────────────────────────────────────────────────────

const TodoListWidget: React.FC<{ userId: string }> = ({ userId }) => {
  const [todos, setTodos] = useState<TodoItem[]>(() => loadTodos(userId));
  const [taskInput, setTaskInput] = useState('');
  const [dueDateInput, setDueDateInput] = useState('');
  const [showForm, setShowForm] = useState(false);

  const persist = (updated: TodoItem[]) => {
    setTodos(updated);
    saveTodos(userId, updated);
  };

  const handleAdd = () => {
    if (!taskInput.trim()) return;
    const newItem: TodoItem = {
      id: `todo-${Date.now()}`,
      task: taskInput.trim(),
      dueDate: dueDateInput,
      done: false,
      createdAt: new Date().toISOString(),
    };
    persist([newItem, ...todos]);
    setTaskInput('');
    setDueDateInput('');
    setShowForm(false);
  };

  const handleToggle = (id: string) => {
    persist(todos.map(t => t.id === id ? { ...t, done: !t.done } : t));
  };

  const handleDelete = (id: string) => {
    persist(todos.filter(t => t.id !== id));
  };

  const sorted = [
    ...todos.filter(t => !t.done).sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    }),
    ...todos.filter(t => t.done),
  ];

  const today = new Date().toISOString().slice(0, 10);
  const overdue = (t: TodoItem) => !t.done && t.dueDate && t.dueDate < today;
  const dueToday = (t: TodoItem) => !t.done && t.dueDate === today;

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <CheckSquare className="w-4 h-4 text-indigo-500" />
          <span className="text-sm font-semibold text-slate-900">My To-Do</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
            {todos.filter(t => !t.done).length} open
          </span>
          <button
            onClick={() => setShowForm(v => !v)}
            className="w-6 h-6 rounded-full bg-indigo-500 hover:bg-indigo-600 flex items-center justify-center transition-colors"
            title="Add task"
          >
            <Plus className="w-3.5 h-3.5 text-white" />
          </button>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="mb-3 p-2.5 bg-indigo-50 rounded-xl border border-indigo-100 flex-shrink-0 space-y-2">
          <input
            autoFocus
            placeholder="Task description*"
            value={taskInput}
            onChange={e => setTaskInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white text-slate-900"
          />
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 flex-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <input
                type="date"
                value={dueDateInput}
                onChange={e => setDueDateInput(e.target.value)}
                className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white text-slate-700"
              />
            </div>
            <button
              onClick={handleAdd}
              disabled={!taskInput.trim()}
              className="px-3 py-1 bg-indigo-500 text-white text-xs font-medium rounded-lg hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Add
            </button>
            <button
              onClick={() => { setShowForm(false); setTaskInput(''); setDueDateInput(''); }}
              className="px-2 py-1 bg-white text-slate-500 text-xs rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Task list */}
      <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
        {sorted.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-center py-4">
            <CheckSquare className="w-8 h-8 text-slate-200" />
            <p className="text-xs text-slate-400">No tasks yet</p>
            <button
              onClick={() => setShowForm(true)}
              className="text-xs text-indigo-500 hover:text-indigo-600 font-medium"
            >
              + Add your first task
            </button>
          </div>
        ) : sorted.map(todo => (
          <div
            key={todo.id}
            className={`flex items-start gap-2 px-2.5 py-2 rounded-lg transition-colors group ${
              todo.done ? 'bg-slate-50 opacity-60' : overdue(todo) ? 'bg-red-50 border border-red-100' : dueToday(todo) ? 'bg-amber-50 border border-amber-100' : 'bg-white border border-slate-100 hover:border-slate-200'
            }`}
          >
            {/* Checkbox */}
            <button
              onClick={() => handleToggle(todo.id)}
              className={`mt-0.5 w-4 h-4 rounded flex-shrink-0 border-2 flex items-center justify-center transition-colors ${
                todo.done ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 hover:border-indigo-400'
              }`}
            >
              {todo.done && <Check className="w-2.5 h-2.5 text-white" />}
            </button>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className={`text-xs leading-snug ${todo.done ? 'line-through text-slate-400' : 'text-slate-800 font-medium'}`}>
                {todo.task}
              </p>
              {todo.dueDate && (
                <div className="flex items-center gap-1 mt-0.5">
                  <Clock className="w-2.5 h-2.5 flex-shrink-0" style={{ color: overdue(todo) ? '#ef4444' : dueToday(todo) ? '#f59e0b' : '#94a3b8' }} />
                  <span className={`text-[10px] font-medium ${overdue(todo) ? 'text-red-500' : dueToday(todo) ? 'text-amber-600' : 'text-slate-400'}`}>
                    {overdue(todo) ? 'Overdue · ' : dueToday(todo) ? 'Due today · ' : ''}
                    {new Date(todo.dueDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              )}
            </div>

            {/* Delete */}
            <button
              onClick={() => handleDelete(todo.id)}
              className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-slate-300 hover:text-red-400"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Per-widget Error Boundary ─────────────────────────────────────────────────

class WidgetErrorBoundary extends React.Component<
  { children: React.ReactNode; onRemove: () => void },
  { hasError: boolean }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full flex flex-col items-center justify-center gap-3 text-center p-4">
          <AlertTriangle className="w-8 h-8 text-red-400" />
          <p className="text-xs font-semibold text-slate-700">Widget failed to load</p>
          <button
            onClick={this.props.onRemove}
            className="px-3 py-1.5 bg-red-100 text-red-600 text-xs font-medium rounded-lg hover:bg-red-200 transition-colors"
          >
            Remove widget
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Widget Slot ───────────────────────────────────────────────────────────────

const WidgetSlot: React.FC<{
  config: WidgetConfig | null;
  index: number;
  customers: Customer[];
  jobs: Job[];
  contractors: Contractor[];
  onOpenAdd: (index: number) => void;
  onRemove: (index: number) => void;
  editMode: boolean;
  currentUserId: string;
  isDragOver: boolean;
  onDragStart: (index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDragLeave: () => void;
  onDrop: (index: number) => void;
}> = ({ config, index, customers, jobs, contractors, onOpenAdd, onRemove, editMode, currentUserId, isDragOver, onDragStart, onDragOver, onDragLeave, onDrop }) => {
  if (!config) {
    return (
      <div
        className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed min-h-[200px] transition-all cursor-pointer group ${
          isDragOver
            ? 'border-orange-400 bg-orange-950/30 scale-[1.02]'
            : 'border-slate-700 bg-slate-900/40 hover:border-orange-500/50 hover:bg-orange-950/20'
        }`}
        onClick={() => onOpenAdd(index)}
        onDragOver={e => onDragOver(e, index)}
        onDragLeave={onDragLeave}
        onDrop={() => onDrop(index)}
      >
        {isDragOver ? (
          <p className="text-xs text-orange-400 font-medium">Drop here</p>
        ) : (
          <>
            <Plus className="w-6 h-6 text-slate-600 group-hover:text-orange-400 transition-colors" />
            <p className="text-xs text-slate-600 group-hover:text-orange-400 mt-1 transition-colors">Add Widget</p>
          </>
        )}
      </div>
    );
  }

  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={e => onDragOver(e, index)}
      onDragLeave={onDragLeave}
      onDrop={() => onDrop(index)}
      className={`relative flex flex-col rounded-xl border bg-white shadow-sm p-4 min-h-[200px] group transition-all ${
        isDragOver
          ? 'border-orange-400 ring-2 ring-orange-300 scale-[1.02] shadow-lg'
          : 'border-slate-200 cursor-grab active:cursor-grabbing'
      }`}
    >
      {/* Drag handle — always visible at top-left */}
      <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing z-10">
        <GripVertical className="w-4 h-4 text-slate-300" />
      </div>

      {/* Delete button — always visible on hover, no edit mode required */}
      <button
        onClick={e => { e.stopPropagation(); onRemove(index); }}
        title="Remove widget"
        className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white border border-slate-200 hover:bg-red-500 hover:border-red-500 flex items-center justify-center transition-all z-10 cursor-pointer opacity-0 group-hover:opacity-100 shadow-sm"
      >
        <X className="w-3 h-3 text-slate-400 group-hover:text-white" style={{ color: 'inherit' }} />
      </button>

      <WidgetErrorBoundary onRemove={() => onRemove(index)}>
        {config.type === 'alert-state'            && <AlertStateWidget customers={customers} />}
        {config.type === 'current-production'     && <FleetProductionWidget />}
        {config.type === 'work-order'             && <AllWorkOrdersWidget jobs={jobs} customers={customers} />}
        {config.type === 'single-wo'              && config.jobId        && <SingleWOWidget jobId={config.jobId} jobs={jobs} customers={customers} />}
        {config.type === 'customer-production'    && config.customerId   && <CustomerProductionWidget customerId={config.customerId} customers={customers} />}
        {config.type === 'contractor-wo'          && config.contractorId && <ContractorWOWidget contractorId={config.contractorId} contractors={contractors} jobs={jobs} customers={customers} />}
        {config.type === 'daily-production-graph' && config.customerId   && <DailyProductionGraphWidget customerId={config.customerId} customers={customers} />}
        {config.type === 'lead-pipeline'          && <LeadPipelineWidget />}
        {config.type === 'single-lead'            && config.leadId       && <SingleLeadWidget leadId={config.leadId} />}
        {config.type === 'todo-list'              && <TodoListWidget userId={currentUserId} />}
      </WidgetErrorBoundary>
    </div>
  );
};

// ── Main ──────────────────────────────────────────────────────────────────────

export const DispatchDashboard: React.FC<DispatchDashboardProps> = ({ customers, jobs, contractors, isMobile, currentUserId }) => {
  const [layout,       setLayout]      = useState<(WidgetConfig | null)[]>(loadLayout);
  const [editMode,     setEditMode]    = useState(false);
  const [addSlot,      setAddSlot]     = useState<number | null>(null);
  const [crmLeads]                     = useState<Lead[]>(() => loadCRMData().leads.filter(l => l.status !== 'closed_won'));
  const [confirmReset, setConfirmReset] = useState(false);
  const [dragOverIdx,  setDragOverIdx] = useState<number | null>(null);
  const dragFromIdx = useRef<number | null>(null);

  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const alertCount = FL_SITES.filter(s => s.alerts > 0).length;
  const openJobs   = jobs.filter(j => j.status !== 'paid' && j.status !== 'completed').length;

  const handleAdd = useCallback((index: number) => {
    setAddSlot(index);
  }, []);

  const handleWidgetAdd = useCallback((config: WidgetConfig) => {
    if (addSlot === null) return;
    setLayout(prev => {
      const next = [...prev];
      next[addSlot] = config;
      saveLayout(next);
      return next;
    });
    setAddSlot(null);
  }, [addSlot]);

  const handleRemove = useCallback((index: number) => {
    setLayout(prev => {
      const next = [...prev];
      next[index] = null;
      saveLayout(next);
      return next;
    });
  }, []);

  const handleReset = () => {
    const fresh = defaultLayout();
    setLayout(fresh);
    saveLayout(fresh);
    setConfirmReset(false);
  };

  const handleDragStart = useCallback((index: number) => {
    dragFromIdx.current = index;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIdx(index);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverIdx(null);
  }, []);

  const handleDrop = useCallback((toIndex: number) => {
    const fromIndex = dragFromIdx.current;
    setDragOverIdx(null);
    dragFromIdx.current = null;
    if (fromIndex === null || fromIndex === toIndex) return;
    setLayout(prev => {
      const next = [...prev];
      [next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]];
      saveLayout(next);
      return next;
    });
  }, []);

  // Track which singleton widget types are already on the board
  const placedSingletonTypes = useMemo(() => {
    const singletons = new Set(
      WIDGET_CATALOG.filter(e => !e.requires).map(e => e.type)
    );
    return new Set(
      layout
        .filter((c): c is WidgetConfig => c !== null && singletons.has(c.type))
        .map(c => c.type)
    );
  }, [layout]);

  const cols = isMobile ? 2 : 4;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Add Widget Modal */}
      {addSlot !== null && (
        <AddWidgetModal
          customers={customers}
          jobs={jobs}
          contractors={contractors}
          leads={crmLeads}
          placedSingletonTypes={placedSingletonTypes}
          onAdd={handleWidgetAdd}
          onClose={() => setAddSlot(null)}
        />
      )}

      {/* Top bar */}
      <div className="border-b border-slate-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center">
              <Crosshair className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-wide text-white">Ops Center</h1>
              <p className="text-xs text-slate-400">{dateStr}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2">
              {alertCount > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-950 border border-red-800">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                  <span className="text-xs font-semibold text-red-300">{alertCount} Alert Sites</span>
                </div>
              )}
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700">
                <Wrench className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs font-semibold text-slate-300">{openJobs} Open WOs</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-950 border border-amber-800">
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs font-semibold text-amber-300">{FL_SITES.length} Sites</span>
              </div>
            </div>
            <p className="text-xl font-mono font-bold text-white hidden md:block">{timeStr}</p>
            <button
              onClick={() => setEditMode(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${editMode ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              {editMode ? 'Done' : 'Edit Layout'}
            </button>
          </div>
        </div>
      </div>

      {/* Edit mode banner */}
      {editMode && (
        <div className="flex items-center justify-between px-6 py-2.5 bg-orange-500/10 border-b border-orange-500/20">
          <p className="text-xs text-orange-300">Click <strong>+</strong> to add a widget · Drag to move · Hover a widget to delete it</p>
          {confirmReset ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-orange-200">Reset all widgets to defaults?</span>
              <button onClick={handleReset} className="px-2.5 py-1 bg-red-500 hover:bg-red-600 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer">Yes, reset</button>
              <button onClick={() => setConfirmReset(false)} className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-medium rounded-lg transition-colors cursor-pointer">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setConfirmReset(true)} className="text-xs text-orange-400 hover:text-orange-300 underline cursor-pointer">Reset to defaults</button>
          )}
        </div>
      )}

      {/* 4 × 3 Grid */}
      <div className="p-6">
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {layout.map((config, i) => (
            <WidgetSlot
              key={i}
              config={config}
              index={i}
              customers={customers}
              jobs={jobs}
              contractors={contractors}
              onOpenAdd={handleAdd}
              onRemove={handleRemove}
              editMode={editMode}
              currentUserId={currentUserId}
              isDragOver={dragOverIdx === i}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
