/**
 * Stale-deploy recovery, shared by both error boundaries and main.tsx.
 *
 * After a deploy, an open tab still references the previous build's hashed chunk
 * files; navigating to a lazy view then fails to import them. That is not a bug,
 * it is an out-of-date tab, and a reload fixes it.
 *
 * The 60s guard is the reason this lives in one place: three copies of it had
 * drifted apart, and a guard that only half the callers respect is not a guard.
 */

const RELOAD_KEY = 'solarops_chunk_reload';

export const isStaleChunkError = (error: unknown): boolean =>
  error instanceof Error &&
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(error.message);

/**
 * Reload once to pick up the new build. Returns false if a reload already
 * happened in the last minute, which means the import is failing for some other
 * reason (network down) and reloading again would just spin.
 */
export const reloadForStaleChunk = (): boolean => {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // Private mode / quota: proceed with the reload rather than wedging the tab.
  }
  window.location.reload();
  return true;
};
