// Arrival/departure geofence for the contractor portal.
//
// While the portal is open, watchPosition tracks the contractor. Entering the
// fence around a job scheduled for today auto-starts it (in_progress); leaving
// the fence after a minimum on-site dwell parks it in 'documentation' so the
// contractor still files the service report (photos, service status, parts)
// before completing. Admin notifications fire from handleContractorJobUpdate
// on the status transition, so manual buttons and the geofence share one
// notify path.
//
// ponytail: web geolocation only runs while the tab is open/foregrounded. If
// the contractor closes the browser on site, exit detection never fires and
// the manual Complete button remains the path. Native background geofencing
// needs a wrapped app (Capacitor), not a web API.
import { useEffect, useRef } from 'react';
import type { ContractorJob } from '../types/contractor';
import { validateAddress } from './addressValidator';

export const ARRIVE_RADIUS_M = 150;
// Exit radius is 2x arrival so GPS jitter at the fence edge cannot flap a job
// between started and completed.
export const EXIT_RADIUS_M = 300;
// Minimum on-site time before an exit may auto-complete. Filters drive-bys and
// quick "forgot a tool in the truck" loops.
export const MIN_ONSITE_MS = 5 * 60_000;
// Ignore low-quality fixes entirely; a 500m-accuracy fix says nothing useful.
export const MAX_FIX_ACCURACY_M = 100;

const ARRIVAL_STATUSES = new Set(['assigned', 'en_route']);

export interface FenceFix {
  lat: number;
  lon: number;
  accuracy: number;
}

export interface FenceCoords {
  lat: number;
  lon: number;
}

export function distanceMeters(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Pure fence decision. Mutates `inside` (jobId -> epoch ms the contractor was
 * first seen inside the fence) so the caller carries state between fixes.
 *
 * - start: job is assigned/en_route, scheduled for today, within ARRIVE_RADIUS_M.
 * - depart: job is in_progress, was seen inside the fence, has been on site
 *   at least MIN_ONSITE_MS, and is now beyond EXIT_RADIUS_M.
 */
export function evaluateFences(opts: {
  jobs: ContractorJob[];
  coords: Map<string, FenceCoords | null>;
  inside: Map<string, number>;
  fix: FenceFix;
  now: number;
  todayISO: string;
}): { start: ContractorJob[]; depart: ContractorJob[] } {
  const { jobs, coords, inside, fix, now, todayISO } = opts;
  const start: ContractorJob[] = [];
  const depart: ContractorJob[] = [];
  if (fix.accuracy > MAX_FIX_ACCURACY_M) return { start, depart };

  for (const job of jobs) {
    const target = coords.get(job.id);
    if (!target) continue;
    const d = distanceMeters(fix.lat, fix.lon, target.lat, target.lon);

    if (ARRIVAL_STATUSES.has(job.status)) {
      const scheduledToday = (job.scheduledDate ?? '').slice(0, 10) === todayISO;
      if (scheduledToday && d <= ARRIVE_RADIUS_M) {
        start.push(job);
        inside.set(job.id, now);
      }
    } else if (job.status === 'in_progress') {
      const since = inside.get(job.id);
      if (d <= ARRIVE_RADIUS_M && since === undefined) {
        // Manually started job observed on site: arm exit detection for it too.
        inside.set(job.id, now);
      } else if (since !== undefined && now - since >= MIN_ONSITE_MS && d >= EXIT_RADIUS_M) {
        depart.push(job);
        inside.delete(job.id);
      }
    }
  }
  return { start, depart };
}

/** Local calendar date as YYYY-MM-DD (en-CA locale formats exactly that). */
export function localTodayISO(): string {
  return new Date().toLocaleDateString('en-CA');
}

/**
 * Contractor-portal geofence watcher. Arms a fence per active job (job coords
 * when present, else a house-precision geocode of the address; city/road
 * centroids never arm a fence) and applies start/complete transitions through
 * the normal onUpdateJob path.
 */
export function useJobGeofence(
  jobs: ContractorJob[],
  onUpdateJob: (job: ContractorJob) => void,
): void {
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;
  const updateRef = useRef(onUpdateJob);
  updateRef.current = onUpdateJob;
  // jobId -> fence center; null = address could not be resolved precisely
  // enough for a fence (fence stays off, manual buttons still work).
  const coordsRef = useRef(new Map<string, FenceCoords | null>());
  const insideRef = useRef(new Map<string, number>());

  // Arm fences for active jobs. Sequential on purpose: validateAddress rate-
  // limits against Nominatim and caches per address.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      for (const job of jobs) {
        const active = ARRIVAL_STATUSES.has(job.status) || job.status === 'in_progress';
        if (!active || coordsRef.current.has(job.id)) continue;
        if (job.latitude && job.longitude) {
          coordsRef.current.set(job.id, { lat: job.latitude, lon: job.longitude });
          continue;
        }
        try {
          const v = await validateAddress({
            address: job.address,
            city: job.city,
            state: job.state,
            zip: job.zip,
          });
          if (cancelled) return;
          const lat = v.normalized?.lat;
          const lon = v.normalized?.lon;
          // House-level only: a fence on a city or bare-road centroid would
          // start jobs from across town.
          const precise =
            v.normalized?.placeType === 'house' ||
            v.normalized?.placeType === 'building' ||
            /^\d/.test(v.normalized?.address ?? '');
          coordsRef.current.set(
            job.id,
            typeof lat === 'number' && typeof lon === 'number' && precise ? { lat, lon } : null,
          );
        } catch {
          coordsRef.current.set(job.id, null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobs]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return undefined;
    const watchId = navigator.geolocation.watchPosition(
      pos => {
        const { start, depart } = evaluateFences({
          jobs: jobsRef.current,
          coords: coordsRef.current,
          inside: insideRef.current,
          fix: {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          },
          now: Date.now(),
          todayISO: localTodayISO(),
        });
        const nowISO = new Date().toISOString();
        for (const job of start) {
          updateRef.current({ ...job, status: 'in_progress', startedAt: job.startedAt ?? nowISO });
        }
        for (const job of depart) {
          // Park in documentation, not completed: the contractor still owes
          // the service report (photos, service status, parts). Completing the
          // report is what marks the job completed and pays out.
          updateRef.current({ ...job, status: 'documentation' });
        }
      },
      () => {
        // Permission denied or GPS unavailable: geofence off, manual flow intact.
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);
}
