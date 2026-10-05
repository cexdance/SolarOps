import React, { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, addWeeks, format, startOfWeek } from 'date-fns';
import { X, MapPin, Loader2, CalendarCheck } from 'lucide-react';
import { Job, Customer } from '../types';
import type { Contractor } from '../types/contractor';
import { geocodeAddress } from '../lib/addressValidator';
import { fullAddress } from './views/jobViewTypes';
import { planWeek, type PlannedStop, type BookedStop } from '../lib/weeklyRoutePlanner';

// Same cache the Map view fills, so addresses geocoded there cost nothing here.
const COORD_CACHE_KEY = 'solarops_geocode_cache';
type Coord = { lat: number; lon: number };

const loadCache = (): Record<string, Coord> => {
  try { return JSON.parse(localStorage.getItem(COORD_CACHE_KEY) ?? '{}'); } catch { return {}; }
};

/** Orders the office would actually schedule: approved/ready, not parked, not finished. */
export function isReadyToSchedule(j: Job): boolean {
  if (!j.woNumber || j.onHold) return false;
  if (j.scheduledDate && j.scheduledDate.split('T')[0]) return false;
  if (['completed', 'invoiced', 'paid', 'archived'].includes(j.status)) return false;
  return !['draft', 'quote_sent', 'completed', 'invoiced', 'paid'].includes(String(j.woStatus ?? ''));
}

/** Monday of next week: what "the upcoming week" means when run on a Thursday. */
export const nextWeekStart = (from = new Date()) => addWeeks(startOfWeek(from, { weekStartsOn: 1 }), 1);

const toMin = (t?: string) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(t ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : 8 * 60;
};

export interface PlanApply { jobId: string; date: string; time: string }

