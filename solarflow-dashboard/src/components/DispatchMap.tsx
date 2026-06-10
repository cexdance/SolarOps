// Dispatch Map: every work order plotted on one map across all technicians.
// The dispatcher filters to active orders, multi-selects the stops for a route,
// and assigns them to a contractor. This is the foundation for the dispatch
// routing brain - a later version will let an agent order these stops via the
// Google Maps Routes API and assign automatically. Reuses the shared
// JobMapView for the map + selection UX.
import React, { useMemo, useState } from 'react';
import { MapPinned, X, UserCheck } from 'lucide-react';
import { Job, Customer, UrgencyLevel } from '../types';
import { Contractor } from '../types/contractor';
import JobMapView from './views/JobMapView';
import { ViewJob, ViewJobPriority } from './views/jobViewTypes';

interface DispatchMapProps {
  jobs: Job[];
  customers: Customer[];
  contractors: Contractor[];
  onOpenJob: (id: string) => void;
  onAssign: (jobIds: string[], contractorId: string) => void;
}

const PRIORITY_MAP: Record<UrgencyLevel, ViewJobPriority> = {
  critical: 'critical', high: 'high', medium: 'normal', low: 'low',
};

const DispatchMap: React.FC<DispatchMapProps> = ({ jobs, customers, contractors, onOpenJob, onAssign }) => {
  // ids queued for assignment; opening the contractor picker modal.
  const [assignIds, setAssignIds] = useState<string[] | null>(null);

  const viewJobs = useMemo<ViewJob[]>(() => {
    const custById = new Map(customers.map(c => [c.id, c]));
    return jobs.map(j => {
      const c = custById.get(j.customerId);
      const status = String(j.status);
      return {
        id: j.id,
        title: c?.name ?? j.woNumber ?? 'Work order',
        address: c?.address ?? '', city: c?.city ?? '', state: c?.state ?? '', zip: c?.zip ?? '',
        status,
        statusLabel: status.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase()),
        priority: PRIORITY_MAP[j.priority ?? 'medium'] ?? 'normal',
        scheduledDate: j.scheduledDate,
        serviceType: String(j.serviceType),
        badge: j.woNumber,
      } satisfies ViewJob;
    });
  }, [jobs, customers]);

  const assignableContractors = useMemo(
    () => contractors.filter(c => c.status === 'approved'),
    [contractors],
  );

  const doAssign = (contractorId: string) => {
    if (assignIds) onAssign(assignIds, contractorId);
    setAssignIds(null);
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-white">
      <header className="flex-shrink-0 px-5 py-3 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <MapPinned className="w-5 h-5 text-orange-500" />
          <h1 className="text-base font-bold text-slate-900">Dispatch Map</h1>
          <span className="text-xs text-slate-400">{viewJobs.length} work orders</span>
        </div>
        <p className="text-xs text-slate-500 mt-0.5">
          Filter to active orders, select stops for a route, and assign them to a contractor.
          Agentic optimization (Google Maps Routes API) ships next version.
        </p>
      </header>

      <JobMapView
        jobs={viewJobs}
        onOpen={onOpenJob}
        selectable
        primaryAction={{ label: 'Assign to contractor', onClick: (ids) => setAssignIds(ids) }}
      />

      {/* Contractor picker */}
      {assignIds && (
        <div className="fixed inset-0 z-[2000] bg-black/60 flex items-center justify-center p-4" onClick={() => setAssignIds(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
              <div>
                <h2 className="text-base font-bold text-slate-900">Assign route</h2>
                <p className="text-xs text-slate-500">{assignIds.length} work order{assignIds.length !== 1 ? 's' : ''} to a contractor</p>
              </div>
              <button onClick={() => setAssignIds(null)} className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="max-h-[55vh] overflow-y-auto p-3 space-y-1.5">
              {assignableContractors.length === 0 ? (
                <p className="text-center text-sm text-slate-400 py-8">No approved contractors available.</p>
              ) : assignableContractors.map(c => (
                <button
                  key={c.id}
                  onClick={() => doAssign(c.id)}
                  className="w-full flex items-center gap-3 text-left rounded-lg border border-slate-200 hover:border-orange-300 hover:bg-orange-50 p-3 transition-colors cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-full bg-slate-900 text-white flex items-center justify-center flex-shrink-0">
                    <UserCheck className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 truncate">{c.businessName || c.contactName}</p>
                    <p className="text-xs text-slate-500 truncate">{c.contactName}{c.city ? ` · ${c.city}, ${c.state}` : ''}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DispatchMap;
