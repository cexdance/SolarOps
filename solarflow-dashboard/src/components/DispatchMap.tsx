// Dispatch Map: every active work order plotted on one map across all
// technicians. This is the foundation for the dispatch routing brain - a later
// version will let an agent order these stops via the Google Maps Routes API
// and assign a technician. Reuses the shared JobMapView.
import React, { useMemo } from 'react';
import { MapPinned } from 'lucide-react';
import { Job, Customer, UrgencyLevel } from '../types';
import JobMapView from './views/JobMapView';
import { ViewJob, ViewJobPriority } from './views/jobViewTypes';

interface DispatchMapProps {
  jobs: Job[];
  customers: Customer[];
  onOpenJob: (id: string) => void;
}

// Statuses that represent live field work worth dispatching/routing. Completed
// and cancelled orders are dropped so the map shows the active operation.
const ROUTABLE_STATUSES = new Set([
  'scheduled', 'dispatched', 'assigned', 'en_route', 'in_progress', 'on_hold', 'pending',
]);

const PRIORITY_MAP: Record<UrgencyLevel, ViewJobPriority> = {
  critical: 'critical', high: 'high', medium: 'normal', low: 'low',
};

const DispatchMap: React.FC<DispatchMapProps> = ({ jobs, customers, onOpenJob }) => {
  const viewJobs = useMemo<ViewJob[]>(() => {
    const custById = new Map(customers.map(c => [c.id, c]));
    return jobs
      .filter(j => ROUTABLE_STATUSES.has(String(j.status)))
      .map(j => {
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

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-white">
      <header className="flex-shrink-0 px-5 py-3 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <MapPinned className="w-5 h-5 text-orange-500" />
          <h1 className="text-base font-bold text-slate-900">Dispatch Map</h1>
          <span className="text-xs text-slate-400">{viewJobs.length} active work orders</span>
        </div>
        <p className="text-xs text-slate-500 mt-0.5">
          Foundation for agentic route optimization (Google Maps Routes API) in the next version.
        </p>
      </header>
      <JobMapView jobs={viewJobs} onOpen={onOpenJob} />
    </div>
  );
};

export default DispatchMap;
