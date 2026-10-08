import { useState } from 'react';
import type { VisitLabor } from '../types';
export default function VisitLaborEditor({ visitId, entries, onChange }: { visitId: string; entries: VisitLabor[]; onChange: (rows: VisitLabor[]) => void }) {
  const [description, setDescription] = useState('');
  const [hours, setHours] = useState('');
  return <section className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
    <h3 className="text-sm font-semibold text-slate-800">Work done this visit</h3>
    {entries.filter(l => l.visitId === visitId).map(l => <p key={l.id} className="text-sm text-slate-600">{l.description}: {l.hours} hours</p>)}
    <div className="flex flex-wrap gap-2">
      <label className="flex-1 min-w-[160px] text-xs text-slate-600">Work performed<input className="block w-full border rounded-lg p-2 text-sm" value={description} onChange={e => setDescription(e.target.value)} /></label>
      <label className="w-24 text-xs text-slate-600">Hours<input type="number" min="0.01" step="0.25" className="block w-full border rounded-lg p-2 text-sm" value={hours} onChange={e => setHours(e.target.value)} /></label>
    </div>
    <button type="button" className="text-sm font-semibold text-orange-700 disabled:text-slate-400" disabled={!description.trim() || !(Number(hours) > 0) || !Number.isFinite(Number(hours))} onClick={() => {
      onChange([...entries, { id: crypto.randomUUID(), visitId, description: description.trim(), hours: Number(hours), updatedAt: new Date().toISOString() }]); setDescription(''); setHours('');
    }}>Add work</button>
  </section>;
}
