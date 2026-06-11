// SolarOps, Address Cleanup checklist storage
// Shared (cross-user) checklist for the address-conflict remediation work.
// Stored under the KV sync key 'solarops_address_cleanup' so the whole team
// sees the same list and check-offs sync across devices. Items are seeded from
// ADDRESS_CLEANUP_SEED on first load; remote state always wins per item by
// updatedAt (merge handled in syncEngine.mergeAddressCleanupItems).

import { dbSet } from './db';
import { ADDRESS_CLEANUP_SEED } from './addressCleanupSeed';

export const ADDRESS_CLEANUP_KEY = 'solarops_address_cleanup';

export interface AddressCleanupItem {
  id: string;
  customerId: string;
  clientNumber: string;
  name: string;
  dbAddress: string;
  seAddress: string;
  trelloAddress: string;
  note: string;
  done: boolean;
  doneBy: string;
  doneAt: string;     // ISO, '' while open
  updatedAt: string;  // ISO, drives last-writer-wins per item
}

function seedItems(): AddressCleanupItem[] {
  return ADDRESS_CLEANUP_SEED.map(s => ({
    ...s,
    done: false,
    doneBy: '',
    doneAt: '',
    updatedAt: '',
  }));
}

export function loadCleanupItems(): AddressCleanupItem[] {
  let stored: AddressCleanupItem[] = [];
  try {
    const raw = localStorage.getItem(ADDRESS_CLEANUP_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) stored = parsed;
    }
  } catch (e) { console.error('[addressCleanupStore] load failed', e); }

  // Merge in any seed items the stored list does not know about yet, so
  // shipping new audit batches in the seed file extends everyone's list.
  const known = new Set(stored.map(i => i.id));
  const missing = seedItems().filter(i => !known.has(i.id));
  const all = missing.length > 0 ? [...stored, ...missing] : stored;
  if (missing.length > 0) persist(all);
  return all;
}

function persist(items: AddressCleanupItem[]): void {
  try { localStorage.setItem(ADDRESS_CLEANUP_KEY, JSON.stringify(items)); }
  catch (e) { console.error('[addressCleanupStore] persist failed', e); }
  void dbSet(ADDRESS_CLEANUP_KEY, items);
}

export function toggleCleanupItem(id: string, userName: string): AddressCleanupItem[] {
  const now = new Date().toISOString();
  const items = loadCleanupItems().map(i => {
    if (i.id !== id) return i;
    const done = !i.done;
    return { ...i, done, doneBy: done ? userName : '', doneAt: done ? now : '', updatedAt: now };
  });
  persist(items);
  return items;
}
