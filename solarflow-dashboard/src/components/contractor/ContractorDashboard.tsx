// SolarFlow - Contractor Dashboard
// Single list view with a status filter. Tap a work order to open its detail.
import React, { useState, useEffect } from 'react';
import { formatMoney } from '../../lib/money';
import {
  Wrench, MapPin, Clock, LogOut, X, ChevronRight, Filter,
  List as ListIcon, LayoutGrid, CalendarDays, Map as MapIcon, RefreshCw,
  PauseCircle, PlayCircle,
} from 'lucide-react';
import { APP_VERSION } from '../../lib/versionConfig';
import { Contractor, ContractorJob, JobPriority, JobStatusContractor } from '../../types/contractor';
import { Lead } from '../../types';
import ConexSolTerms from './ConexSolTerms';
import { JobDetail } from './JobDetail';
import JobBoardView from '../views/JobBoardView';
import JobCalendarView from '../views/JobCalendarView';
import JobMapView from '../views/JobMapView';
import { ViewJob, BoardColumn } from '../views/jobViewTypes';
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
  /** Pull the latest data from the server (no page reload). */
  onSync?: () => Promise<void> | void;
  /** Contractor proposes a service date/time -> pings the office to confirm. */
  onProposeSchedule?: (job: ContractorJob, dateISO: string, time: string) => void;
}

// ─── Priority badge ────────────────────────────────────────────────────────────
const PRIORITY_COLORS: Record<JobPriority, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high:     'bg-amber-100 text-amber-700 border-amber-200',
  normal:   'bg-blue-100 text-blue-700 border-blue-200',
  low:      'bg-slate-100 text-slate-600 border-slate-200',
};

type StatusFilter = 'all' | JobStatusContractor;

