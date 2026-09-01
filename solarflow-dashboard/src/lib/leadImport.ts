// Shared parse helpers for the "+ Customer" import affordances (Excel + screenshot).
// These lived in the now-deleted Lead Lobby; extracted here as pure functions so
// both Add-Customer modals (Customers view + sales Customer Directory) reuse the
// exact same mapping instead of drifting. UI lives in components/ImportPrefill.tsx.
import * as XLSX from 'xlsx';
import type { Customer, Job } from '../types';

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
  /** SolarEdge PowerCare case number ("Case Number" column). */
  caseNumber?: string;
  /** UPS tracking for the part shipment ("Shipping Tracking Number"). */
  trackingNumber?: string;
}

/**
 * Header groups, named so mapRowToContact and rowToNotes agree on what is
 * already on the form. Anything NOT listed here falls through to the notes,
 * which is how part numbers, serials and ship dates stop getting dropped.
 */
const HEADERS = {
  name:     ['Site Main Contact Name', 'Name', 'Customer Name', 'Full Name', 'Contact Name', 'Client Name'],
  phone:    ['Site Main Contact Phone', 'Phone', 'Phone Number', 'Mobile', 'Cell', 'Contact Phone'],
  email:    ['Site Main Contact Email', 'Email', 'Email Address'],
  address:  ['RMA Street', 'Address', 'Street', 'Street Address', 'Address 1'],
  city:     ['RMA City', 'City', 'Town'],
  state:    ['State'],
  zip:      ['RMA Zip/Postal Code', 'Zip', 'Zip Code', 'Postal Code', 'Zipcode'],
  notes:    ['Notes', 'Note', 'Comments'],
  caseNo:   ['Case Number', 'Case #', 'Case No', 'PowerCare Case Number'],
  tracking: ['Shipping Tracking Number', 'Tracking Number', 'Tracking #'],
  work:     ['Work Description (Internal comments)', 'Work Description', 'Scope of Work'],
} as const;

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
function pick(row: Record<string, unknown>, keys: readonly string[]): string {
  const byNorm = new Map(Object.keys(row).map(k => [normHeader(k), row[k]]));
  for (const key of keys) {
    const v = cellText(byNorm.get(normHeader(key)));
    if (v) return v;
  }
  return '';
}

const normHeader = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * One cell as display text. Excel text-forces some cells with a leading
 * apostrophe (the SolarEdge export ships phones as "'+18139938671" and
 * longitudes as "'-82.365945"), and date cells arrive as Date objects because
 * readSheetRows reads with cellDates.
 */
function cellText(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).replace(/^'/, '').trim();
}

/**
 * Date columns whose cells the reader did NOT type as dates. cellDates only
 * converts what XLSX recognizes, and the SolarEdge export number-formats its
 * ship dates, so they arrive as day serials (46261.28 = 2026-08-28). Convert by
 * header name: guessing from the value alone would mangle real numbers, since a
 * case number is 7162665 and a latitude is 25.94.
 */
const DATE_HEADER = /(date|eta|delivery)/i;

/** One cell as a notes line value, resolving Excel date serials by header. */
function cellDisplay(header: string, v: unknown): string {
  if (DATE_HEADER.test(header) && typeof v === 'number' && v > 20000 && v < 80000) {
    return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  }
  return cellText(v);
}

/**
 * Every column that has no form field of its own, as "Header: value" lines.
 * The RMA/case export carries the part numbers, serials, shipping dates, work
 * description and case subject, which is the whole reason the sheet gets sent;
 * before this they were read for contact info and thrown away.
 */
export function rowToNotes(row: Record<string, unknown>): string {
  const skip = new Set(Object.values(HEADERS).flat().map(normHeader));
  return Object.entries(row)
    .filter(([k, v]) => !skip.has(normHeader(k)) && cellDisplay(k, v))
    .map(([k, v]) => `${k.trim()}: ${cellDisplay(k, v)}`)
    .join('\n');
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
  const { firstName, lastName } = splitName(pick(row, HEADERS.name));
  const caseNumber = pick(row, HEADERS.caseNo);
  // Case # leads the notes in the "Case #: N" shape findPowercareCaseNo scans
  // for, so an order carries its own case number even when the customer record
  // holds a different one. Then the work description, then every other column.
  const notes = [
    caseNumber ? `Case #: ${caseNumber}` : '',
    pick(row, HEADERS.work),
    pick(row, HEADERS.notes),
    rowToNotes(row),
  ].filter(Boolean).join('\n');
  return compact({
    firstName,
    lastName,
    phone:   normalizePhone(pick(row, HEADERS.phone)),
    email:   pick(row, HEADERS.email),
    address: pick(row, HEADERS.address),
    city:    pick(row, HEADERS.city),
    state:   pick(row, HEADERS.state) || 'FL',
    zip:     pick(row, HEADERS.zip),
    caseNumber,
    trackingNumber: pick(row, HEADERS.tracking),
    notes,
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

/** Read EVERY data row of an uploaded spreadsheet (xlsx/xls/csv). Empty if none. */
export async function readSheetRows(file: File): Promise<Record<string, unknown>[]> {
  const buf = await file.arrayBuffer();
  // cellDates so ship dates arrive as Dates, not the 46261.28 Excel serial.
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
}

/**
 * A spreadsheet import is always a PowerCare case: the sheet SolarEdge sends
 * ("Cases for Conexsol") is the PowerCare work queue, so every row becomes a
 * PowerCare customer AND the service order to run it. Pure so the shape is
 * testable; `woNumber` is passed in rather than minted here.
 *
 * The case number is written to customer.powerCareCaseNumber AND to the head of
 * the order notes, which is where findPowercareCaseNo reads it for the SO header.
 *
 * ponytail: no RMAEntry is created even though the row carries the shipped part
 * and tracking. Inventing an RMA record from an import would put a row on the RMA
 * dashboard nobody filed. Add one when the RMA modal can claim it.
 */
export function rowToPowerCareRecords(
  row: Record<string, unknown>,
  woNumber: string,
): { customer: Partial<Customer>; job: Partial<Job> } {
  const c = mapRowToContact(row);
  const name = `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim();
  const siteAddress = [c.address, c.city, c.state, c.zip].filter(Boolean).join(', ');
  return {
    customer: {
      name, firstName: c.firstName, lastName: c.lastName,
      email: c.email ?? '', phone: c.phone ?? '',
      address: c.address ?? '', city: c.city ?? '', state: c.state ?? 'FL', zip: c.zip ?? '',
      notes: c.notes ?? '',
      isPowerCare: true,
      powerCareCaseNumber: c.caseNumber,
      powerCareTrackingNumber: c.trackingNumber,
      referralSource: 'SolarEdge PowerCare',
    },
    job: {
      woNumber,
      // contact_client is the PowerCare entry stage: SolarEdge pays, so there is
      // no quote to send or approve, it goes straight to scheduling the client.
      woStatus: 'contact_client',
      status: 'new',
      isPowercare: true,
      serviceType: pick(row, HEADERS.work) || 'PowerCare',
      title: pick(row, HEADERS.work) || 'PowerCare service',
      clientName: name,
      siteAddress,
      notes: c.notes ?? '',
    },
  };
}
