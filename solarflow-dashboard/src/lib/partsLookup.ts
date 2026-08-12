import { PARTS_CATALOG } from './partsCatalog';
import { loadInventory } from './inventoryStore';

export interface PartLookupHit {
  name?: string;
  unitCost?: number;
  source: 'catalog' | 'inventory';
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Resolve a part# against what we already know before ever spending a web
 * search: the static parts catalog, then live inventory. Matches on
 * partNumber OR sku since most catalog/inventory rows only carry one of the
 * two for a given part (e.g. IronRidge Halo Grip is keyed by sku, no
 * partNumber). Inventory wins on price when it has one: catalog unitCost is
 * usually an unset 0 placeholder, inventory reflects what was actually paid.
 */
export function resolvePartByNumber(partNumber: string): PartLookupHit | null {
  const q = norm(partNumber);
  if (!q) return null;

  let hit: PartLookupHit | null = null;

  const catalogMatch = PARTS_CATALOG.find(p => (p.partNumber && norm(p.partNumber) === q) || norm(p.sku) === q);
  if (catalogMatch) hit = { name: catalogMatch.name, unitCost: catalogMatch.unitCost || undefined, source: 'catalog' };

  const invMatch = loadInventory().find(i => (i.partNumber && norm(i.partNumber) === q) || norm(i.sku) === q);
  if (invMatch) {
    hit = {
      name: invMatch.name || hit?.name,
      unitCost: invMatch.unitCost || hit?.unitCost,
      source: 'inventory',
    };
  }

  return hit;
}
