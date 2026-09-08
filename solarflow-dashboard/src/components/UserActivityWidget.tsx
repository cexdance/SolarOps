// SolarOps, Team Workload Widget (Ops Center)
// Ranks staff by estimated active time in SolarOps, from change_log.
//
// Reads only the four columns it needs. change_log.payload holds whole customer
// records and routinely runs to tens of KB a row, so selecting it here would
// pull megabytes into the browser to render a bar chart.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Users, AlertTriangle, RefreshCw, Info } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  buildWorkload,
  formatMinutes,
  lastDays,
  PersonWorkload,
  RawEvent,
  GAP_MIN,
  humanizeActor,
} from '../lib/activityStats';
import { User } from '../types';

interface Props {
  users: User[];
}

type Range = 'today' | 'week';

const PAGE = 1000;
/** Enough for a busy week (a heavy week is under 1,000 rows) with headroom. */
const MAX_ROWS = 5000;

const BAR_COLORS = ['bg-orange-500', 'bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-slate-400'];

export const UserActivityWidget: React.FC<Props> = ({ users }) => {
  const [range, setRange] = useState<Range>('week');
  const [rows, setRows] = useState<RawEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const since = new Date();
    if (range === 'today') since.setHours(0, 0, 0, 0);
    else since.setDate(since.getDate() - 6), since.setHours(0, 0, 0, 0);

    try {
      const all: RawEvent[] = [];
      for (let from = 0; from < MAX_ROWS; from += PAGE) {
        const { data, error: qErr } = await supabase
          .from('change_log')
          .select('user_email,actor_uid,created_at,op_type')
          .gte('created_at', since.toISOString())
          .order('created_at', { ascending: true })
          .range(from, from + PAGE - 1);
        if (qErr) throw qErr;
        const page = (data || []) as RawEvent[];
        all.push(...page);
        if (page.length < PAGE) {
          setTruncated(false);
          setRows(all);
          return;
        }
      }
      setTruncated(true);
      setRows(all);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load activity');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { void load(); }, [load]);

  // Refresh every 5 minutes. This is a trend view, not a live feed.
  useEffect(() => {
    const id = setInterval(() => { void load(); }, 300000);
    return () => clearInterval(id);
  }, [load]);

  const nameFor = useCallback((email: string) => {
    const u = users.find(x => x.email?.toLowerCase() === email.toLowerCase());
    // The users list is not always loaded when this renders, so fall back to a
    // readable form of the address rather than showing a raw login.
    return u?.name || humanizeActor(email);
  }, [users]);

  const people: PersonWorkload[] = useMemo(
    () => (rows ? buildWorkload(rows, { displayName: nameFor }) : []),
    [rows, nameFor],
  );

  const totalMinutes = people.reduce((a, p) => a + p.minutes, 0);
  const peak = people[0]?.minutes || 0;
  const days = useMemo(() => lastDays(range === 'today' ? 1 : 7), [range]);
  const share = peak > 0 && totalMinutes > 0 ? Math.round((peak / totalMinutes) * 100) : 0;

  return (
    <div className="h-full flex flex-col min-h-0 bg-white border border-slate-100 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <Users className="w-4 h-4 text-orange-600 shrink-0" />
          <span className="text-sm font-semibold text-slate-900 truncate">Team Workload</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="flex rounded bg-slate-100 p-0.5" role="group" aria-label="Report range">
            {(['today', 'week'] as Range[]).map(r => (
              <button
                key={r}
                onClick={() => setRange(r)}
                aria-pressed={range === r}
                className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                  range === r
                    ? 'bg-white text-slate-900 font-semibold shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {r === 'today' ? 'Today' : '7 days'}
              </button>
            ))}
          </div>
          <button
            onClick={() => { void load(); }}
            title="Refresh"
            aria-label="Refresh workload"
            className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading && rows === null && (
          <div className="space-y-2 pt-1" aria-hidden="true">
            {[0, 1, 2].map(i => (
              <div key={i} className="animate-pulse">
                <div className="h-2.5 w-24 bg-slate-100 rounded mb-1.5" />
                <div className="h-3 bg-slate-100 rounded" />
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 rounded p-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span className="min-w-0 break-words">{error}</span>
          </div>
        )}

        {!loading && !error && people.length === 0 && (
          <p className="text-xs text-slate-500 pt-2">
            No recorded activity {range === 'today' ? 'today' : 'in the last 7 days'}.
          </p>
        )}

        {!error && people.length > 0 && (
          <div className="space-y-2">
            {people.map((p, i) => {
              const pct = peak > 0 ? Math.max((p.minutes / peak) * 100, 2) : 0;
              const activeDays = p.perDay.size;
              return (
                <div key={p.key}>
                  <div className="flex items-baseline justify-between gap-2 mb-0.5">
                    <span className="text-xs text-slate-700 truncate" title={p.label}>
                      {p.label}
                    </span>
                    <span className="text-xs font-semibold text-slate-900 tabular-nums shrink-0">
                      {formatMinutes(p.minutes)}
                    </span>
                  </div>
                  <div
                    className="h-3 bg-slate-100 rounded-sm overflow-hidden"
                    role="img"
                    aria-label={`${p.label}, ${formatMinutes(p.minutes)} estimated active time`}
                  >
                    <div
                      className={`h-full ${BAR_COLORS[i % BAR_COLORS.length]} rounded-sm transition-all`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-0.5">
                    <span className="text-[10px] text-slate-400 truncate" title={p.topOps.map(o => `${o.op} (${o.n})`).join(', ')}>
                      {p.topOps[0]?.op || 'no writes'}
                    </span>
                    <span className="text-[10px] text-slate-400 tabular-nums shrink-0">
                      {p.events} edits{range === 'week' ? `, ${activeDays}/${days.length}d` : ''}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {!error && people.length > 0 && (
        <div className="pt-2 mt-1 border-t border-slate-100 shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-500">
              {people.length} active, {formatMinutes(totalMinutes)} total
            </span>
            <span
              className="flex items-center gap-1 text-[10px] text-slate-400"
              title={`Estimated from change_log: events are grouped into sessions with a ${GAP_MIN}-minute idle gap and each session counts its first-to-last span. This measures time spent writing to SolarOps, so calls, site visits and reading do not appear. Treat it as a floor, not a timesheet.`}
            >
              <Info className="w-3 h-3" />
              estimated
            </span>
          </div>
          {share >= 60 && (
            <p className="text-[10px] text-amber-700 mt-1">
              {people[0].label.split('@')[0]} is carrying {share}% of recorded time.
            </p>
          )}
          {truncated && (
            <p className="text-[10px] text-slate-400 mt-1">
              Showing the first {MAX_ROWS.toLocaleString()} events.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
