// Shared parse helpers for the "+ Customer" import affordances (Excel + screenshot).
// These lived in the now-deleted Lead Lobby; extracted here as pure functions so
// both Add-Customer modals (Customers view + sales Customer Directory) reuse the
// exact same mapping instead of drifting. UI lives in components/ImportPrefill.tsx.
import * as XLSX from 'xlsx';

/** Neutral, form-agnostic contact shape. Each modal maps this onto its own formData. */
export interface ParsedContact {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  notes?: string;
}

/** Digits only; drop a leading US country code so "1-863-..." and "8863..." normalize alike. */
export function normalizePhone(raw: unknown): string {
  const d = String(raw ?? '').replace(/\D/g, '');
  return d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
}

/**
 * Case/space/punctuation-insensitive column lookup. Real exports vary the header
 * ("Zip" vs "Zip Code" vs "Postal Code"), so match loosely on the first candidate
 * that has a non-empty value.
 */
function pick(row: Record<string, unknown>, keys: string[]): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const byNorm = new Map(Object.keys(row).map(k => [norm(k), row[k]]));
  for (const key of keys) {
    const v = byNorm.get(norm(key));
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return '';
}

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') };
}

/** Drop empty-string fields so a merge only overwrites the form where the sheet had data. */
function compact(c: ParsedContact): ParsedContact {
  return Object.fromEntries(Object.entries(c).filter(([, v]) => v)) as ParsedContact;
}

/**
 * Map one spreadsheet row to a contact. Primary target is the SolarEdge
 * "Site Main Contact / RMA" export, with generic fallbacks for hand-made sheets.
 * State deliberately ignores "RMA State" (that is a warehouse/shipping state, not
 * the customer's) and defaults to FL, the company's home market.
 */
export function mapRowToContact(row: Record<string, unknown>): ParsedContact {
  const name = pick(row, ['Site Main Contact Name', 'Name', 'Customer Name', 'Full Name', 'Contact Name', 'Client Name']);
  const { firstName, lastName } = splitName(name);
  return compact({
    firstName,
    lastName,
    phone:   normalizePhone(pick(row, ['Site Main Contact Phone', 'Phone', 'Phone Number', 'Mobile', 'Cell', 'Contact Phone'])),
    email:   pick(row, ['Site Main Contact Email', 'Email', 'Email Address']),
    address: pick(row, ['RMA Street', 'Address', 'Street', 'Street Address', 'Address 1']),
    city:    pick(row, ['RMA City', 'City', 'Town']),
    state:   pick(row, ['State']) || 'FL',
    zip:     pick(row, ['RMA Zip/Postal Code', 'Zip', 'Zip Code', 'Postal Code', 'Zipcode']),
    notes:   pick(row, ['Notes', 'Note', 'Comments']),
  });
}

/** Map the /api/parse-lead-image (Claude Vision) response onto the neutral shape. */
export function mapVisionToContact(data: Record<string, unknown>): ParsedContact {
  const notes = [data['notes'], data['hsId'] && `HS_ID: ${data['hsId']}`, data['contractName'] && `Contract: ${data['contractName']}`]
    .filter(Boolean).map(String).join('\n');
  return compact({
    firstName: String(data['firstName'] ?? ''),
    lastName:  String(data['lastName'] ?? ''),
    email:     String(data['email'] ?? ''),
    phone:     normalizePhone(data['phone']),
    address:   String(data['address'] ?? ''),
    city:      String(data['city'] ?? ''),
    state:     String(data['state'] ?? ''),
    zip:       String(data['zip'] ?? ''),
    notes,
  });
}

/** Read the FIRST data row of an uploaded spreadsheet (xlsx/xls/csv). Null if empty. */
export async function readFirstSheetRow(file: File): Promise<Record<string, unknown> | null> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return null;
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
  return rows[0] ?? null;
}
