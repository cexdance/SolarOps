import React, { useState, useCallback } from 'react';
import {
  format, startOfWeek, endOfWeek, addDays, addWeeks, addMonths,
  subWeeks, subMonths, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameDay, isSameMonth, isToday, isValid,
} from 'date-fns';
import { ChevronLeft, ChevronRight, CalendarDays, User, Clock, Pause, Play } from 'lucide-react';
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
  archived: 'bg-gray-100 text-gray-700 border-gray-200',
};

const statusDotColors: Record<JobStatus, string> = {
  new: 'bg-blue-500',
  assigned: 'bg-slate-400',
  in_progress: 'bg-amber-500',
  completed: 'bg-green-500',
  invoiced: 'bg-purple-500',
  paid: 'bg-emerald-500',
  archived: 'bg-gray-400',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getWeekStart(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 1 }); // Monday
}

function parseDateSafe(dateStr: string | undefined): Date | null {
  if (!dateStr) return null;
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

type Reschedule = (jobId: string, newDate: string) => void;

// Native HTML5 drop target for a calendar day. Returns `over` (for highlight)
// and the drag handlers to spread onto the day container. Drop reschedules the
// dragged job to this day (yyyy-MM-dd).
function useDayDrop(day: Date, onReschedule?: Reschedule) {
  const [over, setOver] = useState(false);
  const enabled = !!onReschedule;
  const props = enabled
    ? {
        onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (!over) setOver(true); },
        onDragLeave: () => setOver(false),
        onDrop: (e: React.DragEvent) => {
          e.preventDefault();
          setOver(false);
          const id = e.dataTransfer.getData('text/plain');
          if (id) onReschedule!(id, format(day, 'yyyy-MM-dd'));
        },
      }
    : {};
  return { over: enabled && over, props };
}

// ── Job Card (planner style) ──────────────────────────────────────────────────

// Format the scheduled time as an hour window. With a known labor duration we
// show "08:00 - 10:00"; otherwise just the start time.
function formatHourWindow(time: string | undefined, laborHours: number | undefined): string {
  if (!time) return '';
  const m = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!m) return time;
  const hrs = laborHours && laborHours > 0 ? laborHours : 0;
  if (!hrs) return time;
  const startMin = Number(m[1]) * 60 + Number(m[2]);
  const endMin = startMin + Math.round(hrs * 60);
  const hh = String(Math.floor((endMin % 1440) / 60)).padStart(2, '0');
  const mm = String(endMin % 60).padStart(2, '0');
  return `${time.slice(0, 5)} - ${hh}:${mm}`;
}

