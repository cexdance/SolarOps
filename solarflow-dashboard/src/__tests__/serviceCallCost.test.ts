import { describe, expect, it } from 'vitest';
import { actualServiceCallCost, serviceCallCostBreakdown } from '../lib/woHelpers';
import type { Job } from '../types';

const reroof: Partial<Job> = {
  serviceType: 'Re-roof', contractorPayRate: 500, contractorPayUnit: 'flat', laborHours: 8,
  partsCost: 100,
  reroof: { parts: [{ id: 'anchor', category: 'anchors', name: 'Anchor', qty: 20, unitPrice: 7.5 }] },
  lineItems: [{ id: 'labor', type: 'labor', description: 'Additional labor', quantity: 2, unitCost: 50, totalCost: 100 }],
};

describe('service call cost', () => {
  it('includes base labor, extra labor, direct parts and reroof materials', () => {
    expect(serviceCallCostBreakdown(reroof)).toMatchObject({ baseLabor: 500, extraLabor: 100, parts: 100, reroofParts: 150, total: 850 });
    expect(actualServiceCallCost(reroof)).toBe(850);
  });
  it('uses itemized parts instead of counting the saved parts total again', () => {
    expect(actualServiceCallCost({ ...reroof, lineItems: [...reroof.lineItems!, {
      id: 'part', type: 'part', description: 'Consumables', quantity: 1, unitCost: 40, totalCost: 40,
    }] })).toBe(790);
  });
  it('respects zero-priced itemized parts and live reroof quantity edits', () => {
    expect(actualServiceCallCost({ ...reroof, lineItems: [{ id: 'free', type: 'part', description: 'Warranty part', quantity: 1, unitCost: 0, totalCost: 0 }],
      reroof: { parts: [{ ...reroof.reroof!.parts[0], qty: 30 }] },
    })).toBe(725);
  });
  it('handles hourly pay, mileage and eligible expenses', () => {
    expect(actualServiceCallCost({ contractorPayUnit: 'hour', contractorPayRate: 25, laborHours: 4, isPowercare: true, travelMiles: 10 }, [
      { amount: 30, status: 'approved' }, { amount: 500, status: 'rejected' }, { amount: 500, status: 'draft' },
    ])).toBe(135.4);
  });
  it('adds priced labor recorded across visits without counting unpriced hours', () => {
    const visitLabor = [
      { id: 'remove', visitId: 'visit-1', description: 'Panel and railing removal', hours: 46, rate: 45, updatedAt: '2026-09-16T00:00:00Z' },
      { id: 'reinstall', visitId: 'visit-1', description: 'Reinstallation', hours: 46, rate: 65, updatedAt: '2026-09-16T00:00:00Z' },
      { id: 'unpriced', visitId: 'visit-2', description: 'Inspection', hours: 2, updatedAt: '2026-09-16T00:00:00Z' },
    ];
    expect(serviceCallCostBreakdown({ visitLabor })).toMatchObject({ visitLabor: 5060, total: 5060 });
  });
  it('defaults missing pay units to the panel flat rate and ignores inactive reroof data', () => {
    expect(actualServiceCallCost({ ...reroof, contractorPayUnit: undefined, serviceType: 'Repair' })).toBe(700);
  });
});
