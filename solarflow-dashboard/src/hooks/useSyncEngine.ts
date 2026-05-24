import { useEffect, useRef, type MutableRefObject } from 'react';
import { drainOutbox, resetOutboxAttempts } from '../lib/outbox';
import { pullAndMerge, subscribeToChanges } from '../lib/syncEngine';
import { loadContractors, loadServiceRates, loadContractorJobs } from '../lib/contractorStore';
import type { AppState, Customer, Job } from '../types';
import type { Contractor, ContractorJob } from '../types/contractor';

interface SyncEngineOptions {
  setData: React.Dispatch<React.SetStateAction<AppState>>;
  setContractors: React.Dispatch<React.SetStateAction<Contractor[]>>;
  setServiceRates: React.Dispatch<React.SetStateAction<ReturnType<typeof loadServiceRates>>>;
  setContractorJobs: React.Dispatch<React.SetStateAction<ContractorJob[]>>;
  skipContractorPersist: MutableRefObject<boolean>;
}

export function useSyncEngine({
  setData,
  setContractors,
  setServiceRates,
  setContractorJobs,
  skipContractorPersist,
}: SyncEngineOptions): void {

  // ── 30s sync poll: drain outbox then pull remote ─────────────────────────
  useEffect(() => {
    let mounted = true;

    const syncCycle = async () => {
      await drainOutbox();
      const merged = await pullAndMerge();
      if (!mounted || !merged) return;

      setData(prev => {
        const customersChanged =
          merged.customers?.length !== prev.customers.length ||
          merged.customers?.some((c: Customer, i: number) =>
            c.id !== prev.customers[i]?.id || JSON.stringify(c) !== JSON.stringify(prev.customers[i])
          );
        const jobsChanged =
          merged.jobs?.length !== prev.jobs.length ||
          merged.jobs?.some((j: Job, i: number) =>
            j.id !== prev.jobs[i]?.id || JSON.stringify(j) !== JSON.stringify(prev.jobs[i])
          );
        if (!customersChanged && !jobsChanged) return prev;
        // Merge jobs defensively: if remote has a job without woPhotos but local has them,
        // keep the local photos. This prevents a stale Supabase pull (race with an in-flight
        // pushToSupabase) from wiping photos that are already in React state.
        const safeMergedJobs = merged.jobs
          ? merged.jobs.map((remoteJ: Job) => {
              const localJ = prev.jobs.find(j => j.id === remoteJ.id);
              if (!localJ) return remoteJ;
              // Prefer whichever has more photos (local upload may be ahead of remote)
              const remotePhotos = remoteJ.woPhotos ?? [];
              const localPhotos  = localJ.woPhotos  ?? [];
              return {
                ...remoteJ,
                woPhotos: remotePhotos.length >= localPhotos.length ? remotePhotos : localPhotos,
              };
            })
          : prev.jobs;
        return { ...prev, ...merged, jobs: safeMergedJobs };
      });
    };

    const interval = setInterval(syncCycle, 30_000);
    const onFocus  = () => syncCycle();
    const onOnline = () => {
      // Reset the attempt counter so a deadlocked outbox retries on reconnect
      resetOutboxAttempts();
      syncCycle();
    };
    window.addEventListener('focus',  onFocus);
    window.addEventListener('online', onOnline);
    return () => {
      mounted = false;
      clearInterval(interval);
      window.removeEventListener('focus',  onFocus);
      window.removeEventListener('online', onOnline);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Realtime: instant cross-device push (<1s) ─────────────────────────────
  useEffect(() => {
    const unsubscribe = subscribeToChanges({
      onCustomer: (customer, event) => {
        setData(prev => {
          if (event === 'DELETE') return { ...prev, customers: prev.customers.filter(c => c.id !== customer.id) };
          const exists = prev.customers.some(c => c.id === customer.id);
          return {
            ...prev,
            customers: exists
              ? prev.customers.map(c => c.id === customer.id ? customer : c)
              : [...prev.customers, customer],
          };
        });
      },
      onJob: (job, event) => {
        setData(prev => {
          if (event === 'DELETE') return { ...prev, jobs: prev.jobs.filter(j => j.id !== job.id) };
          const exists = prev.jobs.some(j => j.id === job.id);
          return {
            ...prev,
            jobs: exists
              ? prev.jobs.map(j => j.id === job.id ? job : j)
              : [...prev.jobs, job],
          };
        });
      },
      onKV: (key) => {
        skipContractorPersist.current = true;
        if (key === 'solarflow_contractor_jobs') {
          const remote = loadContractorJobs();
          setContractorJobs(prev => mergeById(prev, remote));
        }
        if (key === 'solarflow_contractors') {
          const remote = loadContractors();
          setContractors(prev => mergeById(prev, remote));
        }
        if (key === 'solarflow_service_rates') {
          const remote = loadServiceRates();
          setServiceRates(prev => mergeById(prev, remote));
        }
        setTimeout(() => { skipContractorPersist.current = false; }, 0);
      },
      onSolarSite: (site) => {
        // Fanned out by the solaredge-poller Edge Function (Step 1).
        // Any component (SolarEdgeMonitoring, Dashboard, etc.) can subscribe to this event.
        window.dispatchEvent(new CustomEvent('solarops-solar-site-update', { detail: site }));
      },
    });
    return unsubscribe;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Remote-update event: re-hydrate contractor state ─────────────────────
  useEffect(() => {
    const onRemoteUpdate = (e: Event) => {
      const keys = (e as CustomEvent<{ keys: string[] }>).detail?.keys ?? [];
      skipContractorPersist.current = true;
      if (keys.includes('solarflow_contractor_jobs')) {
        const remote = loadContractorJobs();
        setContractorJobs(prev => mergeById(prev, remote));
      }
      if (keys.includes('solarflow_contractors')) {
        const remote = loadContractors();
        setContractors(prev => mergeById(prev, remote));
      }
      if (keys.includes('solarflow_service_rates')) {
        const remote = loadServiceRates();
        setServiceRates(prev => mergeById(prev, remote));
      }
      setTimeout(() => { skipContractorPersist.current = false; }, 0);
    };
    window.addEventListener('solarflow-remote-update', onRemoteUpdate as EventListener);
    return () => window.removeEventListener('solarflow-remote-update', onRemoteUpdate as EventListener);
  }, []);
}

/**
 * Merge two arrays of records by `id`, preferring REMOTE rows on conflict
 * but keeping any local-only rows (so in-flight local creates aren't dropped
 * before they round-trip through Supabase).
 *
 * Local-only records are preserved indefinitely until they appear in remote
 * with the same id (then remote wins) or are explicitly tombstoned by their
 * domain layer.
 */
function mergeById<T extends { id: string }>(local: T[], remote: T[]): T[] {
  if (!Array.isArray(remote) || remote.length === 0) return local;
  const byId = new Map<string, T>();
  for (const r of local) byId.set(r.id, r);
  // Remote wins on conflict.
  for (const r of remote) byId.set(r.id, r);
  return Array.from(byId.values());
}
