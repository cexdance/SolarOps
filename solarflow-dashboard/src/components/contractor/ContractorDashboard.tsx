// SolarFlow - Contractor Dashboard
// Views: Kanban (Queue → On Route → Completed → Hold) | Map | List
import React, { useState, useRef, useEffect } from 'react';
import {
  Wrench, MapPin, Phone, Clock, CheckCircle,
  List, LogOut, Car, Check, Cloud, CloudRain, Sun, Wind,
  LayoutGrid, Map, Plus, ChevronRight, X, AlertTriangle, Star,
  Receipt, Timer,
} from 'lucide-react';
import { Contractor, ContractorJob, JobPriority, JobStatusContractor } from '../../types/contractor';
import { Lead } from '../../types';
import ConexSolTerms from './ConexSolTerms';
import { JobDetail } from './JobDetail';
import { JobMapView } from './JobMapView';
import {
  loadXpData, getLevelInfo, getLevelProgress, getNextLevel,
  ContractorXpData, BADGES,
} from '../../lib/contractorGamification';
import { loadCRMData, saveCRMData } from '../../lib/crmStore';

interface ContractorDashboardProps {
  contractorName: string;
  contractorId: string;
  contractor?: Contractor;
  jobs: ContractorJob[];
  onLogout: () => void;
  onUpdateJob: (job: ContractorJob) => void;
  onUpdateContractor?: (c: Contractor) => void;
}

// ─── Priority badge ────────────────────────────────────────────────────────────
const PRIORITY_COLORS: Record<JobPriority, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high:     'bg-amber-100 text-amber-700 border-amber-200',
  normal:   'bg-blue-100 text-blue-700 border-blue-200',
  low:      'bg-slate-100 text-slate-600 border-slate-200',
};

