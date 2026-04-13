// Inventory persistence — localStorage + Neon sync
// Seeds from partsCatalog on first load (if store is empty).

import { InventoryItem } from '../types';
import { PARTS_CATALOG } from './partsCatalog';
import { dbGet, dbSet } from './db';

const INVENTORY_KEY = 'solarops_inventory';

function seedFromCatalog(): InventoryItem[] {
  const today = new Date().toISOString();
  const todayDate = today.slice(0, 10);

  const catalogItems: InventoryItem[] = PARTS_CATALOG.map((p, i) => ({
    id: `inv-cat-${i + 1}`,
    sku: p.sku,
    partNumber: p.partNumber || undefined,
    name: p.name,
    category: p.category,
    description: p.description,
    quantity: 0,
    unitOfMeasure: p.unitOfMeasure,
    location: 'Service Van',
    minStockThreshold: 0,
    unitCost: p.unitCost,
    purchaseDate: todayDate,
    createdAt: today,
  }));

  // 60 TOPHiKu6 panels staged at an active job site
  const jobsitePanels: InventoryItem = {
    id: 'inv-jobsite-panels-001',
    sku: 'PAN-TOPHIKU6',
    partNumber: undefined,
    name: 'TOPHiKu6 Panel — Job Site',
    category: 'panel',
    description: '60 TOPHiKu6 panels staged at job site (pending installation)',
    quantity: 60,
    unitOfMeasure: 'unit',
    location: 'Job Site (Pending)',
    minStockThreshold: 0,
    unitCost: 0,
    purchaseDate: todayDate,
    createdAt: today,
  };

  return [...catalogItems, jobsitePanels];
}

export function loadInventory(): InventoryItem[] {
  try {
    const raw = localStorage.getItem(INVENTORY_KEY);
    if (raw) {
      const parsed: InventoryItem[] = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // fall through to seed
  }
  const seed = seedFromCatalog();
  saveInventory(seed);
  return seed;
}

export function saveInventory(items: InventoryItem[]): void {
  localStorage.setItem(INVENTORY_KEY, JSON.stringify(items));
  dbSet(INVENTORY_KEY, items);
}

export async function syncInventoryFromDB(): Promise<void> {
  const remote = await dbGet(INVENTORY_KEY) as InventoryItem[] | null;
  if (Array.isArray(remote) && remote.length > 0) {
    localStorage.setItem(INVENTORY_KEY, JSON.stringify(remote));
  }
}
