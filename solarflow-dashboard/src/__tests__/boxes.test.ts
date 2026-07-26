import { describe, it, expect } from 'vitest';
import {
  BOXES, boxLocation, parseBoxLocation, boxRowId, isBoxRow, findBoxRow,
  boxHome, boxContents, moveBox, setBoxPhotos, knownLocations, totalQty,
  listBoxes, addBox, isDefaultBox, ensureBoxRow,
} from '../lib/inventoryStore';
import { boxFromScan, boxUrl } from '../components/BoxesPanel';
import type { InventoryItem } from '../types';

const item = (over: Partial<InventoryItem>): InventoryItem => ({
  id: 'i1', sku: 'S1', name: 'Glove', category: 'bos', description: '',
  quantity: 0, unitOfMeasure: 'unit', location: 'Storage Locker',
  minStockThreshold: 0, unitCost: 0, purchaseDate: '2026-01-01',
  createdAt: '2026-01-01T00:00:00.000Z', ...over,
});

describe('box locations', () => {
  it('round-trips a box name through its location string', () => {
    for (const b of BOXES) expect(parseBoxLocation(boxLocation(b))).toBe(b);
  });

  it('does not mistake an ordinary location for a box', () => {
    expect(parseBoxLocation('Storage Locker')).toBeNull();
    expect(parseBoxLocation('Contractor: Jaime')).toBeNull();
  });

  it('offers every box as a receiving location even while empty', () => {
    const locs = knownLocations([]);
    for (const b of BOXES) expect(locs).toContain(boxLocation(b));
  });
});

describe('box rows', () => {
  it('defaults an untouched box to the storage locker', () => {
    expect(boxHome([], 'PPE')).toBe('Storage Locker');
  });

  it('moves a box without touching its contents', () => {
    const glove = item({ id: 'i1', stockByLocation: { [boxLocation('PPE')]: 4 }, quantity: 4 });
    const moved = moveBox([glove], 'PPE', 'Service Van');

    expect(boxHome(moved, 'PPE')).toBe('Service Van');
    // The contents did not move: they are still "in PPE", wherever PPE is.
    expect(moved.find(i => i.id === 'i1')!.stockByLocation).toEqual({ [boxLocation('PPE')]: 4 });
    expect(boxContents(moved, 'PPE').map(i => i.id)).toEqual(['i1']);
  });

  it('creates the box row exactly once, so two moves do not fork it', () => {
    const twice = moveBox(moveBox([], 'Cables', 'Service Van'), 'Cables', 'Storage Locker');
    expect(twice.filter(i => i.id === boxRowId('Cables'))).toHaveLength(1);
    expect(boxHome(twice, 'Cables')).toBe('Storage Locker');
  });

  it('keeps the box row out of the stock count but countable as one box', () => {
    const rows = moveBox([], 'Random', 'Service Van');
    const row = findBoxRow(rows, 'Random')!;
    expect(isBoxRow(row)).toBe(true);
    expect(totalQty(row)).toBe(1);
  });

  it('leaves a moved box in exactly one place, holding the store invariant', () => {
    // Regression: moving once put the box in BOTH homes with quantity stuck at 2,
    // because the move added a location instead of replacing it.
    const moved = moveBox(moveBox([], 'PPE', 'Service Van'), 'PPE', 'Storage Locker');
    const row = findBoxRow(moved, 'PPE')!;
    expect(row.stockByLocation).toEqual({ 'Storage Locker': 1 });
    expect(row.location).toBe('Storage Locker');
    // The invariant the whole store rests on: quantity IS the sum of the map.
    expect(row.quantity).toBe(totalQty(row));
    expect(row.quantity).toBe(1);
  });

  it('uses the first photo as the cover and can remove it again', () => {
    const withPhotos = setBoxPhotos([], 'PPE', ['a.jpg', 'b.jpg']);
    expect(findBoxRow(withPhotos, 'PPE')!.imageUrl).toBe('a.jpg');
    const dropped = setBoxPhotos(withPhotos, 'PPE', ['b.jpg']);
    expect(findBoxRow(dropped, 'PPE')!.photos).toEqual(['b.jpg']);
    expect(findBoxRow(dropped, 'PPE')!.imageUrl).toBe('b.jpg');
  });
});

describe('scanning', () => {
  it('reads a box out of its own label URL', () => {
    expect(boxFromScan(boxUrl('Electrical Big'))).toBe('Electrical Big');
  });

  it('accepts a bare box name, case-insensitively', () => {
    expect(boxFromScan('  ppe ')).toBe('PPE');
  });

  it('rejects a QR that is not one of our labels', () => {
    expect(boxFromScan('https://example.com/whatever')).toBeNull();
    expect(boxFromScan('Box 7')).toBeNull();
  });

  it('matches a custom box when the live list is passed', () => {
    const boxes = [...BOXES, 'Ladders'];
    expect(boxFromScan(boxUrl('Ladders'), boxes)).toBe('Ladders');
    expect(boxFromScan(boxUrl('Ladders'))).toBeNull(); // not in the default list
  });
});

describe('custom boxes', () => {
  it('lists defaults first, then discovered custom boxes alphabetically', () => {
    const withCustom = ensureBoxRow(ensureBoxRow([], 'Ladders'), 'Consumables');
    const list = listBoxes(withCustom);
    expect(list.slice(0, BOXES.length)).toEqual(BOXES);
    expect(list.slice(BOXES.length)).toEqual(['Consumables', 'Ladders']);
  });

  it('discovers a custom box from stock sitting at its location, with no row', () => {
    const stray = item({ id: 'x', stockByLocation: { [boxLocation('Attic')]: 3 }, quantity: 3 });
    expect(listBoxes([stray])).toContain('Attic');
  });

  it('never double-lists a default box even if it has a row and contents', () => {
    const seeded = ensureBoxRow([item({ id: 'g', stockByLocation: { [boxLocation('PPE')]: 1 }, quantity: 1 })], 'PPE');
    expect(listBoxes(seeded).filter(b => b === 'PPE')).toHaveLength(1);
  });

  it('addBox creates the box and rejects empties, dupes and reserved chars', () => {
    expect(addBox([], '  ').error).toBeTruthy();
    expect(addBox([], 'PPE').error).toMatch(/exists/i);      // collides with a default
    expect(addBox([], 'a/b').error).toBeTruthy();            // reserved char
    const ok = addBox([], '  Roof  Kit ');
    expect(ok.error).toBeUndefined();
    expect(findBoxRow(ok.items, 'Roof Kit')).toBeDefined();  // whitespace collapsed
    expect(addBox(ok.items, 'roof kit').error).toMatch(/exists/i); // case-insensitive dupe
  });

  it('isDefaultBox is case-insensitive and false for custom names', () => {
    expect(isDefaultBox(' ppe ')).toBe(true);
    expect(isDefaultBox('Ladders')).toBe(false);
  });
});
