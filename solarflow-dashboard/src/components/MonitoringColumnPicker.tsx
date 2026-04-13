// Column picker popover for SolarEdge Monitoring table
// Allows toggling column visibility and resetting to defaults
import React, { useState, useRef, useEffect } from 'react';
import { Columns3, RotateCcw, GripVertical, Eye, EyeOff } from 'lucide-react';
import type { MonitoringColumnDef } from '../lib/monitoringColumns';
import type { ColumnConfig } from '../lib/monitoringColumnStore';

interface Props {
  columns: MonitoringColumnDef[];
  config: ColumnConfig;
  isAdmin: boolean;
  onChange: (config: ColumnConfig) => void;
  onReset: () => void;
}

export const MonitoringColumnPicker: React.FC<Props> = ({
  columns, config, isAdmin, onChange, onReset,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const hidden = new Set(config.hidden);
  // Filter admin-only columns for non-admins
  const available = columns.filter(c => !c.adminOnly || isAdmin);
  // Sort by current order
  const ordered = [...available].sort((a, b) => {
    const ai = config.order.indexOf(a.id);
    const bi = config.order.indexOf(b.id);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  const toggleColumn = (id: string) => {
    const next = hidden.has(id)
      ? config.hidden.filter(h => h !== id)
      : [...config.hidden, id];
    onChange({ ...config, hidden: next });
  };

  // Drag-and-drop reorder
  const handleDragStart = (id: string) => setDragId(id);
  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    setDragOverId(id);
  };
  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); setDragOverId(null); return; }
    const newOrder = [...config.order];
    const fromIdx = newOrder.indexOf(dragId);
    const toIdx = newOrder.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) { setDragId(null); setDragOverId(null); return; }
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, dragId);
    onChange({ ...config, order: newOrder });
    setDragId(null);
    setDragOverId(null);
  };

  const visibleCount = available.filter(c => !hidden.has(c.id)).length;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg transition-colors cursor-pointer
          ${open ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
        title="Customize columns"
      >
        <Columns3 className="w-4 h-4" />
        Columns
        <span className="text-xs text-slate-400">({visibleCount})</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-xl w-72 max-h-[420px] flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Columns</span>
            <button
              onClick={() => { onReset(); }}
              className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-orange-600 transition-colors"
              title="Reset to defaults"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          </div>
          <div className="overflow-y-auto flex-1 py-1">
            {ordered.map(col => (
              <div
                key={col.id}
                draggable
                onDragStart={() => handleDragStart(col.id)}
                onDragOver={(e) => handleDragOver(e, col.id)}
                onDrop={() => handleDrop(col.id)}
                onDragEnd={() => { setDragId(null); setDragOverId(null); }}
                className={`flex items-center gap-2 px-3 py-1.5 cursor-grab active:cursor-grabbing transition-colors
                  ${dragOverId === col.id ? 'bg-orange-50 border-t-2 border-orange-400' : 'hover:bg-slate-50'}
                  ${dragId === col.id ? 'opacity-40' : ''}`}
              >
                <GripVertical className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
                <button
                  onClick={() => toggleColumn(col.id)}
                  className="flex items-center gap-2 flex-1 min-w-0 text-left"
                >
                  {hidden.has(col.id)
                    ? <EyeOff className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
                    : <Eye className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />
                  }
                  <span className={`text-sm truncate ${hidden.has(col.id) ? 'text-slate-400' : 'text-slate-800 font-medium'}`}>
                    {col.label}
                  </span>
                </button>
              </div>
            ))}
          </div>
          <div className="px-3 py-2 border-t border-slate-100 text-xs text-slate-400">
            Drag to reorder · Click eye to toggle
          </div>
        </div>
      )}
    </div>
  );
};
