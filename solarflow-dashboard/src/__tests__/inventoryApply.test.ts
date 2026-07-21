import { describe, it, expect } from 'vitest';
import { applyPartsToInventory, pendingStockParts, setLocationQty, ensureStock } from '../lib/inventoryStore';
import type { InventoryItem } from '../types';
import type { JobPart } from '../types/contractor';

const item = (id: string, loc: string, qty: number): InventoryItem =>
  setLocationQty(ensureStock({
    id, sku: id, name: id, category: 'panel', description: '', quantity: 0,
    unitOfMeasure: 'unit', location: loc, minStockThreshold: 0, unitCost: 10,
    purchaseDate: '2026-07-01', createdAt: '2026-07-01T00:00:00.000Z',
    stockByLocation: {},
  }), loc, qty);

const part = (over: Partial<JobPart> = {}): JobPart => ({
  id: 'p1', name: 'Optimizer', partNumber: 'P400', quantity: 2,
  unitPrice: 50, totalPrice: 100, ...over,
});

describe('applyPartsToInventory', () => {
  it('decrements the location the tech pulled from', () => {
    const res = applyPartsToInventory(
      [item('opt', 'IMPOWER Van', 10)],
      [part({ inventoryItemId: 'opt', fromLocation: 'IMPOWER Van' })],
      'office@conexsol.us',
    );
    expect(res.items[0].stockByLocation!['IMPOWER Van']).toBe(8);
    expect(res.items[0].quantity).toBe(8);
    expect(res.appliedCount).toBe(1);
    expect(res.parts[0].appliedToInventoryAt).toBeTruthy();
    expect(res.parts[0].appliedBy).toBe('office@conexsol.us');
  });

  // The whole reason the part carries a stamp: Apply is a button, buttons get
  // clicked twice, and stock that silently halves is exactly the data loss the
  // office-confirm design exists to avoid.
  it('is idempotent, a second apply moves nothing', () => {
    const first = applyPartsToInventory(
      [item('opt', 'Storage Locker', 10)],
      [part({ inventoryItemId: 'opt', fromLocation: 'Storage Locker' })],
      'u',
    );
    const second = applyPartsToInventory(first.items, first.parts, 'u');
    expect(second.appliedCount).toBe(0);
    expect(second.items[0].stockByLocation!['Storage Locker']).toBe(8);
  });

  it('skips a free-text part that never came from stock', () => {
    const res = applyPartsToInventory([item('opt', 'Storage Locker', 10)], [part()], 'u');
    expect(res.appliedCount).toBe(0);
    expect(res.items[0].quantity).toBe(10);
    expect(res.parts[0].appliedToInventoryAt).toBeUndefined();
  });

  it('leaves a part unapplied when its inventory row was deleted', () => {
    const res = applyPartsToInventory([], [part({ inventoryItemId: 'gone' })], 'u');
    expect(res.appliedCount).toBe(0);
    expect(res.parts[0].appliedToInventoryAt).toBeUndefined();
  });

  it('does not drive stock negative when the field over-reports', () => {
    const res = applyPartsToInventory(
      [item('opt', 'Van', 1)],
      [part({ inventoryItemId: 'opt', fromLocation: 'Van', quantity: 5 })],
      'u',
    );
    expect(res.items[0].quantity).toBe(0);
  });

  it('pendingStockParts lists only unapplied stock pulls', () => {
    const parts = [
      part({ id: 'a', inventoryItemId: 'opt' }),
      part({ id: 'b', inventoryItemId: 'opt', appliedToInventoryAt: '2026-07-01T00:00:00.000Z' }),
      part({ id: 'c' }),
    ];
    expect(pendingStockParts(parts).map(p => p.id)).toEqual(['a']);
  });
});
