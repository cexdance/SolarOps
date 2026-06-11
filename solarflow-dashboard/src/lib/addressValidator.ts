// SolarOps, Address Validation Utility
// Uses Nominatim (OpenStreetMap) for free geocoding/validation, no API key required
// Rate limit: 1 req/sec (respectful usage with caching)

export interface ValidatedAddress {
  // Original input
  input: {
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    fullAddress?: string;
  };
  // Validation result
  isValid: boolean;
  confidence: 'high' | 'medium' | 'low' | 'none';
  // Standardized/normalized components (from Nominatim)
  normalized?: {
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
    formatted: string;
    lat?: number;
    lon?: number;
    placeType?: string; // 'house', 'building', 'road', 'suburb', 'city', 'state', etc.
  };
  // Issues found
  issues: string[];
  // Raw Nominatim response for debugging
  raw?: any;
}

// In-memory cache to respect Nominatim's 1 req/sec rate limit
const geocodeCache = new Map<string, ValidatedAddress>();
const pendingRequests = new Map<string, Promise<ValidatedAddress>>();

/**
 * Build a search query string from address components
 */
function buildQuery(input: ValidatedAddress['input']): string {
  if (input.fullAddress) return input.fullAddress.trim();

  const parts = [
    input.address,
    input.city,
    input.state && input.zip ? `${input.state} ${input.zip}` : input.state || input.zip,
  ].filter(Boolean);
  return parts.join(', ');
}

/**
 * Validate a single address using Nominatim
 */
export async function validateAddress(input: ValidatedAddress['input']): Promise<ValidatedAddress> {
  const query = buildQuery(input);
  if (!query) {
    return {
      input,
      isValid: false,
      confidence: 'none',
      issues: ['No address provided'],
    };
  }

  // Check cache first
  const cacheKey = query.toLowerCase();
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey)!;
  }

  // Deduplicate concurrent requests for the same address
  if (pendingRequests.has(cacheKey)) {
    return pendingRequests.get(cacheKey)!;
  }

  const promise = (async () => {
    try {
      // Nominatim: free, no API key, 1 req/sec limit
      const url = `https://nominatim.openstreetmap.org/search?` +
        `q=${encodeURIComponent(query)}` +
        `&format=json` +
        `&limit=1` +
        `&addressdetails=1` +
        `&accept-language=en`;

      const res = await fetch(url, {
        headers: {
          'Accept-Language': 'en',
          'User-Agent': 'SolarOps/1.0 (address-validation)',
        },
      });

      if (!res.ok) {
        throw new Error(`Nominatim HTTP ${res.status}`);
      }

      const data = await res.json();

      if (!data || data.length === 0) {
        const result: ValidatedAddress = {
          input,
          isValid: false,
          confidence: 'none',
          issues: [`Address not found: "${query}"`],
        };
        geocodeCache.set(cacheKey, result);
        return result;
      }

      const result_data = data[0];
      const addr = result_data.address || {};

      // Determine confidence based on match type and details
      let confidence: ValidatedAddress['confidence'] = 'low';
      const placeType = result_data.type || result_data.class;

      if (placeType === 'house' || placeType === 'building' || result_data.importance && result_data.importance > 0.7) {
        confidence = 'high';
      } else if (placeType === 'road' || placeType === 'street' || (addr.house_number && addr.road)) {
        confidence = 'high';
      } else if (addr.city || addr.town || addr.village || addr.suburb) {
        confidence = 'medium';
      } else if (addr.state || addr.postcode) {
        confidence = 'medium';
      }

      const normalized = {
        address: addr.house_number ? `${addr.house_number} ${addr.road || ''}`.trim() : addr.road,
        city: addr.city || addr.town || addr.village || addr.suburb || addr.county,
        state: addr.state || addr.state_district,
        zip: addr.postcode,
        country: addr.country_code?.toUpperCase(),
        formatted: result_data.display_name,
        lat: parseFloat(result_data.lat),
        lon: parseFloat(result_data.lon),
        placeType,
      };

      // Check for discrepancies with input
      const issues: string[] = [];
      if (input.zip && normalized.zip && input.zip.replace(/\s/g, '') !== normalized.zip.replace(/\s/g, '')) {
        issues.push(`ZIP mismatch: input "${input.zip}" vs validated "${normalized.zip}"`);
      }
      if (input.state && normalized.state && input.state.toUpperCase() !== normalized.state.toUpperCase()) {
        issues.push(`State mismatch: input "${input.state}" vs validated "${normalized.state}"`);
      }
      if (input.city && normalized.city && input.city.toLowerCase() !== normalized.city.toLowerCase()) {
        issues.push(`City mismatch: input "${input.city}" vs validated "${normalized.city}"`);
      }

      const validated: ValidatedAddress = {
        input,
        isValid: true,
        confidence,
        normalized,
        issues,
        raw: result_data,
      };

      geocodeCache.set(cacheKey, validated);
      return validated;
    } catch (err) {
      const result: ValidatedAddress = {
        input,
        isValid: false,
        confidence: 'none',
        issues: [`Validation error: ${err instanceof Error ? err.message : String(err)}`],
      };
      geocodeCache.set(cacheKey, result);
      return result;
    } finally {
      pendingRequests.delete(cacheKey);
    }
  })();

  pendingRequests.set(cacheKey, promise);
  return promise;
}

