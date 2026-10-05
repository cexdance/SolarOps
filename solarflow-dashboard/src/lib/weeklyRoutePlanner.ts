// Weekly route planner: turns the unscheduled work orders into a proposed
// week of short, geographically tight routes (2-3 calls per tech per day).
// Pure and synchronous. Geocoding and applying the result live in the UI.
//
// ponytail: greedy densest-seed + nearest-neighbour chaining. Not an optimal
// TSP/VRP solver; good enough for <= 3 stops a day. Swap for a real solver only
// if routes visibly zig-zag.

export interface PlanJob {
  id: string;
  lat: number;
  lon: number;
  hours: number;
  /** Assigned tech/contractor id, '' when unassigned. */
  contractorId: string;
}

/** A call already on the calendar. Counts toward the daily cap and anchors the route. */
export interface BookedStop {
  contractorId: string;
  date: string; // yyyy-MM-dd
  lat?: number;
  lon?: number;
  startMin: number; // minutes from midnight
  hours: number;
}

export interface PlannedStop {
  jobId: string;
  contractorId: string;
  /** Route id: the tech id, or `open-N` for a route with no tech yet. */
  lane: string;
  date: string;
  time: string; // HH:mm
  order: number; // 1-based position in that tech's day
  driveMiles: number; // from the previous stop (0 for the first)
}

export interface PlanOptions {
  jobs: PlanJob[];
  booked?: BookedStop[];
  days: string[]; // working days to fill, in order
  maxPerDay?: number;
  dayStartMin?: number;
  dayEndMin?: number;
  maxHopMiles?: number;
  avgMph?: number;
  /** How many parallel routes the unassigned pool may run per day (one per available tech). */
  unassignedLanes?: number;
}

export interface PlanResult {
  stops: PlannedStop[];
  /** Ids that did not fit in the week (capacity, or too far from any cluster). */
  overflow: string[];
}

const ROAD_FACTOR = 1.3; // straight line to road miles

export function milesBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 3958.8;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h)) * ROAD_FACTOR;
}

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const roundUp15 = (min: number) => Math.ceil(min / 15) * 15;

export function planWeek(opts: PlanOptions): PlanResult {
  const {
    jobs, booked = [], days,
    maxPerDay = 3, dayStartMin = 8 * 60, dayEndMin = 17 * 60,
    maxHopMiles = 25, avgMph = 35, unassignedLanes = 1,
  } = opts;

  const sorted = [...jobs].sort((a, b) => a.id.localeCompare(b.id));
  const stops: PlannedStop[] = [];
  const placed = new Set<string>();

  // Fill one tech-day: continue after any booked calls, else seed with the
  // densest cluster; chain nearest neighbours until the cap or the workday ends.
  const routeDay = (pool: PlanJob[], owner: string, date: string, lane = owner) => {
    const today = owner
      ? booked.filter(b => b.contractorId === owner && b.date === date).sort((a, b) => a.startMin - b.startMin)
      : [];
    let order = today.length;
    if (order >= maxPerDay) return;
    const remaining = pool.filter(j => !placed.has(j.id));
    if (!remaining.length) return;

    let last: { lat: number; lon: number } | null = null;
    let clock = dayStartMin;
    if (today.length) {
      const tail = today[today.length - 1];
      clock = roundUp15(tail.startMin + Math.round(tail.hours * 60));
      if (tail.lat != null && tail.lon != null) last = { lat: tail.lat, lon: tail.lon };
    }

    const dens = (j: PlanJob) => remaining.filter(o => o !== j && milesBetween(j, o) <= maxHopMiles).length;
    let next: PlanJob | undefined = last
      ? undefined
      : [...remaining].sort((a, b) => dens(b) - dens(a) || a.id.localeCompare(b.id))[0];

    while (order < maxPerDay) {
      if (last) {
        const from = last;
        next = remaining
          .filter(j => !placed.has(j.id) && milesBetween(from, j) <= maxHopMiles)
          .sort((a, b) => milesBetween(from, a) - milesBetween(from, b) || a.id.localeCompare(b.id))[0];
      }
      if (!next) break;
      const miles = last ? milesBetween(last, next) : 0;
      const start = last ? roundUp15(clock + Math.round((miles / avgMph) * 60)) : clock;
      const end = start + Math.round(next.hours * 60);
      // The first stop of an empty day always lands; later ones must fit the workday.
      if (order > 0 && end > dayEndMin) break;
      placed.add(next.id);
      order++;
      stops.push({ jobId: next.id, contractorId: owner, lane, date, time: hhmm(start), order, driveMiles: Math.round(miles * 10) / 10 });
      last = next;
      clock = end;
      next = undefined;
    }
  };

  const byTech = new Map<string, PlanJob[]>();
  for (const j of sorted) if (j.contractorId) byTech.set(j.contractorId, [...(byTech.get(j.contractorId) ?? []), j]);
  for (const [tech, pool] of byTech) for (const date of days) routeDay(pool, tech, date);

  const free = sorted.filter(j => !j.contractorId);
  for (const date of days) for (let i = 0; i < Math.max(1, unassignedLanes); i++) routeDay(free, '', date, `open-${i + 1}`);

  return { stops, overflow: sorted.filter(j => !placed.has(j.id)).map(j => j.id) };
}
