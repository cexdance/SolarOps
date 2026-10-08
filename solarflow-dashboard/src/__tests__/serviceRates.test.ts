// Service rate catalogue (2026-10-07).
//
// These pin the money on the rate card and the one mechanism that gets a NEW
// rate onto machines that already have the list stored: loadServiceRates
// re-applies the defaults by id, so a rate added to the seed reaches everyone
// instead of only fresh installs.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadServiceRates, initializeContractorData } from '../lib/contractorStore';

// initializeContractorData pushes to Supabase and the IDB mirror; neither is
// under test here, and neither should run from a test.
vi.mock('../lib/db', () => ({ dbSet: vi.fn() }));
vi.mock('../lib/stateStore', () => ({ getKVMirror: () => null, setKVMirror: vi.fn() }));

// The seed is module-private, which is right: it is reached through the loader
// everywhere in the app. With nothing stored, the loader IS the seed.
const seed = () => { localStorage.clear(); return loadServiceRates(); };

describe('rate catalogue integrity', () => {
  it('has no duplicate ids or service codes', () => {
    const rates = seed();
    const ids = rates.map(r => r.id);
    const codes = rates.map(r => r.serviceCode);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('never bills a client less than the contractor is paid', () => {
    // A rate priced under its own labor cost loses money on every job.
    for (const r of seed()) {
      if (!r.laborCost || !r.clientRateStandard) continue;
      expect(
        r.clientRateStandard,
        `${r.id} ${r.serviceName} bills ${r.clientRateStandard} but pays ${r.laborCost}`,
      ).toBeGreaterThanOrEqual(r.laborCost);
    }
  });
});

describe('Isolation Fault Diagnostics (sr-23)', () => {
  const rate = seed().find(r => r.id === 'sr-23');

  it('exists and is active', () => {
    expect(rate).toBeDefined();
    expect(rate!.serviceName).toBe('Isolation Fault Diagnostics');
    expect(rate!.active).toBe(true);
  });

  it('pays the contractor 700 and bills the client 1400', () => {
    expect(rate!.laborCost).toBe(700);
    expect(rate!.clientRateStandard).toBe(1400);
    expect(rate!.clientRateRecurring).toBe(1400);
  });

  it('is not Powercare, so it never bills the manufacturer', () => {
    expect(rate!.isPowercareEligible).toBe(false);
    expect(rate!.powercareLaborCost).toBe(0);
    expect(rate!.powercareClientRate).toBe(0);
  });
});

describe('loadServiceRates merge', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('returns the full catalogue when nothing is stored yet', () => {
    expect(loadServiceRates().some(r => r.id === 'sr-23')).toBe(true);
  });

  it('does NOT add a missing rate on its own', () => {
    // loadServiceRates maps over what is stored, so a brand new rate is absent
    // until the boot-time merge runs. Pinned because it reads like a merge.
    const stored = seed().filter(r => r.id !== 'sr-23');
    localStorage.setItem('solarflow_service_rates', JSON.stringify(stored));
    expect(loadServiceRates().some(r => r.id === 'sr-23')).toBe(false);
  });

  it('initializeContractorData adds a newly seeded rate to an existing list', () => {
    // The real case, and the only reason sr-23 reaches anyone who already has
    // sr-1..sr-22 stored. App.tsx calls this on boot.
    const stored = seed().filter(r => r.id !== 'sr-23');
    localStorage.setItem('solarflow_service_rates', JSON.stringify(stored));
    initializeContractorData();
    const added = loadServiceRates().find(r => r.id === 'sr-23');
    expect(added?.laborCost).toBe(700);
    expect(added?.clientRateStandard).toBe(1400);
  });

  it('keeps a rate switched off locally switched off', () => {
    // Only `active` survives from the stored copy; price and wording come from
    // the seed, so an office that retired a service does not get it back.
    const stored = seed().map(r =>
      r.id === 'sr-23' ? { ...r, active: false, clientRateStandard: 1 } : r);
    localStorage.setItem('solarflow_service_rates', JSON.stringify(stored));
    const loaded = loadServiceRates().find(r => r.id === 'sr-23')!;
    expect(loaded.active).toBe(false);
    expect(loaded.clientRateStandard).toBe(1400);
  });
});
