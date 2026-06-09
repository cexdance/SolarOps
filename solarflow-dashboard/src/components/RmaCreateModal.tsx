// SolarOps, shared RMA create modal (standalone or work-order-linked)
import React, { useState } from 'react';
import { X, AlertTriangle, FileText } from 'lucide-react';
import { Job, RMAEntry } from '../types';

interface RmaCreateModalProps {
  jobs?: Job[];
  currentUserName?: string;
  /** Pre-select a work order to link to (e.g. when opened from a WO context). */
  defaultJobId?: string;
  onClose: () => void;
  onCreate: (entry: RMAEntry) => void;
}

const STATUS_OPTS: RMAEntry['status'][] = ['pending', 'submitted', 'approved', 'received'];

export const RmaCreateModal: React.FC<RmaCreateModalProps> = ({
  jobs = [], currentUserName, defaultJobId, onClose, onCreate,
}) => {
  const [manufacturer, setManufacturer] = useState('');
  const [partDescription, setPartDescription] = useState('');
  const [rmaNumber, setRmaNumber] = useState('');
  const [caseNumber, setCaseNumber] = useState('');
  const [status, setStatus] = useState<RMAEntry['status']>('pending');
  const [linkedJobId, setLinkedJobId] = useState(defaultJobId ?? '');
  const [err, setErr] = useState<string | null>(null);

  const jobLabel = (j: Job) =>
    `${j.woNumber ?? (j as Job & { jobNumber?: string }).jobNumber ?? j.id}${j.title ? ' · ' + j.title : ''}`;

  const submit = () => {
    setErr(null);
    if (!manufacturer.trim() || !partDescription.trim()) {
      setErr('Manufacturer and part description are required.');
      return;
    }
    const now = new Date().toISOString();
    onCreate({
      id: `rma-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      manufacturer: manufacturer.trim(),
      partDescription: partDescription.trim(),
      rmaNumber: rmaNumber.trim(),
      caseNumber: caseNumber.trim() || undefined,
      status,
      createdAt: now,
      updatedAt: now,
      createdBy: currentUserName || 'unknown',
      linkedJobId: linkedJobId || undefined,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-orange-500" />
            <h3 className="font-semibold text-slate-900">New RMA</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 space-y-3">
          {err && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 text-red-600 text-xs">
              <AlertTriangle className="w-3.5 h-3.5" /> {err}
            </div>
          )}

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Manufacturer</span>
            <input value={manufacturer} onChange={e => setManufacturer(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="e.g. SolarEdge" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Part description</span>
            <input value={partDescription} onChange={e => setPartDescription(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="e.g. SE7600H inverter" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">RMA #</span>
              <input value={rmaNumber} onChange={e => setRmaNumber(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Case # (optional)</span>
              <input value={caseNumber} onChange={e => setCaseNumber(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </label>
          </div>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Status</span>
            <select value={status} onChange={e => setStatus(e.target.value as RMAEntry['status'])} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white capitalize">
              {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Link to work order (optional)</span>
            <select value={linkedJobId} onChange={e => setLinkedJobId(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="">No work order, standalone RMA</option>
              {jobs.map(j => <option key={j.id} value={j.id}>{jobLabel(j)}</option>)}
            </select>
          </label>

          {!linkedJobId && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>This RMA will <strong>not be linked to a work order</strong>. It will be flagged as unlinked. You can still create it.</span>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
          <button onClick={submit} className="px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600">Create RMA</button>
        </div>
      </div>
    </div>
  );
};
