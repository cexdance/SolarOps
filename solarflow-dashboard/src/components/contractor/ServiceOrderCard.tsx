// Service Order review card shown inside a contractor's Work Order.
// Links the WO to its parent Service Order (shared number, SO- prefix) and lets
// the contractor review the scope of work (SOW), schedule/completion dates,
// status, location, photos and notes in one read-only place.
import React, { useState } from 'react';
import {
  ClipboardList, ChevronDown, Calendar, CheckCircle2, MapPin, FileText, Image as ImageIcon,
} from 'lucide-react';
import { ContractorJob, JobStatusContractor } from '../../types/contractor';
import { serviceOrderNo, dedupePhotoUrls } from '../../lib/woHelpers';

const STATUS_STYLE: Record<JobStatusContractor, string> = {
  assigned:      'bg-slate-100 text-slate-600',
  en_route:      'bg-orange-100 text-orange-700',
  in_progress:   'bg-blue-100 text-blue-700',
  documentation: 'bg-blue-100 text-blue-700',
  completed:     'bg-emerald-100 text-emerald-700',
  cancelled:     'bg-red-100 text-red-700',
  on_hold:       'bg-amber-100 text-amber-700',
  invoiced:      'bg-indigo-100 text-indigo-700',
  paid:          'bg-emerald-100 text-emerald-700',
  returned:      'bg-red-100 text-red-700',
};

function fmtDate(d?: string): string {
  if (!d) return '-';
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const ServiceOrderCard: React.FC<{ job: ContractorJob }> = ({ job }) => {
  const [sowOpen, setSowOpen] = useState(false);
  // Exclude base64 data: URLs - opening one in a new tab (the gallery links to
  // each photo with target="_blank") crashes iOS Safari on large images. Only
  // uploaded Storage URLs are linkable; un-migrated local photos are skipped here.
  const allPhotos = dedupePhotoUrls(
    (Object.values(job.photos ?? {}).flat() as string[]).filter(u => !!u && !u.startsWith('data:')),
  );
  const location = [job.address, job.city, job.state, job.zip].filter(Boolean).join(', ');
  const notes = [job.notes, job.operationalNotes, job.completionNotes].filter(Boolean);
  const scope = job.scopeItems ?? [];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      {/* Header: link to the Service Order */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-2 min-w-0">
          <ClipboardList className="w-4 h-4 text-orange-500 flex-shrink-0" />
          <span className="text-sm font-semibold text-slate-900">Service Order</span>
          {job.woNumber && (
            <span className="text-xs font-bold text-orange-600 bg-orange-50 border border-orange-200 rounded-md px-2 py-0.5">
              {serviceOrderNo(job.woNumber)}
            </span>
          )}
          {/* Client Number - contractors reference this on invoices */}
          {job.clientId && (
            <span className="text-xs font-bold font-mono text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-2 py-0.5">
              {job.clientId}
            </span>
          )}
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${STATUS_STYLE[job.status] ?? 'bg-slate-100 text-slate-600'}`}>
          {job.status.replace(/_/g, ' ')}
        </span>
      </div>

      <div className="p-4 space-y-3">
        {/* Scope of work (SOW) review */}
        <button
          onClick={() => setSowOpen(o => !o)}
          className="w-full flex items-center justify-between text-left cursor-pointer"
        >
          <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            <FileText className="w-4 h-4 text-slate-400" />
            Scope of Work{scope.length > 0 ? ` (${scope.length})` : ''}
          </span>
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${sowOpen ? 'rotate-180' : ''}`} />
        </button>
        {sowOpen && (
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
            {scope.length > 0 ? (
              <ul className="space-y-1.5">
                {scope.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                    <span className="text-[10px] uppercase font-semibold text-slate-400 bg-white border border-slate-200 rounded px-1.5 py-0.5 mt-0.5 flex-shrink-0">{s.type}</span>
                    <span className="flex-1">{s.description}</span>
                    {s.quantity > 1 && <span className="text-xs text-slate-400 flex-shrink-0">x{s.quantity}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-600 whitespace-pre-wrap">{job.description || 'No scope of work recorded on the Service Order.'}</p>
            )}
          </div>
        )}

        {/* Key facts grid */}
        <div className="grid grid-cols-2 gap-3">
          <Fact icon={<Calendar className="w-3.5 h-3.5" />} label="Scheduled" value={`${fmtDate(job.scheduledDate)}${job.scheduledTime ? ` · ${job.scheduledTime}` : ''}`} />
          <Fact icon={<CheckCircle2 className="w-3.5 h-3.5" />} label="Completed" value={fmtDate(job.completedAt)} />
          <Fact icon={<MapPin className="w-3.5 h-3.5" />} label="Location" value={location || '-'} full />
        </div>

        {/* Photos */}
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            <ImageIcon className="w-3.5 h-3.5" /> Photos ({allPhotos.length})
          </p>
          {allPhotos.length > 0 ? (
            <div className="grid grid-cols-4 gap-1.5">
              {allPhotos.map((src, i) => (
                <a key={i} href={src} target="_blank" rel="noreferrer" className="block aspect-square rounded-lg overflow-hidden bg-slate-100 border border-slate-200">
                  <img src={src} alt="" className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No photos yet.</p>
          )}
        </div>

        {/* Notes */}
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            <FileText className="w-3.5 h-3.5" /> Notes
          </p>
          {notes.length > 0 ? (
            <div className="space-y-1.5">
              {notes.map((n, i) => (
                <p key={i} className="text-sm text-slate-700 whitespace-pre-wrap rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">{n}</p>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No notes recorded.</p>
          )}
        </div>
      </div>
    </div>
  );
};

const Fact: React.FC<{ icon: React.ReactNode; label: string; value: string; full?: boolean }> = ({ icon, label, value, full }) => (
  <div className={full ? 'col-span-2' : ''}>
    <p className="flex items-center gap-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{icon}{label}</p>
    <p className="text-sm text-slate-800 mt-0.5">{value}</p>
  </div>
);

export default ServiceOrderCard;
