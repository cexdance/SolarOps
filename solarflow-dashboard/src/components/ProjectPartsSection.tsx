// Section 2 — Equipment & BOM (Parts) for Solar Project workflow
import React, { useState, useMemo, useRef } from 'react';
import {
  ChevronDown, ChevronUp, Plus, X, CheckCircle2, Link2,
  FileText, Settings2, Trash2, ExternalLink, Package,
} from 'lucide-react';
import { ProjectPart, PartGroup, PartStatus } from '../types/project';
import { PARTS_CATALOG, CatalogPart, searchParts } from '../lib/partsCatalog';

// ── Constants ─────────────────────────────────────────────────────────────────

const GROUP_LABELS: Record<PartGroup, string> = {
  panels:           'Panels / Modules',
  roof_attachments: 'Roof Attachments',
  railing:          'Railing System',
  dc_wiring:        'DC Wiring & Conduit Home Run',
  optimizers:       'Optimizers',
  inverter:         'Inverter',
  bos:              'BOS (Balance of System)',
};

const GROUP_ORDER: PartGroup[] = [
  'panels', 'roof_attachments', 'railing', 'dc_wiring', 'optimizers', 'inverter', 'bos',
];

const STATUS_STYLE: Record<PartStatus, { label: string; dot: string; chip: string }> = {
  pending:  { label: 'Pending',  dot: 'bg-slate-400',  chip: 'bg-slate-100 text-slate-500' },
  ordered:  { label: 'Ordered',  dot: 'bg-blue-400',   chip: 'bg-blue-100 text-blue-700'   },
  partial:  { label: 'Partial',  dot: 'bg-amber-400',  chip: 'bg-amber-100 text-amber-700' },
  received: { label: 'Received', dot: 'bg-green-500',  chip: 'bg-green-100 text-green-700' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function deriveStatus(part: ProjectPart): PartStatus {
  if (part.quantityReceived <= 0) return part.status === 'ordered' ? 'ordered' : 'pending';
  if (part.quantityReceived >= part.quantityNeeded) return 'received';
  return 'partial';
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}

function uid() {
  return `part-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ── Column visibility ─────────────────────────────────────────────────────────

interface ColVis {
  partNumber: boolean;
  unitCost: boolean;
  totalCost: boolean;
  link: boolean;
  manufacturer: boolean;
}

const DEFAULT_COLS: ColVis = {
  partNumber: true,
  unitCost: true,
  totalCost: true,
  link: false,
  manufacturer: false,
};

// ── Part row ──────────────────────────────────────────────────────────────────

interface PartRowProps {
  part: ProjectPart;
  cols: ColVis;
  onChange: (p: ProjectPart) => void;
  onDelete: () => void;
}

const PartRow: React.FC<PartRowProps> = ({ part, cols, onChange, onDelete }) => {
  const [showNotes, setShowNotes] = useState(false);
  const [showLinkEdit, setShowLinkEdit] = useState(false);
  const [snInput, setSnInput] = useState('');
  const snRef = useRef<HTMLInputElement>(null);

  const status = deriveStatus(part);
  const statusStyle = STATUS_STYLE[status];
  const isReceived = status === 'received';

  const update = (patch: Partial<ProjectPart>) => {
    const updated = { ...part, ...patch };
    updated.status = deriveStatus(updated);
    onChange(updated);
  };

  const addSN = () => {
    const val = snInput.trim();
    if (!val) return;
    update({ serialNumbers: [...part.serialNumbers, val] });
    setSnInput('');
    snRef.current?.focus();
  };

  const removeSN = (i: number) => {
    update({ serialNumbers: part.serialNumbers.filter((_, idx) => idx !== i) });
  };

  return (
    <div className={`border rounded-lg overflow-hidden transition-colors ${isReceived ? 'border-green-200 bg-green-50/30' : 'border-slate-200 bg-white'}`}>
      {/* Main row */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        {/* Status dot */}
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${statusStyle.dot}`} title={statusStyle.label} />

        {/* Name + part number */}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-slate-800 text-sm truncate">{part.name}</div>
          {cols.partNumber && part.partNumber && (
            <div className="text-xs text-slate-400 truncate">{part.partNumber}</div>
          )}
          {cols.manufacturer && part.manufacturer && (
            <div className="text-xs text-slate-400 truncate">{part.manufacturer}</div>
          )}
        </div>

        {/* Qty needed */}
        <div className="flex flex-col items-center flex-shrink-0">
          <label className="text-[10px] text-slate-400 leading-none mb-0.5">Need</label>
          <input
            type="number"
            min={0}
            value={part.quantityNeeded}
            onChange={e => update({ quantityNeeded: Math.max(0, Number(e.target.value)) })}
            className="w-14 text-center text-sm border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
        </div>

        {/* Qty received */}
        <div className="flex flex-col items-center flex-shrink-0">
          <label className="text-[10px] text-slate-400 leading-none mb-0.5">Rcvd</label>
          <input
            type="number"
            min={0}
            value={part.quantityReceived}
            onChange={e => update({ quantityReceived: Math.max(0, Number(e.target.value)) })}
            className={`w-14 text-center text-sm border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-orange-500 ${isReceived ? 'border-green-300 bg-green-50' : 'border-slate-200'}`}
          />
        </div>

        {/* Unit cost */}
        {cols.unitCost && (
          <div className="flex flex-col items-center flex-shrink-0 hidden sm:flex">
            <label className="text-[10px] text-slate-400 leading-none mb-0.5">Unit $</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={part.unitCost}
              onChange={e => update({ unitCost: Math.max(0, Number(e.target.value)) })}
              className="w-20 text-center text-sm border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
        )}

        {/* Total cost */}
        {cols.totalCost && (
          <div className="flex-col items-end flex-shrink-0 hidden sm:flex">
            <label className="text-[10px] text-slate-400 leading-none mb-0.5">Total</label>
            <span className="text-sm font-medium text-slate-700 tabular-nums">
              {fmt(part.quantityNeeded * part.unitCost)}
            </span>
          </div>
        )}

        {/* Status chip */}
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 hidden md:inline ${statusStyle.chip}`}>
          {statusStyle.label}
        </span>

        {/* Action buttons */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {/* Notes/SN toggle */}
          <button
            type="button"
            onClick={() => { setShowNotes(s => !s); setShowLinkEdit(false); }}
            title="Notes & Serial Numbers"
            className={`p-1.5 rounded hover:bg-slate-100 transition-colors ${showNotes ? 'text-orange-500' : 'text-slate-400'}`}
          >
            <FileText className="w-3.5 h-3.5" />
          </button>

          {/* Link */}
          {cols.link && (
            <button
              type="button"
              onClick={() => {
                if (part.link) {
                  window.open(part.link, '_blank', 'noopener');
                } else {
                  setShowLinkEdit(s => !s);
                  setShowNotes(false);
                }
              }}
              title={part.link ? 'Open link' : 'Set link'}
              className={`p-1.5 rounded hover:bg-slate-100 transition-colors ${part.link ? 'text-blue-500' : 'text-slate-400'}`}
            >
              {part.link ? <ExternalLink className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
            </button>
          )}

          {/* Delete */}
          <button
            type="button"
            onClick={onDelete}
            title="Remove part"
            className="p-1.5 rounded hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Link edit inline */}
      {showLinkEdit && (
        <div className="px-3 pb-3 flex gap-2">
          <input
            type="url"
            value={part.link ?? ''}
            onChange={e => update({ link: e.target.value })}
            placeholder="https://..."
            className="flex-1 text-sm border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
          <button
            type="button"
            onClick={() => setShowLinkEdit(false)}
            className="text-xs px-2 py-1.5 bg-orange-500 text-white rounded hover:bg-orange-600"
          >
            Save
          </button>
        </div>
      )}

      {/* Notes + SN area */}
      {showNotes && (
        <div className="px-3 pb-3 pt-1 border-t border-slate-100 space-y-2 bg-slate-50/60">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Notes</label>
            <textarea
              value={part.notes ?? ''}
              onChange={e => update({ notes: e.target.value })}
              rows={2}
              placeholder="Part notes, install instructions…"
              className="w-full text-sm border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-500 resize-none bg-white"
            />
          </div>

          {/* Watts (panels only) */}
          {part.group === 'panels' && (
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-slate-500 flex-shrink-0">Watts per panel:</label>
              <input
                type="number"
                min={0}
                value={part.watts ?? ''}
                onChange={e => update({ watts: e.target.value === '' ? undefined : Number(e.target.value) })}
                placeholder="e.g. 400"
                className="w-24 text-sm border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
              <span className="text-xs text-slate-400">W</span>
            </div>
          )}

          {/* Serial numbers */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Serial / Barcode numbers</label>
            <div className="flex gap-2 mb-2">
              <input
                ref={snRef}
                type="text"
                value={snInput}
                onChange={e => setSnInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSN(); } }}
                placeholder="Scan or type SN, press Enter…"
                className="flex-1 text-sm border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-500 bg-white"
              />
              <button
                type="button"
                onClick={addSN}
                className="text-xs px-2.5 py-1.5 bg-slate-700 text-white rounded hover:bg-slate-800"
              >
                Add
              </button>
            </div>
            {part.serialNumbers.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {part.serialNumbers.map((sn, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-xs bg-white border border-slate-200 rounded px-2 py-0.5 font-mono">
                    {sn}
                    <button type="button" onClick={() => removeSN(i)} className="text-slate-400 hover:text-red-500">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Group section ─────────────────────────────────────────────────────────────

interface GroupSectionProps {
  group: PartGroup;
  parts: ProjectPart[];
  cols: ColVis;
  onAdd: () => void;
  onChange: (p: ProjectPart) => void;
  onDelete: (id: string) => void;
}

const GroupSection: React.FC<GroupSectionProps> = ({ group, parts, cols, onAdd, onChange, onDelete }) => {
  const [collapsed, setCollapsed] = useState(false);

  const total = parts.length;
  const received = parts.filter(p => deriveStatus(p) === 'received').length;
  const allDone = total > 0 && received === total;
  const groupCost = parts.reduce((sum, p) => sum + p.quantityNeeded * p.unitCost, 0);

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      {/* Group header */}
      <div
        className={`flex items-center gap-2 px-4 py-3 cursor-pointer select-none transition-colors ${allDone ? 'bg-green-50' : 'bg-slate-50'} hover:bg-slate-100`}
        onClick={() => setCollapsed(c => !c)}
      >
        {allDone
          ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
          : <Package className="w-4 h-4 text-slate-400 flex-shrink-0" />
        }
        <span className={`font-semibold text-sm flex-1 ${allDone ? 'text-green-800' : 'text-slate-800'}`}>
          {GROUP_LABELS[group]}
        </span>

        {/* Stats */}
        {total > 0 && (
          <span className="text-xs text-slate-500 hidden sm:inline">
            {received}/{total} rcvd
          </span>
        )}
        {groupCost > 0 && (
          <span className="text-xs font-medium text-slate-600 hidden sm:inline">{fmt(groupCost)}</span>
        )}
        <span className="text-xs text-slate-400">{total} item{total !== 1 ? 's' : ''}</span>
        {collapsed ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronUp className="w-4 h-4 text-slate-400" />}
      </div>

      {/* Parts list */}
      {!collapsed && (
        <div className="p-3 space-y-2">
          {parts.length === 0 && (
            <p className="text-center text-sm text-slate-400 py-3">No parts added yet</p>
          )}
          {parts.map(p => (
            <PartRow
              key={p.id}
              part={p}
              cols={cols}
              onChange={onChange}
              onDelete={() => onDelete(p.id)}
            />
          ))}
          <button
            type="button"
            onClick={onAdd}
            className="flex items-center gap-1.5 text-xs font-medium text-orange-600 hover:text-orange-700 px-2 py-1.5 rounded-lg hover:bg-orange-50 transition-colors w-full"
          >
            <Plus className="w-3.5 h-3.5" />
            Add part to {GROUP_LABELS[group]}
          </button>
        </div>
      )}
    </div>
  );
};

// ── Add Part Modal ─────────────────────────────────────────────────────────────

interface AddPartModalProps {
  group: PartGroup;
  onAdd: (p: ProjectPart) => void;
  onClose: () => void;
}

const BLANK_CUSTOM = (group: PartGroup): Omit<ProjectPart, 'id'> => ({
  group,
  partNumber: '',
  sku: '',
  name: '',
  description: '',
  manufacturer: '',
  watts: undefined,
  quantityNeeded: 1,
  quantityReceived: 0,
  unitCost: 0,
  link: '',
  serialNumbers: [],
  notes: '',
  status: 'pending',
});

const AddPartModal: React.FC<AddPartModalProps> = ({ group, onAdd, onClose }) => {
  const [tab, setTab] = useState<'catalog' | 'custom'>('catalog');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<CatalogPart | null>(null);
  const [qtyNeeded, setQtyNeeded] = useState(1);
  const [unitCost, setUnitCost] = useState(0);
  const [link, setLink] = useState('');
  const [custom, setCustom] = useState<Omit<ProjectPart, 'id'>>(BLANK_CUSTOM(group));

  const results = useMemo(() => {
    if (!query.trim()) return PARTS_CATALOG.slice(0, 20);
    return searchParts(query).slice(0, 30);
  }, [query]);

  const handleAddFromCatalog = () => {
    if (!selected) return;
    const part: ProjectPart = {
      id: uid(),
      catalogId: selected.id,
      group,
      partNumber: selected.partNumber,
      sku: selected.sku,
      name: selected.name,
      description: selected.description,
      quantityNeeded: qtyNeeded,
      quantityReceived: 0,
      unitCost,
      link: link || undefined,
      serialNumbers: [],
      status: 'pending',
    };
    onAdd(part);
    onClose();
  };

  const handleAddCustom = () => {
    if (!custom.name.trim()) return;
    const part: ProjectPart = {
      ...custom,
      id: uid(),
      status: deriveStatus({ ...custom, id: '', status: 'pending' }),
    };
    onAdd(part);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 flex-shrink-0">
          <div>
            <h2 className="font-semibold text-slate-900">Add Part</h2>
            <p className="text-xs text-slate-500 mt-0.5">{GROUP_LABELS[group]}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 flex-shrink-0">
          {(['catalog', 'custom'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${tab === t ? 'border-b-2 border-orange-500 text-orange-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {t === 'catalog' ? 'From Catalog' : 'Custom Part'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'catalog' ? (
            <div className="space-y-3">
              <input
                autoFocus
                type="text"
                value={query}
                onChange={e => { setQuery(e.target.value); setSelected(null); }}
                placeholder="Search parts by name, SKU, or part number…"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />

              <div className="space-y-1 max-h-56 overflow-y-auto">
                {results.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSelected(item);
                      setUnitCost(item.unitCost);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                      selected?.id === item.id
                        ? 'border-orange-400 bg-orange-50'
                        : 'border-slate-100 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-medium text-sm text-slate-800">{item.name}</div>
                    <div className="text-xs text-slate-400">{item.sku}{item.partNumber ? ` · ${item.partNumber}` : ''} · {item.description}</div>
                  </button>
                ))}
                {results.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-4">No results</p>
                )}
              </div>

              {selected && (
                <div className="border border-orange-200 bg-orange-50 rounded-lg p-3 space-y-3">
                  <p className="text-sm font-semibold text-orange-900">{selected.name}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Qty Needed</label>
                      <input
                        type="number"
                        min={1}
                        value={qtyNeeded}
                        onChange={e => setQtyNeeded(Math.max(1, Number(e.target.value)))}
                        className="w-full text-sm border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-500 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Unit Cost ($)</label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={unitCost}
                        onChange={e => setUnitCost(Number(e.target.value))}
                        className="w-full text-sm border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-500 bg-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Product Link (optional)</label>
                    <input
                      type="url"
                      value={link}
                      onChange={e => setLink(e.target.value)}
                      placeholder="https://..."
                      className="w-full text-sm border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-500 bg-white"
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Custom form */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Name *</label>
                  <input
                    autoFocus
                    type="text"
                    value={custom.name}
                    onChange={e => setCustom(c => ({ ...c, name: e.target.value }))}
                    placeholder="Part name"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Part Number</label>
                  <input
                    type="text"
                    value={custom.partNumber}
                    onChange={e => setCustom(c => ({ ...c, partNumber: e.target.value }))}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">SKU</label>
                  <input
                    type="text"
                    value={custom.sku}
                    onChange={e => setCustom(c => ({ ...c, sku: e.target.value }))}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Manufacturer</label>
                  <input
                    type="text"
                    value={custom.manufacturer ?? ''}
                    onChange={e => setCustom(c => ({ ...c, manufacturer: e.target.value }))}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Qty Needed</label>
                  <input
                    type="number"
                    min={1}
                    value={custom.quantityNeeded}
                    onChange={e => setCustom(c => ({ ...c, quantityNeeded: Math.max(1, Number(e.target.value)) }))}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Unit Cost ($)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={custom.unitCost}
                    onChange={e => setCustom(c => ({ ...c, unitCost: Number(e.target.value) }))}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                {custom.group === 'panels' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Watts / Panel</label>
                    <input
                      type="number"
                      min={0}
                      value={custom.watts ?? ''}
                      onChange={e => setCustom(c => ({ ...c, watts: e.target.value === '' ? undefined : Number(e.target.value) }))}
                      placeholder="e.g. 400"
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                )}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Description</label>
                  <input
                    type="text"
                    value={custom.description}
                    onChange={e => setCustom(c => ({ ...c, description: e.target.value }))}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Product Link (optional)</label>
                  <input
                    type="url"
                    value={custom.link ?? ''}
                    onChange={e => setCustom(c => ({ ...c, link: e.target.value }))}
                    placeholder="https://..."
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 pt-0 flex gap-2 flex-shrink-0 border-t border-slate-100 mt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={tab === 'catalog' ? handleAddFromCatalog : handleAddCustom}
            disabled={tab === 'catalog' ? !selected : !custom.name.trim()}
            className="flex-1 py-2.5 bg-orange-500 text-white rounded-lg text-sm font-semibold hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add Part
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Column visibility popover ─────────────────────────────────────────────────

const ColTogglePopover: React.FC<{ cols: ColVis; onChange: (c: ColVis) => void }> = ({ cols, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const toggle = (key: keyof ColVis) => onChange({ ...cols, [key]: !cols[key] });

  const entries: [keyof ColVis, string][] = [
    ['partNumber', 'Part Number'],
    ['unitCost', 'Unit Cost'],
    ['totalCost', 'Total Cost'],
    ['link', 'Link'],
    ['manufacturer', 'Manufacturer'],
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title="Column visibility"
        className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${open ? 'bg-slate-700 text-white border-slate-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
      >
        <Settings2 className="w-3.5 h-3.5" />
        Columns
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-lg z-30 p-2 min-w-40">
          {entries.map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={cols[key]}
                onChange={() => toggle(key)}
                className="accent-orange-500"
              />
              <span className="text-slate-700">{label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Metrics bar ───────────────────────────────────────────────────────────────

const MetricsBar: React.FC<{ parts: ProjectPart[] }> = ({ parts }) => {
  const panels = parts.filter(p => p.group === 'panels');
  const kwdc = panels.reduce((sum, p) => {
    if (!p.watts) return sum;
    return sum + (p.quantityNeeded * p.watts) / 1000;
  }, 0);

  const totalCost = parts.reduce((sum, p) => sum + p.quantityNeeded * p.unitCost, 0);
  const receivedCount = parts.filter(p => deriveStatus(p) === 'received').length;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-white rounded-xl border border-slate-200">
      <div>
        <div className="text-xs text-slate-500 mb-0.5">System Size</div>
        <div className="font-bold text-slate-900">{kwdc > 0 ? `${kwdc.toFixed(2)} kWdc` : '—'}</div>
      </div>
      <div>
        <div className="text-xs text-slate-500 mb-0.5">Total Cost</div>
        <div className="font-bold text-slate-900">{totalCost > 0 ? fmt(totalCost) : '—'}</div>
      </div>
      {kwdc > 0 && totalCost > 0 && (
        <div>
          <div className="text-xs text-slate-500 mb-0.5">Cost / kWdc</div>
          <div className="font-bold text-slate-900">{fmt(totalCost / kwdc)}</div>
        </div>
      )}
      <div>
        <div className="text-xs text-slate-500 mb-0.5">Items Received</div>
        <div className="font-bold text-slate-900">
          {receivedCount} / {parts.length}
          {parts.length > 0 && (
            <span className="text-xs font-normal text-slate-400 ml-1">
              ({Math.round((receivedCount / parts.length) * 100)}%)
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  parts: ProjectPart[];
  onChange: (parts: ProjectPart[]) => void;
}

export const ProjectPartsSection: React.FC<Props> = ({ parts, onChange }) => {
  const [cols, setCols] = useState<ColVis>(DEFAULT_COLS);
  const [addModal, setAddModal] = useState<PartGroup | null>(null);

  const updatePart = (updated: ProjectPart) => {
    onChange(parts.map(p => p.id === updated.id ? updated : p));
  };

  const deletePart = (id: string) => {
    onChange(parts.filter(p => p.id !== id));
  };

  const addPart = (part: ProjectPart) => {
    onChange([...parts, part]);
  };

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-orange-500" />
          <h2 className="font-semibold text-slate-800">Equipment &amp; BOM</h2>
        </div>
        <ColTogglePopover cols={cols} onChange={setCols} />
      </div>

      {/* Metrics bar */}
      <MetricsBar parts={parts} />

      {/* Groups */}
      {GROUP_ORDER.map(group => {
        const groupParts = parts.filter(p => p.group === group);
        return (
          <GroupSection
            key={group}
            group={group}
            parts={groupParts}
            cols={cols}
            onAdd={() => setAddModal(group)}
            onChange={updatePart}
            onDelete={deletePart}
          />
        );
      })}

      {/* Trash summary for cost/received */}
      {parts.length > 0 && (
        <div className="flex items-center justify-between text-xs text-slate-500 px-1">
          <span>{parts.length} part{parts.length !== 1 ? 's' : ''} total</span>
          <button
            type="button"
            onClick={() => {
              if (confirm('Remove all parts from this project?')) onChange([]);
            }}
            className="flex items-center gap-1 text-red-400 hover:text-red-600"
          >
            <Trash2 className="w-3 h-3" /> Clear all
          </button>
        </div>
      )}

      {/* Add part modal */}
      {addModal && (
        <AddPartModal
          group={addModal}
          onAdd={addPart}
          onClose={() => setAddModal(null)}
        />
      )}
    </div>
  );
};
