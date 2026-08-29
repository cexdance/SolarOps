// SolarFlow MVP - Jobs Component
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { formatMoney } from '../lib/money';
import {
  Plus, Search, Calendar, MapPin, User, Clock, X, Wrench, Zap, LayoutGrid, List as ListIcon,
  Power, Cpu, ClipboardCheck, PauseCircle, PlayCircle, ArrowUpDown, Archive,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths,
} from 'date-fns';
import { WorkOrderCalendar } from './WorkOrderCalendar';
import { pipelineDropPatch } from '../lib/woHelpers';
import { labelChipClass } from '../lib/trelloLabels';
import { resolvePriority, sortJobsBy, JOB_SORT_OPTIONS, type JobSortOption } from '../lib/jobSort';
import JobMapView from './views/JobMapView';
import { ViewJob, ViewJobPriority } from './views/jobViewTypes';
import {
  Job, Customer, User as UserType, JobStatus, UrgencyLevel, WO_TO_JOB_STATUS, WOStatus,
  PipelineStage, PIPELINE_STAGES, PIPELINE_STAGE_LABEL, WOLineItem,
} from '../types';

// Map UrgencyLevel onto the shared map-view priority palette.
const MAP_PRIORITY: Record<UrgencyLevel, ViewJobPriority> = {
  critical: 'critical', high: 'high', medium: 'normal', low: 'low',
};

// The board groups by `status`, but RMA/imported service orders often carry a stale
// or undefined `status` while their real pipeline state lives in `woStatus`.
// Respect `status` when it's a valid column (so drag-drop, which writes only
// `status`, keeps working), otherwise derive the column from `woStatus`, and
// finally fall back to "new" so NO service order is ever invisible on the board.
const BOARD_COLUMN_STATUSES: JobStatus[] = ['new', 'assigned', 'in_progress', 'completed', 'invoiced', 'paid'];
function boardStatus(job: Job): JobStatus {
  if (job.status === 'archived') return 'archived' as JobStatus;
  // `woStatus` is the authoritative pipeline stage (the WO panel advances it).
  // The coarse `status` can drift, e.g. a board drag set it without updating
  // woStatus, which made the list badge disagree with the panel. Derive the
  // column from woStatus when present, then fall back to status.
  const fromWo = job.woStatus ? WO_TO_JOB_STATUS[job.woStatus as WOStatus] : undefined;
  if (fromWo) return fromWo;
  if (job.status && BOARD_COLUMN_STATUSES.includes(job.status)) return job.status;
  return 'new';
}
// Representative woStatus for each board column, used when a drag moves a card to
// a column its current woStatus doesn't already map to, keeps status + woStatus
// in sync so they can never drift apart again.
const COLUMN_TO_WOSTATUS: Record<string, WOStatus> = {
  new: 'quote_approved', assigned: 'scheduled', in_progress: 'in_progress',
  completed: 'completed', invoiced: 'invoiced', paid: 'paid',
};

// Precise pipeline-stage labels (match the WO panel). The card badge shows THIS,
// not the coarse 6-bucket name, so the badge and the panel pipeline always agree
// (e.g. a quote_approved WO reads "Quote Approved", not the coarse "new").
const WO_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', quote_sent: 'Quote Sent', contact_client: 'Contact Client',
  quote_approved: 'Quote Approved', scheduled: 'Scheduled', in_progress: 'In Progress',
  completed: 'Completed', invoiced: 'Invoiced', paid: 'Paid', archived: 'Archived',
};
function badgeLabel(job: Job): string {
  if (job.status === 'archived') return 'Archived';
  if (job.woStatus && WO_STATUS_LABEL[job.woStatus]) return WO_STATUS_LABEL[job.woStatus];
  return boardStatus(job).replace('_', ' ');
}
import { ServiceOrderPanel } from './ServiceOrderPanel';
import { LeadPanel } from './LeadPanel';
import { leadToCustomer, formatImportedAt } from '../lib/leadConvert';
import { claimClientNumber } from '../lib/clientRegistry';

// Contractor workload buckets for the per-contractor filter summary. Uses the raw
// `contractorJobStatus` (mirrored from the contractor portal) so "on route"
// (en_route) reads apart from "in progress"; falls back to the coarse board status
// for jobs the contractor hasn't touched yet (just assigned).
type ContractorBucket = 'assigned' | 'on_route' | 'in_progress' | 'completed';
function contractorBucket(job: Job): ContractorBucket {
  const raw = job.contractorJobStatus;
  if (raw === 'completed' || boardStatus(job) === 'completed') return 'completed';
  if (raw === 'en_route') return 'on_route';
  if (raw === 'in_progress' || raw === 'documentation' || boardStatus(job) === 'in_progress') return 'in_progress';
  return 'assigned';
}

// ─── Standalone sub-components (defined outside Jobs to prevent remount on parent re-render) ───

// Work-type badge: flags whether the WO is an Inverter, Optimizer, or simple
// site visit. Derived from the service code first, then a text fallback so older
// WOs without a code still classify. Site Transfer is intentionally excluded.
type WoCategory = { label: string; color: string; Icon: LucideIcon };
function woCategory(job: Job): WoCategory | null {
  const code = (job.serviceCode ?? '').toUpperCase();
  const text = `${job.title ?? ''} ${job.description ?? ''} ${job.notes ?? ''} ${(job.lineItems ?? []).map(l => l.description ?? '').join(' ')}`.toLowerCase();
  if (code === 'SITE-TRX') return null;
  if (code.startsWith('INV-') || /\binverter\b/.test(text)) {
    return { label: 'Inverter', color: 'bg-orange-100 text-orange-700', Icon: Power };
  }
  if (code.startsWith('OPT-') || /optimizer|micro[\s-]?inverter/.test(text)) {
    return { label: 'Optimizer', color: 'bg-cyan-100 text-cyan-700', Icon: Cpu };
  }
  if (code.startsWith('SITE-') || /site visit|inspection/.test(text)) {
    return { label: 'Site Visit', color: 'bg-teal-100 text-teal-700', Icon: ClipboardCheck };
  }
  return null;
}

const statusColors: Record<JobStatus, string> = {
  new: 'bg-blue-100 text-blue-700 border-blue-200',
  assigned: 'bg-slate-100 text-slate-700 border-slate-200',
  in_progress: 'bg-amber-100 text-amber-700 border-amber-200',
  completed: 'bg-green-100 text-green-700 border-green-200',
  invoiced: 'bg-purple-100 text-purple-700 border-purple-200',
  paid: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  archived: 'bg-gray-100 text-gray-700 border-gray-200',
};

