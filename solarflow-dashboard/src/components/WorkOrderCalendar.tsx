import React, { useState, useCallback } from 'react';
import {
  format, startOfWeek, endOfWeek, addDays, addWeeks, addMonths,
  subWeeks, subMonths, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameDay, isSameMonth, isToday, parseISO, isValid,
} from 'date-fns';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { Job, Customer, User as UserType, JobStatus } from '../types';
import type { Contractor } from '../types/contractor';

// ── Types ─────────────────────────────────────────────────────────────────────

type CalendarViewMode = 'week' | '2week' | 'month';

const CALENDAR_VIEW_KEY = 'solarops_calendar_view';

const statusColors: Record<JobStatus, string> = {
  new: 'bg-blue-100 text-blue-700 border-blue-200',
  assigned: 'bg-slate-100 text-slate-700 border-slate-200',
  in_progress: 'bg-amber-100 text-amber-800 border-amber-200',
  completed: 'bg-green-100 text-green-700 border-green-200',
  invoiced: 'bg-purple-100 text-purple-700 border-purple-200',
  paid: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

const statusDotColors: Record<JobStatus, string> = {
  new: 'bg-blue-500',
  assigned: 'bg-slate-400',
  in_progress: 'bg-amber-500',
  completed: 'bg-green-500',
  invoiced: 'bg-purple-500',
  paid: 'bg-emerald-500',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getWeekStart(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 1 }); // Monday
}

function parseDateSafe(dateStr: string | undefined): Date | null {
  if (!dateStr) return null;
  // scheduledDate is stored as yyyy-mm-dd — parse without timezone conversion
  const parts = dateStr.split('T')[0].split('-');
  if (parts.length !== 3) return null;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return isValid(d) ? d : null;
}

function getJobsForDay(jobs: Job[], day: Date): Job[] {
  return jobs.filter(j => {
    const d = parseDateSafe(j.scheduledDate);
    return d && isSameDay(d, day);
  });
}

// ── Job Pill ──────────────────────────────────────────────────────────────────

const JobPill: React.FC<{
  job: Job;
  customer?: Customer;
  onClick: (jobId: string) => void;
  dimmed?: boolean;
}> = ({ job, customer, onClick, dimmed }) => {
  const colorClass = statusColors[job.status] ?? 'bg-slate-100 text-slate-700 border-slate-200';
  const time = job.scheduledTime ? ` ${job.scheduledTime}` : '';
  const label = customer?.name ?? job.clientName ?? job.id.slice(0, 6);

  return (
    <button
      onClick={() => onClick(job.id)}
      title={`${label}${time} — ${job.status.replace('_', ' ')}`}
      className={`w-full text-left text-[10px] font-medium px-1.5 py-0.5 rounded border truncate transition-opacity ${colorClass} ${dimmed ? 'opacity-50' : 'hover:opacity-80'}`}
    >
      {time && <span className="opacity-60 mr-0.5">{time}</span>}{label}
    </button>
  );
};

// ── Day Cell ──────────────────────────────────────────────────────────────────

