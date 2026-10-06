// Which visit the tech is standing in, on a service order that takes several
// trips. The photos, report and labor they enter below always belong to THIS
// visit (JobDetail stamps activeVisitId on each), so the screen has to say
// which one that is, and let them reread what the earlier trips found.
// Collapsed by default: on a phone the history is reference material, not the
// task at hand.
import React, { useState } from 'react';
import { CalendarCheck, ChevronDown, X } from 'lucide-react';
import type { ContractorJob } from '../../types/contractor';
import type { WOVisit } from '../../types';
import VisitHistory from '../VisitHistory';

const fmt = (d?: string) => {
  if (!d) return '';
  const t = new Date(d.length === 10 ? `${d}T12:00:00` : d);
  return isNaN(t.getTime()) ? d : t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

/** One earlier visit, full screen: the report at readable size and photos big
 *  enough to actually check a serial against, which the thumbnail strip is not.
 *  Exported for the render test. */
export const VisitDetail: React.FC<{ visit: WOVisit; onClose: () => void }> = ({ visit, onClose }) => (
  <div className="fixed inset-0 z-50 bg-white flex flex-col">
    <div className="flex items-center justify-between gap-2 px-4 py-3 pt-safe border-b border-slate-200 bg-slate-50">
      <div className="min-w-0">
        <p className="text-sm font-bold text-slate-900">Visit {visit.number}</p>
        <p className="text-xs text-slate-500">{fmt(visit.date)}</p>
      </div>
      <button onClick={onClose} aria-label="Close visit" className="p-2 rounded-xl hover:bg-slate-200 cursor-pointer">
        <X className="w-5 h-5 text-slate-600" />
      </button>
    </div>
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {visit.serviceType && <p className="text-base font-semibold text-slate-900">{visit.serviceType}</p>}
      <section>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Work done</p>
        <p className="text-sm text-slate-800 whitespace-pre-wrap">{visit.workDone || 'No work notes recorded.'}</p>
      </section>
      {visit.nextSteps && (
        <section>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Left to do</p>
          <p className="text-sm text-slate-800 whitespace-pre-wrap">{visit.nextSteps}</p>
        </section>
      )}
      {visit.labor && visit.labor.length > 0 && (
        <section>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Labor</p>
          {visit.labor.map(l => <p key={l.id} className="text-sm text-slate-800">{l.description}, {l.hours} hours</p>)}
        </section>
      )}
      {visit.parts && visit.parts.length > 0 && (
        <section>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Parts</p>
          {visit.parts.map(p => <p key={p.id} className="text-sm text-slate-800">{p.name}{p.quantity > 1 ? ` x${p.quantity}` : ''}</p>)}
        </section>
      )}
      {visit.photoUrls.length > 0 && (
        <section>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Photos ({visit.photoUrls.length})</p>
          <div className="grid grid-cols-2 gap-2">
            {visit.photoUrls.map(src => (
              <a key={src} href={src} target="_blank" rel="noreferrer" className="block aspect-square rounded-xl overflow-hidden bg-slate-100 border border-slate-200">
                <img src={src} alt={`Visit ${visit.number} photo`} loading="lazy" className="w-full h-full object-cover" />
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  </div>
);

const VisitBanner: React.FC<{ job: ContractorJob }> = ({ job }) => {
  const done = job.visits ?? [];
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<WOVisit | null>(null);
  // Single-trip order: nothing to disambiguate and nothing to review.
  if (!job.currentVisit && done.length === 0) return null;
  const number = job.currentVisit?.number ?? done.length + 1;

  return (
    <div className="bg-white rounded-2xl border border-orange-200 overflow-hidden">
      <div className="px-4 py-3 bg-orange-50 border-b border-orange-200 space-y-1">
        <div className="flex items-center gap-2">
          <CalendarCheck className="w-4 h-4 text-orange-500 flex-shrink-0" />
          <span className="text-sm font-bold text-slate-900">Visit {number} of {Math.max(number, done.length)}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase bg-orange-600 text-white">Current</span>
        </div>
        {job.currentVisit && (
          <>
            <p className="text-sm font-semibold text-slate-800">{job.currentVisit.serviceType}</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{job.currentVisit.reason}</p>
          </>
        )}
        <p className="text-xs text-slate-500">Photos and the report you add go on this visit.</p>
      </div>

      {done.length > 0 && (
        <>
          <button
            onClick={() => setOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-3 text-left cursor-pointer"
          >
            <span className="text-sm font-semibold text-slate-700">
              Review earlier visits ({done.length})
            </span>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
          {open && <div className="px-4 pb-4"><VisitHistory visits={done} onOpen={setDetail} /></div>}
        </>
      )}
      {detail && <VisitDetail visit={detail} onClose={() => setDetail(null)} />}
    </div>
  );
};

export default VisitBanner;
