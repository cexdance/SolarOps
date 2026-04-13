// SolarEdgeImportModal.tsx
// Fetches live SolarEdge sites, diffs against current customers, and lets the
// user accept/reject each individual change before applying.

import React, { useState, useEffect, useMemo } from 'react';
import {
  X, RefreshCw, CheckSquare, Square, AlertTriangle,
  Plus, Edit2, Trash2, Check, ChevronDown, ChevronUp, Loader2,
} from 'lucide-react';
import { Customer, CustomerCategory } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LiveSite {
  id: number;
  name: string;
  status: string;
  peakPower: number;
  installationDate: string | null;
  ptoDate: string | null;
  alertQuantity: number;
  location: {
    country: string;
    state: string;
    city: string;
    address: string;
    zip: string;
  };
}

interface FieldChange {
  field: string;
  from: string;
  to: string;
}

export type DiffType = 'new' | 'updated' | 'removed';

export interface DiffItem {
  id: string;
  type: DiffType;
  site?: LiveSite;
  customer?: Customer;
  changes?: FieldChange[];
  accepted: boolean;
}

interface Props {
  apiKey?: string;
  currentCustomers: Customer[];
  onApply: (accepted: DiffItem[]) => void;
  onClose: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchAllSites(apiKey?: string): Promise<LiveSite[]> {
  const PAGE = 100;
  let start = 0;
  let all: LiveSite[] = [];
  while (true) {
    // Server-side proxy uses SOLAREDGE_API_KEY env var by default; client key is optional override
    const params = new URLSearchParams({ path: '/sites/list', size: String(PAGE), startIndex: String(start) });
    if (apiKey) params.set('api_key', apiKey);
    const res = await fetch(`/api/solaredge?${params}`);
    if (!res.ok) throw new Error(`SolarEdge API error ${res.status}`);
    const json = await res.json();
    if (json.errors) throw new Error(json.errors?.error?.[0]?.message || 'API error');
    const page: LiveSite[] = json.sites?.site || [];
    all = all.concat(page);
    if (page.length < PAGE) break;
    start += PAGE;
  }
  // Florida only
  return all.filter(s => s.location?.country === 'United States' && s.location?.state === 'Florida');
}

function fmtAddress(site: LiveSite): string {
  const l = site.location;
  return [l.address, l.city, 'FL', l.zip].filter(Boolean).join(', ');
}

function siteToName(raw: string): string {
  return raw
    .replace(/\s*TSP\d+/gi, '')
    .replace(/^Res\s+/i, '')
    .replace(/\s+Residenc[e]?\s*$/i, '')
    .replace(/^US[\s-]\d+\s*/i, '')
    .replace(/\s+\([^)]+\)\s*$/, '')
    .replace(/\s+-\s+\d+.*$/, '')
    .replace(/\s+\d+\s+panel.*$/i, '')
    .replace(/\.$/, '')
    .trim();
}

function buildDiff(sites: LiveSite[], customers: Customer[]): DiffItem[] {
  const items: DiffItem[] = [];

  // Map existing customers by solarEdgeSiteId
  const byId = new Map<string, Customer>();
  customers.forEach(c => { if (c.solarEdgeSiteId) byId.set(c.solarEdgeSiteId, c); });

  const liveSiteIds = new Set(sites.map(s => String(s.id)));

  // New + Updated
  for (const site of sites) {
    const sid = String(site.id);
    const existing = byId.get(sid);
    const liveName = siteToName(site.name);
    const liveAddr = fmtAddress(site);
    const liveCity  = site.location.city || '';

    if (!existing) {
      items.push({
        id: `new-${sid}`,
        type: 'new',
        site,
        accepted: true,
      });
    } else {
      const changes: FieldChange[] = [];
      if (existing.name !== liveName && liveName)
        changes.push({ field: 'Name', from: existing.name, to: liveName });
      if (existing.address !== site.location.address && site.location.address)
        changes.push({ field: 'Address', from: existing.address, to: site.location.address });
      if (existing.city !== liveCity && liveCity)
        changes.push({ field: 'City', from: existing.city, to: liveCity });
      if (existing.zip !== (site.location.zip || '') && site.location.zip)
        changes.push({ field: 'ZIP', from: existing.zip, to: site.location.zip });

      if (changes.length > 0) {
        items.push({
          id: `upd-${sid}`,
          type: 'updated',
          site,
          customer: existing,
          changes,
          accepted: true,
        });
      }
    }
  }

  // Removed (in our DB but not in live feed)
  for (const customer of customers) {
    if (customer.solarEdgeSiteId && !liveSiteIds.has(customer.solarEdgeSiteId)) {
      items.push({
        id: `rem-${customer.id}`,
        type: 'removed',
        customer,
        accepted: false, // default off — don't auto-delete
      });
    }
  }

  return items;
}

