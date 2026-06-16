import { useCallback, useEffect, type MutableRefObject } from 'react';
import { drainOutbox, resetOutboxAttempts } from '../lib/outbox';
import { pullAndMerge, subscribeToChanges, mergeCustomerPair, mergeJobPair, mergeWoPhotos, resetSyncCursor } from '../lib/syncEngine';
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
}: SyncEngineOptions): { syncNow: () => Promise<void>; deepSync: () => Promise<void> } {

  // Drain the outbox then pull + merge remote. Exposed as `syncNow` so a manual
  // "Sync / update" control (e.g. the contractor header button) can refresh the
  // data in place without a full page reload.
  const syncNow = useCallback(async () => {
      await drainOutbox();
      const merged = await pullAndMerge();
      if (!merged) return;

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
        // Merge jobs defensively. `merged.jobs` is the LWW-resolved remote set, so
        // it is authoritative for which photos exist (a delete on the newer side
        // must stick), but a local photo still uploading (no storageUrl) is kept so
        // a pull racing an in-flight upload cannot wipe it. See mergeWoPhotos (M1).
        const safeMergedJobs = merged.jobs
          ? merged.jobs.map((remoteJ: Job) => {
              const localJ = prev.jobs.find(j => j.id === remoteJ.id);
              if (!localJ) return remoteJ;
              return {
                ...remoteJ,
                woPhotos: mergeWoPhotos(remoteJ.woPhotos ?? [], localJ.woPhotos ?? []),
              };
            })
          : prev.jobs;
        return { ...prev, ...merged, jobs: safeMergedJobs };
      });
  }, [setData]);

  // ── Sync poll: drain outbox then pull remote ─────────────────────────────
  useEffect(() => {
    // Pull immediately on mount: the sync engine's push gate stays closed until
    // the first successful pull, so an early pull both hydrates this device and
    // unblocks its outgoing sync as soon as possible.
    syncNow();

    const interval = setInterval(syncNow, 5 * 60_000);
    const onFocus  = () => syncNow();
    const onOnline = () => {
      // Reset the attempt counter so a deadlocked outbox retries on reconnect
      resetOutboxAttempts();
      syncNow();
    };
    window.addEventListener('focus',  onFocus);
    window.addEventListener('online', onOnline);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus',  onFocus);
      window.removeEventListener('online', onOnline);
    };
  }, [syncNow]);

  // ── Realtime: instant cross-device push (<1s) ─────────────────────────────
  // Defer until auth session is confirmed to avoid pre-auth CHANNEL_ERROR storm
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      const { supabase } = await import('../lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled || !session) return;
      unsubscribe = subscribeToChanges({
      onCustomer: (customer, event) => {
        setData(prev => {
          if (event === 'DELETE') return { ...prev, customers: prev.customers.filter(c => c.id !== customer.id) };
          const exists = prev.customers.some(c => c.id === customer.id);
          return {
            ...prev,
            customers: exists
              // Union activity history + files with the local copy so a remote
              // record missing entries can never wipe them from this device.
              ? prev.customers.map(c => c.id === customer.id ? mergeCustomerPair(customer, c) : c)
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
              // Union the comment feed (and photo heuristic) with the local copy.
              ? prev.jobs.map(j => j.id === job.id ? mergeJobPair(job, j) : j)
              : [...prev.jobs, job],
          };
        });
      },
      onKV: (key, payloadValue) => {
        // Use the Realtime payload value directly, avoids the stale-localStorage
        // race where a re-read would get the old value if the write hasn't flushed.
        skipContractorPersist.current = true;
        if (key === 'solarflow_contractor_jobs') {
          const remote = Array.isArray(payloadValue)
            ? (payloadValue as ContractorJob[])
            : loadContractorJobs(); // fallback to localStorage if payload missing
          setContractorJobs(prev => mergeById(prev, remote));
        }
        if (key === 'solarflow_contractors') {
          const remote = Array.isArray(payloadValue)
            ? (payloadValue as Contractor[])
            : loadContractors();
          setContractors(prev => mergeById(prev, remote));
        }
        if (key === 'solarflow_service_rates') {
          const remote = (Array.isArray(payloadValue) ? payloadValue : loadServiceRates()) as ReturnType<typeof loadServiceRates>;
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
    })();
    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Remote-update event: re-hydrate contractor state ─────────────────────
  useEffect(() => {
    const onRemoteUpdate = (e: Event) => {
      const keys = (e as CustomEvent<{ keys: string[] }>).detail?.keys ?? [];
      // Always re-read from localStorage for remote-update events (these come from
      // the pull cycle which has already written fresh data to localStorage).
      skipContractorPersist.current = true;
      if (keys.includes('solarflow_contractor_jobs')) {
        setContractorJobs(prev => mergeById(prev, loadContractorJobs()));
      }
      if (keys.includes('solarflow_contractors')) {
        setContractors(prev => mergeById(prev, loadContractors()));
      }
      if (keys.includes('solarflow_service_rates')) {
        setServiceRates(prev => mergeById(prev, loadServiceRates() as typeof prev));
      }
      setTimeout(() => { skipContractorPersist.current = false; }, 0);
    };
    window.addEventListener('solarflow-remote-update', onRemoteUpdate as EventListener);
    return () => window.removeEventListener('solarflow-remote-update', onRemoteUpdate as EventListener);
  }, []);

  // deepSync clears the incremental cursor first, so the manual refresh button does a
  // FULL reconcile and a user missing data can always force convergence on demand.
  const deepSync = useCallback(async () => {
    resetSyncCursor();
    await syncNow();
  }, [syncNow]);

  return { syncNow, deepSync };
}

/**
 * Merge two arrays of records by `id`, using NEWEST-WINS semantics on conflict.
 * Compares `updatedAt` → `completedAt` → `startedAt` → `createdAt` to decide
 * which version to keep. Local-only records are always preserved.
 */
function newerOf<T extends { id: string }>(a: T, b: T): T {
  const ts = (r: T): number => {
    const candidate = (r as Record<string, unknown>);
    const t = candidate['updatedAt'] ?? candidate['completedAt'] ?? candidate['startedAt'] ?? candidate['createdAt'];
    return t ? new Date(t as string).getTime() : 0;
  };
  return ts(b) > ts(a) ? b : a;
}

function mergeById<T extends { id: string }>(local: T[], remote: T[]): T[] {
  if (!Array.isArray(remote) || remote.length === 0) return local;
  const byId = new Map<string, T>();
  for (const r of local) byId.set(r.id, r);
  // Newest-wins: replace local record only if remote is strictly newer.
  for (const r of remote) {
    const existing = byId.get(r.id);
    byId.set(r.id, existing ? newerOf(existing, r) : r);
  }
  return Array.from(byId.values());
}
