// SolarOps — SolarEdge site filter (shared between Update Sites sync and Import Modal)
// Apply this BEFORE creating or updating any customer records from SolarEdge data.

export interface RawSite {
  id: string | number;
  name?: string;
  location?: {
    state?: string;
    address?: string;
    city?: string;
    zip?: string;
  };
}

/**
 * Returns true if the site belongs to the Florida portfolio and should be
 * imported / synced.  Returns false for other-territory and junk accounts.
 */
export function isFloridaSite(s: RawSite): boolean {
  const name  = (s.name               || '').trim();
  const state = (s.location?.state    || '').trim();
  const addr  = (s.location?.address  || '').trim();

  // ── Hard exclusions ───────────────────────────────────────────────────────
  if (/^GA[\s-]/i.test(name))   return false;   // Georgia territory GA-xxxxx
  if (/^GT[\s-]/i.test(name))   return false;   // Guatemala territory GT-xxxxx
  if (/^USP[\s-]/i.test(name))  return false;   // USP territory accounts
  if (/\bDELETE\b/i.test(name)) return false;   // soft-deleted / marked for removal
  if (/\bDELETE\b/i.test(addr)) return false;

  // ── Florida allow-list ────────────────────────────────────────────────────
  if (state === 'Florida' || state === 'FL') return true;
  if (/^US[\s-]\d+/i.test(name))             return true;  // Conexsol FL naming (US-NNNNN)

  // Anything else (explicit non-FL state, unknown territory) — exclude
  return false;
}