const PlannerJobCard: React.FC<{
  job: Job;
  customer?: Customer;
  contractorName?: string;
  onClick: (jobId: string) => void;
  dimmed?: boolean;
  onToggleHold?: (job: Job) => void;
}> = ({ job, customer, contractorName, onClick, dimmed, onToggleHold }) => {
  const colorClass = statusColors[job.status] ?? 'bg-slate-100 text-slate-700 border-slate-200';
  const name = customer?.name ?? job.clientName ?? `WO ${job.id.slice(0, 6)}`;
  const serviceLabel = job.serviceType
    ? job.serviceType.charAt(0).toUpperCase() + job.serviceType.slice(1)
    : '';
  const hourWindow = formatHourWindow(job.scheduledTime, job.laborHours);

  // Card + an overlaid hold/resume control. The control is a sibling button (not
  // nested in the card button, which is invalid HTML); stopPropagation keeps a
  // hold click from opening the WO.
  return (
    <div className="relative mb-1">
      <button
        onClick={() => onClick(job.id)}
        draggable
        onDragStart={e => { e.dataTransfer.setData('text/plain', job.id); e.dataTransfer.effectAllowed = 'move'; }}
        className={`w-full text-left rounded border px-2 py-1.5 transition-opacity cursor-grab active:cursor-grabbing ${colorClass} ${dimmed ? 'opacity-40' : 'hover:opacity-80'} ${job.onHold ? 'ring-1 ring-amber-400' : ''}`}
      >
        {/* Line 1: US-15xxx + customer name (pad right so the hold button never overlaps) */}
        <p className="text-[11px] font-semibold leading-tight truncate pr-5">
          {customer?.clientId && <span className="opacity-60">{customer.clientId} </span>}
          {name}
        </p>
        {/* Line 2: visit type */}
        {serviceLabel && (
          <p className="text-[9px] opacity-70 leading-tight truncate">{serviceLabel}</p>
        )}
        {/* Line 3: contractor assigned */}
        <p className="text-[9px] leading-tight truncate flex items-center gap-1">
          <User className="w-2.5 h-2.5 flex-shrink-0 opacity-60" />
          <span className={contractorName ? 'opacity-80' : 'opacity-50 italic'}>
            {contractorName || 'Unassigned'}
          </span>
        </p>
        {/* Line 4: hour window */}
        {hourWindow && (
          <p className="text-[9px] font-semibold opacity-60 leading-tight flex items-center gap-1">
            <Clock className="w-2.5 h-2.5 flex-shrink-0" />{hourWindow}
          </p>
        )}
        {job.onHold && (
          <span className="inline-block mt-1 text-[8px] font-bold uppercase tracking-wide text-amber-700 bg-amber-100 rounded px-1 py-0.5">On hold</span>
        )}
      </button>
      {onToggleHold && (
        <button
          onClick={e => { e.stopPropagation(); onToggleHold(job); }}
          title={job.onHold ? 'Resume (remove hold)' : 'Place on hold'}
          aria-label={job.onHold ? 'Resume work order' : 'Place work order on hold'}
          className={`absolute top-1 right-1 p-0.5 rounded transition-colors ${job.onHold ? 'text-amber-600 hover:bg-amber-100' : 'text-slate-400 hover:text-amber-600 hover:bg-white/60'}`}
        >
          {job.onHold ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
        </button>
      )}
    </div>
  );
};

// ── Planner Day Column ────────────────────────────────────────────────────────

const PlannerDayColumn: React.FC<{
  day: Date;
  jobs: Job[];
  customers: Customer[];
  isCurrentMonth: boolean;
  onJobClick: (jobId: string) => void;
  resolveContractor: (job: Job) => string;
  isLastColumn?: boolean;
  onReschedule?: Reschedule;
  onToggleHold?: (job: Job) => void;
}> = ({ day, jobs, customers, isCurrentMonth, onJobClick, resolveContractor, isLastColumn, onReschedule, onToggleHold }) => {
  const today = isToday(day);
  const { over, props: dropProps } = useDayDrop(day, onReschedule);

  return (
    <div
      {...dropProps}
      className={`flex flex-col flex-1 min-w-[110px] border-r ${isLastColumn ? 'border-r-0' : ''} border-slate-200 ${over ? 'ring-2 ring-inset ring-orange-400 bg-orange-50/40' : ''}`}
    >
      {/* Day header */}
      <div className={`flex flex-col items-center py-2 border-b border-slate-200 ${today ? 'bg-orange-50' : 'bg-slate-50'}`}>
        <span className={`text-[10px] font-semibold uppercase tracking-wide ${today ? 'text-orange-500' : 'text-slate-500'}`}>
          {format(day, 'EEE')}
        </span>
        <span className={`text-base font-bold leading-tight ${
          today
            ? 'text-white bg-orange-500 w-7 h-7 rounded-full flex items-center justify-center text-sm'
            : isCurrentMonth ? 'text-slate-800' : 'text-slate-300'
        }`}>
          {format(day, 'd')}
        </span>
      </div>

      {/* Job cards */}
      <div className={`flex-1 p-1.5 min-h-[120px] ${today ? 'bg-orange-50/30' : 'bg-white'} ${!isCurrentMonth ? 'bg-slate-50/60' : ''}`}>
        {jobs.length === 0 ? (
          <div className="h-full flex items-start justify-center pt-4">
            <span className="text-[10px] text-slate-300">-</span>
          </div>
        ) : (
          jobs.map(job => (
            <PlannerJobCard
              key={job.id}
              job={job}
              customer={customers.find(c => c.id === job.customerId)}
              contractorName={resolveContractor(job)}
              onClick={onJobClick}
              dimmed={!isCurrentMonth}
              onToggleHold={onToggleHold}
            />
          ))
        )}
      </div>
    </div>
  );
};

// ── Week Planner (7 columns) ──────────────────────────────────────────────────

const WeekPlanner: React.FC<{
  days: Date[];
  jobs: Job[];
  customers: Customer[];
  onJobClick: (jobId: string) => void;
  resolveContractor: (job: Job) => string;
  onReschedule?: Reschedule;
  onToggleHold?: (job: Job) => void;
}> = ({ days, jobs, customers, onJobClick, resolveContractor, onReschedule, onToggleHold }) => (
  <div className="overflow-x-auto rounded-lg border border-slate-200">
    <div className="flex min-w-[700px]">
      {days.map((day, i) => (
        <PlannerDayColumn
          key={day.toISOString()}
          day={day}
          jobs={getJobsForDay(jobs, day)}
          customers={customers}
          // Every day in the 7-day range is in-scope; never dim (only the Month
          // grid fades leading/trailing days from adjacent months).
          isCurrentMonth
          resolveContractor={resolveContractor}
          onJobClick={onJobClick}
          isLastColumn={i === days.length - 1}
          onReschedule={onReschedule}
          onToggleHold={onToggleHold}
        />
      ))}
    </div>
  </div>
);

// ── 2-Week Planner (2 rows of 7 columns) ─────────────────────────────────────

const TwoWeekPlanner: React.FC<{
  weekStart: Date;
  jobs: Job[];
  customers: Customer[];
  onJobClick: (jobId: string) => void;
  resolveContractor: (job: Job) => string;
  onReschedule?: Reschedule;
  onToggleHold?: (job: Job) => void;
}> = ({ weekStart, jobs, customers, onJobClick, resolveContractor, onReschedule, onToggleHold }) => {
  const week1 = eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) });
  const week2 = eachDayOfInterval({ start: addDays(weekStart, 7), end: addDays(weekStart, 13) });

  const renderRow = (days: Date[]) => (
    <div className="flex min-w-[700px]">
      {days.map((day, i) => (
        <PlannerDayColumn
          key={day.toISOString()}
          day={day}
          jobs={getJobsForDay(jobs, day)}
          customers={customers}
          // All 14 days are in-scope; never dim in the 2-week planner.
          isCurrentMonth
          onJobClick={onJobClick}
          resolveContractor={resolveContractor}
          isLastColumn={i === 6}
          onReschedule={onReschedule}
          onToggleHold={onToggleHold}
        />
      ))}
    </div>
  );

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 space-y-0">
      {renderRow(week1)}
      <div className="border-t-2 border-slate-300" />
      {renderRow(week2)}
    </div>
  );
};

