import { describe, it, expect } from 'vitest';
import {
  evaluateFences,
  distanceMeters,
  ARRIVE_RADIUS_M,
  EXIT_RADIUS_M,
  MIN_ONSITE_MS,
  MAX_FIX_ACCURACY_M,
  FenceCoords,
} from '../lib/geofence';
import type { ContractorJob } from '../types/contractor';

// Pins the arrival/departure fence decisions: arrive -> start, dwell + leave
// -> depart (documentation), and the guards (accuracy, schedule day,
// hysteresis, dwell).

const SITE = { lat: 27.9506, lon: -82.4572 }; // Tampa
const TODAY = '2026-07-10';

function job(over: Partial<ContractorJob>): ContractorJob {
  return {
    id: 'cj-1',
    contractorId: 'con-1',
    customerId: 'cust-1',
    customerName: 'Test Customer',
    customerPhone: '',
    address: '123 Main St',
    city: 'Tampa',
    state: 'FL',
    zip: '33601',
    latitude: SITE.lat,
    longitude: SITE.lon,
    serviceType: 'maintenance',
    description: '',
    priority: 'normal',
    status: 'assigned',
    isRecurringClient: false,
    urgency: 'low',
    isPowercare: false,
    scheduledDate: TODAY,
    scheduledTime: '09:00',
    estimatedDuration: 60,
    assignedAt: '2026-07-09T12:00:00.000Z',
    ...over,
  } as ContractorJob;
}

// A fix `meters` north of the site.
function fixAt(meters: number, accuracy = 10) {
  return { lat: SITE.lat + meters / 111_320, lon: SITE.lon, accuracy };
}

function run(j: ContractorJob, meters: number, inside: Map<string, number>, now = 0, accuracy = 10) {
  const coords = new Map<string, FenceCoords | null>([[j.id, SITE]]);
  return evaluateFences({
    jobs: [j], coords, inside, fix: fixAt(meters, accuracy), now, todayISO: TODAY,
  });
}

describe('distanceMeters', () => {
  it('measures a ~1km offset within 1%', () => {
    const d = distanceMeters(SITE.lat, SITE.lon, SITE.lat + 1000 / 111_320, SITE.lon);
    expect(d).toBeGreaterThan(990);
    expect(d).toBeLessThan(1010);
  });
});

describe('evaluateFences arrival', () => {
  it('starts an assigned job scheduled today when inside the fence', () => {
    const inside = new Map<string, number>();
    const r = run(job({}), ARRIVE_RADIUS_M - 50, inside, 1000);
    expect(r.start.map(j => j.id)).toEqual(['cj-1']);
    expect(inside.get('cj-1')).toBe(1000);
  });

  it('does not start a job scheduled another day', () => {
    const r = run(job({ scheduledDate: '2026-07-11' }), 10, new Map());
    expect(r.start).toEqual([]);
  });

  it('does not start outside the arrival radius', () => {
    const r = run(job({}), ARRIVE_RADIUS_M + 100, new Map());
    expect(r.start).toEqual([]);
  });

  it('ignores low-accuracy fixes', () => {
    const r = run(job({}), 10, new Map(), 0, MAX_FIX_ACCURACY_M + 1);
    expect(r.start).toEqual([]);
  });

  it('never arms a job without resolved coords', () => {
    const j = job({});
    const r = evaluateFences({
      jobs: [j], coords: new Map([[j.id, null]]), inside: new Map(),
      fix: fixAt(10), now: 0, todayISO: TODAY,
    });
    expect(r.start).toEqual([]);
  });
});

describe('evaluateFences departure', () => {
  it('flags departure for an in_progress job after dwell when beyond the exit radius', () => {
    const inside = new Map([['cj-1', 0]]);
    const r = run(job({ status: 'in_progress' }), EXIT_RADIUS_M + 50, inside, MIN_ONSITE_MS + 1);
    expect(r.depart.map(j => j.id)).toEqual(['cj-1']);
    expect(inside.has('cj-1')).toBe(false);
  });

  it('does not flag departure before the minimum on-site dwell', () => {
    const inside = new Map([['cj-1', 0]]);
    const r = run(job({ status: 'in_progress' }), EXIT_RADIUS_M + 50, inside, MIN_ONSITE_MS - 1);
    expect(r.depart).toEqual([]);
  });

  it('does not flag departure inside the hysteresis band (between arrive and exit radii)', () => {
    const inside = new Map([['cj-1', 0]]);
    const r = run(job({ status: 'in_progress' }), EXIT_RADIUS_M - 50, inside, MIN_ONSITE_MS + 1);
    expect(r.depart).toEqual([]);
  });

  it('does not flag a job never seen on site, but arms it when seen inside', () => {
    const inside = new Map<string, number>();
    // Far away, never seen inside: nothing happens.
    let r = run(job({ status: 'in_progress' }), EXIT_RADIUS_M + 500, inside, MIN_ONSITE_MS + 1);
    expect(r.depart).toEqual([]);
    // Seen inside (manual start case): arms exit tracking.
    r = run(job({ status: 'in_progress' }), 10, inside, 5000);
    expect(inside.get('cj-1')).toBe(5000);
  });
});
