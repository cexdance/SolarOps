// SolarOps — Trello Card Importer
// Fetches a Trello card and maps it to SolarOps Customer fields.
// Credentials are sourced from .env.local (VITE_TRELLO_API_KEY / VITE_TRELLO_TOKEN).

import { Activity, Customer, CustomerFile } from '../types';
import { uploadTrelloAttachment } from './trelloAttachmentUpload';

const KEY   = import.meta.env.VITE_TRELLO_API_KEY as string;
const TOKEN = import.meta.env.VITE_TRELLO_TOKEN   as string;

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

export interface TrelloCardData {
  name: string;
  desc: string;
  due: string | null;
  shortUrl: string;
  labels: string[];
  attachments: TrelloAttachment[];
  comments: TrelloComment[];
}

export interface TrelloImportResult {
  card: TrelloCardData;
  contactInfo: { phone: string; email: string };
  activities: Activity[];
  files: CustomerFile[];
  updates: Partial<Customer>;
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

export async function fetchTrelloCard(urlOrId: string): Promise<TrelloCardData> {
  const match = urlOrId.match(/trello\.com\/c\/([a-zA-Z0-9]+)/);
  const cardId = match ? match[1] : urlOrId.trim();

  const url =
    `https://api.trello.com/1/cards/${cardId}` +
    `?key=${KEY}&token=${TOKEN}` +
    `&fields=name,desc,due,shortUrl,labels` +
    `&attachments=true&attachment_fields=all` +
    `&actions=commentCard&actions_limit=50`;

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Trello API ${res.status}: ${body || res.statusText}`);
  }

  const d = await res.json();

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
      // Use largest preview if available for images, otherwise raw url
      previewUrl: (() => {
        if (!a.previews?.length) return null;
        const sorted = [...a.previews].sort((x, y) => (y.width ?? 0) - (x.width ?? 0));
        return sorted[0]?.url ?? null;
      })(),
    })),
    comments: (d.actions ?? [])
      .filter((a: { type: string }) => a.type === 'commentCard')
      .map((a: { memberCreator?: { fullName?: string; username?: string }; date: string; data?: { text?: string } }) => ({
        author: a.memberCreator?.fullName ?? a.memberCreator?.username ?? 'Unknown',
        date:   a.date,
        text:   a.data?.text ?? '',
      })),
  };
}

// ── Parse contact info from description ───────────────────────────────────────

export function extractContactInfo(desc: string): { phone: string; email: string } {
  const phoneMatch = desc.match(/\b(\d{10}|\d{3}[.\-]?\d{3}[.\-]?\d{4})\b/);
  const emailMatch = desc.match(/\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/);
  return {
    phone: phoneMatch ? phoneMatch[0].replace(/\D/g, '') : '',
    email: emailMatch ? emailMatch[0] : '',
  };
}

// ── Build Activity entries ─────────────────────────────────────────────────────

export function buildImportActivities(card: TrelloCardData, userName: string): Activity[] {
  const activities: Activity[] = [];
  const now = new Date().toISOString();
  const base = Date.now();

  if (card.desc.trim()) {
    activities.push({
      id:          `trello-desc-${base}`,
      type:        'note_added',
      description: `📋 Trello import — "${card.name}":\n\n${card.desc.trim()}`,
      timestamp:   now,
      userName,
    });
  }

  // Attachments are imported as real CustomerFile records — no note needed

  card.comments.forEach((c, i) => {
    activities.push({
      id:          `trello-comment-${base + 2 + i}`,
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
  const card        = await fetchTrelloCard(urlOrId);
  const contactInfo = extractContactInfo(card.desc);
  const activities  = buildImportActivities(card, userName);

  // Build CustomerFile records — download each attachment and re-host in Supabase
  // so the URL is permanent and never blocked by browser CSP or Trello token expiry.
  const base = Date.now();
  const files: CustomerFile[] = await Promise.all(
    card.attachments.map(async (a, i) => {
      const fileId    = `trello-file-${base + i}`;
      const sourceUrl = a.url; // raw Trello attachment URL (no token)

      // Try to upload to Supabase Storage → get a permanent public URL
      const permanentUrl = await uploadTrelloAttachment({
        trelloUrl:   sourceUrl,
        trelloKey:   KEY,
        trelloToken: TOKEN,
        customerId:  customer.id,
        fileId,
        fileName:    a.name,
        mimeType:    a.mimeType,
      });

      // Fall back to Trello URL + auth params if upload failed
      const url = permanentUrl ?? (
        a.previewUrl
          ? `${a.previewUrl}?key=${KEY}&token=${TOKEN}`
          : `${sourceUrl}?key=${KEY}&token=${TOKEN}`
      );

      return {
        id:        fileId,
        name:      a.name,
        url,
        mimeType:  a.mimeType,
        size:      a.size,
        source:    'trello' as const,
        createdAt: new Date().toISOString(),
      };
    })
  );

  const existingFiles = customer.files ?? [];
  // Avoid duplicating files already imported from the same card
  const existingUrls = new Set(existingFiles.map(f => f.name + f.size));
  const newFiles = files.filter(f => !existingUrls.has(f.name + f.size));

  const updates: Partial<Customer> = {
    trelloBackupUrl: card.shortUrl,
    activityHistory: [...activities, ...(customer.activityHistory ?? [])],
    files:           [...newFiles, ...existingFiles],
  };

  if (!customer.phone && contactInfo.phone) updates.phone = contactInfo.phone;
  if (!customer.email && contactInfo.email) updates.email = contactInfo.email;

  return { card, contactInfo, activities, files: newFiles, updates };
}