/**
 * Geocode an address to a coordinate, tolerant of imperfect data.
 *
 * 1) Tries the full street address, dropping any city/state/ZIP that is already
 *    embedded in the street string (avoids duplicated queries like
 *    "6024 ACORN CIR, LABELLE, FL 33935, LABELLE, FL 33935").
 * 2) If the house-level lookup returns nothing (rural addresses are frequently
 *    absent from OpenStreetMap), falls back to the city/ZIP centroid so the
 *    stop still plots approximately instead of showing "not located".
 *
 * Returns null only when even the city/ZIP cannot be resolved.
 */
export async function geocodeAddress(
  p: { address?: string; city?: string; state?: string; zip?: string }
): Promise<{ lat: number; lon: number } | null> {
  const tryOne = async (input: ValidatedAddress['input']): Promise<{ lat: number; lon: number } | null> => {
    const r = await validateAddress(input);
    const lat = r.normalized?.lat, lon = r.normalized?.lon;
    return (typeof lat === 'number' && typeof lon === 'number') ? { lat, lon } : null;
  };

  const addr = (p.address || '').trim();
  const lc = addr.toLowerCase();
  const cityDup = !!p.city && lc.includes(p.city.toLowerCase());
  const zipDup = !!p.zip && addr.includes(p.zip);

  // 1) Full street address (de-duplicated).
  if (addr) {
    const primary = await tryOne({
      address: addr,
      city: cityDup ? undefined : p.city || undefined,
      state: p.state || undefined,
      zip: zipDup ? undefined : p.zip || undefined,
    });
    if (primary) return primary;
  }

  // 2) City / ZIP centroid fallback. Require a city or a state so we never send a
  //    bare ZIP - "33935" alone geocodes to Spain, "FL 33935" / "LABELLE, FL" do not.
  if (p.city || p.state) {
    const fallback = await tryOne({
      city: p.city || undefined,
      state: p.state || undefined,
      zip: p.zip || undefined,
    });
    if (fallback) return fallback;
  }

  return null;
}

/**
 * Validate multiple addresses in parallel (with rate limiting)
 * Processes in batches to respect Nominatim's 1 req/sec limit
 */
export async function validateAddresses(
  inputs: ValidatedAddress['input'][],
  options?: { batchSize?: number; delayMs?: number }
): Promise<ValidatedAddress[]> {
  const { batchSize = 1, delayMs = 1100 } = options || {};
  const results: ValidatedAddress[] = [];

  for (let i = 0; i < inputs.length; i += batchSize) {
    const batch = inputs.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(validateAddress));
    results.push(...batchResults);

    // Rate limiting delay between batches
    if (i + batchSize < inputs.length) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  return results;
}

/**
 * Quick validation without full geocoding, checks format only
 * Use for immediate feedback, then call validateAddress for full validation
 */
