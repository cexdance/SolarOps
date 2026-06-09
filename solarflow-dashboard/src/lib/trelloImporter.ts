// SolarOps, Trello Card Importer
// Fetches a Trello card and maps it to SolarOps Customer fields.
// Uses backend proxy (/api/trello-card.ts) for secure server-side API calls.

import { Activity, Customer, CustomerFile } from '../types';
import { authedFetch } from './supabase';
import { validateAddress, ValidatedAddress } from './addressValidator';

export interface TrelloAttachment {
  name: string;
  url: string;
  mimeType: string;
  size?: number;
  previewUrl?: string | null;
}

export interface TrelloComment {
  author: string;
  date: string;
  text: string;
}

export interface TrelloAction {
  id: string;
  type: string;
  date: string;
  memberCreator?: {
    fullName?: string;
    username?: string;
    id?: string;
  };
  data?: {
    text?: string;
    listBefore?: { name: string };
    listAfter?: { name: string };
    card?: { name: string };
    old?: { desc?: string };
    'new'?: { desc?: string };
    [key: string]: any;
  };
}

export interface TrelloCardData {
  name: string;
  desc: string;
  due: string | null;
  shortUrl: string;
  labels: string[];
  attachments: TrelloAttachment[];
  comments: TrelloComment[];
  // All actions (comments, description changes, list moves, etc.)
  actions: TrelloAction[];
}