// ── Month Grid (traditional calendar) ────────────────────────────────────────

const MonthDayCell: React.FC<{
  day: Date;
  jobs: Job[];
  customers: Customer[];
  isCurrentMonth: boolean;
  onJobClick: (jobId: string) => void;
  resolveContractor: (job: Job) => string;
  onReschedule?: Reschedule;
  onToggleHold?: (job: Job) => void;
}> = ({ day, jobs, customers, isCurrentMonth, onJobClick, resolveContractor, onReschedule, onToggleHold }) => {
  const [showAll, setShowAll] = useState(false);
  const { over, props: dropProps } = useDayDrop(day, onReschedule);
  const visible = jobs.slice(0, 3);
  const overflow = jobs.length - 3;

  return (
    <div
      {...dropProps}
      className={`min-h-[100px] p-1 border-b border-r border-slate-100 relative ${!isCurrentMonth ? 'bg-slate-50' : 'bg-white'} ${over ? 'ring-2 ring-inset ring-orange-400 bg-orange-50/40' : ''}`}
    >
      <div className="mb-1 text-center">
        {isToday(day) ? (
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-orange-500 text-white text-xs font-bold">
            {format(day, 'd')}
          </span>
        ) : (
          <span className={`text-xs font-medium ${isCurrentMonth ? 'text-slate-700' : 'text-slate-300'}`}>
            {format(day, 'd')}
          </span>
        )}
      </div>
      <div className="space-y-0.5">
        {visible.map(job => (
          <PlannerJobCard
            key={job.id}
            job={job}
            customer={customers.find(c => c.id === job.customerId)}
            contractorName={resolveContractor(job)}
            onClick={onJobClick}
            dimmed={!isCurrentMonth}
            onToggleHold={onToggleHold}
          />
        ))}
        {overflow > 0 && !showAll && (
          <button
            onClick={() => setShowAll(true)}
            className="w-full text-[10px] text-slate-500 hover:text-slate-700 text-left pl-1 py-0.5"
          >
            +{overflow} more
          </button>
        )}
        {showAll && jobs.slice(3).map(job => (
          <PlannerJobCard
            key={job.id}
            job={job}
            customer={customers.find(c => c.id === job.customerId)}
            contractorName={resolveContractor(job)}
            onClick={onJobClick}
            dimmed={!isCurrentMonth}
            onToggleHold={onToggleHold}
          />
        ))}
      </div>
    </div>
  );
};

