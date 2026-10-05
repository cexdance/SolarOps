import { describe, it, expect } from 'vitest';
import { planWeek, milesBetween, type PlanJob } from '../lib/weeklyRoutePlanner';

const days = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'];
// Miami cluster, Tampa cluster (~250 mi apart)
const miami = (id: string, dLat = 0): PlanJob => ({ id, lat: 25.76 + dLat, lon: -80.19, hours: 2, contractorId: 't1' });
const tampa = (id: string): PlanJob => ({ id, lat: 27.95, lon: -82.46, hours: 2, contractorId: 't1' });

describe('planWeek', () => {
  it('caps at 3 stops a day and keeps clusters together', () => {
    const jobs = [miami('a'), miami('b', 0.02), miami('c', 0.04), miami('d', 0.06), tampa('x'), tampa('y')];
    const { stops, overflow } = planWeek({ jobs, days });
    expect(overflow).toEqual([]);
    const perDay = new Map<string, string[]>();
    for (const s of stops) perDay.set(s.date, [...(perDay.get(s.date) ?? []), s.jobId]);
    for (const ids of perDay.values()) expect(ids.length).toBeLessThanOrEqual(3);
    // No day mixes Miami and Tampa
    for (const ids of perDay.values()) {
      const tampaCount = ids.filter(i => i === 'x' || i === 'y').length;
      expect(tampaCount === 0 || tampaCount === ids.length).toBe(true);
    }
  });

  it('respects calls already booked that day', () => {
    const booked = [
      { contractorId: 't1', date: days[0], lat: 25.76, lon: -80.19, startMin: 480, hours: 2 },
      { contractorId: 't1', date: days[0], lat: 25.77, lon: -80.19, startMin: 660, hours: 2 },
    ];
    const { stops } = planWeek({ jobs: [miami('a', 0.01), miami('b', 0.02)], booked, days });
    expect(stops.filter(s => s.date === days[0])).toHaveLength(1);
  });

  it('does not stack a day past 17:00', () => {
    const long = (id: string): PlanJob => ({ ...miami(id, 0.01), hours: 4 });
    const { stops } = planWeek({ jobs: [long('a'), long('b'), long('c')], days: days.slice(0, 1) });
    expect(stops.length).toBe(2);
    expect(stops[1].time).toBe('12:00');
  });

  it('leaves far-away jobs unplanned when the week is full', () => {
    const { overflow } = planWeek({ jobs: [miami('a'), tampa('x')], days: days.slice(0, 1) });
    expect(overflow).toEqual(['x']);
  });

  it('haversine is sane', () => {
    expect(milesBetween({ lat: 25.76, lon: -80.19 }, { lat: 27.95, lon: -82.46 })).toBeGreaterThan(250);
  });
});