export interface TrelloImportResult {
  card: TrelloCardData;
  contactInfo: { phone: string; email: string };
  activities: Activity[];
  files: CustomerFile[];
  updates: Partial<Customer>;
  addressValidation?: ValidatedAddress;
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

export async function fetchTrelloCard(urlOrId: string): Promise<TrelloCardData> {
  // Use backend proxy to avoid CORS issues + keep credentials secure
  const url = `/api/trello-card?cardId=${encodeURIComponent(urlOrId)}`;

  const res = await authedFetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Trello API error ${res.status}: ${body || res.statusText}`);
  }

  const d = await res.json();

  // Extract all actions (not just comments) for contact info mining
  const allActions: TrelloAction[] = (d.actions ?? []).map((a: any) => ({
    id: a.id,
    type: a.type,
    date: a.date,
    memberCreator: a.memberCreator ? {
      fullName: a.memberCreator.fullName,
      username: a.memberCreator.username,
      id: a.memberCreator.id,
    } : undefined,
    data: a.data,
  }));

  const comments = allActions
    .filter((a: TrelloAction) => a.type === 'commentCard')
    .map((a: TrelloAction) => ({
      author: a.memberCreator?.fullName ?? a.memberCreator?.username ?? 'Unknown',
      date: a.date,
      text: a.data?.text ?? '',
    }));

  return {
    name:        d.name ?? '',
    desc:        d.desc ?? '',
    due:         d.due  ?? null,
    shortUrl:    d.shortUrl ?? '',
    labels:      (d.labels  ?? []).map((l: { name: string }) => l.name).filter(Boolean),
    attachments: (d.attachments ?? []).map((a: { name: string; url: string; mimeType?: string; bytes?: number; previews?: { url: string; width: number }[] }) => ({
      name:     a.name,
      url:      a.url,
      mimeType: a.mimeType ?? '',
      size:     a.bytes,
      previewUrl: (() => {
        if (!a.previews?.length) return null;
        const sorted = [...a.previews].sort((x, y) => (y.width ?? 0) - (x.width ?? 0));
        return sorted[0]?.url ?? null;
      })(),
    })),
    comments,
    actions: allActions,
  };
}

// ── Parse contact info from multiple sources ────────────────────────────────────

const PHONE_REGEX = /\b(\d{10}|\d{3}[.\-]?\d{3}[.\-]?\d{4}|\(\d{3}\)\s*\d{3}[.\-]?\d{4})\b/;
const EMAIL_REGEX = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/;

function extractFromText(text: string): { phone: string; email: string } {
  const phoneMatch = text.match(PHONE_REGEX);
  const emailMatch = text.match(EMAIL_REGEX);
  return {
    phone: phoneMatch ? phoneMatch[0].replace(/\D/g, '') : '',
    email: emailMatch ? emailMatch[0] : '',
  };
}

/**
 * Extract contact info from description, comments, AND all Trello actions
 * (description changes, checklist items, custom fields, etc.)
 */
export function extractContactInfo(card: TrelloCardData): { phone: string; email: string } {
  let bestPhone = '';
  let bestEmail = '';

  // 1. Description
  if (card.desc) {
    const { phone, email } = extractFromText(card.desc);
    if (phone) bestPhone = phone;
    if (email) bestEmail = email;
  }

  // 2. Comments
  for (const c of card.comments) {
    if (c.text) {
      const { phone, email } = extractFromText(c.text);
      if (phone && !bestPhone) bestPhone = phone;
      if (email && !bestEmail) bestEmail = email;
    }
  }

  // 3. All other actions (description edits, checklist items, custom fields, etc.)
  for (const action of card.actions) {
    if (action.type === 'commentCard') continue; // already processed

    const data = action.data || {};
    const textsToCheck: string[] = [];

    // Description changes
    if (data.old?.desc) textsToCheck.push(data.old.desc);
    if (data['new']?.desc) textsToCheck.push(data['new'].desc);

    // Checklist items
    if (data['checkItem']?.name) textsToCheck.push(data['checkItem'].name);

    // Custom fields (often contain phone/email)
    if (data['customField']?.value?.text) textsToCheck.push(data['customField'].value.text);
    if (data['customField']?.value?.number) textsToCheck.push(String(data['customField'].value.number));

    // Card name changes (sometimes contains contact)
    if (data.card?.name) textsToCheck.push(data.card.name);

    // List moves (sometimes list name has contact info)
    if (data.listBefore?.name) textsToCheck.push(data.listBefore.name);
    if (data.listAfter?.name) textsToCheck.push(data.listAfter.name);

    // Generic text field in action data
    if (data.text) textsToCheck.push(data.text);

    for (const t of textsToCheck) {
      const { phone, email } = extractFromText(t);
      if (phone && !bestPhone) bestPhone = phone;
      if (email && !bestEmail) bestEmail = email;
    }
  }

  return { phone: bestPhone, email: bestEmail };
}

// ── Build Activity entries ─────────────────────────────────────────────────────
// IDs are derived from the card's stable short key so re-importing the same
// card produces identical IDs, enabling dedup by ID in importTrelloCard.

export function buildImportActivities(card: TrelloCardData, userName: string): Activity[] {
  const activities: Activity[] = [];
  const now = new Date().toISOString();
  const cardKey = card.shortUrl.split('/').pop() ?? card.shortUrl;

  if (card.desc.trim()) {
    activities.push({
      id:          `trello-desc-${cardKey}`,
      type:        'note_added',
      description: `📋 Trello import, "${card.name}":\n\n${card.desc.trim()}`,
      timestamp:   now,
      userName,
    });
  }

  // Attachments are imported as real CustomerFile records, no note needed

  card.comments.forEach((c) => {
    // Use author + exact timestamp as stable comment key
    const commentKey = `${cardKey}-${c.date}`;
    activities.push({
      id:          `trello-comment-${commentKey}`,
      type:        'note_added',
      description: `💬 Trello comment by ${c.author} [${c.date.slice(0, 10)}]:\n${c.text}`,
      timestamp:   c.date,
      userName:    c.author,
    });
  });

  return activities;
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function importTrelloCard(
  urlOrId: string,
  customer: Customer,
  userName: string,
): Promise<TrelloImportResult> {
  const card = await fetchTrelloCard(urlOrId);
  const contactInfo = extractContactInfo(card);
  const allActivities = buildImportActivities(card, userName);

  // Validate customer's address if present
  let addressValidation: ValidatedAddress | undefined;
  if (customer.address || customer.city || customer.state || customer.zip) {
    addressValidation = await validateAddress({
      address: customer.address,
      city: customer.city,
      state: customer.state,
      zip: customer.zip,
    });

    // If address validation provides better/normalized components and customer lacks them, suggest updates
    if (addressValidation.isValid && addressValidation.normalized) {
      const norm = addressValidation.normalized;
      if (!customer.address && norm.address) {
        // Don't auto-update, just include in validation result for review
      }
    }
  }

  // Dedup against timeline already in the customer record
  const existingActivityIds = new Set((customer.activityHistory ?? []).map(a => a.id));
  const activities = allActivities.filter(a => !existingActivityIds.has(a.id));

  // Build CustomerFile records, download each attachment and re-host in Supabase
  // so the URL is permanent and never blocked by browser CSP or Trello token expiry.
  const cardKey = card.shortUrl.split('/').pop() ?? card.shortUrl;
  const files: CustomerFile[] = await Promise.all(
    card.attachments.map(async (a, i) => {
      const fileId = `trello-file-${cardKey}-${i}`;
      const sourceUrl = a.url; // raw Trello attachment URL (publicly accessible)

      // Use preview URL if available, fallback to source URL
      // (Trello attachment URLs are typically publicly accessible)
      const url = a.previewUrl ?? sourceUrl;

      return {
        id: fileId,
        name: a.name,
        url,
        mimeType: a.mimeType,
        size: a.size,
        source: 'trello' as const,
        createdAt: new Date().toISOString(),
      };
    })
  );

  const existingFiles = customer.files ?? [];
  // Avoid duplicating files already imported from the same card
  const existingFileKeys = new Set(existingFiles.map(f => f.name + (f.size ?? '')));
  const newFiles = files.filter(f => !existingFileKeys.has(f.name + (f.size ?? '')));

  const existingHistory = customer.activityHistory ?? [];
  const updates: Partial<Customer> = {
    trelloBackupUrl: card.shortUrl,
    // Only prepend net-new activities, skip anything already in the timeline
    activityHistory: activities.length > 0
      ? [...activities, ...existingHistory]
      : existingHistory,
    files: newFiles.length > 0 ? [...newFiles, ...existingFiles] : existingFiles,
  };

  if (!customer.phone && contactInfo.phone) updates.phone = contactInfo.phone;
  if (!customer.email && contactInfo.email) updates.email = contactInfo.email;

  return { card, contactInfo, activities, files: newFiles, updates, addressValidation };
}
