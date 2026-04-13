// Section 3 — Installation: weekly schedule, contractor reports, progress
import React, { useState, useMemo } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, CheckCircle2, Circle,
  Calendar, FileText, User, Clock, Wrench, Truck,
  ClipboardList, Users, X, Zap, TrendingUp, HardHat,
} from 'lucide-react';
import { ContractorJob } from '../types/contractor';
import { ScheduleEntry, ScheduleEntryType } from '../types/project';

// ── Helpers ───────────────────────────────────────────────────────────────────

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day; // start on Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toYMD(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function fmtDate(ymd: string): string {
  return new Date(ymd + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtDay(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

function fmtMonthYear(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

const ENTRY_TYPE_CONFIG: Record<ScheduleEntryType, { label: string; color: string; icon: React.ReactNode }> = {
  work_order: { label: 'Work Order',  color: 'bg-orange-500', icon: <Wrench className="w-3 h-3" /> },
  inspection: { label: 'Inspection',  color: 'bg-blue-500',   icon: <ClipboardList className="w-3 h-3" /> },
  delivery:   { label: 'Delivery',    color: 'bg-green-500',  icon: <Truck className="w-3 h-3" /> },
  meeting:    { label: 'Meeting',     color: 'bg-purple-500', icon: <Users className="w-3 h-3" /> },
  other:      { label: 'Other',       color: 'bg-slate-400',  icon: <Calendar className="w-3 h-3" /> },
};

const JOB_STATUS_COLOR: Record<string, string> = {
  pending:      'bg-slate-100 text-slate-600',
  assigned:     'bg-blue-100 text-blue-700',
  en_route:     'bg-yellow-100 text-yellow-700',
  in_progress:  'bg-orange-100 text-orange-700',
  completed:    'bg-green-100 text-green-700',
  invoiced:     'bg-purple-100 text-purple-700',
  paid:         'bg-emerald-100 text-emerald-700',
};

// ── Add entry modal ────────────────────────────────────────────────────────────

const AddEntryModal: React.FC<{
  date?: string;
  contractorJobs: ContractorJob[];
  linkedJobIds: string[];
  onAdd: (entry: ScheduleEntry) => void;
  onLinkJob: (jobId: string) => void;
  onClose: () => void;
}> = ({ date, contractorJobs, linkedJobIds, onAdd, onLinkJob, onClose }) => {
  const [tab, setTab] = useState<'schedule' | 'link'>('schedule');
  const [form, setForm] = useState({
    date: date ?? toYMD(new Date()),
    title: '',
    type: 'work_order' as ScheduleEntryType,
    contractorName: '',
    notes: '',
  });

  const unlinkedJobs = contractorJobs.filter(j => !linkedJobIds.includes(j.id));

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-900">Add to Installation</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-3 border-b border-slate-100">
          {(['schedule', 'link'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === t ? 'bg-orange-500 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
              {t === 'schedule' ? 'Schedule Entry' : 'Link Contractor Job'}
            </button>
          ))}
        </div>

        <div className="p-4">
          {tab === 'schedule' ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Date</label>
                  <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Type</label>
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as ScheduleEntryType }))}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500">
                    {(Object.keys(ENTRY_TYPE_CONFIG) as ScheduleEntryType[]).map(t => (
                      <option key={t} value={t}>{ENTRY_TYPE_CONFIG[t].label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Title</label>
                <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g., Panel installation — Day 1"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Contractor / Crew</label>
                <input type="text" value={form.contractorName} onChange={e => setForm(f => ({ ...f, contractorName: e.target.value }))}
                  placeholder="Crew name or contractor"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2} placeholder="Optional notes…"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none" />
              </div>
              <button
                onClick={() => {
                  if (!form.title.trim()) return;
                  onAdd({ id: `sch-${Date.now()}`, date: form.date, title: form.title, type: form.type, contractorName: form.contractorName || undefined, notes: form.notes || undefined, completed: false });
                  onClose();
                }}
                disabled={!form.title.trim()}
                className="w-full py-2.5 bg-orange-500 text-white rounded-lg text-sm font-semibold hover:bg-orange-600 disabled:opacity-50">
                Add Entry
              </button>
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {unlinkedJobs.length === 0 ? (
                <p className="text-center py-6 text-sm text-slate-400">No unlinked contractor jobs found</p>
              ) : unlinkedJobs.map(job => (
                <button key={job.id} onClick={() => { onLinkJob(job.id); onClose(); }}
                  className="w-full text-left px-3 py-2.5 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate">{job.customerName}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{job.serviceType} · {job.scheduledDate}</div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${JOB_STATUS_COLOR[job.status] ?? 'bg-slate-100 text-slate-600'}`}>
                      {job.status}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Job Report Modal ──────────────────────────────────────────────────────────

const JOB_PHOTO_LABELS: Record<string, string> = {
  before: 'Before', serial: 'Serial #', parts: 'Parts',
  process: 'Process', after: 'After', progress: 'Progress', ppe: 'PPE',
};

const SERVICE_STATUS_LABELS: Record<string, string> = {
  fully_operational: 'Fully Operational',
  partially_operational: 'Partially Operational',
  pending_parts: 'Pending Parts',
  could_not_complete: 'Could Not Complete',
};

const JobReportModal: React.FC<{
  job: ContractorJob;
  onClose: () => void;
}> = ({ job, onClose }) => {
  const [activePhotoGroup, setActivePhotoGroup] = useState<string | null>(null);
  const allPhotoCats = Object.entries(job.photos ?? {}).filter(([, arr]) => arr.length > 0);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end md:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl my-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-slate-900">{job.serviceType}</h3>
            {job.isNewInstall && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-semibold rounded-full">
                <HardHat className="w-3 h-3" /> New Install
              </span>
            )}
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${JOB_STATUS_COLOR[job.status] ?? 'bg-slate-100 text-slate-600'}`}>
              {job.status}
            </span>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg flex-shrink-0">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Customer & date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs text-slate-400 mb-0.5">Customer</p>
              <p className="text-sm font-medium text-slate-800">{job.customerName}</p>
              <p className="text-xs text-slate-500">{job.address}, {job.city}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs text-slate-400 mb-0.5">Scheduled</p>
              <p className="text-sm font-medium text-slate-800">{fmtDate(job.scheduledDate?.slice(0, 10) ?? '')}</p>
              {job.completedAt && <p className="text-xs text-slate-500">Completed {fmtDate(job.completedAt.slice(0, 10))}</p>}
            </div>
          </div>

          {/* Service status */}
          {job.serviceStatus && (
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs text-slate-400 mb-1">Service Status</p>
              <p className={`text-sm font-semibold ${
                job.serviceStatus === 'fully_operational' ? 'text-green-600' :
                job.serviceStatus === 'partially_operational' ? 'text-yellow-600' :
                'text-red-600'
              }`}>{SERVICE_STATUS_LABELS[job.serviceStatus] ?? job.serviceStatus}</p>
            </div>
          )}

          {/* Notes */}
          {job.completionNotes && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Completion Notes</p>
              <p className="text-sm text-slate-700 bg-slate-50 rounded-xl p-3 whitespace-pre-wrap">{job.completionNotes}</p>
            </div>
          )}
          {job.notes && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Job Notes</p>
              <p className="text-sm text-slate-700 bg-slate-50 rounded-xl p-3 whitespace-pre-wrap">{job.notes}</p>
            </div>
          )}
          {job.nextSteps && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Next Steps</p>
              <p className="text-sm text-slate-700 bg-slate-50 rounded-xl p-3 whitespace-pre-wrap">{job.nextSteps}</p>
            </div>
          )}

          {/* Photos */}
          {allPhotoCats.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Photos</p>
              {/* Photo category tabs */}
              <div className="flex flex-wrap gap-2 mb-3">
                {allPhotoCats.map(([cat, arr]) => (
                  <button key={cat}
                    onClick={() => setActivePhotoGroup(g => g === cat ? null : cat)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      activePhotoGroup === cat
                        ? 'bg-orange-500 text-white border-orange-500'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-orange-300'
                    }`}>
                    {JOB_PHOTO_LABELS[cat] ?? cat}
                    <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${activePhotoGroup === cat ? 'bg-orange-400/40' : 'bg-slate-100 text-slate-500'}`}>
                      {(arr as string[]).length}
                    </span>
                  </button>
                ))}
              </div>
              {/* Photo grid */}
              {activePhotoGroup && (() => {
                const imgs = (job.photos as Record<string, string[]>)[activePhotoGroup] ?? [];
                return (
                  <div className="grid grid-cols-3 gap-2">
                    {imgs.map((src, i) => (
                      <a key={i} href={src} target="_blank" rel="noreferrer" className="aspect-square rounded-xl overflow-hidden bg-slate-100 block">
                        <img src={src} alt={`${activePhotoGroup} ${i + 1}`} className="w-full h-full object-cover hover:opacity-90 transition-opacity" />
                      </a>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Parts used */}
          {job.parts && job.parts.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Parts Used</p>
              <div className="space-y-1.5">
                {job.parts.map(p => (
                  <div key={p.id} className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-xl text-sm">
                    <div>
                      <span className="font-medium text-slate-800">{p.name}</span>
                      {p.partNumber && <span className="text-xs text-slate-400 ml-2">#{p.partNumber}</span>}
                    </div>
                    <div className="text-right">
                      <span className="text-slate-600">×{p.quantity}</span>
                      <span className="text-slate-400 ml-2">${p.totalPrice.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Signature */}
          {(job.signature || job.clientSignature) && (
            <div className="grid grid-cols-2 gap-3">
              {job.signature && (
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs text-slate-400 mb-1">Technician Signature</p>
                  <img src={job.signature} alt="Tech signature" className="max-h-16 object-contain" />
                </div>
              )}
              {job.clientSignature && (
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs text-slate-400 mb-1">Client Signature</p>
                  <img src={job.clientSignature} alt="Client signature" className="max-h-16 object-contain" />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Week calendar ─────────────────────────────────────────────────────────────

const WeekCalendar: React.FC<{
  entries: ScheduleEntry[];
  linkedJobs: ContractorJob[];
  onDayClick: (ymd: string) => void;
  selectedDay: string | null;
}> = ({ entries, linkedJobs, onDayClick, selectedDay }) => {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = toYMD(new Date());

  // Build map: ymd → {entries, jobs}
  const dayMap = useMemo(() => {
    const m: Record<string, { entries: ScheduleEntry[]; jobs: ContractorJob[] }> = {};
    days.forEach(d => { m[toYMD(d)] = { entries: [], jobs: [] }; });
    entries.forEach(e => { if (m[e.date]) m[e.date].entries.push(e); });
    linkedJobs.forEach(j => { const ymd = j.scheduledDate?.slice(0, 10); if (ymd && m[ymd]) m[ymd].jobs.push(j); });
    return m;
  }, [entries, linkedJobs, weekStart]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      {/* Week nav */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setWeekStart(d => addDays(d, -7))} className="p-1.5 hover:bg-slate-100 rounded-lg">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-slate-700">{fmtMonthYear(weekStart)}</span>
        <button onClick={() => setWeekStart(d => addDays(d, 7))} className="p-1.5 hover:bg-slate-100 rounded-lg">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Day columns */}
      <div className="grid grid-cols-7 gap-1">
        {days.map(day => {
          const ymd = toYMD(day);
          const data = dayMap[ymd] ?? { entries: [], jobs: [] };
          const total = data.entries.length + data.jobs.length;
          const isToday = ymd === today;
          const isSelected = ymd === selectedDay;

          return (
            <button
              key={ymd}
              onClick={() => onDayClick(ymd)}
              className={`flex flex-col items-center p-1.5 rounded-xl border transition-all min-h-[72px] ${
                isSelected ? 'border-orange-400 bg-orange-50' :
                isToday    ? 'border-orange-200 bg-orange-50/50' :
                total > 0  ? 'border-slate-200 bg-white hover:border-orange-200' :
                             'border-slate-100 bg-slate-50/50 hover:bg-white'
              }`}
            >
              <span className="text-xs text-slate-400 font-medium">{fmtDay(day)}</span>
              <span className={`text-sm font-bold mt-0.5 w-7 h-7 flex items-center justify-center rounded-full ${
                isToday ? 'bg-orange-500 text-white' : 'text-slate-700'
              }`}>
                {day.getDate()}
              </span>
              {/* Event dots */}
              <div className="flex flex-wrap gap-0.5 mt-1 justify-center">
                {data.entries.slice(0, 3).map(e => (
                  <span key={e.id} className={`w-2 h-2 rounded-full ${ENTRY_TYPE_CONFIG[e.type].color} ${e.completed ? 'opacity-40' : ''}`} title={e.title} />
                ))}
                {data.jobs.slice(0, 3).map(j => (
                  <span key={j.id} className="w-2 h-2 rounded-full bg-blue-500" title={j.serviceType} />
                ))}
                {total > 3 && <span className="text-xs text-slate-400">+{total - 3}</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ── Day detail list ───────────────────────────────────────────────────────────

const DayDetail: React.FC<{
  ymd: string;
  entries: ScheduleEntry[];
  jobs: ContractorJob[];
  onToggleEntry: (id: string) => void;
  onDeleteEntry: (id: string) => void;
  onViewReport: (job: ContractorJob) => void;
}> = ({ ymd, entries, jobs, onToggleEntry, onDeleteEntry, onViewReport }) => {
  if (entries.length === 0 && jobs.length === 0) return (
    <div className="text-center py-6 text-sm text-slate-400">
      No activity scheduled for {fmtDate(ymd)}
    </div>
  );

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{fmtDate(ymd)}</p>
      {entries.map(e => {
        const cfg = ENTRY_TYPE_CONFIG[e.type];
        return (
          <div key={e.id} className={`flex items-start gap-3 p-3 rounded-xl border ${e.completed ? 'bg-green-50/60 border-green-200' : 'bg-white border-slate-200'}`}>
            <button onClick={() => onToggleEntry(e.id)} className="flex-shrink-0 mt-0.5">
              {e.completed
                ? <CheckCircle2 className="w-5 h-5 text-green-500" />
                : <Circle className="w-5 h-5 text-slate-300" />}
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${cfg.color} flex-shrink-0`} />
                <span className={`text-sm font-medium ${e.completed ? 'line-through text-slate-400' : 'text-slate-800'}`}>{e.title}</span>
                <span className="text-xs text-slate-400">{cfg.label}</span>
              </div>
              {e.contractorName && (
                <div className="flex items-center gap-1 mt-0.5 text-xs text-slate-500">
                  <User className="w-3 h-3" />{e.contractorName}
                </div>
              )}
              {e.notes && <p className="text-xs text-slate-400 mt-0.5 truncate">{e.notes}</p>}
            </div>
            <button onClick={() => onDeleteEntry(e.id)} className="p-1 hover:bg-red-50 rounded text-slate-300 hover:text-red-400">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
      {jobs.map(j => (
        <div key={j.id} className="flex items-start gap-3 p-3 rounded-xl border bg-blue-50/40 border-blue-200">
          <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0 mt-0.5">
            <FileText className="w-3 h-3 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-slate-800">{j.serviceType}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${JOB_STATUS_COLOR[j.status] ?? 'bg-slate-100 text-slate-600'}`}>{j.status}</span>
            </div>
            <div className="text-xs text-slate-500 mt-0.5">{j.customerName}</div>
            {j.completionNotes && <p className="text-xs text-slate-400 mt-0.5 truncate">{j.completionNotes}</p>}
            {/* Photo count */}
            {j.photos && (
              <div className="flex gap-2 mt-1 text-xs text-slate-400">
                {Object.entries(j.photos).map(([cat, arr]) =>
                  arr.length > 0 ? <span key={cat}>{cat}: {arr.length}</span> : null
                )}
              </div>
            )}
            <button onClick={() => onViewReport(j)}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium mt-1.5">
              <FileText className="w-3 h-3" /> View Full Report
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

// ── Report list ───────────────────────────────────────────────────────────────

const ReportList: React.FC<{
  entries: ScheduleEntry[];
  jobs: ContractorJob[];
  linkedJobIds: string[];
  onUnlinkJob: (id: string) => void;
  onViewReport: (job: ContractorJob) => void;
}> = ({ entries, jobs, linkedJobIds, onUnlinkJob, onViewReport }) => {
  const allItems = [
    ...entries.map(e => ({ key: e.id, date: e.date, title: e.title, type: 'entry' as const, entry: e })),
    ...jobs.map(j => ({ key: j.id, date: j.scheduledDate?.slice(0, 10) ?? '', title: j.serviceType, type: 'job' as const, job: j })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  if (allItems.length === 0) return (
    <div className="text-center py-6 text-sm text-slate-400">No schedule entries or linked jobs yet</div>
  );

  return (
    <div className="space-y-2">
      {allItems.map(item => item.type === 'entry' ? (
        <div key={item.key} className="flex items-center gap-3 px-3 py-2.5 bg-white rounded-xl border border-slate-200">
          <span className={`w-2.5 h-2.5 rounded-full ${ENTRY_TYPE_CONFIG[item.entry!.type].color} flex-shrink-0`} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-slate-800 truncate">{item.title}</div>
            <div className="text-xs text-slate-400">{fmtDate(item.date)}{item.entry!.contractorName ? ` · ${item.entry!.contractorName}` : ''}</div>
          </div>
          {item.entry!.completed && <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />}
        </div>
      ) : (
        <div key={item.key} className="flex items-center gap-3 px-3 py-2.5 bg-blue-50/50 rounded-xl border border-blue-200">
          <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-800 truncate">{item.job!.serviceType}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${JOB_STATUS_COLOR[item.job!.status] ?? 'bg-slate-100 text-slate-600'}`}>{item.job!.status}</span>
            </div>
            <div className="text-xs text-slate-400">{fmtDate(item.date)} · {item.job!.customerName}</div>
          </div>
          <button onClick={() => onViewReport(item.job!)}
            className="text-xs text-blue-500 hover:text-blue-700 px-1.5 flex items-center gap-1">
            <FileText className="w-3 h-3" />
          </button>
          <button onClick={() => onUnlinkJob(item.key)} className="text-xs text-slate-400 hover:text-red-500 px-1.5">✕</button>
        </div>
      ))}
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

export interface ProjectInstallationSectionProps {
  scheduleEntries: ScheduleEntry[];
  linkedContractorJobIds: string[];
  installationProgress: number;
  contractorJobs: ContractorJob[];      // all contractor jobs (filtered by project inside)
  onChange: (data: {
    scheduleEntries: ScheduleEntry[];
    linkedContractorJobIds: string[];
    installationProgress: number;
  }) => void;
}

export const ProjectInstallationSection: React.FC<ProjectInstallationSectionProps> = ({
  scheduleEntries,
  linkedContractorJobIds,
  installationProgress,
  contractorJobs,
  onChange,
}) => {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [reportJob, setReportJob] = useState<ContractorJob | null>(null);

  const linkedJobs = contractorJobs.filter(j => linkedContractorJobIds.includes(j.id));

  const dayEntries = selectedDay ? scheduleEntries.filter(e => e.date === selectedDay) : [];
  const dayJobs = selectedDay ? linkedJobs.filter(j => j.scheduledDate?.slice(0, 10) === selectedDay) : [];

  const completedEntries = scheduleEntries.filter(e => e.completed).length;
  const completedJobs = linkedJobs.filter(j => j.status === 'completed' || j.status === 'invoiced' || j.status === 'paid').length;
  const totalActivity = scheduleEntries.length + linkedJobs.length;
  const completedActivity = completedEntries + completedJobs;

  const autoProgress = totalActivity > 0 ? Math.round((completedActivity / totalActivity) * 100) : installationProgress;

  const update = (patch: Partial<{ scheduleEntries: ScheduleEntry[]; linkedContractorJobIds: string[]; installationProgress: number }>) => {
    onChange({
      scheduleEntries,
      linkedContractorJobIds,
      installationProgress,
      ...patch,
    });
  };

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-orange-500" />
          <h2 className="font-semibold text-slate-800">Installation</h2>
          <span className="text-xs text-slate-400">Section 3</span>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex gap-1 p-0.5 bg-slate-100 rounded-lg">
            {(['calendar', 'list'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${view === v ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}>
                {v === 'calendar' ? <Calendar className="w-3.5 h-3.5 inline mr-1" /> : <ClipboardList className="w-3.5 h-3.5 inline mr-1" />}
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 text-white text-xs font-semibold rounded-lg hover:bg-orange-600"
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </div>
      </div>

      {/* Progress stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
          <div className="text-lg font-bold text-slate-900">{linkedJobs.length + scheduleEntries.length}</div>
          <div className="text-xs text-slate-500">Activities</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
          <div className="text-lg font-bold text-green-600">{completedActivity}</div>
          <div className="text-xs text-slate-500">Completed</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
          <div className="text-lg font-bold text-orange-500">{installationProgress}%</div>
          <div className="text-xs text-slate-500">Progress</div>
        </div>
      </div>

      {/* Calendar or List */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        {view === 'calendar' ? (
          <>
            <WeekCalendar
              entries={scheduleEntries}
              linkedJobs={linkedJobs}
              selectedDay={selectedDay}
              onDayClick={ymd => setSelectedDay(d => d === ymd ? null : ymd)}
            />
            {selectedDay && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <DayDetail
                  ymd={selectedDay}
                  entries={dayEntries}
                  jobs={dayJobs}
                  onToggleEntry={id => update({
                    scheduleEntries: scheduleEntries.map(e => e.id === id ? { ...e, completed: !e.completed } : e),
                  })}
                  onDeleteEntry={id => update({
                    scheduleEntries: scheduleEntries.filter(e => e.id !== id),
                  })}
                  onViewReport={j => setReportJob(j)}
                />
              </div>
            )}
          </>
        ) : (
          <ReportList
            entries={scheduleEntries}
            jobs={linkedJobs}
            linkedJobIds={linkedContractorJobIds}
            onUnlinkJob={id => update({ linkedContractorJobIds: linkedContractorJobIds.filter(x => x !== id) })}
            onViewReport={j => setReportJob(j)}
          />
        )}
      </div>

      {/* Progress bar + manual override */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-orange-500" />
            <span className="text-sm font-semibold text-slate-800">Installation Progress</span>
          </div>
          <div className="flex items-center gap-2">
            {totalActivity > 0 && (
              <button
                onClick={() => update({ installationProgress: autoProgress })}
                className="text-xs text-orange-500 hover:underline"
              >
                Auto ({autoProgress}%)
              </button>
            )}
            <input
              type="number"
              min={0} max={100}
              value={installationProgress}
              onChange={e => update({ installationProgress: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) })}
              className="w-16 text-sm text-right border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <span className="text-sm text-slate-500">%</span>
          </div>
        </div>
        <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              installationProgress >= 100 ? 'bg-green-500' :
              installationProgress >= 50  ? 'bg-orange-500' :
                                            'bg-orange-400'
            }`}
            style={{ width: `${installationProgress}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-slate-400">
          <span>Not started</span>
          <span className={installationProgress >= 100 ? 'text-green-600 font-semibold' : ''}>
            {installationProgress >= 100 ? '✓ Complete' : `${installationProgress}% done`}
          </span>
          <span>Complete</span>
        </div>
      </div>

      {showAdd && (
        <AddEntryModal
          date={selectedDay ?? undefined}
          contractorJobs={contractorJobs}
          linkedJobIds={linkedContractorJobIds}
          onAdd={entry => update({ scheduleEntries: [...scheduleEntries, entry] })}
          onLinkJob={id => update({ linkedContractorJobIds: [...linkedContractorJobIds, id] })}
          onClose={() => setShowAdd(false)}
        />
      )}
      {reportJob && <JobReportModal job={reportJob} onClose={() => setReportJob(null)} />}
    </div>
  );
};
