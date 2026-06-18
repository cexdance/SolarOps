// SolarOps, Deep Sync Metrics Widget (Ops Center)
// Shows how often contractors are using the deepSync (full reconcile) button.
// High usage = cursor drift still occurring, needs investigation.
import React, { useEffect, useState } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { getDeepSyncMetrics, resetDeepSyncMetrics, DeepSyncMetrics } from '../hooks/useSyncEngine';

interface Props {
  userName: string;
}

export const DeepSyncMetricsWidget: React.FC<Props> = ({ userName: _userName }) => {
  const [metrics, setMetrics] = useState<DeepSyncMetrics>(() => getDeepSyncMetrics());

  useEffect(() => {
    const onRemote = () => setMetrics(getDeepSyncMetrics());
    window.addEventListener('solarflow-remote-update', onRemote);
    const interval = setInterval(onRemote, 10000);
    return () => {
      window.removeEventListener('solarflow-remote-update', onRemote);
      clearInterval(interval);
    };
  }, []);

  const callsPerDay = metrics.totalCalls > 0 && metrics.sessionStart
    ? (metrics.totalCalls / Math.max(1, (Date.now() - new Date(metrics.sessionStart).getTime()) / 86400000)).toFixed(1)
    : '0';

  const isHighUsage = metrics.callsBySession > 5 || (metrics.totalCalls > 0 && parseFloat(callsPerDay) > 2);

  return (
    <div className="h-full flex flex-col min-h-0 bg-white border border-slate-100 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <RefreshCw className={`w-4 h-4 ${isHighUsage ? 'text-amber-600' : 'text-emerald-600'}`} />
          <span className="text-sm font-semibold text-slate-900">Deep Sync Metrics</span>
        </div>
        {isHighUsage && (
          <div className="w-4 h-4 text-amber-600" title="High deepSync usage - cursor drift may be occurring">
            <AlertTriangle className="w-4 h-4" />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-center mb-2">
        <div className="bg-slate-50 rounded p-2">
          <p className="text-2xl font-bold text-slate-900">{metrics.totalCalls}</p>
          <p className="text-[10px] text-slate-500 uppercase tracking-wide">Total Calls</p>
        </div>
        <div className="bg-slate-50 rounded p-2">
          <p className="text-2xl font-bold text-slate-900">{metrics.callsBySession}</p>
          <p className="text-[10px] text-slate-500 uppercase tracking-wide">This Session</p>
        </div>
        <div className="bg-slate-50 rounded p-2">
          <p className="text-2xl font-bold text-slate-900">{callsPerDay}/day</p>
          <p className="text-[10px] text-slate-500 uppercase tracking-wide">Avg/Day</p>
        </div>
        <div className="bg-slate-50 rounded p-2">
          <p className="text-xl font-bold text-slate-900">{metrics.lastCallAt ? new Date(metrics.lastCallAt).toLocaleTimeString() : 'Never'}</p>
          <p className="text-[10px] text-slate-500 uppercase tracking-wide">Last Used</p>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
        <p className={`text-xs ${isHighUsage ? 'text-amber-700' : 'text-emerald-700'}`}>
          {isHighUsage
            ? '⚠ High usage: contractors hitting deepSync frequently — check cursor drift'
            : '✓ Normal usage: deepSync used sparingly'}
        </p>
        <button
          onClick={() => { resetDeepSyncMetrics(); setMetrics(getDeepSyncMetrics()); }}
          className="text-[11px] text-slate-500 hover:text-slate-700 underline"
        >
          Reset metrics
        </button>
      </div>
    </div>
  );
};