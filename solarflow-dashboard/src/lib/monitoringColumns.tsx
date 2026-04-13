// Column registry for SolarEdge Monitoring table
// Each column is defined with its render logic, making the table fully dynamic
import React from 'react';
import {
  AlertTriangle, FileText, MessageSquare, ExternalLink,
  TrendingUp, TrendingDown, Trash2,
} from 'lucide-react';
import type { SolarEdgeSite } from './solarEdgeSites';
import type { Job, Customer } from '../types';
import type { SiteClientStatus } from './siteProfileStore';
import { CLIENT_STATUS_CONFIG } from './siteProfileStore';

// ── Context passed to every cell renderer ────────────────────────────────────
export interface CellCtx {
  site: SolarEdgeSite;
  siteJobs: Job[];
  isExpanded: boolean;
  profileMeta: Record<string, { noteCount: number; hasDesc: boolean; clientStatus?: string }>;
  customerBySiteId: {
    bySiteId: Map<string, Customer>;
    byClientId: Map<string, Customer>;
  };
  onViewCustomer?: (id: string) => void;
  onViewChange: (view: string) => void;
  onToggleExpand: () => void;
  onOpenPanel: () => void;
  isAdmin: boolean;
  confirmRemove: string | null;
  onConfirmRemove: (siteId: string) => void;
  onCancelRemove: () => void;
  onRemove: (siteId: string) => void;
}

// ── Column definition ────────────────────────────────────────────────────────
export interface MonitoringColumnDef {
  id: string;
  label: string;
  /** SolarEdgeSite field used for sorting; null = not sortable */
  sortKey: keyof SolarEdgeSite | null;
  defaultVisible: boolean;
  defaultOrder: number;
  align?: 'left' | 'right' | 'center';
  adminOnly?: boolean;
  /** Render the cell content (not the <td> wrapper) */
  render: (ctx: CellCtx) => React.ReactNode;
  /** Optional max-width class for the <td> */
  maxWidth?: string;
}

// ── Helper sub-components (kept tiny, no state) ──────────────────────────────
const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const colors: Record<string, string> = {
    Active: 'bg-emerald-100 text-emerald-700',
    Pending: 'bg-amber-100 text-amber-700',
    PendingCommunication: 'bg-orange-100 text-orange-700',
    Error: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  );
};

const EnergyCell: React.FC<{ value: number }> = ({ value }) => {
  if (!value) return <span className="text-slate-300">—</span>;
  const display = value >= 1000 ? `${(value / 1000).toFixed(1)} MWh` : `${value.toFixed(1)} kWh`;
  return <span className="font-mono text-xs text-slate-700">{display}</span>;
};