export const WeeklyRoutePlanner: React.FC<{
  jobs: Job[];
  customers: Customer[];
  contractors: Contractor[];
  onApply: (items: PlanApply[]) => void;
  onClose: () => void;
}> = ({ jobs, customers, contractors, onApply, onClose }) => {
  const monday = useMemo(() => nextWeekStart(), []);
  const days = useMemo(() => [0, 1, 2, 3, 4].map(i => format(addDays(monday, i), 'yyyy-MM-dd')), [monday]);
  const custById = useMemo(() => new Map(customers.map(c => [c.id, c])), [customers]);
  const techName = (id: string) => {
    const c = contractors.find(x => x.id === id);
    return c?.businessName || c?.contactName || 'Unassigned';
  };

  const addrOf = (j: Job) => {
    const c = custById.get(j.customerId);
    return { address: c?.address ?? '', city: c?.city ?? '', state: c?.state ?? '', zip: c?.zip ?? '' };
  };
  const keyOf = (j: Job) => fullAddress(addrOf(j)).toLowerCase();

  // Everything that matters for the plan: ready orders + calls already in the target week.
  const ready = useMemo(() => jobs.filter(isReadyToSchedule), [jobs]);
  const inWeek = useMemo(
    () => jobs.filter(j => j.contractorId && days.includes((j.scheduledDate ?? '').split('T')[0]) && !j.onHold
      && !['completed', 'invoiced', 'paid', 'archived'].includes(j.status)),
    [jobs, days],
  );

  const cacheRef = useRef<Record<string, Coord>>(loadCache());
  const [coords, setCoords] = useState<Record<string, Coord>>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failed, setFailed] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cache = cacheRef.current;
      const need = [...ready, ...inWeek];
      const resolved: Record<string, Coord> = {};
      const pending: Job[] = [];
      for (const j of need) {
        const k = keyOf(j);
        if (k && cache[k]) resolved[j.id] = cache[k];
        else if (k) pending.push(j);
      }
      setCoords({ ...resolved });
      if (!pending.length) return;
      const bad: string[] = [];
      setProgress({ done: 0, total: pending.length });
      let n = 0;
      for (const j of pending) {
        if (cancelled) return;
        const k = keyOf(j);
        try {
          const c = cache[k] ?? await geocodeAddress(addrOf(j));
          if (c) { cache[k] = c; resolved[j.id] = c; setCoords({ ...resolved }); } else bad.push(j.id);
        } catch { bad.push(j.id); }
        setProgress({ done: ++n, total: pending.length });
      }
      try { localStorage.setItem(COORD_CACHE_KEY, JSON.stringify(cache)); } catch { /* quota */ }
      if (!cancelled) { setFailed(bad); setProgress(null); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const located = ready.filter(j => coords[j.id]);
  const noAddress = ready.filter(j => !coords[j.id]);
  const busy = !!progress;

  const plan = useMemo(() => {
    const booked: BookedStop[] = inWeek.map(j => ({
      contractorId: j.contractorId!,
      date: (j.scheduledDate ?? '').split('T')[0],
      lat: coords[j.id]?.lat, lon: coords[j.id]?.lon,
      startMin: toMin(j.scheduledTime),
      hours: j.laborHours > 0 ? j.laborHours : 2,
    }));
    return planWeek({
      jobs: located.map(j => ({
        id: j.id, lat: coords[j.id].lat, lon: coords[j.id].lon,
        hours: j.laborHours > 0 ? j.laborHours : 2,
        contractorId: j.contractorId ?? '',
      })),
      booked,
      days,
      unassignedLanes: Math.min(4, Math.max(1, contractors.length)),
    });
  }, [located.length, coords, inWeek, days, contractors.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const jobById = useMemo(() => new Map(jobs.map(j => [j.id, j])), [jobs]);
  const nameOf = (id: string) => {
    const j = jobById.get(id);
    return custById.get(j?.customerId ?? '')?.name ?? j?.woNumber ?? id;
  };
  const cityOf = (id: string) => {
    const c = custById.get(jobById.get(id)?.customerId ?? '');
    return [c?.address, c?.city].filter(Boolean).join(', ');
  };

  // day -> lane (tech or unassigned route) -> stops
  const grouped = useMemo(() => {
    const out = new Map<string, Map<string, PlannedStop[]>>();
    for (const s of plan.stops) {
      const day = out.get(s.date) ?? new Map<string, PlannedStop[]>();
      day.set(s.lane, [...(day.get(s.lane) ?? []), s]);
      out.set(s.date, day);
    }
    return out;
  }, [plan.stops]);

  const apply = () => {
    onApply(plan.stops.map(s => ({ jobId: s.jobId, date: s.date, time: s.time })));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Plan next week">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between p-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Plan next week</h2>
            <p className="text-sm text-slate-500">
              {format(monday, 'MMM d')} to {format(addDays(monday, 4), 'MMM d')}. Up to 3 calls per tech per day, grouped by location.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 overflow-y-auto space-y-4">
          {busy && (
            <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3">
              <Loader2 className="w-4 h-4 animate-spin" />
              Locating addresses ({progress!.done} of {progress!.total}). Slow the first time, cached after.
            </div>
          )}

          <p className="text-sm text-slate-700">
            <strong>{ready.length}</strong> ready to schedule, <strong>{plan.stops.length}</strong> placed
            {plan.overflow.length > 0 && <>, {plan.overflow.length} do not fit this week</>}.
          </p>

          {days.map(d => {
            const lanes = grouped.get(d);
            if (!lanes) return null;
            return (
              <div key={d}>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{format(new Date(`${d}T12:00:00`), 'EEEE, MMM d')}</h3>
                <div className="space-y-2">
                  {[...lanes.entries()].map(([lane, stops]) => (
                    <div key={lane} className="border border-slate-200 rounded-lg">
                      <div className="px-3 py-1.5 bg-slate-50 text-xs font-semibold text-slate-600 rounded-t-lg">
                        {techName(stops[0].contractorId)}
                      </div>
                      <ol className="divide-y divide-slate-100">
                        {stops.map(s => (
                          <li key={s.jobId} className="flex items-center gap-3 px-3 py-2 text-sm">
                            <span className="w-12 font-medium text-slate-800">{s.time}</span>
                            <span className="flex-1 min-w-0">
                              <span className="font-medium text-slate-900">{nameOf(s.jobId)}</span>
                              <span className="block text-xs text-slate-500 truncate">{cityOf(s.jobId)}</span>
                            </span>
                            {s.driveMiles > 0 && <span className="text-xs text-slate-500 whitespace-nowrap">{s.driveMiles} mi drive</span>}
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {plan.overflow.length > 0 && (
            <div className="text-sm text-slate-600 border border-slate-200 rounded-lg p-3">
              <p className="font-medium mb-1">Left for a later week ({plan.overflow.length})</p>
              <p className="text-xs text-slate-500">{plan.overflow.map(nameOf).join(', ')}</p>
            </div>
          )}

          {!busy && (noAddress.length > 0 || failed.length > 0) && (
            <div className="text-sm border border-amber-200 bg-amber-50 rounded-lg p-3 text-amber-900">
              <p className="font-medium mb-1 flex items-center gap-1.5"><MapPin className="w-4 h-4" />Missing a usable address ({noAddress.length})</p>
              <p className="text-xs">{noAddress.map(j => nameOf(j.id)).join(', ')}. Fix the customer address and run again.</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50">Cancel</button>
          <button
            onClick={apply}
            disabled={busy || plan.stops.length === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CalendarCheck className="w-4 h-4" />
            Schedule {plan.stops.length} order{plan.stops.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  );
};
