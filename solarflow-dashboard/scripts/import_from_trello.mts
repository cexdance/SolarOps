// scripts/import_from_trello.mts
// Imports "SOLAREDGE LEADS (Servicios)" from Conexsol Funnel strategyn
// Outputs: src/lib/trelloImport.ts
// Run: npx tsx scripts/import_from_trello.mts

import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const KEY   = process.env.TRELLO_KEY   ?? '';
const TOKEN = process.env.TRELLO_TOKEN ?? '';
const LIST_ID = '662f9781997caa90e43c6f00'; // SOLAREDGE LEADS (Servicios)

const BASE = 'https://api.trello.com/1';
const qs = (p: Record<string, string>) =>
  new URLSearchParams({ key: KEY, token: TOKEN, ...p }).toString();

async function trello(path: string, params: Record<string, string> = {}) {
  const res = await fetch(`${BASE}${path}?${qs(params)}`);
  if (!res.ok) throw new Error(`Trello ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

// ── Description parsers ─────────────────────────────────────────────────────

interface ParsedDesc {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  notes: string;
  hsId: string;
}

function stripMarkdown(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')   // [text](url) → text
    .replace(/\*\*([^*]+)\*\*/g, '$1')           // **bold** → text
    .replace(/!\[.*?\]\(.*?\)/g, '')             // images
    .trim();
}

function fieldVal(lines: string[], ...keys: string[]): string {
  for (const line of lines) {
    for (const key of keys) {
      const re = new RegExp(`^${key}\\s*:\\s*(.*)`, 'i');
      const m = line.match(re);
      if (m) return stripMarkdown(m[1].trim());
    }
  }
  return '';
}

function parseDesc(raw: string): ParsedDesc {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  return {
    firstName: fieldVal(lines, 'first name', 'firstname'),
    lastName:  fieldVal(lines, 'last name', 'lastname'),
    email:     fieldVal(lines, 'email', 'e-mail'),
    phone:     fieldVal(lines, 'phone', 'tel', 'mobile', 'celular'),
    address:   fieldVal(lines, 'address', 'direccion', 'street'),
    city:      fieldVal(lines, 'city', 'ciudad'),
    state:     fieldVal(lines, 'state', 'estado') || 'FL',
    zip:       fieldVal(lines, 'zip', 'zip code', 'postal'),
    notes:     fieldVal(lines, 'notes', 'note', 'notas', 'comments'),
    hsId:      fieldVal(lines, 'hs_id', 'hubspot', 'hs id'),
  };
}

// ── Title parser ────────────────────────────────────────────────────────────

function parseTitle(name: string): { clientId: string | null; displayName: string } {
  // Match US-15XXX at start or anywhere
  const m = name.match(/\b(US-\d+)\b/i);
  const clientId = m ? m[1].toUpperCase() : null;
  // Strip clientId + cleanup
  const display = name
    .replace(/\b(US-\d+)\b/i, '')
    .replace(/^\s*[-|:]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return { clientId, displayName: display || name.trim() };
}

// ── Main ────────────────────────────────────────────────────────────────────

interface TrelloCustomer {
  trelloCardId: string;
  clientId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  notes: string;
  hsId: string;
  status: 'customer' | 'lead';
  source: 'solaredge';
  tags: string[];
  createdAt: string;
  updatedAt: string;
  attachments: TrelloAttachment[];
}

interface TrelloAttachment {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

interface TrelloInteraction {
  id: string;
  trelloCardId: string;
  clientId: string | null;
  type: 'note';
  direction: 'inbound';
  content: string;
  userId: string;
  userName: string;
  timestamp: string;
  createdAt: string;
}

async function main() {
console.log('Fetching cards from SOLAREDGE LEADS (Servicios)...');

// Fetch cards without inline actions (avoids 403 on large lists)
const cards: any[] = await trello(`/lists/${LIST_ID}/cards`, {
  fields: 'id,name,desc,dateLastActivity,due,labels,idList',
  attachments: 'true',
  limit: '1000',
});

// Build cardId → card map
const cardMap = new Map<string, any>(cards.map(c => [c.id, c]));

// Fetch all commentCard actions from the board (paginated)
console.log('Fetching comments from board...');
const BOARD_ID = '6155f98449d05e4953626f5e';
let allActions: any[] = [];
let before: string | null = null;
while (true) {
  const params: Record<string, string> = {
    filter: 'commentCard',
    fields: 'id,type,date,data,memberCreator',
    limit: '1000',
  };
  if (before) params.before = before;
  const batch: any[] = await trello(`/boards/${BOARD_ID}/actions`, params);
  allActions = allActions.concat(batch);
  if (batch.length < 1000) break;
  before = batch[batch.length - 1].id;
}
// Keep only comments on cards in our list
const listCardIds = new Set(cards.map((c: any) => c.id));
const comments = allActions.filter(a => listCardIds.has(a.data?.card?.id));
console.log(`Found ${comments.length} comments across ${cards.length} cards`);

console.log(`Fetched ${cards.length} cards`);

const customers: TrelloCustomer[] = [];
const interactions: TrelloInteraction[] = [];

let matched = 0, leads = 0, noDesc = 0;

for (const card of cards) {
  const { clientId, displayName } = parseTitle(card.name);
  const desc = parseDesc(card.desc || '');

  // Derive first/last name
  let firstName = desc.firstName;
  let lastName  = desc.lastName;
  if (!firstName && !lastName && displayName) {
    const parts = displayName.split(' ');
    firstName = parts[0] || '';
    lastName  = parts.slice(1).join(' ') || '';
  }

  // Attachments
  const attachments: TrelloAttachment[] = (card.attachments || []).map((a: any) => ({
    id: a.id,
    name: a.name || 'attachment',
    url: a.url,
    mimeType: a.mimeType || 'application/octet-stream',
    size: a.bytes || 0,
    createdAt: a.date || card.dateLastActivity,
  }));

  // Comments → interactions (from pre-fetched board actions)
  const cardComments = comments.filter(a => a.data?.card?.id === card.id);
  for (const c of cardComments) {
    interactions.push({
      id: `trello-${c.id}`,
      trelloCardId: card.id,
      clientId,
      type: 'note',
      direction: 'inbound',
      content: c.data?.text || '',
      userId: c.memberCreator?.id || 'trello',
      userName: c.memberCreator?.fullName || c.memberCreator?.username || 'Trello',
      timestamp: c.date,
      createdAt: c.date,
    });
  }

  if (!desc.email && !desc.phone && !desc.address && !card.desc?.trim()) noDesc++;

  const status = clientId ? 'customer' : 'lead';
  if (clientId) matched++; else leads++;

  customers.push({
    trelloCardId: card.id,
    clientId,
    firstName,
    lastName,
    email: desc.email,
    phone: desc.phone,
    address: desc.address,
    city: desc.city,
    state: desc.state,
    zip: desc.zip,
    notes: desc.notes,
    hsId: desc.hsId,
    status,
    source: 'solaredge',
    tags: card.labels?.map((l: any) => l.name).filter(Boolean) || [],
    createdAt: card.dateLastActivity || new Date().toISOString(),
    updatedAt: card.dateLastActivity || new Date().toISOString(),
    attachments,
  });
}

console.log(`\nResults:`);
console.log(`  Matched US-15XXX (existing customers): ${matched}`);
console.log(`  New leads (no US-15XXX):                ${leads}`);
console.log(`  Cards with no contact info:             ${noDesc}`);
console.log(`  Total interactions (comments):          ${interactions.length}`);
console.log(`  Total attachments:                      ${customers.reduce((s, c) => s + c.attachments.length, 0)}`);

// ── Write output ────────────────────────────────────────────────────────────

const out = `// src/lib/trelloImport.ts
// Auto-generated by scripts/import_from_trello.mts
// Board: Conexsol Funnel strategyn | List: SOLAREDGE LEADS (Servicios)
// Imported: ${new Date().toISOString().split('T')[0]} | Cards: ${customers.length}
// DO NOT EDIT MANUALLY — re-run scripts/import_from_trello.mts to refresh

export interface TrelloAttachment {
  id: string;
  name: string;
  url: string;        // Trello CDN URL — requires Trello token to download
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface TrelloCustomer {
  trelloCardId: string;
  clientId: string | null;   // US-15XXX if matched, null if lead
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  notes: string;
  hsId: string;
  status: 'customer' | 'lead';
  source: 'solaredge';
  tags: string[];
  createdAt: string;
  updatedAt: string;
  attachments: TrelloAttachment[];
}

export interface TrelloInteraction {
  id: string;
  trelloCardId: string;
  clientId: string | null;
  type: 'note';
  direction: 'inbound';
  content: string;
  userId: string;
  userName: string;
  timestamp: string;
  createdAt: string;
}

export const trelloCustomers: TrelloCustomer[] = ${JSON.stringify(customers, null, 2)};

export const trelloInteractions: TrelloInteraction[] = ${JSON.stringify(interactions, null, 2)};
`;

const outPath = resolve(ROOT, 'src/lib/trelloImport.ts');
writeFileSync(outPath, out, 'utf-8');
console.log(`\nWrote ${outPath}`);
console.log(`File size: ${(out.length / 1024).toFixed(1)} KB`);

// ── Print sample ─────────────────────────────────────────────────────────────
console.log('\nSample customers (first 5):');
customers.slice(0, 5).forEach(c => {
  console.log(`  [${c.status}] ${c.clientId || 'LEAD'} | ${c.firstName} ${c.lastName} | ${c.phone} | ${c.email}`);
});
console.log('\nSample interactions (first 3):');
interactions.slice(0, 3).forEach(i => {
  console.log(`  ${i.clientId || 'LEAD'} | ${i.userName} | ${i.content.slice(0, 60)}`);
});
} // end main

main().catch(e => { console.error('FAILED:', e); process.exit(1); });
