import { authedFetch } from './supabase';

export interface ParsedDatasheetFields {
  name?: string;
  manufacturer?: string;
  partNumber?: string;
  sku?: string;
  category?: string;
  description?: string;
}

/**
 * Parse a PDF/image spec sheet via /api/parse-lead-image (action: parse-datasheet).
 * Shared by InventoryModule's add/edit form and the Reroofing tab's parts list so
 * the fetch/auth/response-shape contract lives in one place. Throws on any
 * failure (network, non-2xx, bad JSON); callers fall back to manual entry.
 */
export async function parseDatasheetFile(file: File): Promise<ParsedDatasheetFields> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  const res = await authedFetch('/api/parse-lead-image', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'parse-datasheet', imageBase64: base64, mimeType: file.type }),
  });
  if (!res.ok) throw new Error(`datasheet parse ${res.status}`);
  const p = await res.json() as ParsedDatasheetFields;
  return {
    name: p.name || undefined,
    manufacturer: p.manufacturer || undefined,
    partNumber: p.partNumber || undefined,
    sku: p.sku || undefined,
    category: p.category || undefined,
    description: p.description || undefined,
  };
}
