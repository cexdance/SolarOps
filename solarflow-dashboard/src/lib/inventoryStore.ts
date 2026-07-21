// Inventory persistence: localStorage, synced to Supabase via the KV path.
// Seeds from partsCatalog on first load (if store is empty).
//
// Until 2026-07-20 the "sync" here was fiction: `dbSet` silently no-op'd for this
// key (not in KV_SYNC_KEYS), `dbGet` was a stub returning null, and the pull
// helper had zero callers. Items added on one device reached no other device and
// never hit the database. Now the key is synced and merged per item by
// `mergeInventoryItems`, which unions rather than overwrites so the local-only
// items every device accumulated during that period get adopted, not deleted.

import { InventoryItem, InventoryCategory, UnitOfMeasure } from '../types';
import type { JobPart } from '../types/contractor';
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

// ── Per-location stock ───────────────────────────────────────────────────────
// Standard locations. Anything else in use is discovered from the data itself
// (see `knownLocations`), so adding a location needs no synced settings key and
// therefore no new merge branch, which is the failure mode this codebase keeps
// hitting. A location exists because stock sits in it.
export const STD_LOCATIONS = ['Storage Locker', 'Service Van', '985', 'Office'];

/** Total across all locations. The invariant `quantity === totalQty(item)`. */
export function totalQty(item: Pick<InventoryItem, 'stockByLocation'>): number {
  return Object.values(item.stockByLocation ?? {}).reduce((s, n) => s + (n || 0), 0);
}

/**
 * Backfill `stockByLocation` for a legacy row from its flat `quantity` + `location`.
 * Idempotent, so it is safe to run on every load and every merge result.
 */
export function ensureStock(item: InventoryItem): InventoryItem {
  if (item.stockByLocation) return item;
  return {
    ...item,
    stockByLocation: { [item.location || 'Unassigned']: item.quantity ?? 0 },
  };
}

/** Set one location's count, recomputing the maintained `quantity` total. */
export function setLocationQty(item: InventoryItem, location: string, qty: number): InventoryItem {
  const base = ensureStock(item);
  const next = { ...(base.stockByLocation ?? {}) };
  // Drop empty locations rather than keeping a 0. Location keys ARE the location
  // list, so a leftover 0 would keep a decommissioned van in every dropdown.
  if (qty > 0) next[location] = qty; else delete next[location];
  return { ...base, stockByLocation: next, quantity: totalQty({ stockByLocation: next }) };
}

/** Add/remove units at one location. Never goes below zero. */
export function adjustLocationQty(item: InventoryItem, location: string, delta: number): InventoryItem {
  const base = ensureStock(item);
  const current = base.stockByLocation?.[location] ?? 0;
  return setLocationQty(base, location, Math.max(0, current + delta));
}

// ── Boxes ────────────────────────────────────────────────────────────────────
// A box is a QR-labelled physical container. Two things had to be modelled: what
// is inside it, and where it currently sits. Both reuse machinery that already
// exists, so boxes add no synced key, no merge branch and no tombstone contract.
//
//  - CONTENTS: an item inside a box holds its stock at location `Box: PPE`.
//    `knownLocations` discovers that string on its own, exactly like the
//    `Contractor: <name>` convention it already follows.
//  - THE BOX ITSELF: one ordinary InventoryItem per box (`box-ppe`, qty 1) whose
//    `stockByLocation` says which building the box is in, and whose `photos`
//    hold the shots of what is inside.
//
// Moving a box is therefore a single-row write: the contents stay "in PPE" and
// only the box row changes address. Nothing has to walk the contents.

/** The six physical boxes. A fixed list on purpose: six strings do not need CRUD. */
export const BOXES = ['PPE', 'Electrical Big', 'Electrical Small', 'Rail System', 'Cables', 'Random'];

/** Where a box row can live. Boxes shuttle between these two. */
export const BOX_HOMES = ['Storage Locker', 'Service Van'];

const DEFAULT_BOX_HOME = 'Storage Locker';

/** Stock-location string for things inside `box`. */
export const boxLocation = (box: string): string => `Box: ${box}`;

/** Inverse of `boxLocation`, or null when `location` is not a box. */
export function parseBoxLocation(location: string): string | null {
  return location.startsWith('Box: ') ? location.slice(5) : null;
}

