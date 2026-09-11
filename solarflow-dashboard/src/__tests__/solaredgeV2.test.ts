/**
 * The v2 -> v1 reshaping in the LIVE proxy (repo-root api/, see requireUser.test.ts).
 * Fixtures mirror real /v2 responses captured 2026-09-11, with synthetic values.
 * If any of these break, every SolarEdge screen breaks with them.
 */
import { describe, it, expect } from 'vitest';
import {
  toV1SitesList, toV1Overview, toV1Details, toV1Energy, energyRange,
  type V2Site, type V2Alert,
} from '../../../api/solaredge';

const site = (siteId: number, activationStatus = 'ACTIVE'): V2Site => ({
  siteId,
  name: `Test Site ${siteId}`,
  peakPower: 7.6,
  installationDate: '2026-07-27T00:00:00Z',
  activationStatus,
  note: '',
  location: { address: 'Main Street 100', city: 'Testville', state: 'Florida', zip: '33000', country: 'United States', latitude: 26.1, longitude: -80.2 },
});

describe('toV1SitesList', () => {
  it('maps fields to the v1 names the client reads and counts open alerts per site', () => {
    const alerts: V2Alert[] = [
      { siteId: 1, impact: 3, status: 'OPEN' },
      { siteId: 1, impact: 9, status: 'OPEN' },
      { siteId: 1, impact: 9, status: 'CLOSED' },
      { siteId: 2, impact: 5, status: 'CLOSED' },
    ];
    const { sites } = toV1SitesList([site(1), site(2, 'PENDING')], alerts);
    expect(sites.count).toBe(2);
    const [a, b] = sites.site;
    expect(a).toMatchObject({
      id: 1, status: 'Active', installationDate: '2026-07-27', ptoDate: null,
      alertQuantity: 2, highestImpact: 9,
      location: { address: 'Main Street 100', city: 'Testville', state: 'Florida', zip: '33000', country: 'United States' },
    });
    expect(b).toMatchObject({ id: 2, status: 'Pending', alertQuantity: 0, highestImpact: 0 });
  });
});

describe('toV1Overview', () => {
  it('builds lifetime/year from YEAR buckets and month/today from DAY buckets, nulls as 0', () => {
    const yearly = { values: [{ timestamp: '2025-01-01T00:00:00-05:00', value: 1000 }, { timestamp: '2026-01-01T00:00:00-05:00', value: 400 }] };
    const daily = { values: [{ timestamp: '2026-09-01T00:00:00-04:00', value: 30 }, { timestamp: '2026-09-02T00:00:00-04:00', value: null }, { timestamp: '2026-09-03T00:00:00-04:00', value: 12 }] };
    expect(toV1Overview(yearly, daily).overview).toEqual({
      lifeTimeData: { energy: 1400 },
      lastYearData: { energy: 400 },
      lastMonthData: { energy: 42 },
      lastDayData: { energy: 12 },
    });
  });
});

describe('toV1Details', () => {
  it('exposes coordinates as lat/lng', () => {
    const d = toV1Details(site(7)).details;
    expect(d).toMatchObject({ id: 7, peakPower: 7.6, status: 'Active' });
    expect(d.location).toMatchObject({ lat: 26.1, lng: -80.2 });
  });
});

describe('toV1Energy / energyRange', () => {
  it('renames timestamp to date and keeps nulls for the client to filter', () => {
    const e = toV1Energy({ values: [{ timestamp: '2026-09-01T00:00:00-04:00', value: 5 }, { timestamp: '2026-09-02T00:00:00-04:00', value: null }] }, 'DAY');
    expect(e.energy.values).toEqual([{ date: '2026-09-01T00:00:00-04:00', value: 5 }, { date: '2026-09-02T00:00:00-04:00', value: null }]);
  });

  it('sends UTC instants anchored so local-day buckets start on startDate', () => {
    expect(Object.fromEntries(energyRange('2026-08-12', '2026-09-11', 'week')))
      .toEqual({ from: '2026-08-12T12:00:00Z', to: '2026-09-11T23:59:59Z', resolution: 'WEEK' });
  });
});
