// Standalone removed-sites store — NO external imports (avoids bundler TDZ)
// Admin can soft-remove sites from the SolarEdge monitoring table.
// Persisted in localStorage only; survives page reloads and future imports.

const KEY = 'solarops_removed_sites';

export const getRemovedSiteIds = (): Set<string> => {
  try {
    const raw = localStorage.getItem(KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
};

export const addRemovedSiteId = (siteId: string): void => {
  const set = getRemovedSiteIds();
  set.add(siteId);
  try {
    localStorage.setItem(KEY, JSON.stringify(Array.from(set)));
  } catch (e) {
    console.warn('removedSitesStore: could not persist', e);
  }
};

export const restoreSiteId = (siteId: string): void => {
  const set = getRemovedSiteIds();
  set.delete(siteId);
  try {
    localStorage.setItem(KEY, JSON.stringify(Array.from(set)));
  } catch (e) {
    console.warn('removedSitesStore: could not restore', e);
  }
};
