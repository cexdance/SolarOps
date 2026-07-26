import { describe, it, expect } from 'vitest';
import { estimatedPrice, diffStockMovements, usageSummary } from '../lib/inventoryStore';

describe('estimatedPrice', () => {
  it('returns the cheapest priced vendor entry', () => {
    const est = estimatedPrice({
      vendorPrices: [
        { vendorName: 'A', price: 12, seenAt: '2026-01-01' },
        { vendorName: 'B', price: 9, url: 'https://b.example', seenAt: '2026-01-02' },
        { vendorName: 'C', price: 15, seenAt: '2026-01-03' },
      ],
    });
    expect(est?.price).toBe(9);
    expect(est?.vendorName).toBe('B');
  });

  it('ignores zero/negative prices and returns undefined when none remain', () => {
    expect(estimatedPrice({ vendorPrices: [{ price: 0, seenAt: 'x' }] })).toBeUndefined();
    expect(estimatedPrice({})).toBeUndefined();
  });
});

describe('diffStockMovements', () => {
  it('emits a signed adjust movement per changed location, skipping unchanged ones', () => {
    const moves = diffStockMovements(
      { Van: 5, Locker: 2 },
      { Van: 3, Locker: 2, '985': 4 },
      'cruz',
      '2026-07-25T00:00:00.000Z',
    );
    const byLoc = Object.fromEntries(moves.map(m => [m.location, m.qty]));
    expect(byLoc).toEqual({ Van: -2, '985': 4 }); // Locker unchanged -> no entry
    expect(moves.every(m => m.type === 'adjust' && m.by === 'cruz')).toBe(true);
  });
});

describe('usageSummary', () => {
  it('counts purchases from receipts and usage from negative movements', () => {
    const s = usageSummary({
      receipts: [{ id: 'r1', quantity: 5 }, { id: 'r2', quantity: 3 }] as never,
      movements: [{ id: 'm1', qty: -2 }, { id: 'm2', qty: 4 }, { id: 'm3', qty: -1 }] as never,
    });
    expect(s).toEqual({ purchasedTimes: 2, purchasedQty: 8, usedTimes: 2, usedQty: 3 });
  });
});
