// The client registry Google Sheet, as a MIRROR.
//
// Since 2026-09-11 client numbers are allocated by Postgres (see clientNumbers.ts
// and supabase/migrations/20260911_client_numbers.sql). The sheet no longer picks
// numbers: it is told which number went to which name, so the office keeps its
// view. This module can therefore only stamp a SPECIFIC row or clear one; there
// is deliberately no "give me the next number" call left in it. The Apps Script
// refuses that request too, so a stale tab still running the old code fails
// loudly instead of allocating behind the database's back.
//
// The endpoint is an Apps Script web app bound to the sheet; see
// scripts/client-registry.gs for the script and its deploy steps.

import { authedFetch } from './supabase';

// ponytail: an Apps Script /exec URL instead of the Sheets API. No OAuth, no
// service account key, no new /api/ function (Vercel Hobby caps api/ at 12).
// Read here only to know whether the sheet is configured at all; the call
// itself is made by the server (see viaServer).
// Bracket notation: import.meta.env is an index signature under this tsconfig.
const REGISTRY_URL = import.meta.env['VITE_CLIENT_REGISTRY_URL'] as string | undefined;

/** False on builds without the sheet (preview), where mirroring is skipped. */
export function sheetRegistryConfigured(): boolean {
  return !!REGISTRY_URL;
}

/**
 * Every sheet write goes through OUR server, never from the browser to Google.
 *
 * The browser used to POST the Apps Script /exec URL directly. That call is
 * reliable from a server and unreliable from a browser: it is a third-party
 * request, so an extension, tracking protection or a corporate network can kill
 * it. Assigning US-15715 failed with a bare "NetworkError" on 2026-10-01 while
 * the identical call from the server returned 200. Same-origin cannot be
 * blocked that way, and it keeps the sheet's URL out of the client bundle's
 * reach entirely.
 */
async function viaServer(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await authedFetch('/api/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null) as Record<string, unknown> | null;
  const failure = data?.['error'];
  if (!res.ok) throw new Error(String(failure ?? `Client registry sheet returned HTTP ${res.status}`));
  if (failure) throw new Error(String(failure));
  return data ?? {};
}

export interface SheetStamp {
  clientId: string;
  /** The name now on that row. When `taken`, this is the OTHER name already there. */
  name: string;
  /** The row already holds a different name; the sheet was NOT changed. */
  taken?: boolean;
}

/**
 * Write `name` onto the sheet row for `clientId`. A blank row takes the name; a
 * row already holding the same name is left alone; a row holding someone else
 * is never overwritten and comes back `taken`.
 *
 * Returns null when the sheet is not configured. Throws on a real failure, which
 * the caller treats as "mirror later", never as "the number is invalid":
 * Postgres is the authority, the sheet only follows.
 */
export async function stampSheetRow(name: string, clientId: string): Promise<SheetStamp | null> {
  if (!REGISTRY_URL) return null;
  const data = await viaServer({ action: 'registry-mirror', name, clientId });
  if (!data['clientId']) throw new Error('Client registry sheet returned no row.');
  return data as unknown as SheetStamp;
}

/**
 * Clear a row this app wrote, because the save it was for never happened. The
 * sheet only clears the cell while it still holds exactly `name`, so a late
 * clear cannot wipe someone else's row. Resolves false on any failure.
 */
export async function clearSheetRow(clientId: string, name: string): Promise<boolean> {
  if (!REGISTRY_URL || !clientId) return false;
  try {
    const data = await viaServer({ action: 'registry-mirror', op: 'release', clientId, name });
    return data['released'] === true;
  } catch {
    return false;
  }
}
