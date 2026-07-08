// SolarOps, SolarEdge site filter (shared between Update Sites sync, Import Modal,
// mergeRemote, and the loadData always-on exclusion pass).

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
  if (/^V[\s-]/i.test(name))        return false;  // V-xxxx accounts (non-FL, excluded)
  if (/^GA[\s-]/i.test(name))       return false;  // Georgia territory GA-xxxxx
  if (/^GT[\s-]/i.test(name))       return false;  // Guatemala territory GT-xxxxx
  if (/^USP[\s-]/i.test(name))      return false;  // USP territory accounts
  if (/^Casa\b/i.test(name))        return false;  // non-FL business
  if (/^Clinica\b/i.test(name))     return false;  // non-FL business
  if (/^Club\b/i.test(name))        return false;  // non-FL business
  if (/^Cook\b/i.test(name))        return false;  // non-FL business
  if (/^Guyoil\b/i.test(name))      return false;  // non-FL business
  if (/^Industrias\b/i.test(name))  return false;  // non-FL business
  if (/\bDELETE\b/i.test(name))     return false;  // soft-deleted / marked for removal
  if (/\bDELETE\b/i.test(addr))     return false;
  if (/\bDISABLED\b/i.test(name))   return false;  // disabled accounts
  if (/\(TX\)/i.test(name))         return false;  // Texas accounts
  if (/\(RD\)/i.test(name))         return false;  // other territory (República Dominicana)
  if (/\bnull\b/i.test(name))       return false;  // corrupted / placeholder records

  // ── Florida allow-list ────────────────────────────────────────────────────
  // An explicit non-Florida state excludes the site even if it uses the
  // Conexsol US-NNNNN naming. Empty/unknown state falls through to the naming
  // rule (SolarEdge often omits state on FL sites).
  const st = state.toLowerCase();
  if (st && st !== 'fl' && st !== 'florida') return false;
  if (state === 'Florida' || state === 'FL') return true;
  if (/^US[\s-]\d+/i.test(name))             return true;  // Conexsol FL naming (US-NNNNN)

  // Anything else (unknown territory, no FL signal), exclude
  return false;
}

/**
 * Client ID for an imported site: the leading US-NNNNN token of the site name
 * (Conexsol naming, e.g. "US-15523-2 Charles Roach" -> "US-15523-2"), else the
 * SolarEdge accountId. Empty string when neither applies.
 */
export function deriveClientId(name?: string, accountId?: string): string {
  const first = (name || '').trim().split(/\s+/)[0];
  if (/^US-?\d/i.test(first)) return first;
  return accountId || '';
}

/**
 * Customer-record variant, same rules, different field shape.
 * Use in loadData(), mergeRemote(), and anywhere Customer[] is filtered.
 */
export function isAllowedCustomer(c: { name?: string; address?: string }): boolean {
  const name = (c.name    || '').trim();
  const addr = (c.address || '').trim();
  if (/^V[\s-]/i.test(name))    return false;
  if (/^GA[\s-]/i.test(name))   return false;
  if (/^GT[\s-]/i.test(name))   return false;
  if (/^USP[\s-]/i.test(name))  return false;
  if (/\bDELETE\b/i.test(name)) return false;
  if (/\bDELETE\b/i.test(addr)) return false;
  return true;
}
