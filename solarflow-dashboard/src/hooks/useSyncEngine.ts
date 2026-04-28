import { useEffect, useRef, type MutableRefObject } from 'react';
import { drainOutbox } from '../lib/outbox';
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
        return { ...prev, ...merged };
      });
    };

    const interval = setInterval(syncCycle, 30_000);
    const onFocus  = () => syncCycle();
    const onOnline = () => syncCycle();
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
        if (key === 'solarflow_contractor_jobs') setContractorJobs(loadContractorJobs());
        if (key === 'solarflow_contractors')     setContractors(loadContractors());
        if (key === 'solarflow_service_rates')   setServiceRates(loadServiceRates());
        setTimeout(() => { skipContractorPersist.current = false; }, 0);
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
      if (keys.includes('solarflow_contractor_jobs')) setContractorJobs(loadContractorJobs());
      if (keys.includes('solarflow_contractors'))     setContractors(loadContractors());
      if (keys.includes('solarflow_service_rates'))   setServiceRates(loadServiceRates());
      setTimeout(() => { skipContractorPersist.current = false; }, 0);
    };
    window.addEventListener('solarflow-remote-update', onRemoteUpdate as EventListener);
    return () => window.removeEventListener('solarflow-remote-update', onRemoteUpdate as EventListener);
  }, []);
}
