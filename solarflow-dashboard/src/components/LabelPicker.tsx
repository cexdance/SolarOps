// Multi-select label dropdown, mirroring the Trello label picker. Check as many
// labels as needed from the board catalog; selected labels render as chips (here
// and, via labelChipClass, on the kanban cards). Stored on Job.labels.
import React, { useRef, useState, useEffect } from 'react';
import { Tag, Check, ChevronDown } from 'lucide-react';
import type { JobLabel } from '../types';
import { LABEL_CATALOG, hasLabel, toggleLabel } from '../lib/labelCatalog';
import { labelChipClass } from '../lib/trelloLabels';

export const LabelPicker: React.FC<{
  value: JobLabel[];
  onChange: (labels: JobLabel[]) => void;
}> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const selected = value ?? [];

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
        >
          <Tag className="w-3.5 h-3.5 text-slate-500" />
          Labels{selected.length ? ` (${selected.length})` : ''}
          <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {selected.map((l, i) => (
          <span key={i} className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${labelChipClass(l.color)}`}>{l.name}</span>
        ))}
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-72 max-h-72 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-xl p-1.5 space-y-1">
          {LABEL_CATALOG.map(l => {
            const on = hasLabel(selected, l.name);
            return (
              <button
                key={l.name}
                type="button"
                onClick={() => onChange(toggleLabel(selected, l))}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded border text-left text-xs font-semibold ${labelChipClass(l.color)} ${on ? 'ring-2 ring-slate-400' : ''}`}
              >
                <span className="w-4 shrink-0">{on && <Check className="w-4 h-4" />}</span>
                <span className="flex-1 truncate">{l.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