const DayCell: React.FC<{
  day: Date;
  jobs: Job[];
  customers: Customer[];
  isCurrentMonth: boolean;
  onJobClick: (jobId: string) => void;
  maxPills?: number;
}> = ({ day, jobs, customers, isCurrentMonth, onJobClick, maxPills = 3 }) => {
  const [showOverflow, setShowOverflow] = useState(false);
  const todayClass = isToday(day)
    ? 'bg-orange-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mx-auto'
    : 'text-xs font-medium';

  const visible = jobs.slice(0, maxPills);
  const overflow = jobs.length - maxPills;

  return (
    <div className={`min-h-[90px] p-1 border-b border-r border-slate-100 relative ${!isCurrentMonth ? 'bg-slate-50' : 'bg-white'}`}>
      <div className={`mb-1 text-center ${isCurrentMonth ? 'text-slate-700' : 'text-slate-300'}`}>
        <span className={todayClass}>{format(day, 'd')}</span>
      </div>
      <div className="space-y-0.5">
        {visible.map(job => (
          <JobPill
            key={job.id}
            job={job}
            customer={customers.find(c => c.id === job.customerId)}
            onClick={onJobClick}
            dimmed={!isCurrentMonth}
          />
        ))}
        {overflow > 0 && (
          <button
            onClick={() => setShowOverflow(true)}
            className="w-full text-[10px] text-slate-500 hover:text-slate-700 text-left pl-1"
          >
            +{overflow} more
          </button>
        )}
      </div>

      {/* Overflow popover */}
      {showOverflow && (
        <div className="absolute top-0 left-0 z-20 bg-white border border-slate-200 rounded-lg shadow-lg p-2 min-w-[180px]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-slate-700">{format(day, 'MMM d')}</span>
            <button onClick={() => setShowOverflow(false)} className="text-slate-400 hover:text-slate-600 text-xs">✕</button>
          </div>
          <div className="space-y-0.5">
            {jobs.map(job => (
              <JobPill
                key={job.id}
                job={job}
                customer={customers.find(c => c.id === job.customerId)}
                onClick={(id) => { onJobClick(id); setShowOverflow(false); }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Unscheduled Strip ─────────────────────────────────────────────────────────

const UnscheduledStrip: React.FC<{
  jobs: Job[];
  customers: Customer[];
  onJobClick: (jobId: string) => void;
}> = ({ jobs, customers, onJobClick }) => {
  if (jobs.length === 0) return null;
  return (
    <div className="mb-4 bg-slate-50 border border-slate-200 rounded-lg p-3">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
        Unscheduled ({jobs.length})
      </p>
      <div className="flex flex-wrap gap-1.5">
        {jobs.map(job => {
          const customer = customers.find(c => c.id === job.customerId);
          const colorClass = statusColors[job.status] ?? 'bg-slate-100 text-slate-700 border-slate-200';
          return (
            <button
              key={job.id}
              onClick={() => onJobClick(job.id)}
              className={`text-xs font-medium px-2 py-1 rounded border truncate max-w-[160px] hover:opacity-80 transition-opacity ${colorClass}`}
              title={customer?.name ?? job.clientName ?? job.id}
            >
              <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${statusDotColors[job.status]}`} />
              {customer?.name ?? job.clientName ?? `WO ${job.id.slice(0, 6)}`}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ── Day Column Header Row ─────────────────────────────────────────────────────

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const DayHeaders: React.FC = () => (
  <div className="grid grid-cols-7 border-l border-t border-slate-200 rounded-t-lg overflow-hidden">
    {DAY_LABELS.map(d => (
      <div key={d} className="text-center text-xs font-semibold text-slate-500 py-2 bg-slate-50 border-b border-r border-slate-200">
        {d}
      </div>
    ))}
  </div>
);

// ── Week Grid (7 days) ────────────────────────────────────────────────────────

const WeekGrid: React.FC<{
  days: Date[];
  jobs: Job[];
  customers: Customer[];
  focusMonth: Date;
  onJobClick: (jobId: string) => void;
}> = ({ days, jobs, customers, focusMonth, onJobClick }) => (
  <div className="border-l border-t border-slate-200 rounded-b-lg overflow-hidden">
    <div className="grid grid-cols-7">
      {days.map(day => (
        <DayCell
          key={day.toISOString()}
          day={day}
          jobs={getJobsForDay(jobs, day)}
          customers={customers}
          isCurrentMonth={isSameMonth(day, focusMonth)}
          onJobClick={onJobClick}
          maxPills={5}
        />
      ))}
    </div>
  </div>
);

// ── Month Grid ────────────────────────────────────────────────────────────────

const MonthGrid: React.FC<{
  focusDate: Date;
  jobs: Job[];
  customers: Customer[];
  onJobClick: (jobId: string) => void;
}> = ({ focusDate, jobs, customers, onJobClick }) => {
  const monthStart = startOfMonth(focusDate);
  const monthEnd = endOfMonth(focusDate);
  const gridStart = getWeekStart(monthStart);
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  return (
    <div className="border-l border-t border-slate-200 rounded-b-lg overflow-hidden">
      <div className="grid grid-cols-7">
        {days.map(day => (
          <DayCell
            key={day.toISOString()}
            day={day}
            jobs={getJobsForDay(jobs, day)}
            customers={customers}
            isCurrentMonth={isSameMonth(day, monthStart)}
            onJobClick={onJobClick}
            maxPills={3}
          />
        ))}
      </div>
    </div>
  );
};

// ── Mobile Agenda View ────────────────────────────────────────────────────────

const AgendaView: React.FC<{
  days: Date[];
  jobs: Job[];
  customers: Customer[];
  onJobClick: (jobId: string) => void;
}> = ({ days, jobs, customers, onJobClick }) => (
  <div className="space-y-4">
    {days.map(day => {
      const dayJobs = getJobsForDay(jobs, day);
      return (
        <div key={day.toISOString()}>
          <div className={`text-sm font-semibold px-1 mb-1 ${isToday(day) ? 'text-orange-500' : 'text-slate-700'}`}>
            {format(day, 'EEEE, MMM d')}
          </div>
          {dayJobs.length === 0 ? (
            <p className="text-xs text-slate-400 px-1">No jobs</p>
          ) : (
            <div className="space-y-1">
              {dayJobs.map(job => (
                <JobPill key={job.id} job={job} customer={customers.find(c => c.id === job.customerId)} onClick={onJobClick} />
              ))}
            </div>
          )}
        </div>
      );
    })}
  </div>
);

// ── Main Component ────────────────────────────────────────────────────────────

interface WorkOrderCalendarProps {
  jobs: Job[];
  customers: Customer[];
  users: UserType[];
  contractors?: Contractor[];
  isMobile?: boolean;
  onJobClick: (jobId: string) => void;
}

export const WorkOrderCalendar: React.FC<WorkOrderCalendarProps> = ({
  jobs,
  customers,
  isMobile = false,
  onJobClick,
}) => {
  const [calendarView, setCalendarView] = useState<CalendarViewMode>(() => {
    const saved = localStorage.getItem(CALENDAR_VIEW_KEY) as CalendarViewMode | null;
    return saved ?? 'week';
  });

  const [focusDate, setFocusDate] = useState(() => getWeekStart(new Date()));

  const handleViewChange = useCallback((mode: CalendarViewMode) => {
    setCalendarView(mode);
    localStorage.setItem(CALENDAR_VIEW_KEY, mode);
    // Keep focusDate anchored to the current week start when switching
    setFocusDate(prev => getWeekStart(prev));
  }, []);

  // ── Separate scheduled vs unscheduled ──
  const scheduledJobs = jobs.filter(j => {
    const d = parseDateSafe(j.scheduledDate);
    return d !== null;
  });
  const unscheduledJobs = jobs.filter(j => !parseDateSafe(j.scheduledDate));

  // ── Navigation ──
  const navigateBack = () => {
    if (calendarView === 'month') setFocusDate(d => getWeekStart(startOfMonth(subMonths(d, 1))));
    else if (calendarView === '2week') setFocusDate(d => subWeeks(d, 2));
    else setFocusDate(d => subWeeks(d, 1));
  };

  const navigateForward = () => {
    if (calendarView === 'month') setFocusDate(d => getWeekStart(startOfMonth(addMonths(d, 1))));
    else if (calendarView === '2week') setFocusDate(d => addWeeks(d, 2));
    else setFocusDate(d => addWeeks(d, 1));
  };

  const goToToday = () => setFocusDate(getWeekStart(new Date()));

  // ── Date range label ──
  const getHeaderLabel = () => {
    if (calendarView === 'month') return format(focusDate, 'MMMM yyyy');
    const weekStart = getWeekStart(focusDate);
    if (calendarView === 'week') {
      const weekEnd = addDays(weekStart, 6);
      return isSameMonth(weekStart, weekEnd)
        ? `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'd, yyyy')}`
        : `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d, yyyy')}`;
    }
    // 2-week
    const twoWeekEnd = addDays(weekStart, 13);
    return isSameMonth(weekStart, twoWeekEnd)
      ? `${format(weekStart, 'MMM d')} – ${format(twoWeekEnd, 'd, yyyy')}`
      : `${format(weekStart, 'MMM d')} – ${format(twoWeekEnd, 'MMM d, yyyy')}`;
  };

  // ── Build visible days array ──
  const getVisibleDays = (): Date[] => {
    const weekStart = getWeekStart(focusDate);
    if (calendarView === 'week') return eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) });
    if (calendarView === '2week') return eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 13) });
    // month — visible days handled inside MonthGrid
    return eachDayOfInterval({ start: startOfMonth(focusDate), end: endOfMonth(focusDate) });
  };

  const visibleDays = getVisibleDays();

  return (
    <div className="select-none">
      {/* Unscheduled strip */}
      <UnscheduledStrip jobs={unscheduledJobs} customers={customers} onJobClick={onJobClick} />

      {/* Calendar header */}
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            onClick={navigateBack}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h2 className="text-sm font-semibold text-slate-800 min-w-[180px] text-center">
            {getHeaderLabel()}
          </h2>
          <button
            onClick={navigateForward}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={goToToday}
            className="px-2.5 py-1 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600"
          >
            Today
          </button>
        </div>

        {/* View mode switcher */}
        <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm">
          {(['week', '2week', 'month'] as CalendarViewMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => handleViewChange(mode)}
              className={`px-3 py-1.5 font-medium transition-colors ${
                calendarView === mode
                  ? 'bg-slate-800 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {mode === 'week' ? '7-Day' : mode === '2week' ? '2-Week' : 'Month'}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar grid */}
      {isMobile ? (
        <AgendaView days={visibleDays} jobs={scheduledJobs} customers={customers} onJobClick={onJobClick} />
      ) : (
        <>
          <DayHeaders />
          {calendarView === 'month' ? (
            <MonthGrid focusDate={focusDate} jobs={scheduledJobs} customers={customers} onJobClick={onJobClick} />
          ) : (
            <WeekGrid
              days={calendarView === '2week'
                ? eachDayOfInterval({ start: getWeekStart(focusDate), end: addDays(getWeekStart(focusDate), 13) })
                : eachDayOfInterval({ start: getWeekStart(focusDate), end: addDays(getWeekStart(focusDate), 6) })
              }
              jobs={scheduledJobs}
              customers={customers}
              focusMonth={focusDate}
              onJobClick={onJobClick}
            />
          )}
        </>
      )}

      {/* Empty state */}
      {scheduledJobs.length === 0 && unscheduledJobs.length === 0 && (
        <div className="text-center py-16">
          <CalendarDays className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No work orders to display</p>
        </div>
      )}
    </div>
  );
};
