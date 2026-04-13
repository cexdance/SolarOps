// scripts/import_from_solaredge.mts
// Generates src/lib/mergedCustomers.ts from FL_SITES in solarEdgeSites.ts
// Run: npx tsx scripts/import_from_solaredge.mts

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── 1. Load FL_SITES by reading and eval-ing the TS source ──────────────────
const sitesSource = readFileSync(
  resolve(ROOT, 'src/lib/solarEdgeSites.ts'),
  'utf-8'
);

// Strip TS type declarations and extract the JSON array
const jsonStr = sitesSource
  .replace(/^\/\/.*$/gm, '')                         // strip line comments
  .replace(/export interface[\s\S]*?^\}/gm, '')       // strip interfaces
  .replace(/export const FL_SITES[^=]+=/, '')         // strip const declaration
  .replace(/as const;?\s*$/, '')                      // strip "as const"
  .replace(/;\s*$/, '')                               // strip trailing semicolon
  .trim();

let FL_SITES: any[];
try {
  FL_SITES = JSON.parse(jsonStr);
} catch (e) {
  console.error('Failed to parse FL_SITES:', (e as Error).message);
  process.exit(1);
}

console.log(`Loaded ${FL_SITES.length} FL_SITES`);

// ── 2. Name parsing helpers ─────────────────────────────────────────────────

const COMMERCIAL_RE =
  /city\s+of|school|hospital|hotel|mall|university|church|\binc\b|\bllc\b|\bcorp\b|parque\s+solar|one\s+eleven|\bmanishpv\b|firestation|fire\s+station|commercial|business/i;

/** Strip noise tokens from a raw siteName */
function cleanName(raw: string): string {
  let n = raw;

  // Extract leading "-1 " / "-2 " — will append as "(1)" after all cleaning
  const leadingNum = n.match(/^-(\d+)\s+/);
  n = n.replace(/^-\d+\s+/, '');

  // Strip "US-##### " / "US ##### " prefix
  n = n.replace(/^US[\s-]\d+\s*/i, '');

  // Strip "Res " prefix
  n = n.replace(/^Res\s+/i, '');

  // Strip " TSP###### " suffix
  n = n.replace(/\s+TSP\d+/gi, '');

  // Strip " Residence" / " Residenc" suffix
  n = n.replace(/\s+Residenc[e]?\s*$/i, '');

  // Strip trailing location qualifiers: " Dundee FL", " (Jacksonville)"
  n = n.replace(/\s+\([^)]+\)\s*$/, '');
  n = n.replace(/\s+[A-Z][a-z]+(?: [A-Z]{2})?\s*$/, s => {
    // Only strip if it looks like "City FL" — not part of the name
    return /[A-Z]{2}$/.test(s.trim()) ? '' : s;
  });

  // Strip "- address" suffix like "- 16771 Yellow Bluff Rd"
  n = n.replace(/\s+-\s+\d+.*$/, '');

  // Strip " ##panel X.XkW" patterns
  n = n.replace(/\s+\d+\s+panel\s+[\d.]+kw/i, '');

  // Handle "LastName, FirstName" → "FirstName LastName"
  if (n.includes(',')) {
    const [last, first] = n.split(',').map(p => p.trim());
    n = `${first} ${last}`;
  }

  // Trailing dot
  n = n.replace(/\.$/, '');

  // Title-case
  n = n
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
    // Preserve common particles
    .replace(/\bMc([a-z])/g, (_, c) => `Mc${c.toUpperCase()}`)
    .replace(/\bMac([a-z])/g, (_, c) => `Mac${c.toUpperCase()}`)
    .replace(/\bDe([a-z])/g, (_, c) => `de${c.toUpperCase()}`) // deCapua
    .replace(/\bDel\b/g, 'del')
    .replace(/\bVan\b/g, 'Van')
    .replace(/\bSt\b/g, 'St');

  const cleaned = n.trim();
  return leadingNum ? `${cleaned} (${leadingNum[1]})` : cleaned;
}

/** Parse "Street, City, State, Zip" → parts */
function parseAddress(raw: string) {
  if (!raw) return { address: '', city: '', state: 'FL', zip: '' };
  // Format: "Street #, City, FL, Zip"
  const parts = raw.split(',').map(p => p.trim());
  if (parts.length >= 4) {
    const zip = parts[parts.length - 1];
    const state = parts[parts.length - 2];
    const city = parts[parts.length - 3];
    const address = parts.slice(0, parts.length - 3).join(', ');
    return { address, city, state, zip };
  }
  return { address: raw, city: '', state: 'FL', zip: '' };
}

/** Skip obvious placeholder/test entries */
function isTestEntry(siteName: string): boolean {
  return /^delete\b/i.test(siteName.trim());
}

// ── 3. Convert FL_SITES → Customer records ──────────────────────────────────

