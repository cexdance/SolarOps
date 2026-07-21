import { describe, it, expect } from 'vitest';
import { ensureStock, setLocationQty, adjustLocationQty, totalQty, knownLocations } from '../lib/inventoryStore';
import type { InventoryItem } from '../types';

const item = (over: Partial<InventoryItem> = {}): InventoryItem => ({
  id: 'i1', sku: 'SKU', name: 'Part', category: 'panel', description: '',
  quantity: 0, unitOfMeasure: 'unit', location: 'Storage Locker',
  minStockThreshold: 0, unitCost: 10, purchaseDate: '2026-07-01',
  createdAt: '2026-07-01T00:00:00.000Z', ...over,
});

describe('per-location stock', () => {
  it('migrates a legacy flat row into the location map', () => {
    const migrated = ensureStock(item({ quantity: 7, location: 'Service Van' }));
    expect(migrated.stockByLocation).toEqual({ 'Service Van': 7 });
  });

  it('is idempotent, so it is safe on every load and merge', () => {
    const once = ensureStock(item({ quantity: 7 }));
    expect(ensureStock(once)).toEqual(once);
  });

  it('keeps quantity as the true total across locations', () => {
    let it0 = ensureStock(item({ quantity: 0 }));
    it0 = setLocationQty(it0, 'Storage Locker', 12);
    it0 = setLocationQty(it0, 'IMPOWER Van', 3);
    expect(it0.stockByLocation).toEqual({ 'Storage Locker': 12, 'IMPOWER Van': 3 });
    expect(it0.quantity).toBe(15);
    expect(totalQty(it0)).toBe(15);
  });

  it('drops a location at zero so decommissioned vans leave the dropdown', () => {
    let it0 = setLocationQty(ensureStock(item()), 'Old Van', 2);
    it0 = setLocationQty(it0, 'Old Van', 0);
    expect(it0.stockByLocation).toEqual({ 'Storage Locker': 0 } as never);
    expect(Object.keys(it0.stockByLocation!)).not.toContain('Old Van');
  });

  it('never lets a location go negative', () => {
    const it0 = adjustLocationQty(setLocationQty(ensureStock(item()), 'Van', 2), 'Van', -5);
    expect(it0.stockByLocation!['Van']).toBeUndefined();
    expect(it0.quantity).toBe(0);
  });

  it('a transfer between locations conserves the total', () => {
    let it0 = setLocationQty(ensureStock(item({ quantity: 0 })), 'Storage Locker', 10);
    it0 = adjustLocationQty(it0, 'Storage Locker', -4);
    it0 = adjustLocationQty(it0, 'IMPOWER Van', 4);
    expect(it0.quantity).toBe(10);
    expect(it0.stockByLocation).toEqual({ 'Storage Locker': 6, 'IMPOWER Van': 4 });
  });

  it('derives the location list from the data plus contractors', () => {
    const withStock = setLocationQty(ensureStock(item({ quantity: 0 })), 'Job Site', 1);
    const locs = knownLocations([withStock], ['IMPOWER']);
    expect(locs).toContain('Storage Locker');
    expect(locs).toContain('Job Site');
    expect(locs).toContain('Contractor: IMPOWER');
  });
});
