// Month calendar of scheduled jobs. Tap a job chip to open it. Shared by the
// contractor portal and the staff dispatch view.
import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ViewJob, PRIORITY_DOT } from './jobViewTypes';

interface JobCalendarViewProps {
  jobs: ViewJob[];
  onOpen: (id: string) => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const JobCalendarView: React.FC<JobCalendarViewProps> = ({ jobs, onOpen }) => {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = ymd(new Date());

  // Bucket jobs by scheduled date for O(1) lookup per cell.
  const byDate = new Map<string, ViewJob[]>();
  for (const j of jobs) {
    if (!j.scheduledDate) continue;
    const arr = byDate.get(j.scheduledDate) ?? [];
    arr.push(j);
    byDate.set(j.scheduledDate, arr);
  }

  // Leading blanks + day cells.
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const monthLabel = cursor.toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-slate-900">{monthLabel}</h2>
        <div className="flex items-center gap-1">
          <button onClick={() => setCursor(new Date(year, month - 1, 1))} className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer">
            <ChevronLeft className="w-4 h-4 text-slate-600" />
          </button>
          <button onClick={() => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); }}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer">
            Today
          </button>
          <button onClick={() => setCursor(new Date(year, month + 1, 1))} className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer">
            <ChevronRight className="w-4 h-4 text-slate-600" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map(w => (
          <div key={w} className="text-center text-[10px] font-bold uppercase text-slate-400 py-1">{w}</div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`b${i}`} className="min-h-[72px]" />;
          const dateStr = ymd(new Date(year, month, day));
          const dayJobs = byDate.get(dateStr) ?? [];
          const isToday = dateStr === todayStr;
          return (
            <div key={dateStr} className={`min-h-[72px] rounded-lg border p-1 ${isToday ? 'border-orange-400 bg-orange-50' : 'border-slate-200 bg-white'}`}>
              <div className={`text-[11px] font-semibold mb-0.5 ${isToday ? 'text-orange-600' : 'text-slate-500'}`}>{day}</div>
              <div className="space-y-0.5">
                {dayJobs.slice(0, 3).map(job => (
                  <button
                    key={job.id}
                    onClick={() => onOpen(job.id)}
                    title={`${job.title} - ${job.statusLabel}`}
                    className="w-full flex items-center gap-1 text-left bg-slate-100 hover:bg-slate-200 rounded px-1 py-0.5 transition-colors cursor-pointer"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PRIORITY_DOT[job.priority]}`} />
                    <span className="text-[10px] text-slate-700 truncate">{job.title}</span>
                    {job.clientNumber && (
                      <span className="text-[8px] px-1 py-0.5 rounded font-bold font-mono bg-blue-100 text-blue-700 flex-shrink-0">
                        {job.clientNumber}
                      </span>
                    )}
                  </button>
                ))}
                {dayJobs.length > 3 && (
                  <div className="text-[9px] text-slate-400 pl-1">+{dayJobs.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default JobCalendarView;