const AlertBadge: React.FC<{ alerts: number; impact: string }> = ({ alerts, impact }) => {
  if (alerts === 0) return <span className="text-slate-400 text-xs">—</span>;
  const colors: Record<string, string> = {
    '0': 'bg-slate-100 text-slate-500', '1': 'bg-blue-100 text-blue-600',
    '2': 'bg-yellow-100 text-yellow-700', '3': 'bg-orange-100 text-orange-700',
    '4': 'bg-red-100 text-red-700', '5': 'bg-red-200 text-red-800', '6': 'bg-red-300 text-red-900',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colors[impact] || 'bg-red-100 text-red-700'}`}>
      <AlertTriangle className="w-3 h-3" />
      {alerts}
    </span>
  );
};

const jobProfit = (job: Job): number => {
  const revenue = job.totalAmount || 0;
  const laborRate = job.contractorPayRate ?? job.laborRate;
  const laborCost = job.laborHours * laborRate;
  const partsCost = job.partsCost || 0;
  const seComp = job.seCompensationClaimed ? (job.seCompensationAmount || 0) : 0;
  return revenue - laborCost - partsCost + seComp;
};

// ── The registry ─────────────────────────────────────────────────────────────
export const COLUMN_REGISTRY: MonitoringColumnDef[] = [
  {
    id: 'clientStatus',
    label: 'Client Status',
    sortKey: null,
    defaultVisible: true,
    defaultOrder: 0,
    render: ({ site, profileMeta }) => {
      const cs = profileMeta[site.siteId]?.clientStatus;
      if (!cs) return <span className="text-slate-300 text-xs">—</span>;
      const cfg = CLIENT_STATUS_CONFIG[cs as SiteClientStatus];
      if (cfg) return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
          {cfg.critical && <AlertTriangle className="w-3 h-3" />}
          {cfg.label}
        </span>
      );
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-300">
          {cs}
        </span>
      );
    },
  },
  {
    id: 'clientId',
    label: 'Client ID',
    sortKey: 'clientId',
    defaultVisible: true,
    defaultOrder: 1,
    render: ({ site }) =>
      site.clientId
        ? <span className="font-mono text-xs font-semibold text-orange-600 bg-orange-50 px-2 py-0.5 rounded">{site.clientId}</span>
        : <span className="text-slate-300 text-xs">—</span>,
  },
  {
    id: 'siteName',
    label: 'Site Name',
    sortKey: 'siteName',
    defaultVisible: true,
    defaultOrder: 2,
    maxWidth: 'max-w-[180px]',
    render: ({ site, customerBySiteId, onViewCustomer }) => {
      const customer = customerBySiteId.bySiteId.get(site.siteId)
        ?? customerBySiteId.byClientId.get(site.clientId);
      if (customer && onViewCustomer) {
        return (
          <button
            onClick={() => onViewCustomer(customer.id)}
            className="text-orange-600 font-medium truncate block hover:underline text-left w-full"
            title={`Open customer: ${site.siteName}`}
          >
            {site.siteName || '—'}
          </button>
        );
      }
      return (
        <span className="text-slate-800 font-medium truncate block" title={site.siteName}>
          {site.siteName || '—'}
        </span>
      );
    },
  },
  {
    id: 'address',
    label: 'Address',
    sortKey: 'address',
    defaultVisible: true,
    defaultOrder: 3,
    maxWidth: 'max-w-[200px]',
    render: ({ site }) => (
      <span className="text-slate-500 text-xs truncate block" title={site.address}>
        {site.address || '—'}
      </span>
    ),
  },
  {
    id: 'group',
    label: 'Group',
    sortKey: null,
    defaultVisible: false,
    defaultOrder: 4,
    render: ({ site }) => {
      const upper = site.address.toUpperCase();
      let group = 'Other';
      if (/\bFL\b/.test(upper)) group = 'Conexsol Florida';
      else if (/\bPR\b/.test(upper)) group = 'Puerto Rico';
      else if (/\bAZ\b/.test(upper)) group = 'Arizona';
      else if (/\bTX\b/.test(upper)) group = 'Texas';
      return <span className="text-xs text-slate-600">{group}</span>;
    },
  },
  {
    id: 'status',
    label: 'Status',
    sortKey: 'status',
    defaultVisible: true,
    defaultOrder: 5,
    render: ({ site }) => <StatusBadge status={site.status} />,
  },
  {
    id: 'peakPower',
    label: 'Peak Power (kW)',
    sortKey: 'peakPower',
    defaultVisible: false,
    defaultOrder: 6,
    align: 'right',
    render: ({ site }) =>
      site.peakPower
        ? <span className="font-mono text-xs text-slate-700">{site.peakPower.toFixed(1)}</span>
        : <span className="text-slate-300 text-xs">—</span>,
  },
  {
    id: 'installDate',
    label: 'Install Date',
    sortKey: 'installDate',
    defaultVisible: true,
    defaultOrder: 7,
    render: ({ site }) => (
      <span className="text-xs text-slate-600 font-mono">{site.installDate || '—'}</span>
    ),
  },
  {
    id: 'ptoDate',
    label: 'PTO Date',
    sortKey: 'ptoDate',
    defaultVisible: true,
    defaultOrder: 8,
    render: ({ site }) => (
      <span className="text-xs text-slate-500 font-mono">{site.ptoDate || <span className="text-slate-300">—</span>}</span>
    ),
  },
  {
    id: 'alerts',
    label: 'Alerts',
    sortKey: 'alerts',
    defaultVisible: true,
    defaultOrder: 9,
    render: ({ site }) => <AlertBadge alerts={site.alerts} impact={site.highestImpact} />,
  },
  {
    id: 'highestImpact',
    label: 'Severity',
    sortKey: 'highestImpact',
    defaultVisible: false,
    defaultOrder: 10,
    render: ({ site }) => {
      const labels: Record<string, string> = {
        '0': 'None', '1': 'Low', '2': 'Medium', '3': 'High', '4': 'Critical', '5': 'Severe', '6': 'Emergency',
      };
      return <span className="text-xs text-slate-600">{labels[site.highestImpact] || site.highestImpact}</span>;
    },
  },
  {
    id: 'workOrders',
    label: 'Work Orders',
    sortKey: null,
    defaultVisible: true,
    defaultOrder: 11,
    render: ({ site, siteJobs, isExpanded, onToggleExpand, onViewChange }) => {
      if (siteJobs.length === 0) {
        return (
          <button onClick={() => onViewChange('jobs')} className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-orange-500 transition-colors cursor-pointer" title="Create work order">
            + Add WO
          </button>
        );
      }
      const open = siteJobs.filter(j => !['completed', 'invoiced', 'paid'].includes(j.status)).length;
      return (
        <button onClick={onToggleExpand} className="inline-flex items-center gap-1.5 cursor-pointer group" title={`${siteJobs.length} work orders`}>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${open > 0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
            {siteJobs.length}
          </span>
          {open > 0 ? <span className="text-xs text-amber-600">{open} open</span> : <span className="text-xs text-slate-400">{siteJobs.length} done</span>}
        </button>
      );
    },
  },
  {
    id: 'profitability',
    label: 'Profitability',
    sortKey: null,
    defaultVisible: true,
    defaultOrder: 12,
    align: 'right',
    render: ({ siteJobs }) => {
      if (siteJobs.length === 0) return <span className="text-slate-300 text-xs">—</span>;
      const revenue = siteJobs.reduce((s, j) => s + (j.totalAmount || 0), 0);
      const cost = siteJobs.reduce((s, j) => s + (j.laborHours * (j.contractorPayRate ?? j.laborRate)) + (j.partsCost || 0), 0);
      const profit = revenue - cost;
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
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
    },
  },
  {
    id: 'todayKwh',
    label: 'Today (kWh)',
    sortKey: 'todayKwh',
    defaultVisible: false,
    defaultOrder: 13,
    align: 'right',
    render: ({ site }) => <EnergyCell value={site.todayKwh} />,
  },
  {
    id: 'monthKwh',
    label: 'Month (kWh)',
    sortKey: 'monthKwh',
    defaultVisible: true,
    defaultOrder: 14,
    align: 'right',
    render: ({ site }) => <EnergyCell value={site.monthKwh} />,
  },
  {
    id: 'yearKwh',
    label: 'Year (kWh)',
    sortKey: 'yearKwh',
    defaultVisible: true,
    defaultOrder: 15,
    align: 'right',
    render: ({ site }) => <EnergyCell value={site.yearKwh} />,
  },
  {
    id: 'lifetimeKwh',
    label: 'Lifetime',
    sortKey: 'lifetimeKwh',
    defaultVisible: true,
    defaultOrder: 16,
    align: 'right',
    render: ({ site }) => <EnergyCell value={site.lifetimeKwh} />,
  },
  {
    id: 'lastUpdate',
    label: 'Last Update',
    sortKey: 'lastUpdate',
    defaultVisible: true,
    defaultOrder: 17,
    render: ({ site }) => (
      <span className="text-xs text-slate-400 font-mono">{site.lastUpdate ? site.lastUpdate.split(' ')[0] : '—'}</span>
    ),
  },
  {
    id: 'systemType',
    label: 'System Type',
    sortKey: 'systemType',
    defaultVisible: false,
    defaultOrder: 18,
    render: ({ site }) => (
      <span className="text-xs text-slate-600">{site.systemType || '—'}</span>
    ),
  },
  {
    id: 'module',
    label: 'Module',
    sortKey: 'module',
    defaultVisible: false,
    defaultOrder: 19,
    render: ({ site }) => (
      <span className="text-xs text-slate-600">{site.module || '—'}</span>
    ),
  },
  {
    id: 'siteId',
    label: 'Site ID',
    sortKey: 'siteId',
    defaultVisible: false,
    defaultOrder: 20,
    render: ({ site }) => (
      <span className="text-xs text-slate-400 font-mono">{site.siteId}</span>
    ),
  },
  {
    id: 'notes',
    label: 'Description / Notes',
    sortKey: null,
    defaultVisible: true,
    defaultOrder: 21,
    render: ({ site, profileMeta, onOpenPanel }) => {
      const meta = profileMeta[site.siteId];
      return (
        <button onClick={onOpenPanel} className="inline-flex items-center gap-1.5 cursor-pointer group" title="Open customer story & notes">
          {meta?.hasDesc || (meta?.noteCount ?? 0) > 0 ? (
            <>
              <FileText className="w-3.5 h-3.5 text-orange-400 group-hover:text-orange-600 transition-colors" />
              <span className="text-xs text-slate-600 group-hover:text-slate-900 transition-colors">
                {meta?.hasDesc ? 'Story' : ''}
                {meta?.hasDesc && meta?.noteCount > 0 ? ' \u00b7 ' : ''}
                {meta?.noteCount > 0 ? `${meta.noteCount} note${meta.noteCount !== 1 ? 's' : ''}` : ''}
              </span>
            </>
          ) : (
            <>
              <MessageSquare className="w-3.5 h-3.5 text-slate-300 group-hover:text-orange-400 transition-colors" />
              <span className="text-xs text-slate-300 group-hover:text-slate-500 transition-colors">Add notes</span>
            </>
          )}
        </button>
      );
    },
  },
  {
    id: 'solarEdgeLink',
    label: 'SolarEdge',
    sortKey: null,
    defaultVisible: true,
    defaultOrder: 22,
    render: ({ site }) => (
      <a
        href={`https://monitoring.solaredge.com/solaredge-web/p/site/${site.siteId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 transition-colors cursor-pointer"
        title={`Open site ${site.siteId} in SolarEdge`}
      >
        <ExternalLink className="w-3.5 h-3.5" />
        {site.siteId}
      </a>
    ),
  },
  {
    id: 'remove',
    label: 'Remove',
    sortKey: null,
    defaultVisible: true,
    defaultOrder: 23,
    align: 'center',
    adminOnly: true,
    render: ({ site, confirmRemove, onConfirmRemove, onCancelRemove, onRemove }) => {
      if (confirmRemove === site.siteId) {
        return (
          <span className="inline-flex items-center gap-1">
            <button onClick={() => onRemove(site.siteId)} className="px-2 py-0.5 text-xs bg-red-500 hover:bg-red-600 text-white rounded font-medium transition-colors">Confirm</button>
            <button onClick={onCancelRemove} className="px-2 py-0.5 text-xs bg-slate-200 hover:bg-slate-300 text-slate-700 rounded font-medium transition-colors">Cancel</button>
          </span>
        );
      }
      return (
        <button onClick={() => onConfirmRemove(site.siteId)} className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors" title={`Remove ${site.siteName || site.siteId}`}>
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      );
    },
  },
];

/** Build default column config from the registry */
export const getDefaultColumnConfig = () => ({
  order: COLUMN_REGISTRY.sort((a, b) => a.defaultOrder - b.defaultOrder).map(c => c.id),
  hidden: COLUMN_REGISTRY.filter(c => !c.defaultVisible).map(c => c.id),
});