export function quickValidate(input: ValidatedAddress['input']): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const query = buildQuery(input);

  if (!query) {
    return { valid: false, issues: ['No address provided'] };
  }

  // Basic format checks
  if (input.zip && !/^\d{5}(-\d{4})?$/.test(input.zip)) {
    issues.push('ZIP should be 5 digits (or ZIP+4)');
  }
  if (input.state && !/^[A-Z]{2}$/i.test(input.state)) {
    issues.push('State should be 2-letter code (e.g., FL)');
  }
  if (!input.address || input.address.trim().length < 3) {
    issues.push('Street address too short');
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Normalize address components to standard format
 */
export function normalizeAddressComponents(input: ValidatedAddress['input']): {
  address: string;
  city: string;
  state: string;
  zip: string;
} {
  return {
    address: input.address?.trim() || '',
    city: input.city?.trim() || '',
    state: input.state?.trim().toUpperCase() || '',
    zip: input.zip?.trim().replace(/\s/g, '') || '',
  };
}

// Trailing tokens that are unit designators, not house numbers. "Maple Grove LOT 10"
// must stay as written; reordering it produces a non-address.
const UNIT_SUFFIX = /\b(lot|unit|apt|apartment|suite|ste|bldg|building|trlr|trailer|#)\.?$/i;

/**
 * Fix SolarEdge-style street order: "Northwest 72nd Street 7499" -> "7499 Northwest 72nd Street".
 * The SolarEdge monitoring API returns location.address with the house number after the
 * street name (European order), which breaks Google Maps lookups.
 *
 * Conservative by design. Reorders only when the street segment starts with a letter,
 * ends in a 1-6 digit number, the name part has at least two words (skips "Calle 2",
 * "LOT 10"), and the name part does not end in a unit designator.
 * Safe to call on already-correct US addresses: they start with a digit and pass through.
 */
export function normalizeStreetOrder(address: string): string {
  if (!address) return address;
  const parts = address.split(',');
  const street = (parts[0] ?? '').trim();
  const match = street.match(/^([A-Za-z].*\S)\s+(\d{1,6})$/);
  if (!match) return address;
  const namePart = match[1] ?? '';
  if (namePart.trim().split(/\s+/).length < 2) return address;
  if (UNIT_SUFFIX.test(namePart)) return address;
  parts[0] = `${match[2]} ${namePart}`;
  return parts.join(',');
}

/**
 * Strip a city/state/zip suffix that is embedded in the street address string when the
 * same values are also held in separate fields, so they do not render or geocode twice.
 * "330 Beulah Rd, Winter Garden, FL 34787" + city "Winter Garden" -> "330 Beulah Rd".
 */
export function stripEmbeddedCityStateZip(
  address: string,
  p: { city?: string; state?: string; zip?: string }
): string {
  if (!address) return address;
  let out = address.trim();
  const cut = (needle?: string) => {
    if (!needle) return;
    const idx = out.toLowerCase().indexOf(`, ${needle.toLowerCase()}`);
    if (idx > 0) out = out.slice(0, idx).trim();
  };
  cut(p.city);
  cut(p.state);
  if (p.zip) out = out.replace(new RegExp(`,?\\s*${p.zip.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`), '').trim();
  return out.replace(/,\s*$/, '') || address.trim();
}

/**
 * Format address for display/storage
 */
export function formatAddress(components: { address?: string; city?: string; state?: string; zip?: string }): string {
  const parts = [
    components.address,
    components.city,
    components.state && components.zip ? `${components.state} ${components.zip}` : components.state || components.zip,
  ].filter(Boolean);
  return parts.join(', ');
}

/**
 * Clear the validation cache (useful for testing or memory management)
 */
export function clearAddressCache(): void {
  geocodeCache.clear();
  pendingRequests.clear();
}

/**
 * Get cache stats
 */
export function getAddressCacheStats(): { size: number; keys: string[] } {
  return {
    size: geocodeCache.size,
    keys: Array.from(geocodeCache.keys()),
  };
}