// Priority is a DOT, not a pill. The card already carries a status pill; a
// second and third colored pill beside it left nothing reading as urgent, so
// red now appears on a card for exactly one reason.
const urgencyDot: Record<UrgencyLevel, string> = {
  low: 'bg-slate-300',
  medium: 'bg-amber-400',
  high: 'bg-red-500',
  critical: 'bg-red-600 ring-2 ring-red-200',
};

const urgencyLabels: Record<UrgencyLevel, string> = {
  low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical',
};

// ─── Board sort ────────────────────────────────────────────────────────────
// One sort applies uniformly across the Kanban columns and the List view, so
// card order stays consistent when switching between them. Moved to
// lib/jobSort.ts so the Billing board can share it; re-exported here for the
// existing importers and resolvePriority.test.ts.
export { resolvePriority, sortJobsBy, JOB_SORT_OPTIONS } from '../lib/jobSort';
export type { JobSortOption } from '../lib/jobSort';

interface JobCardProps {
  job: Job;
  customer: Customer | undefined;
  technician: UserType | undefined;
  contractorName?: string;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent, jobId: string) => void;
  onDragEnd: () => void;
  onClick: (jobId: string) => void;
  onToggleHold?: (job: Job) => void;
}

const JobCard: React.FC<JobCardProps> = ({ job, customer, contractorName, isDragging, onDragStart, onDragEnd, onClick, onToggleHold }) => {
  const handleCardClick = (_e: React.MouseEvent) => {
    // Only trigger click if not dragging and no drag is in progress
    if (!isDragging) {
      onClick(job.id);
    }
  };

  return (
  <div
    draggable
    onDragStart={e => onDragStart(e, job.id)}
    onDragEnd={onDragEnd}
    onClick={handleCardClick}
    className={`rounded-xl border p-3 hover:shadow-md transition-all ${
      job.isPowercare ? 'bg-orange-50/70 border-orange-200' : 'bg-white border-slate-200'
    } ${isDragging ? 'cursor-grabbing opacity-40 scale-95' : 'cursor-pointer hover:border-orange-300'} select-none`}
  >
    {/* Trello-style label chips at the very top, mirroring the source card. */}
    {job.labels && job.labels.length > 0 && (
      <div className="flex flex-wrap gap-1 mb-2">
        {job.labels.map((lb, i) => (
          <span key={i} className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${labelChipClass(lb.color)}`}>
            {lb.name}
          </span>
        ))}
      </div>
    )}
    {/* Identity row. The order number, the priority dot and the ONE status pill
        share a single line, which frees the full card width for the name below
        instead of squeezing it against a right-hand badge stack. Hold state is
        carried by the On Hold column and the green Resume button, so the status
        pill keeps showing the real pipeline stage even while parked. */}
    <div className="flex items-center gap-1.5 mb-1.5">
      {(() => {
        const p = resolvePriority(job);
        return (
          <span
            title={`${urgencyLabels[p]} priority`}
            className={`w-[7px] h-[7px] rounded-full shrink-0 ${urgencyDot[p]}`}
          />
        );
      })()}
      {(job.clientId || customer?.clientId) && (
        <span className="text-[11px] text-slate-500 font-mono whitespace-nowrap">{job.clientId || customer?.clientId}</span>
      )}
      {job.isPowercare && <Zap className="w-3 h-3 text-indigo-600 fill-indigo-600 shrink-0" />}
      <span className="flex-1" />
      <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${statusColors[boardStatus(job)]}`}>
        {badgeLabel(job)}
      </span>
    </div>

    {/* Fall back to clientName: an intake lead (S1 "Leads" column) has no
        customer record yet, and without this the whole card renders blank.
        Wraps to two lines rather than `truncate`, which cut names mid-word. */}
    <h3 className="font-semibold text-slate-900 text-sm leading-snug line-clamp-2 [overflow-wrap:anywhere] [text-wrap:pretty]">
      {customer?.name || job.clientName || 'Unnamed lead'}
    </h3>
    {(customer?.address || customer?.city) && (
      <p className="flex gap-1 mt-1 text-[11.5px] text-slate-500 leading-snug">
        <MapPin className="w-3 h-3 shrink-0 mt-[2px]" />
        <span className="line-clamp-2 [overflow-wrap:anywhere]">
          {[customer?.address, customer?.city].filter(Boolean).join(', ')}
        </span>
      </p>
    )}
    {/* Work type and assignee are context, not status: monochrome glyph plus
        label, so the status pill stays the only colored badge on the card.
        PowerCare moved up to the bolt beside the order number. */}
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-2 mb-2 text-[11.5px] text-slate-600">
      {(() => {
        const cat = woCategory(job);
        return cat ? (
          <span className="flex items-center gap-1 min-w-0">
            <cat.Icon className="w-3.5 h-3.5 shrink-0 text-slate-400" />
            <span className="truncate">{cat.label}</span>
          </span>
        ) : null;
      })()}
      {/* Contractor assignment doesn't apply yet on a pure LL lead card, that
          happens once it converts to a real service order (has a woNumber). */}
      {!isPipelineOnly(job) && (
        job.contractorId ? (
          <span className="flex items-center gap-1 min-w-0">
            <User className="w-3.5 h-3.5 shrink-0 text-slate-400" />
            <span className="truncate">{contractorName ?? 'Assigned'}</span>
          </span>
        ) : (
          <span className="flex items-center gap-1 min-w-0 font-semibold text-amber-700">
            <User className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Unassigned</span>
          </span>
        )
      )}
    </div>
    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
      <div className="flex items-center gap-2.5 text-[11.5px] text-slate-500">
        {isPipelineOnly(job) ? (
          /* A lead has no schedule yet: the webhook writes scheduledDate/Time
             empty on purpose so it buckets as "unscheduled" rather than landing
             on today's calendar. That left this row rendering two bare icons, so
             show when the lead came in instead. */
          <span
            className="flex items-center gap-1"
            title={job.createdAt ? `Imported ${new Date(job.createdAt).toLocaleString()}` : undefined}
          >
            <Calendar className="w-3 h-3" />Imported {formatImportedAt(job.createdAt)}
          </span>
        ) : (
          <>
            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{job.scheduledDate?.split('T')[0] ?? job.scheduledDate}</span>
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{job.scheduledTime}</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        {/* Icon-only: the label repeated the icon, and at a 218px column that
            row was the first thing to run out of width. Name lives in `title`. */}
        {onToggleHold && (
          job.onHold ? (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleHold(job); }}
              title="Resume"
              aria-label="Resume"
              className="flex items-center justify-center w-[26px] h-[26px] rounded-lg text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
            >
              <PlayCircle className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleHold(job); }}
              title="Hold"
              aria-label="Hold"
              className="flex items-center justify-center w-[26px] h-[26px] rounded-lg text-slate-500 bg-slate-100 hover:bg-slate-200"
            >
              <PauseCircle className="w-4 h-4" />
            </button>
          )
        )}
        {/* formatMoney is a policy gate: with SHOW_MONEY off it returns "-", so
            rendering it unconditionally put a bare dash on every card. */}
        {(() => {
          const money = formatMoney(job.totalAmount, { decimals: 0 });
          return money && money !== '-' ? <span className="font-semibold text-slate-900">{money}</span> : null;
        })()}
      </div>
    </div>
  </div>
  );
};

interface KanbanColumnProps {
  status: JobStatus | 'on_hold' | PipelineStage | 'unstaged';
  title: string;
  columnJobs: Job[];
  allJobs: Job[];
  draggedJobId: string | null;
  customers: Customer[];
  users: UserType[];
  contractors: import('../types/contractor').Contractor[];
  sortBy: JobSortOption;
  onUpdateJob: (job: Job) => void;
  onDragStart: (e: React.DragEvent, jobId: string) => void;
  onDragEnd: () => void;
  onCardClick: (jobId: string) => void;
  onToggleHold: (job: Job) => void;
}

// Keyed by status OR pipeline stage; unlisted keys fall back to neutral slate.
const colColors: Record<string, string> = {
  new: 'bg-blue-50 border-blue-200',
  on_hold: 'bg-slate-100 border-slate-300',
  assigned: 'bg-slate-50 border-slate-200',
  in_progress: 'bg-amber-50 border-amber-200',
  completed: 'bg-green-50 border-green-200',
  invoiced: 'bg-purple-50 border-purple-200',
  paid: 'bg-emerald-50 border-emerald-200',
  archived: 'bg-gray-50 border-gray-200',
  // Pipeline stages (Tryout board)
  leads: 'bg-sky-50 border-sky-200',
  needs_first_quote: 'bg-blue-50 border-blue-200',
  first_quote_in_progress: 'bg-indigo-50 border-indigo-200',
  site_transfer_processing: 'bg-violet-50 border-violet-200',
  site_transfer_completed: 'bg-purple-50 border-purple-200',
  service_quote_in_progress: 'bg-amber-50 border-amber-200',
  needs_scheduling: 'bg-orange-50 border-orange-200',
  needs_follow_up: 'bg-rose-50 border-rose-200',
  work_done_collect: 'bg-teal-50 border-teal-200',
  done: 'bg-green-50 border-green-200',
  email_follow_up: 'bg-yellow-50 border-yellow-200',
  closed_won: 'bg-emerald-50 border-emerald-200',
  closed_archived: 'bg-gray-50 border-gray-200',
};

// Column header dot. The tinted column background alone is too washed out to
// tell columns apart at a glance once they are 218px wide.
const colDot: Record<string, string> = {
  new: 'bg-blue-500',
  on_hold: 'bg-slate-400',
  assigned: 'bg-slate-500',
  in_progress: 'bg-amber-500',
  completed: 'bg-green-500',
  invoiced: 'bg-purple-500',
  paid: 'bg-emerald-500',
  archived: 'bg-gray-400',
  leads: 'bg-sky-500',
  needs_first_quote: 'bg-blue-500',
  first_quote_in_progress: 'bg-indigo-500',
  site_transfer_processing: 'bg-violet-500',
  site_transfer_completed: 'bg-purple-500',
  service_quote_in_progress: 'bg-amber-500',
  needs_scheduling: 'bg-orange-500',
  needs_follow_up: 'bg-rose-500',
  work_done_collect: 'bg-teal-500',
  done: 'bg-green-500',
  email_follow_up: 'bg-yellow-500',
  closed_won: 'bg-emerald-500',
  closed_archived: 'bg-gray-400',
};

// A Job with a pipeline stage but no work-order number is a pure LL funnel card
// (a Trello lead / converted card), not a real service order. These render ONLY
// on the LL board, never the main Service Orders board / list / map / count.
const isPipelineOnly = (j: Job) => !!j.pipelineStage && !j.woNumber;

const PIPELINE_STAGE_SET = new Set<string>(PIPELINE_STAGES);
const isPipelineStage = (s: string): s is PipelineStage => PIPELINE_STAGE_SET.has(s);

const JOBS_VIEW_MODES = ['list', 'kanban', 'calendar', 'map', 'tryout'] as const;
type JobsViewMode = typeof JOBS_VIEW_MODES[number];

const KanbanColumn: React.FC<KanbanColumnProps> = ({
  status, title, columnJobs, allJobs, draggedJobId,
  customers, users, contractors, sortBy, onUpdateJob, onDragStart, onDragEnd, onCardClick, onToggleHold,
}) => {
  const [isOver, setIsOver] = useState(false);
  // Sort is per-column, not board-wide: each column keeps its own independent order.
  const sortedJobs = useMemo(() => sortJobsBy(columnJobs, sortBy, contractors), [columnJobs, sortBy, contractors]);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsOver(true); };
  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if leaving the column itself, not a child
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsOver(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(false);
    const jobId = e.dataTransfer.getData('jobId');
    if (!jobId) return;
    const job = allJobs.find(j => j.id === jobId);
    if (!job) return;
    // Tryout board: pipeline stage is orthogonal to status/woStatus, so a drop
    // here moves ONLY pipelineStage. Execution status, billing and contractor
    // visibility are deliberately left alone.
    // Unstaged pulls the order back off the funnel. Neither branch touches
    // status, so a Tryout drag can never archive or reopen a service order.
    if (isPipelineStage(status) || status === 'unstaged') {
      const patch = pipelineDropPatch(job, status);
      if (patch) onUpdateJob({ ...job, ...patch });
      return;
    }
    // Drop on the On Hold column = park the order (keep its underlying stage).
    if (status === 'on_hold') {
      if (!job.onHold) onUpdateJob({ ...job, onHold: true, onHoldAt: new Date().toISOString() });
      return;
    }
    // Drop on a status column = un-park (if held) and/or move stage.
    const needsStatus = boardStatus(job) !== status;
    if (job.onHold || needsStatus) {
      // Keep the fine-grained woStatus if it already maps to the target column;
      // otherwise move it to a representative woStatus so the coarse `status` and
      // the pipeline `woStatus` stay consistent (no more invoiced-vs-quote drift).
      const keepWo = job.woStatus && WO_TO_JOB_STATUS[job.woStatus as WOStatus] === status;
      const woStatus = needsStatus ? (keepWo ? job.woStatus : COLUMN_TO_WOSTATUS[status]) : job.woStatus;
      // Stamp completedAt when moving INTO Completed so a completed WO always carries
      // a completion date (drives the billing lifecycle); preserve an existing one.
      const completedAt = status === 'completed' ? (job.completedAt || new Date().toISOString()) : job.completedAt;
      onUpdateJob({ ...job, status, woStatus, completedAt, onHold: false, onHoldAt: undefined });
    }
  };

  // Fixed width, not `flex-1 min-w-[280px]`: flex-grow stretched 4 columns across
  // the viewport so the 5th was always clipped at the edge. At 218px six columns
  // fit a 1440px window and the rest scroll predictably.
  return (
    <div
      className={`w-[218px] shrink-0 rounded-xl border-2 transition-colors duration-150 p-2 ${
        isOver ? 'border-orange-400 bg-orange-50' : colColors[status]
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* The per-column Sort dropdown lived here, one identical copy in each of
          the 7 (or 14 on LL) column headers. Sort is now board-wide and lives
          once in the control bar. */}
      <div className="flex items-center gap-2 px-1 pb-2.5">
        <span className={`w-[7px] h-[7px] rounded-full shrink-0 ${colDot[status] ?? 'bg-slate-400'}`} />
        <h3 title={title} className="font-semibold text-slate-800 text-[13px] flex-1 truncate">{title}</h3>
        <span className="text-[11px] font-semibold text-slate-500 bg-white border border-slate-200 px-2 rounded-full">{columnJobs.length}</span>
      </div>
      <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-260px)]">
        {sortedJobs.map(job => (
          <JobCard
            key={job.id}
            job={job}
            customer={customers.find(c => c.id === job.customerId)}
            technician={users.find(u => u.id === job.technicianId)}
            contractorName={contractors.find(c => c.id === job.contractorId)?.contactName}
            isDragging={draggedJobId === job.id}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onClick={onCardClick}
            onToggleHold={onToggleHold}
          />
        ))}
        {columnJobs.length === 0 && (
          <div className={`border-2 border-dashed rounded-lg py-6 text-center text-sm transition-colors ${
            isOver ? 'border-orange-400 text-orange-500' : 'border-slate-200 text-slate-400'
          }`}>
            {isOver ? '↓ Drop here' : 'No jobs'}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

interface JobsProps {
  jobs: Job[];
  customers: Customer[];
  users: UserType[];
  contractors?: import('../types/contractor').Contractor[];
  onCreateJob: (job: Partial<Job>) => Job;
  onUpdateJob: (job: Job) => void;
  onDeleteJob: (jobId: string) => void;
  onCreateCustomer: (customer: Partial<Customer>) => string;
  onViewChange: (view: string, jobId?: string) => void;
  isMobile: boolean;
  currentUser: UserType | null;
}

export const Jobs: React.FC<JobsProps> = ({
  jobs,
  customers,
  users,
  contractors = [],
  onCreateJob,
  onUpdateJob,
  onCreateCustomer,
  onViewChange,
  isMobile,
  currentUser,
}) => {
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [createCustomer, setCreateCustomer] = useState<Customer | null>(null);
  const [editingCreatedJob, setEditingCreatedJob] = useState<Job | null>(null);
  // A customerless card is a LEAD (no Service Order panel can open it); it opens
  // the LeadPanel instead. Set to the job id being worked as a lead.
  const [leadPanelJobId, setLeadPanelJobId] = useState<string | null>(null);
  // Last resolved lead, so a transient miss in `jobs` cannot unmount the panel.
  const lastLeadRef = useRef<Job | null>(null);

  // ── Persist filters/sort to localStorage, so they survive a page leave/return
  // (same pattern as Customers.tsx's loadView/saveView). ─────────────────────
  const FILTERS_KEY = 'solarops_jobs_filters';
  const loadFilters = <T,>(key: string, fallback: T): T => {
    try {
      const raw = localStorage.getItem(FILTERS_KEY);
      if (!raw) return fallback;
      const saved = JSON.parse(raw);
      return key in saved ? saved[key] : fallback;
    } catch { return fallback; }
  };
  const saveFilters = (patch: Record<string, unknown>) => {
    try {
      const raw = localStorage.getItem(FILTERS_KEY);
      const saved = raw ? JSON.parse(raw) : {};
      localStorage.setItem(FILTERS_KEY, JSON.stringify({ ...saved, ...patch }));
    } catch (e) { console.error('[Jobs] saveFilters failed', e); }
  };

  const [searchQuery, setSearchQuery] = useState(() => loadFilters('searchQuery', ''));
  const [filterStatus, setFilterStatus] = useState<JobStatus | 'all' | 'on_hold'>(
    () => loadFilters('filterStatus', 'all' as JobStatus | 'all' | 'on_hold')
  );
  const [filterContractor, setFilterContractor] = useState<string>(() => loadFilters('filterContractor', 'all'));
  const [showArchived, setShowArchived] = useState(() => loadFilters('showArchived', false));
  const [showOnHold, setShowOnHold] = useState(() => loadFilters('showOnHold', false));
  const [powerCareOnly, setPowerCareOnly] = useState(() => loadFilters('powerCareOnly', false));
  // Sort is per-Kanban-column (each column keeps its own independent order); the
  // flat List view gets one sort since it has no columns to separate.
  const [listSortBy, setListSortBy] = useState<JobSortOption>(() => loadFilters('listSortBy', 'none' as JobSortOption));
  type PeriodFilter = 'all' | 'this_week' | 'this_month' | 'last_month' | 'custom';
  const [filterPeriod, setFilterPeriod] = useState<PeriodFilter>(() => loadFilters('filterPeriod', 'all' as PeriodFilter));
  const [customFrom, setCustomFrom] = useState(() => loadFilters('customFrom', ''));
  const [customTo, setCustomTo] = useState(() => loadFilters('customTo', ''));

  // Persist whenever a filter/sort changes.
  React.useEffect(() => { saveFilters({ searchQuery }); }, [searchQuery]);
  React.useEffect(() => { saveFilters({ filterStatus }); }, [filterStatus]);
  React.useEffect(() => { saveFilters({ filterContractor }); }, [filterContractor]);
  React.useEffect(() => { saveFilters({ showArchived }); }, [showArchived]);
  React.useEffect(() => { saveFilters({ showOnHold }); }, [showOnHold]);
  React.useEffect(() => { saveFilters({ powerCareOnly }); }, [powerCareOnly]);
  React.useEffect(() => { saveFilters({ listSortBy }); }, [listSortBy]);
  React.useEffect(() => { saveFilters({ filterPeriod }); }, [filterPeriod]);
  React.useEffect(() => { saveFilters({ customFrom }); }, [customFrom]);
  React.useEffect(() => { saveFilters({ customTo }); }, [customTo]);

  const [viewMode, setViewMode] = useState<JobsViewMode>(() => {
    const saved = localStorage.getItem('solarops_jobs_view') as JobsViewMode | null;
    if (saved && JOBS_VIEW_MODES.includes(saved)) return saved;
    return isMobile ? 'list' : 'kanban';
  });

  const handleViewMode = (mode: JobsViewMode) => {
    setViewMode(mode);
    localStorage.setItem('solarops_jobs_view', mode);
  };
  const [draggedJobId, setDraggedJobId] = useState<string | null>(null);

  const technicians = users.filter((u) => u.role === 'technician' || u.role === 'coo');

  // Period date range
  const periodRange = useMemo<{ start: Date; end: Date } | null>(() => {
    const now = new Date();
    switch (filterPeriod) {
      case 'this_week':
        return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
      case 'this_month':
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case 'last_month': {
        const prev = subMonths(now, 1);
        return { start: startOfMonth(prev), end: endOfMonth(prev) };
      }
      case 'custom':
        if (customFrom && customTo) return { start: new Date(customFrom), end: new Date(customTo + 'T23:59:59') };
        if (customFrom) return { start: new Date(customFrom), end: new Date('2099-12-31') };
        if (customTo) return { start: new Date('2000-01-01'), end: new Date(customTo + 'T23:59:59') };
        return null;
      default:
        return null;
    }
  }, [filterPeriod, customFrom, customTo]);

  const archivedCount = useMemo(() => jobs.filter(j => j.status === 'archived' && !showArchived).length, [jobs, showArchived]);
  const onHoldCount = useMemo(() => jobs.filter(j => j.onHold && j.status !== 'archived').length, [jobs]);
  const powerCareCount = useMemo(() => jobs.filter(j => j.isPowercare && j.status !== 'archived').length, [jobs]);

  // Shared job predicate. `includeHeld` lets the calendar receive parked orders
  // (it has its own On Hold / Active status filter) while the list + kanban keep
  // the board's "Show On Hold" gating.
  // forLL: the LL funnel board groups by pipelineStage, an axis orthogonal to
  // execution. The contractor and status filters (meant for the work-order
  // board) would gut it, intake/funnel cards have no contractor and their
  // status is always 'new', so a contractor or status filter hides them all.
  // The LL board keeps only search / powercare / period / archived.
  const jobMatches = useCallback((job: Job, includeHeld: boolean, forLL = false) => {
    const customer = customers.find((c) => c.id === job.customerId);
    const matchesSearch =
      !searchQuery ||
      customer?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customer?.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.notes.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = forLL ? true : (
      filterStatus === 'all' ? true :
      filterStatus === 'on_hold' ? !!job.onHold :
      boardStatus(job) === filterStatus);
    const matchesContractor = forLL || filterContractor === 'all' || job.contractorId === filterContractor;
    const matchesPowerCare = !powerCareOnly || !!job.isPowercare;
    // Period filter, uses scheduledDate or createdAt
    let matchesPeriod = true;
    if (periodRange) {
      const dateStr = job.scheduledDate || job.createdAt;
      if (dateStr) {
        const d = new Date(dateStr.split('T')[0]);
        matchesPeriod = d >= periodRange.start && d <= periodRange.end;
      } else {
        matchesPeriod = false; // no date → excluded when period filter active
      }
    }
    // Filter out archived jobs unless toggle is enabled
    const isArchived = job.status === 'archived';
    const notArchived = !isArchived || showArchived;
    // Held orders are parked: hidden from the queue unless "Show On Hold" is on or
    // the admin is explicitly filtering to On Hold (the calendar passes includeHeld).
    const notHeld = forLL || includeHeld || !job.onHold || showOnHold || filterStatus === 'on_hold';

    return matchesSearch && matchesStatus && matchesContractor && matchesPowerCare && matchesPeriod && notArchived && notHeld;
  }, [customers, searchQuery, filterStatus, filterContractor, powerCareOnly, periodRange, showArchived, showOnHold]);

  const filteredJobs = useMemo(() => jobs.filter(j => jobMatches(j, false)), [jobs, jobMatches]);
  // The LL funnel board ignores the contractor/status filters (see forLL above).
  const llJobs = useMemo(() => jobs.filter(j => jobMatches(j, false, true)), [jobs, jobMatches]);
  // Real service orders for the main board/list/map/count. LL-only funnel cards
  // (pipeline stage, no woNumber) are excluded here and live only on the LL board.
  const boardJobs = useMemo(() => filteredJobs.filter(j => !isPipelineOnly(j)), [filteredJobs]);
  // The calendar always receives held orders; its own status filter shows/hides them.
  const calendarJobs = useMemo(() => jobs.filter(j => jobMatches(j, true)), [jobs, jobMatches]);

  // Held orders for the kanban "On Hold" column - always shown there (independent of
  // the Show On Hold toggle and status filter), matching the search/contractor/period
  // filters. Hold is an orthogonal flag, so these are pulled out of their status column.
  const boardHeldJobs = useMemo(() => jobs.filter((job) => {
    if (!job.onHold || job.status === 'archived') return false;
    const customer = customers.find((c) => c.id === job.customerId);
    const matchesSearch =
      !searchQuery ||
      customer?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customer?.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.notes.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesContractor = filterContractor === 'all' || job.contractorId === filterContractor;
    const matchesPowerCare = !powerCareOnly || !!job.isPowercare;
    let matchesPeriod = true;
    if (periodRange) {
      const dateStr = job.scheduledDate || job.createdAt;
      matchesPeriod = dateStr ? (() => { const d = new Date(dateStr.split('T')[0]); return d >= periodRange.start && d <= periodRange.end; })() : false;
    }
    return matchesSearch && matchesContractor && matchesPowerCare && matchesPeriod;
  }), [jobs, customers, searchQuery, filterContractor, powerCareOnly, periodRange]);

  // One board-wide sort drives the List view AND every Kanban/LL column, so
  // card order stays consistent when switching views. It used to be per-column,
  // which meant 7 identical dropdowns on the board and 14 on LL.
  const sortedListJobs = useMemo(
    () => sortJobsBy(boardJobs, listSortBy, contractors),
    [boardJobs, listSortBy, contractors]
  );

  // Per-contractor workload summary (Assigned / On Route / In Progress / Completed).
  // Computed across ALL of the selected contractor's non-archived jobs, independent of
  // the status filter, so the admin always sees the full live picture for that person.
  const contractorSummary = useMemo(() => {
    if (filterContractor === 'all') return null;
    const counts: Record<ContractorBucket, number> = { assigned: 0, on_route: 0, in_progress: 0, completed: 0 };
    for (const job of jobs) {
      if (job.contractorId !== filterContractor) continue;
      if (job.status === 'archived') continue;
      counts[contractorBucket(job)] += 1;
    }
    return counts;
  }, [jobs, filterContractor]);

  const selectedContractorName = useMemo(() => {
    if (filterContractor === 'all') return '';
    const c = contractors.find(c => c.id === filterContractor);
    return c?.businessName || c?.contactName || 'Contractor';
  }, [contractors, filterContractor]);

  // Adapt the filtered jobs to the shared map-view shape. The map geocodes each
  // address (cached) and plots colored pins; JobMapView owns its own status filter.
  const mapJobs = useMemo<ViewJob[]>(() => {
    const custById = new Map(customers.map(c => [c.id, c]));
    return boardJobs.map(job => {
      const c = custById.get(job.customerId);
      const status = String(boardStatus(job));
      return {
        id: job.id,
        title: c?.name ?? job.woNumber ?? 'Service order',
        address: c?.address ?? '', city: c?.city ?? '', state: c?.state ?? '', zip: c?.zip ?? '',
        status,
        statusLabel: status.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase()),
        priority: MAP_PRIORITY[job.priority ?? 'medium'] ?? 'normal',
        scheduledDate: job.scheduledDate,
        serviceType: String(job.serviceType),
        badge: job.woNumber,
        clientNumber: c?.clientId || '',
      } satisfies ViewJob;
    });
  }, [boardJobs, customers]);

  const handleDragStart = (e: React.DragEvent, jobId: string) => {
    e.dataTransfer.setData('jobId', jobId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedJobId(jobId);
  };

  // A customerless job is a lead: the Service Order panel needs a customer, so
  // route it to the LeadPanel instead. Everything else opens the SO panel.
  const handleCardClick = (jobId: string) => {
    const j = jobs.find(x => x.id === jobId);
    if (j && !j.customerId) { setLeadPanelJobId(jobId); return; }
    onViewChange('jobDetail', jobId);
  };

  // Convert a lead to a client: create the Customer from the lead's fields, link
  // it to the job, and advance the card to the first quote stage.
  // Converting a lead claims its US-1XXXX number in the client registry sheet
  // (name written next to the number) before the Customer exists here, so the
  // sheet stays the authority on the consecutive numbering. A failed registry
  // write aborts the conversion: converting anyway would drift the two apart.
  const handleConvertLead = async (lead: Job) => {
    const payload = leadToCustomer(lead);
    let clientId = lead.clientId;
    try {
      const reg = await claimClientNumber(payload.name ?? '', lead.clientId);
      if (reg?.taken) {
        const ok = window.confirm(
          `${reg.clientId} is already assigned to "${reg.name}" in the client registry sheet.\n\n` +
          `Convert this lead anyway, leaving the sheet unchanged?`
        );
        if (!ok) return;
      } else if (reg) {
        clientId = reg.clientId;
      }
    } catch (err) {
      window.alert(`Could not update the client registry sheet:\n\n${(err as Error).message}\n\nNothing was converted. Try again.`);
      return;
    }
    const customerId = onCreateCustomer({ ...payload, clientId });
    // A converted lead starts as a site transfer: the SolarEdge ownership move is
    // the first thing we do for a new client. Flat $120, no field work.
    // ponytail: the rate lives in contractorStore (sr-20); duplicated here so the
    // conversion doesn't need the catalog loaded. Read the catalog if it ever moves.
    onUpdateJob({
      ...lead,
      clientId,
      customerId,
      solarEdgeClientId: clientId,
      leadInfo: undefined,
      pipelineStage: 'needs_first_quote',
      serviceCode: 'SITE-TRX',
      serviceType: 'Site Transfer',
      quoteAmount: 120,
      lineItems: (lead.lineItems ?? []).some(li => li.description.toLowerCase().includes('site transfer'))
        ? lead.lineItems
        : [...(lead.lineItems ?? []), {
            id: `li-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            type: 'other' as WOLineItem['type'],
            description: 'Site Transfer, SolarEdge ownership transfer (admin agentic workflow)',
            quantity: 1,
            unitCost: 120,
            totalCost: 120,
          }],
      updatedAt: new Date().toISOString(),
    });
    setLeadPanelJobId(null);
  };

  // Calendar drag-to-reschedule: stamp the new scheduled date (yyyy-MM-dd) plus
  // updatedAt so the sync engine keeps the change (LWW). No-op if the date is
  // unchanged so we don't churn sync rows on an accidental drop.
  const handleReschedule = (jobId: string, newDate: string) => {
    const job = jobs.find(j => j.id === jobId);
    if (!job || (job.scheduledDate ?? '').split('T')[0] === newDate) return;
    onUpdateJob({ ...job, scheduledDate: newDate, updatedAt: new Date().toISOString() });
  };

  // Park / un-park a service order. Hold drops it out of the active queue on both
  // the admin board and the contractor portal; the underlying woStatus is kept so
  // Resume returns it to its place in the pipeline.
  const handleToggleHold = (job: Job) =>
    onUpdateJob({
      ...job,
      onHold: !job.onHold,
      onHoldAt: !job.onHold ? new Date().toISOString() : undefined,
    });

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        {/* The count sat on its own line under the heading, which cost a row of
            vertical space for a number that only matters next to the title. */}
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-bold text-slate-900">Service Orders</h1>
          <span className="text-sm text-slate-500">{boardJobs.length} showing</span>
        </div>
        {currentUser?.role !== 'support' && (
          <button
            onClick={() => setShowCustomerPicker(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 text-white font-medium rounded-lg hover:bg-orange-600 transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>New Job</span>
          </button>
        )}
      </div>

      {/* Control bar. This was THREE stacked rows (view toggles / filters /
          search) costing ~214px before the board started. One row, 52px: the
          board now begins roughly a card higher in every column. */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex h-[38px] rounded-lg border border-slate-200 overflow-hidden shrink-0">
          <button
            onClick={() => handleViewMode('tryout')}
            title="LL (Lead Lobby) - multi-state pipeline"
            className={`px-3 text-xs font-semibold flex items-center justify-center ${viewMode === 'tryout' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            LL
          </button>
          {([
            { mode: 'kanban', title: 'Board', Icon: LayoutGrid },
            { mode: 'list', title: 'List', Icon: ListIcon },
            { mode: 'calendar', title: 'Calendar', Icon: Calendar },
            { mode: 'map', title: 'Map', Icon: MapPin },
          ] as const).map(({ mode, title, Icon }) => (
            <button
              key={mode}
              onClick={() => handleViewMode(mode)}
              title={title}
              aria-label={title}
              className={`w-[38px] flex items-center justify-center border-l border-slate-200 ${viewMode === mode ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-w-[130px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, order number or address"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-[38px] pl-9 pr-3 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          />
        </div>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as JobStatus | 'all' | 'on_hold')}
          className="h-[38px] px-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-xs text-slate-600 shrink-0"
        >
          <option value="all">All Status</option>
          <option value="new">New</option>
          <option value="assigned">Assigned</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="invoiced">Invoiced</option>
          <option value="paid">Paid</option>
          <option value="on_hold">On Hold</option>
        </select>
        {contractors.length > 0 && (
          <select
            value={filterContractor}
            onChange={(e) => setFilterContractor(e.target.value)}
            className="h-[38px] px-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-xs text-slate-600 max-w-[180px] shrink-0"
          >
            <option value="all">All Contractors</option>
            {contractors
              .filter((c) => c.status === 'approved')
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.businessName || c.contactName}
                </option>
              ))}
          </select>
        )}
        <select
          value={filterPeriod}
          onChange={(e) => setFilterPeriod(e.target.value as PeriodFilter)}
          className="h-[38px] px-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-xs text-slate-600 shrink-0"
        >
          <option value="all">All Time</option>
          <option value="this_week">This Week</option>
          <option value="this_month">This Month</option>
          <option value="last_month">Last Month</option>
          <option value="custom">Custom Dates</option>
        </select>
        {filterPeriod === 'custom' && (
          <div className="flex items-center gap-1.5 shrink-0">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="h-[38px] px-2 bg-white border border-slate-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <span className="text-slate-400 text-xs">to</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="h-[38px] px-2 bg-white border border-slate-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
        )}

        <div className="w-px h-5 bg-slate-200 shrink-0" />

        {/* The three toggles carried a full label plus a count each, which is
            what forced the filter row to wrap. The count is the information;
            the icon carries the meaning and the name lives in the tooltip. */}
        {([
          { on: showOnHold, set: () => setShowOnHold(!showOnHold), title: 'On Hold', Icon: PauseCircle, count: onHoldCount },
          { on: powerCareOnly, set: () => setPowerCareOnly(v => !v), title: 'PowerCare', Icon: Zap, count: powerCareCount },
          { on: showArchived, set: () => setShowArchived(!showArchived), title: 'Archive', Icon: Archive, count: archivedCount },
        ] as const).map(({ on, set, title, Icon, count }) => (
          <button
            key={title}
            type="button"
            onClick={set}
            title={title}
            aria-label={title}
            aria-pressed={on}
            className={`flex items-center gap-1 h-[38px] px-2 rounded-lg border text-xs font-semibold shrink-0 transition-colors ${
              on ? 'bg-orange-50 text-orange-700 border-orange-500' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Icon className="w-4 h-4" />
            {count > 0 && count}
          </button>
        ))}

        <div className="relative shrink-0">
          <ArrowUpDown className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <select
            value={listSortBy}
            onChange={(e) => setListSortBy(e.target.value as JobSortOption)}
            title="Sort service orders"
            className="h-[38px] pl-7 pr-1 max-w-[132px] bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-xs text-slate-600 cursor-pointer"
          >
            {JOB_SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* Per-contractor workload summary */}
      {contractorSummary && (
        <div className="flex flex-wrap items-center gap-3 mb-6 p-3 rounded-xl border border-slate-200 bg-slate-50">
          <div className="flex items-center gap-1.5 pr-3 mr-1 border-r border-slate-200">
            <User className="w-4 h-4 text-orange-500" />
            <span className="text-sm font-semibold text-slate-900">{selectedContractorName}</span>
          </div>
          {([
            { key: 'assigned',    label: 'Assigned',    cls: 'bg-slate-100 text-slate-700' },
            { key: 'on_route',    label: 'On Route',    cls: 'bg-blue-100 text-blue-700' },
            { key: 'in_progress', label: 'In Progress', cls: 'bg-amber-100 text-amber-700' },
            { key: 'completed',   label: 'Completed',   cls: 'bg-green-100 text-green-700' },
          ] as const).map(({ key, label, cls }) => (
            <div key={key} className="flex items-center gap-1.5">
              <span className={`inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 rounded-full text-xs font-bold ${cls}`}>
                {contractorSummary[key]}
              </span>
              <span className="text-xs font-medium text-slate-600">{label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Kanban View. 'On Hold' is a dedicated column right of New (hold is an
          orthogonal flag, so held orders are pulled out of their status column). */}
      {viewMode === 'kanban' && (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {(['on_hold', 'new', 'assigned', 'in_progress', 'completed', 'invoiced', 'paid'] as const).map(col => (
            <KanbanColumn
              key={col}
              status={col}
              title={col === 'on_hold' ? 'On Hold' : col.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
              // Group by the EFFECTIVE board status (derives from woStatus when the
              // raw status is stale/undefined) so RMA/imported service orders land in
              // the right column WITHOUT needing a manual save, and none vanish. Held
              // jobs go ONLY in the On Hold column, never their status column.
              columnJobs={col === 'on_hold' ? boardHeldJobs : boardJobs.filter(j => !j.onHold && boardStatus(j) === col)}
              allJobs={jobs}
              draggedJobId={draggedJobId}
              customers={customers}
              users={users}
              contractors={contractors}
              sortBy={listSortBy}
              onUpdateJob={onUpdateJob}
              onDragStart={handleDragStart}
              onDragEnd={() => setDraggedJobId(null)}
              onCardClick={handleCardClick}
              onToggleHold={handleToggleHold}
            />
          ))}
        </div>
      )}

      {/* LL board: the "Conexsol Florida Services" Trello funnel mirrored 1:1,
          first column = Leads Services SolarEdge, where the Trello webhook drops
          every new lead (api/trello-card.ts writes pipelineStage:'leads').
          Groups by `pipelineStage` ONLY.
          There is deliberately NO "Unstaged" column: the ~123 stage-less records
          are real service orders, not funnel cards, and they stay visible on the
          main board/list/map (boardJobs). Showing them here buried the funnel. */}
      {viewMode === 'tryout' && (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {PIPELINE_STAGES.map(col => (
            <KanbanColumn
              key={col}
              status={col}
              title={col === 'done' ? 'Completed' : PIPELINE_STAGE_LABEL[col]}
              columnJobs={col === 'done'
                ? llJobs.filter(j => j.pipelineStage === col || j.status === 'completed')
                : llJobs.filter(j => j.pipelineStage === col)}
              allJobs={jobs}
              draggedJobId={draggedJobId}
              customers={customers}
              users={users}
              contractors={contractors}
              sortBy={listSortBy}
              onUpdateJob={onUpdateJob}
              onDragStart={handleDragStart}
              onDragEnd={() => setDraggedJobId(null)}
              onCardClick={handleCardClick}
              onToggleHold={handleToggleHold}
            />
          ))}
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <div className="space-y-3">
          {sortedListJobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              customer={customers.find(c => c.id === job.customerId)}
              technician={users.find(u => u.id === job.technicianId)}
              contractorName={contractors.find(c => c.id === job.contractorId)?.contactName}
              isDragging={draggedJobId === job.id}
              onDragStart={handleDragStart}
              onDragEnd={() => setDraggedJobId(null)}
              onClick={handleCardClick}
              onToggleHold={handleToggleHold}
            />
          ))}
          {sortedListJobs.length === 0 && (
            <div className="text-center py-12">
              <Wrench className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">No jobs found</p>
            </div>
          )}
        </div>
      )}

      {/* Calendar View */}
      {viewMode === 'calendar' && (
        <WorkOrderCalendar
          jobs={calendarJobs}
          customers={customers}
          users={users}
          contractors={contractors}
          isMobile={isMobile}
          onJobClick={handleCardClick}
          onReschedule={handleReschedule}
          onToggleHold={handleToggleHold}
        />
      )}

      {viewMode === 'map' && (
        <div className="flex flex-col rounded-xl border border-slate-200 overflow-hidden bg-white h-[calc(100vh-280px)] min-h-[420px]">
          <JobMapView jobs={mapJobs} onOpen={handleCardClick} />
        </div>
      )}

      {/* Lead card (customerless funnel job): add contact info, log calls/emails,
          and convert to a client. */}
      {leadPanelJobId && (() => {
        // Fall back to the last known copy rather than unmounting. `jobs` is
        // replaced wholesale by every sync pull/hydrate, and a transient miss
        // used to drop this panel entirely, silently discarding whatever the
        // user had typed into it (a lost call note, 2026-08-24). Rendering the
        // previous object for a beat is strictly better than losing their work.
        const found = jobs.find(j => j.id === leadPanelJobId);
        if (found) lastLeadRef.current = found;
        const lead = found ?? lastLeadRef.current;
        if (!lead || lead.id !== leadPanelJobId) return null;
        return (
          <LeadPanel
            job={lead}
            currentUserName={currentUser?.name}
            onSave={(partial) => onUpdateJob({ ...lead, ...partial, updatedAt: new Date().toISOString() })}
            onConvertToClient={() => handleConvertLead(lead)}
            onClose={() => setLeadPanelJobId(null)}
          />
        );
      })()}

      {/* Step 1: Customer Picker */}
      {showCustomerPicker && !createCustomer && (
        <CustomerPickerModal
          customers={customers}
          onSelect={(c) => { setCreateCustomer(c); setShowCustomerPicker(false); }}
          onClose={() => setShowCustomerPicker(false)}
        />
      )}

      {/* Step 2: New WO creation */}
      {createCustomer && !editingCreatedJob && (
        <ServiceOrderPanel
          siteId={createCustomer.id}
          siteName={createCustomer.name}
          clientId={createCustomer.clientId}
          siteAddress={`${createCustomer.address}, ${createCustomer.city}, ${createCustomer.state} ${createCustomer.zip}`}
          contractors={contractors}
          technicians={technicians.map(u => ({ id: u.id, name: u.name }))}
          currentUserName={currentUser?.name}
          currentUserRole={currentUser?.role}
          customer={createCustomer}
          users={users.map(u => ({ id: u.id, name: u.name, username: u.username, email: u.email }))}
          onClose={() => setCreateCustomer(null)}
          onSave={(jobData) => {
            const newJob = onCreateJob({ ...jobData, customerId: createCustomer.id });
            setCreateCustomer(null);
            setEditingCreatedJob(newJob);
          }}
        />
      )}

      {/* Step 3: Edit mode after WO creation, panel stays open */}
      {editingCreatedJob && (
        <ServiceOrderPanel
          job={editingCreatedJob}
          siteId={editingCreatedJob.solarEdgeSiteId ?? editingCreatedJob.customerId}
          siteName={editingCreatedJob.clientName ?? editingCreatedJob.customerId}
          clientId={editingCreatedJob.solarEdgeClientId}
          siteAddress={editingCreatedJob.siteAddress}
          contractors={contractors}
          technicians={technicians.map(u => ({ id: u.id, name: u.name }))}
          currentUserName={currentUser?.name}
          currentUserRole={currentUser?.role}
          users={users.map(u => ({ id: u.id, name: u.name, username: u.username, email: u.email }))}
          onClose={() => setEditingCreatedJob(null)}
          onSave={(jobData, shouldClose) => {
            const updated = { ...editingCreatedJob, ...jobData } as Job;
            onUpdateJob(updated);
            if (shouldClose) setEditingCreatedJob(null);
            else setEditingCreatedJob(updated);
          }}
        />
      )}
    </div>
  );
};

// Customer Picker Modal, step 1 of new WO flow
interface CustomerPickerModalProps {
  customers: Customer[];
  onSelect: (customer: Customer) => void;
  onClose: () => void;
}

const CustomerPickerModal: React.FC<CustomerPickerModalProps> = ({ customers, onSelect, onClose }) => {
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = search.trim()
    ? customers.filter(c => {
        const q = search.toLowerCase();
        return c.name.toLowerCase().includes(q)
          || (c.clientId ?? '').toLowerCase().includes(q)
          || c.address.toLowerCase().includes(q);
      }).slice(0, 10)
    : customers.slice(0, 10);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">New Service Order</h2>
            <p className="text-xs text-slate-500 mt-0.5">Select a customer to continue</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg cursor-pointer">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        <div className="p-4">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search by name or client ID…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
            />
          </div>
          <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-400 text-center">No customers found</p>
            ) : filtered.map(c => (
              <button
                key={c.id}
                onClick={() => onSelect(c)}
                className="w-full text-left px-4 py-3 hover:bg-orange-50 transition-colors cursor-pointer"
              >
                <p className="font-medium text-slate-900 text-sm">{c.name}</p>
                <p className="text-xs text-slate-500">{c.address}{c.clientId ? ` · ${c.clientId}` : ''}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