/** Deterministic id, so two devices creating the same box row converge instead of forking. */
export const boxRowId = (box: string): string => `box-${box.toLowerCase().replace(/\s+/g, '-')}`;

/** True for the placeholder row representing a box, which is not real stock. */
export const isBoxRow = (item: Pick<InventoryItem, 'id'>): boolean => item.id.startsWith('box-');

/** The row representing `box`, if any device has created it yet. */
export function findBoxRow(items: InventoryItem[], box: string): InventoryItem | undefined {
  return items.find(i => i.id === boxRowId(box));
}

/**
 * Which home the box currently sits in. Falls back to the storage locker when no
 * row exists yet, so a never-touched box still reads sensibly instead of blank.
 */
export function boxHome(items: InventoryItem[], box: string): string {
  const row = findBoxRow(items, box);
  const at = Object.keys(row?.stockByLocation ?? {})[0];
  return at || DEFAULT_BOX_HOME;
}

/** Live items holding stock inside `box`. */
export function boxContents(items: InventoryItem[], box: string): InventoryItem[] {
  const loc = boxLocation(box);
  return items.filter(i => !isBoxRow(i) && (i.stockByLocation?.[loc] ?? 0) > 0);
}

/**
 * Create the row for `box` on demand. Boxes are not seeded at load: six phantom
 * rows would show up in the equipment catalog for a feature nobody had used yet.
 * The row appears the first time someone moves a box or adds a photo.
 */
export function ensureBoxRow(items: InventoryItem[], box: string): InventoryItem[] {
  if (findBoxRow(items, box)) return items;
  const now = new Date().toISOString();
  return [...items, {
    id: boxRowId(box),
    sku: `BOX-${box.toUpperCase().replace(/\s+/g, '-')}`,
    name: `Box: ${box}`,
    category: 'bos' as InventoryCategory,
    description: `Physical storage box. Scan its QR label to see what is inside.`,
    quantity: 1,
    stockByLocation: { [DEFAULT_BOX_HOME]: 1 },
    unitOfMeasure: 'unit' as UnitOfMeasure,
    location: DEFAULT_BOX_HOME,
    minStockThreshold: 0,
    unitCost: 0,
    purchaseDate: now.slice(0, 10),
    createdAt: now,
  }];
}

/**
 * Move a whole box to another home. One row changes; the contents do not move,
 * they stay "in PPE" wherever PPE happens to be.
 *
 * Assigns the whole map rather than going through `setLocationQty`: a box is one
 * object in exactly one place, so a move REPLACES its location instead of adding
 * a second one. (Doing both was a bug: the box ended up listed in two places at
 * once with `quantity` stuck at 2.)
 */
export function moveBox(items: InventoryItem[], box: string, to: string): InventoryItem[] {
  return ensureBoxRow(items, box).map(i =>
    i.id === boxRowId(box) ? { ...i, quantity: 1, stockByLocation: { [to]: 1 }, location: to } : i,
  );
}

/** Replace a box's content photos. */
export function setBoxPhotos(items: InventoryItem[], box: string, photos: string[]): InventoryItem[] {
  return ensureBoxRow(items, box).map(i =>
    i.id === boxRowId(box) ? { ...i, photos, imageUrl: photos[0] } : i,
  );
}

/**
 * Every location currently in play: the standard set, plus any location holding
 * stock, plus a per-contractor location for each active contractor. Derived, so
 * it can never drift out of sync with the items themselves.
 */
export function knownLocations(items: InventoryItem[], contractorNames: string[] = []): string[] {
  const set = new Set<string>(STD_LOCATIONS);
  // Boxes are offered even when empty, otherwise you could never receive the
  // first item INTO a box: the location would not exist until stock was in it.
  for (const b of BOXES) set.add(boxLocation(b));
  for (const i of items) for (const loc of Object.keys(i.stockByLocation ?? {})) set.add(loc);
  // Matches the format the receiving modal already writes, so contractor stock
  // received before this feature lands in the same bucket, not a parallel one.
  for (const n of contractorNames) if (n.trim()) set.add(`Contractor: ${n.trim()}`);
  return Array.from(set).sort();
}

