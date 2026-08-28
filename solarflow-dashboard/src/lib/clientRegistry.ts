// Client number registry: the Google Sheet that owns the consecutive US-1XXXX
// numbers. "Move to Client" calls this so the sheet and the CRM agree on which
// number belongs to which name.
//
// The endpoint is an Apps Script web app bound to the sheet; see
// scripts/client-registry.gs for the script and its deploy steps.

// ponytail: an Apps Script /exec URL instead of the Sheets API. No OAuth, no
// service account key, no new /api/ function (Vercel Hobby caps api/ at 12).
// Bracket notation: import.meta.env is an index signature under this tsconfig.
const REGISTRY_URL = import.meta.env['VITE_CLIENT_REGISTRY_URL'] as string | undefined;

export interface RegistryResult {
  /** The US-1XXXX number the sheet assigned or matched. */
  clientId: string;
  /** The name now on that row. When `taken`, this is the OTHER name already there. */
  name: string;
  /** The number is already assigned to someone else; the sheet was NOT changed. */
  taken?: boolean;
}

/**
 * Stamp `name` onto the registry row for `clientId`, or claim the next
 * unassigned number when `clientId` is empty.
 *
 * Returns null when VITE_CLIENT_REGISTRY_URL is unset, so the app keeps working
 * (converting without touching the sheet) before the script is deployed.
 * Throws on any real failure: the caller must not convert on a failed write, or
 * the sheet and the CRM silently drift apart.
 */
export async function claimClientNumber(name: string, clientId?: string): Promise<RegistryResult | null> {
  if (!REGISTRY_URL) return null;
  // text/plain keeps this a CORS "simple request" - Apps Script does not answer
  // preflight OPTIONS, so an application/json body would fail before it is sent.
  const res = await fetch(REGISTRY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ name, clientId: clientId || undefined }),
  });
  if (!res.ok) throw new Error(`Client registry returned HTTP ${res.status}`);
  const data = await res.json();
  if (data?.error) throw new Error(String(data.error));
  if (!data?.clientId) throw new Error('Client registry returned no client number.');
  return data as RegistryResult;
}
