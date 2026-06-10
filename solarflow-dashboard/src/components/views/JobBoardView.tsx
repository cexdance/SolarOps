// Read-only Kanban board: jobs bucketed into status columns. Tap a card to open
// the job detail (where status changes already happen). Shared by the
// contractor portal and the staff dispatch view.
import React from 'react';
import { MapPin, Clock } from 'lucide-react';
import { ViewJob, BoardColumn, PRIORITY_DOT } from './jobViewTypes';

interface JobBoardViewProps {
  jobs: ViewJob[];
  columns: BoardColumn[];
  onOpen: (id: string) => void;
  /** Optional formatter for the pay/revenue figure; omit to hide money. */
  formatPay?: (n: number) => string;
}

const JobBoardView: React.FC<JobBoardViewProps> = ({ jobs, columns, onOpen, formatPay }) => {
  const byStatus = (status: string) => jobs.filter(j => j.status === status);

  return (
    <div className="flex-1 overflow-x-auto overflow-y-hidden">
      <div className="flex gap-3 p-4 h-full min-w-min">
        {columns.map(col => {
          const colJobs = byStatus(col.id);
          return (
            <div key={col.id} className="flex flex-col w-72 flex-shrink-0 bg-slate-50 rounded-xl border border-slate-200">
              <div className={`flex items-center justify-between px-3 py-2 rounded-t-xl ${col.accent}`}>
                <span className="text-xs font-bold uppercase tracking-wide">{col.label}</span>
                <span className="text-[11px] font-bold bg-white/70 rounded-full px-2 py-0.5">{colJobs.length}</span>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {colJobs.length === 0 ? (
                  <p className="text-center text-xs text-slate-400 py-6">No work orders</p>
                ) : colJobs.map(job => (
                  <button
                    key={job.id}
                    onClick={() => onOpen(job.id)}
                    className="w-full text-left bg-white rounded-lg border border-slate-200 hover:border-orange-300 hover:shadow-sm transition-all p-3"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_DOT[job.priority]}`} />
                      <span className="font-semibold text-sm text-slate-900 truncate">{job.title}</span>
                    </div>
                    <p className="text-xs text-slate-500 flex items-center gap-1 truncate">
                      <MapPin className="w-3 h-3 flex-shrink-0" />{job.city}{job.state ? `, ${job.state}` : ''}
                    </p>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[11px] text-slate-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />{job.scheduledDate ?? '-'}{job.scheduledTime ? ` ${job.scheduledTime}` : ''}
                      </span>
                      {formatPay && typeof job.pay === 'number' && (
                        <span className="text-[11px] font-bold text-emerald-700">{formatPay(job.pay)}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default JobBoardView;
