// Address Cleanup widget (Ops Center)
// Shared team checklist of the 30 customers whose address conflicts across
// DB / SolarEdge / Trello (2026-06-10 audit). Assign it to whoever is doing
// the cleanup: each row shows all three sources, a click opens the customer,
// and the checkbox crosses the record off for everyone (synced).
import React, { useEffect, useState } from 'react';
import { MapPin, Check, ChevronDown, ChevronUp } from 'lucide-react';
import {
  AddressCleanupItem,
  ADDRESS_CLEANUP_KEY,
  loadCleanupItems,
  toggleCleanupItem,
} from '../lib/addressCleanupStore';

interface Props {
  userName: string;
  onViewCustomer: (customerId: string) => void;
}

const SourceRow: React.FC<{ label: string; value: string; tone: string }> = ({ label, value, tone }) => {
  if (!value) return null;
  return (
    <div className="flex items-baseline gap-1.5 min-w-0">
      <span className={`text-[9px] font-semibold uppercase tracking-wide flex-shrink-0 ${tone}`}>{label}</span>
      <span className="text-[11px] text-slate-600 truncate">{value}</span>
    </div>
  );
};

export const AddressCleanupWidget: React.FC<Props> = ({ userName, onViewCustomer }) => {
  const [items, setItems] = useState<AddressCleanupItem[]>(loadCleanupItems);
  const [showDone, setShowDone] = useState(false);

  // Re-read when a sync pull updates the key (another user checked something off).
  useEffect(() => {
    const onRemote = (e: Event) => {
      const keys = (e as CustomEvent<{ keys?: string[] }>).detail?.keys ?? [];
      if (keys.includes(ADDRESS_CLEANUP_KEY)) setItems(loadCleanupItems());
    };
    window.addEventListener('solarflow-remote-update', onRemote);
    return () => window.removeEventListener('solarflow-remote-update', onRemote);
  }, []);

  const open = items.filter(i => !i.done);
  const done = items.filter(i => i.done);
  const pct = items.length > 0 ? Math.round((done.length / items.length) * 100) : 0;

  const renderItem = (item: AddressCleanupItem) => (
    <div
      key={item.id}
      className={`flex items-start gap-2 px-2.5 py-2 rounded-lg transition-colors ${
        item.done ? 'bg-slate-50 opacity-60' : 'bg-white border border-slate-100 hover:border-slate-200'
      }`}
    >
      <button
        onClick={() => setItems(toggleCleanupItem(item.id, userName))}
        title={item.done ? `Fixed by ${item.doneBy || 'unknown'}` : 'Mark as fixed'}
        className={`mt-0.5 w-4 h-4 rounded flex-shrink-0 border-2 flex items-center justify-center transition-colors ${
          item.done ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 hover:border-emerald-400'
        }`}
      >
        {item.done && <Check className="w-2.5 h-2.5 text-white" />}
      </button>
      <div className="flex-1 min-w-0">
        <button
          onClick={() => onViewCustomer(item.customerId)}
          className={`text-xs font-medium text-left hover:text-orange-600 transition-colors ${
            item.done ? 'line-through text-slate-400' : 'text-slate-900'
          }`}
        >
          {item.clientNumber ? `${item.clientNumber} ` : ''}{item.name}
        </button>
        {!item.done && (
          <div className="mt-0.5 space-y-0.5">
            <SourceRow label="DB" value={item.dbAddress} tone="text-slate-400" />
            <SourceRow label="SE" value={item.seAddress} tone="text-amber-600" />
            <SourceRow label="TRELLO" value={item.trelloAddress} tone="text-sky-600" />
          </div>
        )}
        {item.done && item.doneBy && (
          <p className="text-[10px] text-slate-400">
            Fixed by {item.doneBy}{item.doneAt ? ` on ${item.doneAt.slice(0, 10)}` : ''}
          </p>
        )}
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <MapPin className="w-4 h-4 text-emerald-600" />
          <span className="text-sm font-semibold text-slate-900">Address Cleanup</span>
        </div>
        <span className="text-[11px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
          {done.length} / {items.length} fixed
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-slate-100 mb-3 flex-shrink-0 overflow-hidden">
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
        {open.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 text-center py-4">
            <Check className="w-8 h-8 text-emerald-300" />
            <p className="text-xs text-slate-400">All addresses verified. Nice work.</p>
          </div>
        )}
        {open.map(renderItem)}

        {done.length > 0 && (
          <button
            onClick={() => setShowDone(v => !v)}
            className="w-full flex items-center justify-center gap-1 py-1.5 text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
          >
            {showDone ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {showDone ? 'Hide' : 'Show'} {done.length} fixed
          </button>
        )}
        {showDone && done.map(renderItem)}
      </div>
    </div>
  );
};