// ─── Component ─────────────────────────────────────────────────────────────────
export const ContractorDashboard: React.FC<ContractorDashboardProps> = ({
  contractorName,
  contractorId,
  contractor,
  jobs,
  onLogout,
  onUpdateJob,
  onUpdateContractor,
  onSync,
  onProposeSchedule,
}) => {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [view, setView]                 = useState<'list' | 'board' | 'calendar' | 'map'>('list');
  const [openJob, setOpenJob]           = useState<ContractorJob | null>(null);
  const [xpData, setXpData]             = useState<ContractorXpData>(() => loadXpData(contractorId));
  const [showBadges, setShowBadges]     = useState(false);
  const [timeframe]                     = useState<'day' | 'week' | 'month' | 'ytd'>('ytd');
  const [syncing, setSyncing]           = useState(false);

  // Pull the latest list from the server IN PLACE (no page reload). A full
  // reload was hanging iOS Safari (had to be force-closed) and did not reliably
  // refresh the queue; an in-app pull updates the list and always stops the
  // spinner. Guarded so a stuck network can never leave it spinning forever.
  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      await Promise.race([
        Promise.resolve(onSync?.()),
        new Promise(res => setTimeout(res, 8000)),
      ]);
    } finally {
      setSyncing(false);
    }
  };

  // Terms acceptance is also remembered per-device in localStorage, keyed by
  // contractor id + version. The contractor record carries `termsAcceptedAt`,
  // but that field can be lost if a remote sync overwrites the record with a
  // copy that predates acceptance. The local flag guarantees an accepted
  // contractor is never re-prompted on the same device. Bumping TERMS_VERSION
  // intentionally re-prompts everyone for the new agreement.
  const TERMS_VERSION = 'v2026.1';
  const termsKey = `solarops_contractor_terms_${contractorId}`;
  const [termsAcceptedLocal, setTermsAcceptedLocal] = useState<boolean>(() => {
    try { return localStorage.getItem(termsKey) === TERMS_VERSION; } catch { return false; }
  });

  // Refresh XP data whenever jobs change (e.g. job just completed)
  useEffect(() => { setXpData(loadXpData(contractorId)); }, [contractorId, jobs]);

  // Computed stats
  const today = new Date().toISOString().split('T')[0];
  const now   = new Date();

  const inTimeframe = (dateStr: string | undefined) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (timeframe === 'day')   return dateStr === today;
    if (timeframe === 'week') {
      const start = new Date(now); start.setDate(now.getDate() - now.getDay());
      start.setHours(0, 0, 0, 0);
      return d >= start;
    }
    if (timeframe === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    if (timeframe === 'ytd')   return d.getFullYear() === now.getFullYear();
    return false;
  };

  // Held orders are parked: they stay reachable under the "On Hold" filter but are
  // kept OUT of the active queue and stats so they do not clutter the list.
  const activeJobs = jobs.filter(j => j.status !== 'on_hold');
  const heldJobs   = jobs.filter(j => j.status === 'on_hold');

  const filteredJobs =
    statusFilter === 'on_hold' ? heldJobs :
    statusFilter === 'all'     ? activeJobs :
    activeJobs.filter(j =>
      j.status === statusFilter || (statusFilter === 'in_progress' && j.status === 'documentation')
    );
  const todaysJobs     = activeJobs.filter(j => j.scheduledDate === today);
  const routeJobs      = activeJobs.filter(j => j.status === 'en_route');
  const frameJobs      = activeJobs.filter(j => inTimeframe(j.scheduledDate ?? j.completedAt));
  const frameCompleted = frameJobs.filter(j => j.status === 'completed');
  const totalEarned    = frameCompleted.reduce((s, j) => s + (j.contractorTotalPay ?? 0), 0);

  // Hold / resume. Holding parks the order; resuming returns it to the queue as
  // 'assigned' (its underlying stage is preserved admin-side via job.woStatus).
  const toggleHold = (job: ContractorJob, e?: React.MouseEvent) => {
    e?.stopPropagation();
    onUpdateJob({ ...job, status: job.status === 'on_hold' ? 'assigned' : 'on_hold' });
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
        key={live.id}
        job={live}
        contractorId={contractorId}
        onBack={() => setOpenJob(null)}
        onUpdateJob={(updated) => { onUpdateJob(updated); setOpenJob(updated); }}
        onXpEarned={() => setXpData(loadXpData(contractorId))}
        onUpsellLead={handleUpsellLead}
        onProposeSchedule={onProposeSchedule}
        currentWeather="sunny"
      />
    );
  }

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
        <div className="text-right flex-shrink-0 flex flex-col items-end">
          <p className="text-base font-bold text-emerald-700">{formatMoney(job.contractorTotalPay ?? 0, { decimals: 0 })}</p>
          {job.status === 'on_hold' ? (
            <button
              onClick={(e) => toggleHold(job, e)}
              className="mt-1.5 flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 cursor-pointer"
            >
              <PlayCircle className="w-3.5 h-3.5" /> Resume
            </button>
          ) : (
            <button
              onClick={(e) => toggleHold(job, e)}
              className="mt-1.5 flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 cursor-pointer"
            >
              <PauseCircle className="w-3.5 h-3.5" /> Hold
            </button>
          )}
          <ChevronRight className="w-4 h-4 text-slate-400 mt-1" />
        </div>
      </div>
    </div>
  );

  // Status filter chips, label + count for each
  const statusChips: { id: StatusFilter; label: string }[] = [
    { id: 'all',         label: 'All'         },
    { id: 'assigned',    label: 'Queue'       },
    { id: 'en_route',    label: 'En Route'    },
    { id: 'in_progress', label: 'In Progress' },
    { id: 'completed',   label: 'Completed'   },
    { id: 'on_hold',     label: 'On Hold'     },
  ];

  // ── Multi-view (List / Board / Calendar / Map) ─────────────────────────────
  const viewTabs: { id: typeof view; label: string; Icon: typeof ListIcon }[] = [
    { id: 'list',     label: 'List',     Icon: ListIcon },
    { id: 'board',    label: 'Board',    Icon: LayoutGrid },
    { id: 'calendar', label: 'Calendar', Icon: CalendarDays },
    { id: 'map',      label: 'Map',      Icon: MapIcon },
  ];

  // Adapt ContractorJob -> shared ViewJob. `documentation` buckets with
  // in_progress on the board (it is a sub-state of an active visit).
  const toViewJob = (j: ContractorJob): ViewJob => ({
    id: j.id,
    title: j.customerName,
    address: j.address, city: j.city, state: j.state, zip: j.zip,
    status: j.status === 'documentation' ? 'in_progress' : j.status,
    statusLabel: j.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    priority: j.priority,
    scheduledDate: j.scheduledDate,
    scheduledTime: j.scheduledTime,
    serviceType: j.serviceType,
    pay: j.contractorTotalPay,
  });
  const viewJobs: ViewJob[] = jobs.map(toViewJob);

  const boardColumns: BoardColumn[] = [
    { id: 'assigned',    label: 'Queue',       accent: 'bg-slate-100 text-slate-600'   },
    { id: 'en_route',    label: 'En Route',    accent: 'bg-orange-100 text-orange-700'  },
    { id: 'in_progress', label: 'In Progress', accent: 'bg-blue-100 text-blue-700'      },
    { id: 'completed',   label: 'Completed',   accent: 'bg-emerald-100 text-emerald-700'},
    { id: 'on_hold',     label: 'On Hold',     accent: 'bg-slate-200 text-slate-500'    },
  ];

  const openById = (id: string) => { const j = jobs.find(x => x.id === id); if (j) setOpenJob(j); };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* ── T&C overlay for contractors who haven't accepted yet ────────────── */}
      {contractor && !contractor.termsAcceptedAt && !termsAcceptedLocal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl my-4 overflow-hidden">
            <ConexSolTerms
              onAccept={() => {
                // Remember acceptance on this device first so a later sync that
                // drops termsAcceptedAt can never re-prompt this contractor.
                try { localStorage.setItem(termsKey, TERMS_VERSION); } catch { /* ignore */ }
                setTermsAcceptedLocal(true);
                const updated = { ...contractor, termsAcceptedAt: new Date().toISOString(), termsVersion: TERMS_VERSION };
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
            {/* App version badge */}
            <span className="px-2 py-1 rounded-md bg-slate-800 text-[11px] font-semibold text-slate-300 tabular-nums">
              {APP_VERSION}
            </span>
            {/* Sync / update */}
            <button
              onClick={handleSync}
              disabled={syncing}
              title="Sync & update to the latest version"
              className="p-2 hover:bg-slate-800 rounded-lg cursor-pointer disabled:opacity-60 disabled:cursor-default"
            >
              <RefreshCw className={`w-5 h-5 ${syncing ? 'animate-spin' : ''}`} />
            </button>
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
            <p className="text-lg font-bold text-emerald-400">{frameCompleted.length}</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-[10px] text-slate-400 uppercase tracking-wide">Earned</p>
            <p className="text-lg font-bold text-emerald-400">{formatMoney(totalEarned, { decimals: 0 })}</p>
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

      {/* ── View Switcher ──────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-3 py-1.5 flex items-center gap-1 flex-shrink-0">
        {viewTabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              view === id ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* ── Status Filter Bar (List view only) ─────────────────────────────── */}
      {view === 'list' && (
        <div className="bg-white border-b border-slate-200 px-3 py-1.5 flex items-center gap-1.5 flex-shrink-0 overflow-x-auto">
          <Filter className="w-4 h-4 text-slate-400 flex-shrink-0" />
          {statusChips.map(({ id, label }) => {
            const count =
              id === 'all'     ? activeJobs.length :
              id === 'on_hold' ? heldJobs.length :
              activeJobs.filter(j => j.status === id || (id === 'in_progress' && j.status === 'documentation')).length;
            return (
              <button
                key={id}
                onClick={() => setStatusFilter(id)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  statusFilter === id ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                {label}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  statusFilter === id ? 'bg-white/20' : 'bg-slate-100'
                }`}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Active View ────────────────────────────────────────────────────── */}
      {view === 'list' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filteredJobs.length === 0 ? (
            <div className="text-center py-16">
              <Wrench className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">
                {statusFilter !== 'all' ? 'No work orders match this filter' : 'No work orders assigned'}
              </p>
            </div>
          ) : (
            [...filteredJobs]
              .sort((a, b) => {
                const ord: Record<JobPriority, number> = { critical: 0, high: 1, normal: 2, low: 3 };
                return ord[a.priority] - ord[b.priority] ||
                  `${a.scheduledDate}${a.scheduledTime}`.localeCompare(`${b.scheduledDate}${b.scheduledTime}`);
              })
              .map(job => <ListCard key={job.id} job={job} />)
          )}
        </div>
      )}

      {view === 'board' && (
        <JobBoardView jobs={viewJobs} columns={boardColumns} onOpen={openById}
          formatPay={(n) => formatMoney(n, { decimals: 0 })} />
      )}
      {view === 'calendar' && <JobCalendarView jobs={viewJobs} onOpen={openById} />}
      {view === 'map' && <JobMapView jobs={viewJobs} onOpen={openById} />}
    </div>
  );
};