// ── Component ─────────────────────────────────────────────────────────────────

const typeConfig = {
  new:     { label: 'New Sites',     color: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-200', icon: Plus,         dot: 'bg-green-500' },
  updated: { label: 'Updated',       color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-200',  icon: Edit2,        dot: 'bg-blue-500'  },
  removed: { label: 'Not in API',    color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200',icon: AlertTriangle, dot: 'bg-orange-500'},
};

export const SolarEdgeImportModal: React.FC<Props> = ({
  apiKey, currentCustomers, onApply, onClose,
}) => {
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState('');
  const [diff, setDiff] = useState<DiffItem[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Auto-fetch on mount
  useEffect(() => {
    run();
  }, []);

  const run = async () => {
    setStatus('loading');
    setError('');
    try {
      const sites = await fetchAllSites(apiKey);
      const items = buildDiff(sites, currentCustomers);
      setDiff(items);
      setStatus('ready');
    } catch (e: any) {
      setError(e.message || 'Unknown error');
      setStatus('error');
    }
  };

  const toggle = (id: string) =>
    setDiff(prev => prev.map(d => d.id === id ? { ...d, accepted: !d.accepted } : d));

  const toggleAll = (type: DiffType, val: boolean) =>
    setDiff(prev => prev.map(d => d.type === type ? { ...d, accepted: val } : d));

  const toggleExpand = (id: string) =>
    setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const counts = useMemo(() => ({
    new:     diff.filter(d => d.type === 'new').length,
    updated: diff.filter(d => d.type === 'updated').length,
    removed: diff.filter(d => d.type === 'removed').length,
    acceptedNew:     diff.filter(d => d.type === 'new' && d.accepted).length,
    acceptedUpdated: diff.filter(d => d.type === 'updated' && d.accepted).length,
    acceptedRemoved: diff.filter(d => d.type === 'removed' && d.accepted).length,
  }), [diff]);

  const acceptedTotal = diff.filter(d => d.accepted).length;

  const renderGroup = (type: DiffType) => {
    const items = diff.filter(d => d.type === type);
    if (!items.length) return null;
    const cfg = typeConfig[type];
    const allOn  = items.every(d => d.accepted);
    const someOn = items.some(d => d.accepted);

    return (
      <div key={type} className={`rounded-xl border ${cfg.border} overflow-hidden`}>
        {/* Group header */}
        <div className={`flex items-center justify-between px-4 py-3 ${cfg.bg}`}>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
            <span className={`font-semibold text-sm ${cfg.color}`}>{cfg.label}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
              {items.filter(d => d.accepted).length} / {items.length} selected
            </span>
          </div>
          <button
            onClick={() => toggleAll(type, !allOn)}
            className={`text-xs font-medium px-3 py-1 rounded-lg border transition-colors ${cfg.color} ${cfg.border} hover:opacity-80`}
          >
            {allOn ? 'Deselect all' : 'Select all'}
          </button>
        </div>

        {/* Items */}
        <div className="divide-y divide-slate-100">
          {items.map(item => {
            const isExp = expanded.has(item.id);
            const name = item.site ? siteToName(item.site.name) : (item.customer?.name || '');
            const city = item.site?.location.city || item.customer?.city || '';

            return (
              <div key={item.id} className="bg-white">
                <div className="flex items-center gap-3 px-4 py-3">
                  {/* Checkbox */}
                  <button onClick={() => toggle(item.id)} className="flex-shrink-0">
                    {item.accepted
                      ? <CheckSquare className={`w-5 h-5 ${cfg.color}`} />
                      : <Square className="w-5 h-5 text-slate-300" />}
                  </button>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-800 text-sm truncate">{name || item.site?.name}</span>
                      {city && <span className="text-xs text-slate-400">{city}</span>}
                      {item.site && (
                        <span className="text-xs text-slate-400 font-mono">#{item.site.id}</span>
                      )}
                    </div>
                    {type === 'new' && item.site && (
                      <p className="text-xs text-slate-500 mt-0.5 truncate">{fmtAddress(item.site)}</p>
                    )}
                    {type === 'removed' && item.customer && (
                      <p className="text-xs text-slate-500 mt-0.5">{item.customer.clientId} — not found in live API</p>
                    )}
                    {type === 'updated' && item.changes && (
                      <p className="text-xs text-slate-500 mt-0.5">{item.changes.map(c => c.field).join(', ')} changed</p>
                    )}
                  </div>

                  {/* Expand (for updated) */}
                  {type === 'updated' && item.changes && (
                    <button onClick={() => toggleExpand(item.id)} className="text-slate-400 hover:text-slate-600">
                      {isExp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  )}
                </div>

                {/* Expanded changes */}
                {isExp && item.changes && (
                  <div className="px-12 pb-3 space-y-1">
                    {item.changes.map(ch => (
                      <div key={ch.field} className="flex items-start gap-2 text-xs">
                        <span className="font-medium text-slate-600 w-16 flex-shrink-0">{ch.field}</span>
                        <span className="text-red-500 line-through truncate max-w-[140px]">{ch.from || '—'}</span>
                        <span className="text-slate-400">→</span>
                        <span className="text-green-600 font-medium truncate max-w-[140px]">{ch.to || '—'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900">SolarEdge Import</h2>
            <p className="text-sm text-slate-500 mt-0.5">Florida sites — live API vs current customer list</p>
          </div>
          <div className="flex items-center gap-2">
            {status === 'ready' && (
              <button onClick={run} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                <RefreshCw className="w-3.5 h-3.5" />
                Refresh
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {status === 'loading' && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
              <p className="text-slate-500 text-sm">Fetching live sites from SolarEdge…</p>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <AlertTriangle className="w-8 h-8 text-red-500" />
              <p className="text-red-600 text-sm font-medium">{error}</p>
              <button onClick={run} className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm hover:bg-orange-600">
                Retry
              </button>
            </div>
          )}

          {status === 'ready' && diff.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Check className="w-10 h-10 text-green-500" />
              <p className="text-slate-700 font-semibold">All up to date</p>
              <p className="text-slate-400 text-sm">No differences between live sites and your customer list.</p>
            </div>
          )}

          {status === 'ready' && diff.length > 0 && (
            <>
              {/* Summary bar */}
              <div className="flex gap-3 text-sm">
                {counts.new > 0 && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg border border-green-200">
                    <Plus className="w-3.5 h-3.5" />
                    <span className="font-semibold">{counts.new}</span> new
                  </div>
                )}
                {counts.updated > 0 && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg border border-blue-200">
                    <Edit2 className="w-3.5 h-3.5" />
                    <span className="font-semibold">{counts.updated}</span> updated
                  </div>
                )}
                {counts.removed > 0 && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 text-orange-700 rounded-lg border border-orange-200">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span className="font-semibold">{counts.removed}</span> not in API
                  </div>
                )}
              </div>

              {(['new', 'updated', 'removed'] as DiffType[]).map(type => renderGroup(type))}
            </>
          )}
        </div>

        {/* Footer */}
        {status === 'ready' && diff.length > 0 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
            <p className="text-sm text-slate-500">
              <span className="font-semibold text-slate-700">{acceptedTotal}</span> change{acceptedTotal !== 1 ? 's' : ''} selected
            </p>
            <div className="flex gap-3">
              <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-white transition-colors">
                Cancel
              </button>
              <button
                disabled={acceptedTotal === 0}
                onClick={() => onApply(diff.filter(d => d.accepted))}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Check className="w-4 h-4" />
                Apply {acceptedTotal} change{acceptedTotal !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