/**
 * Apply a work order's contractor-logged parts to stock. The office-confirm step.
 *
 * Pure: hands back the new item list and the new part list, so the caller writes
 * both in one transaction and they cannot disagree. Rules:
 *  - a part with no `inventoryItemId` is free-text (bought at a counter, not from
 *    stock) and is skipped, not guessed at,
 *  - a part already carrying `appliedToInventoryAt` is skipped, so clicking Apply
 *    twice cannot double-decrement,
 *  - the stamp goes on ONLY the parts that actually moved stock.
 */
export function applyPartsToInventory(
  items: InventoryItem[],
  parts: JobPart[],
  appliedBy: string,
): { items: InventoryItem[]; parts: JobPart[]; appliedCount: number } {
  const byId = new Map(items.map(i => [i.id, i]));
  const now = new Date().toISOString();
  let appliedCount = 0;

  const nextParts = parts.map(part => {
    if (!part.inventoryItemId || part.appliedToInventoryAt) return part;
    const item = byId.get(part.inventoryItemId);
    if (!item) return part; // item was deleted; leave unapplied rather than guess
    const location = part.fromLocation || item.location;
    byId.set(item.id, adjustLocationQty(item, location, -(part.quantity || 0)));
    appliedCount++;
    return { ...part, appliedToInventoryAt: now, appliedBy };
  });

  return { items: Array.from(byId.values()), parts: nextParts, appliedCount };
}

/** Parts on a WO that came from stock and have not been applied yet. */
export function pendingStockParts(parts: JobPart[] = []): JobPart[] {
  return parts.filter(p => p.inventoryItemId && !p.appliedToInventoryAt);
}

/** Raw persisted array INCLUDING soft-deleted tombstones. Internal use only. */
function loadRaw(): InventoryItem[] {
  try {
    const raw = localStorage.getItem(INVENTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // unreadable, treat as empty
  }
  return [];
}

export function loadInventory(): InventoryItem[] {
  const all = loadRaw();
  // A store that exists but is entirely tombstoned must NOT reseed the catalog,
  // that would resurrect every deleted item. Only a genuinely absent store seeds.
  if (all.length > 0) return all.filter(i => !i.deletedAt).map(ensureStock);
  const seed = seedFromCatalog().map(ensureStock);
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

  // Re-attach tombstones. Callers hold the LIVE list (loadInventory filters
  // deleted items out), so persisting `items` alone would drop every tombstone
  // and the union merge would resurrect the item from any device that still has
  // it. The tombstone must survive every ordinary save to stay a real delete.
  const live = new Set(stamped.map(i => i.id));
  const tombstones = loadRaw().filter(i => i.deletedAt && !live.has(i.id));
  const persisted = [...stamped, ...tombstones];

  try {
    localStorage.setItem(INVENTORY_KEY, JSON.stringify(persisted));
  } catch (err) {
    // QuotaExceededError (e.g. an oversized inline image) must NOT abort the
    // save and lose the item, fall through to the DB write below.
    console.warn('[inventory] localStorage save failed (likely quota); persisting to DB only', err);
  }
  dbSet(INVENTORY_KEY, persisted);
}

/**
 * Delete an item. Soft-delete, not removal: the record stays in the synced array
 * stamped with `deletedAt` so the delete PROPAGATES.
 *
 * A hard filter-out cannot work here. `mergeInventoryItems` unions by id and
 * keeps anything present on only one side (it has to, every device still holds
 * local-only items from the era when inventory never synced), so a shorter array
 * is indistinguishable from "this device never had that item" and the deleted
 * item comes straight back on the next pull. A tombstone is a normal update that
 * wins on `updatedAt` like any other edit.
 */
export function deleteInventoryItem(id: string): InventoryItem[] {
  const now = new Date().toISOString();
  const all = loadRaw().map(i =>
    i.id === id ? { ...i, deletedAt: now, updatedAt: now } : i
  );
  try {
    localStorage.setItem(INVENTORY_KEY, JSON.stringify(all));
  } catch (err) {
    console.warn('[inventory] localStorage delete failed (likely quota); persisting to DB only', err);
  }
  dbSet(INVENTORY_KEY, all);
  return all.filter(i => !i.deletedAt);
}