// ─── Live timer for In Progress kanban cards ──────────────────────────────────
const InProgressTimer: React.FC<{ startedAt?: string }> = ({ startedAt }) => {
  const [elapsed, setElapsed] = React.useState('0:00');
  React.useEffect(() => {
    if (!startedAt) return;
    const tick = () => {
      const secs = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      const s = secs % 60;
      setElapsed(h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${m}:${String(s).padStart(2,'0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return (
    <div className="flex items-center gap-1 text-amber-700 font-mono font-bold text-xs">
      <Timer className="w-3 h-3" />
      {elapsed}
    </div>
  );
};

// ─── Kanban column config ──────────────────────────────────────────────────────
const COLUMNS: {
  id: string;
  label: string;
  statuses: JobStatusContractor[];
  dropTarget: JobStatusContractor;
  bg: string;
  header: string;
  badge: string;
  empty: string;
}[] = [
  {
    id: 'queue',
    label: 'Queue',
    statuses: ['assigned'],
    dropTarget: 'assigned',
    bg: 'bg-slate-50 border-slate-200',
    header: 'text-slate-700',
    badge: 'bg-slate-200 text-slate-600',
    empty: 'No jobs waiting',
  },
  {
    id: 'on_route',
    label: 'On Route',
    statuses: ['en_route'],
    dropTarget: 'en_route',
    bg: 'bg-orange-50 border-orange-200',
    header: 'text-orange-800',
    badge: 'bg-orange-200 text-orange-700',
    empty: 'Drag jobs here to add to route',
  },
  {
    id: 'in_progress',
    label: 'In Progress',
    statuses: ['in_progress', 'documentation'],
    dropTarget: 'in_progress',
    bg: 'bg-amber-50 border-amber-200',
    header: 'text-amber-800',
    badge: 'bg-amber-200 text-amber-700',
    empty: 'No active work orders',
  },
  {
    id: 'completed',
    label: 'Completed',
    statuses: ['completed'],
    dropTarget: 'completed',
    bg: 'bg-emerald-50 border-emerald-200',
    header: 'text-emerald-800',
    badge: 'bg-emerald-200 text-emerald-700',
    empty: 'No completed jobs today',
  },
  {
    id: 'hold',
    label: 'Hold',
    statuses: ['on_hold', 'cancelled'],
    dropTarget: 'on_hold',
    bg: 'bg-slate-50 border-slate-200',
    header: 'text-slate-600',
    badge: 'bg-slate-200 text-slate-500',
    empty: 'Nothing on hold',
  },
];

type ViewMode = 'kanban' | 'map' | 'list' | 'billing';

// ─── Billing kanban column config ─────────────────────────────────────────────
const BILLING_COLUMNS: {
  id: string;
  label: string;
  statuses: JobStatusContractor[];
  dropTarget: JobStatusContractor;
  bg: string;
  header: string;
  badge: string;
  empty: string;
  icon: string;
}[] = [
  {
    id: 'completed',
    label: 'Completed',
    statuses: ['completed'],
    dropTarget: 'completed',
    bg: 'bg-emerald-50 border-emerald-200',
    header: 'text-emerald-800',
    badge: 'bg-emerald-200 text-emerald-700',
    empty: 'No completed jobs',
    icon: '✅',
  },
  {
    id: 'invoiced',
    label: 'Invoiced',
    statuses: ['invoiced'],
    dropTarget: 'invoiced',
    bg: 'bg-blue-50 border-blue-200',
    header: 'text-blue-800',
    badge: 'bg-blue-200 text-blue-700',
    empty: 'No invoiced jobs',
    icon: '📄',
  },
  {
    id: 'paid',
    label: 'Paid',
    statuses: ['paid'],
    dropTarget: 'paid',
    bg: 'bg-violet-50 border-violet-200',
    header: 'text-violet-800',
    badge: 'bg-violet-200 text-violet-700',
    empty: 'No paid jobs',
    icon: '💰',
  },
  {
    id: 'returned',
    label: 'Returned',
    statuses: ['returned'],
    dropTarget: 'returned',
    bg: 'bg-red-50 border-red-200',
    header: 'text-red-800',
    badge: 'bg-red-200 text-red-700',
    empty: 'No returned jobs',
    icon: '↩️',
  },
];

// ─── Component ─────────────────────────────────────────────────────────────────
export const ContractorDashboard: React.FC<ContractorDashboardProps> = ({
  contractorName,
  contractorId,
  contractor,
  jobs,
  onLogout,
  onUpdateJob,
  onUpdateContractor,
}) => {
  const [viewMode, setViewMode]         = useState<ViewMode>(() => window.innerWidth < 768 ? 'list' : 'kanban');
  const [openJob, setOpenJob]           = useState<ContractorJob | null>(null);
  const [xpData, setXpData]             = useState<ContractorXpData>(() => loadXpData(contractorId));
  const [showBadges, setShowBadges]     = useState(false);

  // Invoice gate — billing kanban requires invoice # before moving
  const [pendingMove, setPendingMove]   = useState<{ job: ContractorJob; target: JobStatusContractor } | null>(null);
  const [invoiceInput, setInvoiceInput] = useState('');
  const invoiceInputRef = useRef<HTMLInputElement>(null);

  // Refresh XP data whenever jobs change (e.g. job just completed)
  useEffect(() => { setXpData(loadXpData(contractorId)); }, [contractorId, jobs]);
  const [draggedJob, setDraggedJob]     = useState<ContractorJob | null>(null);
  const [dragOverCol, setDragOverCol]   = useState<string | null>(null);
  const [currentWeather, setCurrentWeather] = useState('sunny');
  // Toast for move confirmation
  const [toast, setToast]               = useState<string | null>(null);
  const toastTimeout = useRef<ReturnType<typeof setTimeout>>();

  const showToast = (msg: string) => {
    setToast(msg);
    clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setToast(null), 2500);
  };

  const weatherOptions = [
    { id: 'sunny',  icon: Sun,       label: 'Sunny'  },
    { id: 'cloudy', icon: Cloud,     label: 'Cloudy' },
    { id: 'rainy',  icon: CloudRain, label: 'Rainy'  },
    { id: 'windy',  icon: Wind,      label: 'Windy'  },
  ];

  // Computed stats
  const today         = new Date().toISOString().split('T')[0];
  const todaysJobs    = jobs.filter(j => j.scheduledDate === today);
  const routeJobs     = jobs.filter(j => j.status === 'en_route');
  const completedJobs = jobs.filter(j => j.status === 'completed');
  const totalEarned   = completedJobs.reduce((s, j) => s + (j.contractorTotalPay ?? 0), 0);

  // ── Job update helpers ──────────────────────────────────────────────────────
  const moveJob = (job: ContractorJob, target: JobStatusContractor) => {
    if (job.status === target) return;
    const now = new Date().toISOString();
    onUpdateJob({
      ...job,
      status: target,
      ...(target === 'in_progress' && !job.startedAt   ? { startedAt: now }   : {}),
      ...(target === 'completed'   && !job.completedAt ? { completedAt: now } : {}),
    });
    const allCols = [...COLUMNS, ...BILLING_COLUMNS];
    const label = allCols.find(c => c.dropTarget === target)?.label ?? target;
    showToast(`Moved "${job.customerName}" → ${label}`);
  };

  // ── Billing move — requires invoice number ──────────────────────────────────
  const billingMoveJob = (job: ContractorJob, target: JobStatusContractor) => {
    if (job.status === target) return;
    if (!job.contractorInvoiceNumber?.trim()) {
      // Gate: prompt for invoice number before moving
      setPendingMove({ job, target });
      setInvoiceInput('');
      setTimeout(() => invoiceInputRef.current?.focus(), 50);
      return;
    }
    moveJob(job, target);
  };

  const confirmInvoiceMove = () => {
    if (!pendingMove || !invoiceInput.trim()) return;
    const updated = { ...pendingMove.job, contractorInvoiceNumber: invoiceInput.trim() };
    onUpdateJob(updated); // save invoice number
    moveJob(updated, pendingMove.target);
    setPendingMove(null);
    setInvoiceInput('');
  };

  // ── Drag handlers ───────────────────────────────────────────────────────────
  const onDragStart = (job: ContractorJob) => setDraggedJob(job);
  const onDragEnd   = () => { setDraggedJob(null); setDragOverCol(null); };
  const onDragOver  = (e: React.DragEvent, colId: string) => { e.preventDefault(); setDragOverCol(colId); };
  const onDragLeave = () => setDragOverCol(null);
  const onDrop      = (col: typeof COLUMNS[0]) => {
    if (draggedJob) moveJob(draggedJob, col.dropTarget);
    setDraggedJob(null);
    setDragOverCol(null);
  };

  // ── Upsell lead creation ─────────────────────────────────────────────────────
  const handleUpsellLead = (job: ContractorJob, notes: string) => {
    const nameParts = job.customerName.trim().split(' ');
    const firstName = nameParts[0] ?? '';
    const lastName  = nameParts.slice(1).join(' ') ?? '';
    const now = new Date().toISOString();
    const newLead: Lead = {
      id: `lead-upsell-${Date.now()}`,
      firstName,
      lastName,
      email: job.customerEmail ?? '',
      phone: job.customerPhone,
      address: job.address,
      city: job.city,
      state: job.state,
      zip: job.zip,
      status: 'new',
      source: 'contractor_referral',
      priority: 'high',
      leadType: 'sales',
      homeowner: true,
      notes: `Upsell opportunity flagged by contractor after service visit.\n\n${notes}`,
      description: notes,
      score: 85,
      createdAt: now,
      updatedAt: now,
    };
    const crm = loadCRMData();
    saveCRMData({ ...crm, leads: [newLead, ...crm.leads] });
  };

  // ── If a job is open, show detail view ──────────────────────────────────────
  if (openJob) {
    const live = jobs.find(j => j.id === openJob.id) ?? openJob;
    return (
      <JobDetail
        job={live}
        contractorId={contractorId}
        onBack={() => setOpenJob(null)}
        onUpdateJob={(updated) => { onUpdateJob(updated); setOpenJob(updated); }}
        onXpEarned={() => setXpData(loadXpData(contractorId))}
        onUpsellLead={handleUpsellLead}
        currentWeather={currentWeather}
      />
    );
  }

  // ── Kanban card ──────────────────────────────────────────────────────────────
  const KanbanCard: React.FC<{ job: ContractorJob }> = ({ job }) => {
    const isGhost = draggedJob?.id === job.id;

    return (
      <div
        draggable
        onDragStart={() => onDragStart(job)}
        onDragEnd={onDragEnd}
        onClick={() => setOpenJob(job)}
        className={`bg-white rounded-xl border-2 transition-all cursor-pointer select-none ${
          isGhost
            ? 'opacity-30 scale-95 border-orange-300'
            : 'border-slate-200 hover:border-orange-300 hover:shadow-md active:scale-95'
        }`}
      >
        <div className="p-3 space-y-2">
          {/* Priority + Pay */}
          <div className="flex items-center justify-between">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border uppercase ${PRIORITY_COLORS[job.priority]}`}>
              {job.priority}
            </span>
            <span className="text-sm font-bold text-emerald-700">${(job.contractorTotalPay ?? 0).toFixed(0)}</span>
          </div>

          {/* Customer */}
          <div>
            <h4 className="font-semibold text-slate-900 text-sm leading-tight">{job.customerName}</h4>
            <p className="text-xs text-slate-500 flex items-center gap-0.5 mt-0.5 truncate">
              <MapPin className="w-3 h-3 flex-shrink-0" />
              {job.city}, {job.state}
            </p>
          </div>

          {/* Time + service */}
          <div className="flex items-center justify-between text-xs text-slate-500">
            {job.status === 'in_progress' || job.status === 'documentation' ? (
              <InProgressTimer startedAt={job.startedAt} />
            ) : (
              <span className="flex items-center gap-0.5">
                <Clock className="w-3 h-3" />{job.scheduledTime}
              </span>
            )}
            <span className="truncate ml-2 text-right">{job.serviceType}</span>
          </div>

          {/* Quick-move buttons (no drag required) */}
          <div onClick={e => e.stopPropagation()} className="flex gap-1.5 pt-0.5">
            {job.status === 'assigned' && (
              <button
                onClick={() => moveJob(job, 'en_route')}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                <Car className="w-3 h-3" /> Add to Route
              </button>
            )}
            {job.status === 'en_route' && (
              <button
                onClick={() => moveJob(job, 'assigned')}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                <X className="w-3 h-3" /> Remove
              </button>
            )}
            {job.status === 'on_hold' && (
              <button
                onClick={() => moveJob(job, 'assigned')}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                Back to Queue
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ── List card ────────────────────────────────────────────────────────────────
  const ListCard: React.FC<{ job: ContractorJob }> = ({ job }) => (
    <div
      onClick={() => setOpenJob(job)}
      className="bg-white rounded-xl border-2 border-slate-200 hover:border-orange-300 hover:shadow-md transition-all cursor-pointer p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border uppercase ${PRIORITY_COLORS[job.priority]}`}>
              {job.priority}
            </span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
              job.status === 'assigned'    ? 'bg-slate-100 text-slate-600' :
              job.status === 'en_route'    ? 'bg-orange-100 text-orange-700' :
              job.status === 'in_progress' ? 'bg-orange-100 text-orange-700' :
              job.status === 'completed'   ? 'bg-emerald-100 text-emerald-700' :
              'bg-slate-100 text-slate-500'
            }`}>
              {job.status.replace(/_/g,' ').toUpperCase()}
            </span>
          </div>
          <h3 className="font-semibold text-slate-900">{job.customerName}</h3>
          <p className="text-sm text-slate-500 flex items-center gap-1 mt-0.5">
            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />{job.address}, {job.city}
          </p>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{job.scheduledDate} {job.scheduledTime}</span>
            <span>{job.serviceType}</span>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-base font-bold text-emerald-700">${(job.contractorTotalPay ?? 0).toFixed(0)}</p>
          <ChevronRight className="w-4 h-4 text-slate-400 mt-1 ml-auto" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* ── T&C overlay for contractors who haven't accepted yet ────────────── */}
      {contractor && !contractor.termsAcceptedAt && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl my-4 overflow-hidden">
            <ConexSolTerms
              onAccept={() => {
                const updated = { ...contractor, termsAcceptedAt: new Date().toISOString(), termsVersion: 'v2026.1' };
                if (onUpdateContractor) onUpdateContractor(updated);
              }}
            />
          </div>
        </div>
      )}
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="bg-slate-900 text-white px-4 pt-4 pb-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] text-orange-400 font-bold uppercase tracking-widest">SolarOps Field</p>
            <h1 className="text-base font-bold leading-tight">{contractorName}</h1>
          </div>
          <div className="flex items-center gap-2">
            {/* Weather */}
            <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
              {weatherOptions.map(({ id, icon: Icon, label }) => (
                <button
                  key={id}
                  onClick={() => setCurrentWeather(id)}
                  title={label}
                  className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                    currentWeather === id ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>
            <button onClick={onLogout} className="p-2 hover:bg-slate-800 rounded-lg cursor-pointer">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── XP Bar ──────────────────────────────────────────────────────── */}
        {(() => {
          const level     = getLevelInfo(xpData.totalXp);
          const nextLevel = getNextLevel(xpData.totalXp);
          const progress  = getLevelProgress(xpData.totalXp);
          const xpInLevel = xpData.totalXp - level.minXp;
          const xpNeeded  = (nextLevel?.minXp ?? level.maxXp) - level.minXp;

          return (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1.5">
                {/* Level badge */}
                <button
                  onClick={() => setShowBadges(v => !v)}
                  className="flex items-center gap-1.5 bg-slate-800 rounded-full pl-1.5 pr-3 py-1 hover:bg-slate-700 transition-colors"
                >
                  <span className="text-base leading-none">{level.emoji}</span>
                  <span className="text-xs font-bold text-white">{level.name}</span>
                  <span className="text-[10px] text-slate-400 ml-0.5">Lv.{level.level}</span>
                </button>
                {/* XP numbers */}
                <span className="text-[11px] text-slate-400">
                  {xpData.totalXp.toLocaleString()} XP
                  {nextLevel && <span className="text-slate-500"> · {(xpNeeded - xpInLevel).toLocaleString()} to next</span>}
                </span>
              </div>
              {/* Progress bar */}
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${level.gradient} transition-all duration-700`}
                  style={{ width: `${Math.max(progress * 100, 4)}%` }}
                />
              </div>
              {/* Badges strip */}
              {xpData.earnedBadges.length > 0 && (
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {xpData.earnedBadges.map(bid => (
                    <span key={bid} title={BADGES[bid].name} className="text-base cursor-default" style={{ lineHeight: 1 }}>
                      {BADGES[bid].emoji}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* Stats */}
        <div className="flex gap-5 mt-3">
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wide">Today</p>
            <p className="text-lg font-bold">{todaysJobs.length}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wide">Route</p>
            <p className="text-lg font-bold text-orange-400">{routeJobs.length}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wide">Done</p>
            <p className="text-lg font-bold text-emerald-400">{completedJobs.length}</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-[10px] text-slate-400 uppercase tracking-wide">Earned</p>
            <p className="text-lg font-bold text-emerald-400">${totalEarned.toFixed(0)}</p>
          </div>
        </div>
      </header>

      {/* ── Badge Detail Sheet ───────────────────────────────────────────────── */}
      {showBadges && (
        <div className="fixed inset-0 z-[400] bg-black/60 flex items-end" onClick={() => setShowBadges(false)}>
          <div className="bg-slate-900 w-full rounded-t-3xl p-5 pb-8 max-h-[70vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-slate-600 rounded-full mx-auto mb-4" />
            <div className="flex items-start justify-between mb-1">
              <h2 className="text-white font-bold text-base">Your Achievements</h2>
              <button onClick={() => setShowBadges(false)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 cursor-pointer -mt-1 -mr-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-slate-400 text-xs mb-4">{xpData.totalXp.toLocaleString()} XP total · {xpData.earnedBadges.length} / {Object.keys(BADGES).length} badges</p>
            <div className="grid grid-cols-1 gap-3">
              {(Object.values(BADGES)).map(badge => {
                const earned = xpData.earnedBadges.includes(badge.id);
                return (
                  <div key={badge.id} className={`flex items-center gap-3 p-3 rounded-xl border ${earned ? 'bg-slate-800 border-slate-600' : 'bg-slate-800/40 border-slate-700/50 opacity-50'}`}>
                    <span className="text-2xl">{badge.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold ${earned ? 'text-white' : 'text-slate-400'}`}>{badge.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold uppercase ${badge.rarityBg} ${badge.rarityColor}`}>{badge.rarity}</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{badge.description}</p>
                    </div>
                    {earned
                      ? <span className="text-emerald-400 text-xs font-bold flex-shrink-0">+{badge.xpBonus} XP</span>
                      : <span className="text-slate-600 text-xs flex-shrink-0">+{badge.xpBonus} XP</span>
                    }
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── View Toggle ─────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-3 py-1.5 flex items-center gap-1 flex-shrink-0">
        {([
          { id: 'kanban',  icon: LayoutGrid, label: 'Board'   },
          { id: 'map',     icon: Map,        label: 'Map'     },
          { id: 'list',    icon: List,       label: 'List'    },
          { id: 'billing', icon: Receipt,    label: 'Billing' },
        ] as { id: ViewMode; icon: React.ElementType; label: string }[]).map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => setViewMode(id)}
            className={`flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] rounded-lg text-sm font-medium transition-colors cursor-pointer ${
              viewMode === id ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-400 whitespace-nowrap">{jobs.length} WOs</span>
      </div>

      {/* ── Toast ───────────────────────────────────────────────────────────── */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[500] bg-slate-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 animate-fade-in">
          <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          {toast}
        </div>
      )}

      {/* ── KANBAN ──────────────────────────────────────────────────────────── */}
      {viewMode === 'kanban' && (
        <div className="flex-1 overflow-y-auto md:overflow-x-auto">
          <div className="flex flex-col gap-3 p-4 md:flex md:flex-row md:h-full md:min-w-max md:grid md:grid-cols-4">
            {COLUMNS.map(col => {
              const colJobs = jobs.filter(j => col.statuses.includes(j.status));
              const isOver  = dragOverCol === col.id;

              return (
                <div
                  key={col.id}
                  className={`w-full md:w-64 md:flex-shrink-0 rounded-2xl border-2 transition-all flex flex-col ${col.bg} ${
                    isOver ? 'ring-2 ring-orange-400 ring-offset-1 scale-[1.01]' : ''
                  }`}
                  onDragOver={e => onDragOver(e, col.id)}
                  onDragLeave={onDragLeave}
                  onDrop={() => onDrop(col)}
                >
                  {/* Column header */}
                  <div className="px-3 pt-3 pb-2 flex items-center justify-between flex-shrink-0">
                    <h3 className={`font-bold text-sm ${col.header}`}>{col.label}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${col.badge}`}>
                      {colJobs.length}
                    </span>
                  </div>

                  {/* Drop zone hint */}
                  {isOver && draggedJob && (
                    <div className="mx-3 mb-2 border-2 border-dashed border-orange-400 rounded-xl py-3 text-center text-xs text-orange-600 font-semibold bg-orange-50">
                      Drop to move here
                    </div>
                  )}

                  {/* Cards */}
                  <div className="px-3 pb-3 space-y-2 flex-1 overflow-y-auto min-h-[80px]">
                    {colJobs.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-6 italic">{col.empty}</p>
                    ) : (
                      colJobs.map(job => <KanbanCard key={job.id} job={job} />)
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── MAP ──────────────────────────────────────────────────────────────── */}
      {viewMode === 'map' && (
        <div className="flex-1 overflow-hidden">
          <JobMapView
            jobs={jobs}
            onUpdateJob={onUpdateJob}
            onOpenJob={job => setOpenJob(job)}
          />
        </div>
      )}

      {/* ── BILLING KANBAN ───────────────────────────────────────────────────── */}
      {viewMode === 'billing' && (
        <div className="flex-1 overflow-y-auto md:overflow-x-auto">
          <div className="flex flex-col gap-3 p-4 md:flex md:flex-row md:h-full md:min-w-max md:grid md:grid-cols-4">
            {BILLING_COLUMNS.map((col, colIdx) => {
              const colJobs = jobs.filter(j => col.statuses.includes(j.status));
              const isOver  = dragOverCol === col.id;
              const nextCol = BILLING_COLUMNS[colIdx + 1];

              return (
                <div
                  key={col.id}
                  className={`w-full md:w-64 md:flex-shrink-0 rounded-2xl border-2 transition-all flex flex-col ${col.bg} ${
                    isOver ? 'ring-2 ring-orange-400 ring-offset-1 scale-[1.01]' : ''
                  }`}
                  onDragOver={e => onDragOver(e, col.id)}
                  onDragLeave={onDragLeave}
                  onDrop={() => {
                    if (draggedJob) billingMoveJob(draggedJob, col.dropTarget);
                    setDraggedJob(null);
                    setDragOverCol(null);
                  }}
                >
                  {/* Column header */}
                  <div className="px-3 pt-3 pb-2 flex items-center justify-between flex-shrink-0">
                    <h3 className={`font-bold text-sm flex items-center gap-1.5 ${col.header}`}>
                      <span>{col.icon}</span>{col.label}
                    </h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${col.badge}`}>
                      {colJobs.length}
                    </span>
                  </div>

                  {/* Drop zone hint */}
                  {isOver && draggedJob && (
                    <div className="mx-3 mb-2 border-2 border-dashed border-orange-400 rounded-xl py-3 text-center text-xs text-orange-600 font-semibold bg-orange-50">
                      Drop to move here
                    </div>
                  )}

                  {/* Cards */}
                  <div className="px-3 pb-3 space-y-2 flex-1 overflow-y-auto min-h-[80px]">
                    {colJobs.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-6 italic">{col.empty}</p>
                    ) : (
                      colJobs.map(job => (
                        <div
                          key={job.id}
                          draggable
                          onDragStart={() => onDragStart(job)}
                          onDragEnd={onDragEnd}
                          onClick={() => setOpenJob(job)}
                          className={`bg-white rounded-xl border-2 transition-all cursor-pointer select-none ${
                            draggedJob?.id === job.id
                              ? 'opacity-30 scale-95 border-orange-300'
                              : 'border-slate-200 hover:border-orange-300 hover:shadow-md active:scale-95'
                          }`}
                        >
                          <div className="p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border uppercase ${PRIORITY_COLORS[job.priority]}`}>
                                {job.priority}
                              </span>
                              <span className="text-sm font-bold text-emerald-700">${(job.contractorTotalPay ?? 0).toFixed(0)}</span>
                            </div>
                            <div>
                              <h4 className="font-semibold text-slate-900 text-sm leading-tight">{job.customerName}</h4>
                              <p className="text-xs text-slate-500 flex items-center gap-0.5 mt-0.5 truncate">
                                <MapPin className="w-3 h-3 flex-shrink-0" />{job.city}, {job.state}
                              </p>
                            </div>
                            <div className="flex items-center justify-between text-xs text-slate-500">
                              <span className="flex items-center gap-0.5">
                                <Clock className="w-3 h-3" />{job.scheduledDate}
                              </span>
                              <span className="truncate ml-2 text-right">{job.serviceType}</span>
                            </div>
                            {job.contractorInvoiceNumber ? (
                              <p className="text-[10px] text-blue-600 font-medium truncate flex items-center gap-1">
                                <Receipt className="w-3 h-3 flex-shrink-0" />
                                {job.contractorInvoiceNumber}
                              </p>
                            ) : (
                              <p className="text-[10px] text-amber-600 font-medium flex items-center gap-1">
                                <Receipt className="w-3 h-3 flex-shrink-0" />
                                No invoice # — required to move
                              </p>
                            )}
                            {/* Move to next column button */}
                            {nextCol && (
                              <div onClick={e => e.stopPropagation()}>
                                <button
                                  onClick={() => billingMoveJob(job, nextCol.dropTarget)}
                                  className="w-full flex items-center justify-center gap-1 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                                >
                                  <ChevronRight className="w-3 h-3" />
                                  Move to {nextCol.label}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Invoice gate modal ───────────────────────────────────────────────── */}
      {pendingMove && (
        <div className="fixed inset-0 z-[600] bg-black/60 flex items-center justify-center p-4" onClick={() => setPendingMove(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                <Receipt className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="font-bold text-slate-900 text-sm">Invoice number required</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Enter the invoice # you submitted before moving <span className="font-semibold">{pendingMove.job.customerName}</span> to{' '}
                  <span className="font-semibold">{BILLING_COLUMNS.find(c => c.dropTarget === pendingMove.target)?.label}</span>.
                </p>
              </div>
            </div>
            <input
              ref={invoiceInputRef}
              type="text"
              value={invoiceInput}
              onChange={e => setInvoiceInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && confirmInvoiceMove()}
              placeholder="e.g. INV-2026-001"
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setPendingMove(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmInvoiceMove}
                disabled={!invoiceInput.trim()}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-sm font-semibold transition-colors cursor-pointer"
              >
                Save & Move
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── LIST ─────────────────────────────────────────────────────────────── */}
      {viewMode === 'list' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {jobs.length === 0 ? (
            <div className="text-center py-16">
              <Wrench className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">No work orders assigned</p>
            </div>
          ) : (
            [...jobs]
              .sort((a, b) => {
                const ord: Record<JobPriority, number> = { critical: 0, high: 1, normal: 2, low: 3 };
                return ord[a.priority] - ord[b.priority] ||
                  `${a.scheduledDate}${a.scheduledTime}`.localeCompare(`${b.scheduledDate}${b.scheduledTime}`);
              })
              .map(job => <ListCard key={job.id} job={job} />)
          )}
        </div>
      )}
    </div>
  );
};