interface MergedCustomer {
  clientId: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  type: 'residential' | 'commercial';
  clientStatus: string;
  solarEdgeSiteId: string;
  systemType: string;
  notes: string;
  installDate: string;
  peakPower: number;
  isPowerCare: boolean;
}

// Track used clientIds to avoid collisions
const usedIds = new Set<string>();
let autoIdCounter = 10001;

function nextAutoId(): string {
  while (usedIds.has(`US-${autoIdCounter}`)) autoIdCounter++;
  const id = `US-${autoIdCounter}`;
  usedIds.add(id);
  autoIdCounter++;
  return id;
}

/** Extract US-XXXXX from a siteName and return { clientId, remainingName }
 *  Handles: "US-15036 Bobby Acon", "US 15054 Residence ...", "Us-15402 Pavel Rizo", "US-15015" (id only)
 */
function extractClientId(raw: string): { clientId: string | null; remainingName: string } {
  const m = raw.match(/^US[\s-](\d+)\s*/i);
  if (!m) return { clientId: null, remainingName: raw };
  const clientId = `US-${m[1]}`;
  const remainingName = raw.slice(m[0].length).trim();
  return { clientId, remainingName };
}

// Pre-register known clientIds from FL_SITES siteNames
FL_SITES.forEach(s => {
  const { clientId } = extractClientId(s.siteName || '');
  if (clientId) usedIds.add(clientId);
  if (s.clientId && /^US-\d+$/.test(s.clientId)) usedIds.add(s.clientId);
});

const customers: MergedCustomer[] = [];
const skipped: string[] = [];

for (const site of FL_SITES) {
  const raw: string = site.siteName || '';

  // Skip obvious test entries
  if (isTestEntry(raw)) {
    skipped.push(`SKIP (test): ${raw}`);
    continue;
  }

  // Extract US-XXXXX from siteName — takes priority over site.clientId
  const { clientId: parsedId, remainingName } = extractClientId(raw);

  // Determine clientId: siteName-parsed > site.clientId field > auto-generated
  let clientId: string;
  if (parsedId) {
    clientId = parsedId;
    usedIds.add(clientId);
  } else if (site.clientId && site.clientId.trim()) {
    clientId = site.clientId.trim();
    usedIds.add(clientId);
  } else {
    clientId = nextAutoId();
  }

  // Clean the name from the remaining part (after stripping the US-XXXXX prefix)
  // If nothing remains (siteName was just the ID), leave name blank for manual entry
  const nameSource = remainingName || '';
  const name = nameSource ? cleanName(nameSource) : '';
  const type: 'residential' | 'commercial' = COMMERCIAL_RE.test(raw) ? 'commercial' : 'residential';
  const { address, city, state, zip } = parseAddress(site.address || '');

  customers.push({
    clientId,
    name,
    email: '',
    phone: '',
    address,
    city,
    state: state || 'FL',
    zip,
    type,
    clientStatus: site.status === 'Active' ? 'O&M' : 'Standby',
    solarEdgeSiteId: site.siteId,
    systemType: 'SolarEdge',
    notes: '',
    installDate: site.installDate || '',
    peakPower: site.peakPower || 0,
    isPowerCare: false,
  });
}

console.log(`Generated ${customers.length} customers`);
console.log(`Skipped: ${skipped.length}`);
skipped.forEach(s => console.log(' ', s));

// ── 4. Write mergedCustomers.ts ─────────────────────────────────────────────

const lines = customers.map(c => `  {
    clientId: '${c.clientId}',
    name: ${JSON.stringify(c.name)},
    email: "",
    phone: "",
    address: ${JSON.stringify(c.address)},
    city: ${JSON.stringify(c.city)},
    state: "FL",
    zip: ${JSON.stringify(c.zip)},
    type: '${c.type}',
    clientStatus: '${c.clientStatus}',
    solarEdgeSiteId: ${JSON.stringify(c.solarEdgeSiteId)},
    systemType: "SolarEdge",
    notes: "",
    installDate: ${JSON.stringify(c.installDate)},
    peakPower: ${c.peakPower},
    isPowerCare: false,
  }`);

const output = `// Merged customer database — generated by scripts/import_from_solaredge.mts
// Source: FL_SITES (solarEdgeSites.ts) — ${new Date().toISOString().split('T')[0]}
// ${customers.length} clients imported from SolarEdge site list
// Run \`npx tsx scripts/import_from_solaredge.mts\` to regenerate
const mergedCustomerData = [
${lines.join(',\n')}
] as const;

export { mergedCustomerData };
`;

const outPath = resolve(ROOT, 'src/lib/mergedCustomers.ts');
writeFileSync(outPath, output, 'utf-8');
console.log(`\nWrote ${outPath}`);
console.log(`\nSample output (first 3):`);
customers.slice(0, 3).forEach(c => console.log(`  ${c.clientId} | ${c.name} | ${c.city} | siteId:${c.solarEdgeSiteId}`));
