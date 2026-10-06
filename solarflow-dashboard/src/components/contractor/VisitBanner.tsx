// Which visit the tech is standing in, on a service order that takes several
// trips. The photos, report and labor they enter below always belong to THIS
// visit (JobDetail stamps activeVisitId on each), so the screen has to say
// which one that is, and let them reread what the earlier trips found.
// Collapsed by default: on a phone the history is reference material, not the
// task at hand.
import React, { useState } from 'react';
import { CalendarCheck, ChevronDown } from 'lucide-react';
import type { ContractorJob } from '../../types/contractor';
import VisitHistory from '../VisitHistory';

const VisitBanner: React.FC<{ job: ContractorJob }> = ({ job }) => {
  const done = job.visits ?? [];
  const [open, setOpen] = useState(false);
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
          {open && <div className="px-4 pb-4"><VisitHistory visits={done} /></div>}
        </>
      )}
    </div>
  );
};

export default VisitBanner;
