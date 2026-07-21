// Inventory persistence: localStorage, synced to Supabase via the KV path.
// Seeds from partsCatalog on first load (if store is empty).
//
// Until 2026-07-20 the "sync" here was fiction: `dbSet` silently no-op'd for this
// key (not in KV_SYNC_KEYS), `dbGet` was a stub returning null, and the pull
// helper had zero callers. Items added on one device reached no other device and
// never hit the database. Now the key is synced and merged per item by
// `mergeInventoryItems`, which unions rather than overwrites so the local-only
// items every device accumulated during that period get adopted, not deleted.

import { InventoryItem } from '../types';
import { PARTS_CATALOG } from './partsCatalog';
import { dbSet } from './db';

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
    name: 'TOPHiKu6 Panel, Job Site',
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

/**
 * Stamp `updatedAt` on items whose content actually changed since the last save.
 *
 * Deliberately NOT a blanket stamp: `mergeInventoryItems` resolves conflicts by
 * newest `updatedAt`, so re-stamping untouched items would make whichever device
 * saved last win every field, which is the clobber this merge exists to prevent.
 */
function stampChanged(items: InventoryItem[], prevRaw: string | null): InventoryItem[] {
  let prevById = new Map<string, string>();
  try {
    const prev: InventoryItem[] = prevRaw ? JSON.parse(prevRaw) : [];
    if (Array.isArray(prev)) {
      prevById = new Map(prev.filter(p => p?.id).map(p => [p.id, JSON.stringify(p)]));
    }
  } catch {
    // Unreadable previous state: treat everything as new rather than lose the save.
  }
  const now = new Date().toISOString();
  return items.map(item => {
    if (!item?.id) return item;
    const before = prevById.get(item.id);
    // Compare ignoring updatedAt itself, otherwise every item looks changed.
    const { updatedAt: _drop, ...bare } = item;
    const beforeBare = before ? (() => {
      try { const { updatedAt: _d, ...b } = JSON.parse(before); return JSON.stringify(b); }
      catch { return null; }
    })() : null;
    if (beforeBare !== null && beforeBare === JSON.stringify(bare)) return item; // untouched
    return { ...item, updatedAt: now };
  });
}

export function saveInventory(items: InventoryItem[]): void {
  const prevRaw = localStorage.getItem(INVENTORY_KEY);
  const stamped = stampChanged(items, prevRaw);
  try {
    localStorage.setItem(INVENTORY_KEY, JSON.stringify(stamped));
  } catch (err) {
    // QuotaExceededError (e.g. an oversized inline image) must NOT abort the
    // save and lose the item, fall through to the DB write below.
    console.warn('[inventory] localStorage save failed (likely quota); persisting to DB only', err);
  }
  dbSet(INVENTORY_KEY, stamped);
}