const MonthGrid: React.FC<{
  focusDate: Date;
  jobs: Job[];
  customers: Customer[];
  onJobClick: (jobId: string) => void;
  resolveContractor: (job: Job) => string;
  onReschedule?: Reschedule;
  onToggleHold?: (job: Job) => void;
}> = ({ focusDate, jobs, customers, onJobClick, resolveContractor, onReschedule, onToggleHold }) => {
  const monthStart = startOfMonth(focusDate);
  const monthEnd = endOfMonth(focusDate);
  const gridStart = getWeekStart(monthStart);
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden">
      {/* Header row */}
      <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200">
        {DAY_LABELS.map(d => (
          <div key={d} className="text-center text-xs font-semibold text-slate-500 py-2 border-r border-slate-200 last:border-r-0">
            {d}
          </div>
        ))}
      </div>
      {/* Day cells */}
      <div className="grid grid-cols-7">
        {days.map(day => (
          <MonthDayCell
            key={day.toISOString()}
            day={day}
            jobs={getJobsForDay(jobs, day)}
            customers={customers}
            isCurrentMonth={isSameMonth(day, monthStart)}
            onJobClick={onJobClick}
            resolveContractor={resolveContractor}
            onReschedule={onReschedule}
            onToggleHold={onToggleHold}
          />
        ))}
      </div>
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

// ── Main Component ────────────────────────────────────────────────────────────

interface WorkOrderCalendarProps {
  jobs: Job[];
  customers: Customer[];
  users: UserType[];
  contractors?: Contractor[];
  isMobile?: boolean;
  onJobClick: (jobId: string) => void;
  /** Drag-to-reschedule: drop a card on a day to set its scheduled date. */
  onReschedule?: Reschedule;
  /** Park/un-park a work order from its calendar card. */
  onToggleHold?: (job: Job) => void;
}

type CalStatusFilter = 'active' | 'on_hold' | 'completed' | 'all';
const CALENDAR_STATUS_KEY = 'solarops_calendar_status_filter';
// Status-filter predicates. "Active" = the working queue: pending/assigned/scheduled/
// in-progress, parked orders and finished (completed/invoiced/paid/archived) hidden.
const statusFilterFns: Record<CalStatusFilter, (j: Job) => boolean> = {
  active: j => !j.onHold && !['completed', 'invoiced', 'paid', 'archived'].includes(j.status),
  on_hold: j => !!j.onHold,
  completed: j => ['completed', 'invoiced', 'paid'].includes(j.status),
  all: () => true,
};

export const WorkOrderCalendar: React.FC<WorkOrderCalendarProps> = ({
  jobs,
  customers,
  contractors = [],
  onJobClick,
  onReschedule,
  onToggleHold,
}) => {
  const [calendarView, setCalendarView] = useState<CalendarViewMode>(() => {
    const saved = localStorage.getItem(CALENDAR_VIEW_KEY) as CalendarViewMode | null;
    return saved ?? 'week';
  });
  const [statusFilter, setStatusFilter] = useState<CalStatusFilter>(() => {
    const saved = localStorage.getItem(CALENDAR_STATUS_KEY) as CalStatusFilter | null;
    return saved ?? 'active';
  });
  const changeStatusFilter = useCallback((f: CalStatusFilter) => {
    setStatusFilter(f);
    localStorage.setItem(CALENDAR_STATUS_KEY, f);
  }, []);

  // Resolve the contractor assigned to a job for display on each card.
  const contractorById = React.useMemo(
    () => new Map(contractors.map(c => [c.id, c])),
    [contractors],
  );
  const resolveContractor = useCallback((job: Job): string => {
    if (!job.contractorId) return '';
    const c = contractorById.get(job.contractorId);
    return c?.businessName || c?.contactName || '';
  }, [contractorById]);

  const [focusDate, setFocusDate] = useState(() => getWeekStart(new Date()));

  const handleViewChange = useCallback((mode: CalendarViewMode) => {
    setCalendarView(mode);
    localStorage.setItem(CALENDAR_VIEW_KEY, mode);
    setFocusDate(prev => getWeekStart(prev));
  }, []);

  const statusVisible = statusFilterFns[statusFilter];
  const visibleJobs = jobs.filter(statusVisible);
  const scheduledJobs = visibleJobs.filter(j => parseDateSafe(j.scheduledDate) !== null);
  const unscheduledJobs = visibleJobs.filter(j => !parseDateSafe(j.scheduledDate));

  const navigateBack = () => {
    if (calendarView === 'month') setFocusDate(d => getWeekStart(startOfMonth(subMonths(addDays(d, 15), 1))));
    else if (calendarView === '2week') setFocusDate(d => subWeeks(d, 2));
    else setFocusDate(d => subWeeks(d, 1));
  };

  const navigateForward = () => {
    if (calendarView === 'month') setFocusDate(d => getWeekStart(startOfMonth(addMonths(addDays(d, 15), 1))));
    else if (calendarView === '2week') setFocusDate(d => addWeeks(d, 2));
    else setFocusDate(d => addWeeks(d, 1));
  };

  const goToToday = () => setFocusDate(getWeekStart(new Date()));

  const getHeaderLabel = () => {
    if (calendarView === 'month') return format(focusDate, 'MMMM yyyy');
    const weekStart = getWeekStart(focusDate);
    if (calendarView === 'week') {
      const weekEnd = addDays(weekStart, 6);
      return isSameMonth(weekStart, weekEnd)
        ? `${format(weekStart, 'MMM d')}, ${format(weekEnd, 'd, yyyy')}`
        : `${format(weekStart, 'MMM d')}, ${format(weekEnd, 'MMM d, yyyy')}`;
    }
    const twoWeekEnd = addDays(weekStart, 13);
    return isSameMonth(weekStart, twoWeekEnd)
      ? `${format(weekStart, 'MMM d')}, ${format(twoWeekEnd, 'd, yyyy')}`
      : `${format(weekStart, 'MMM d')}, ${format(twoWeekEnd, 'MMM d, yyyy')}`;
  };

  const weekStart = getWeekStart(focusDate);
  const weekDays = eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) });

  return (
    <div className="select-none">
      <UnscheduledStrip jobs={unscheduledJobs} customers={customers} onJobClick={onJobClick} />

      {/* Header */}
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

        <div className="flex items-center gap-2 flex-wrap">
          {/* Status filter: defaults to Active so finished/parked orders are hidden. */}
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm">
            {([['active', 'Active'], ['on_hold', 'On Hold'], ['completed', 'Completed'], ['all', 'All']] as [CalStatusFilter, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => changeStatusFilter(key)}
                title={key === 'active' ? 'Pending, assigned, scheduled and in-progress only' : undefined}
                className={`px-2.5 py-1.5 font-medium transition-colors ${
                  statusFilter === key ? 'bg-orange-500 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

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
      </div>

      {/* Calendar body */}
      {calendarView === 'month' ? (
        <MonthGrid focusDate={focusDate} jobs={scheduledJobs} customers={customers} onJobClick={onJobClick} resolveContractor={resolveContractor} onReschedule={onReschedule} onToggleHold={onToggleHold} />
      ) : calendarView === '2week' ? (
        <TwoWeekPlanner
          weekStart={weekStart}
          jobs={scheduledJobs}
          customers={customers}
          onJobClick={onJobClick}
          resolveContractor={resolveContractor}
          onReschedule={onReschedule}
          onToggleHold={onToggleHold}
        />
      ) : (
        <WeekPlanner
          days={weekDays}
          jobs={scheduledJobs}
          customers={customers}
          onJobClick={onJobClick}
          resolveContractor={resolveContractor}
          onReschedule={onReschedule}
          onToggleHold={onToggleHold}
        />
      )}

      {scheduledJobs.length === 0 && unscheduledJobs.length === 0 && (
        <div className="text-center py-16">
          <CalendarDays className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No service orders to display</p>
        </div>
      )}
    </div>
  );
};
