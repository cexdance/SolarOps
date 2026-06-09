// mentionsStore, per-user inbox of @mentions across the app
// Mentions are pushed whenever a comment / note / todo containing
// @handles is saved (see notify.ts hook). The Ops Center MentionsWidget
// reads from here and filters by current user.

export interface MentionRecord {
  id: string;                // unique id (sourceType-sourceId-activityId)
  userId: string;            // mentioned user id
  notifierName: string;      // who wrote it
  sourceType: 'customer' | 'workOrder' | 'todo';
  sourceId: string;          // customerId / jobId / todoId
  sourceLabel: string;       // e.g. "US-15583 Ella Mae Arnold" or "WO-2604-96746"
  snippet: string;           // first 240 chars of the comment body
  createdAt: string;         // ISO
  read: boolean;
}

const KEY = 'solarops_mentions_v1';
const MAX = 200; // cap to prevent unbounded growth

function safeRead(): MentionRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function safeWrite(records: MentionRecord[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(records.slice(0, MAX)));
  } catch { /* quota, silently drop */ }
}

export function getMentions(): MentionRecord[] {
  return safeRead();
}

export function getMentionsFor(userId: string): MentionRecord[] {
  return safeRead().filter(m => m.userId === userId);
}

export function unreadCountFor(userId: string): number {
  return safeRead().filter(m => m.userId === userId && !m.read).length;
}

export function addMentions(mentions: Array<Omit<MentionRecord, 'id' | 'read'>>): void {
  const existing = safeRead();
  const additions: MentionRecord[] = mentions.map((m, i) => ({
    ...m,
    id: `mention-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
    read: false,
  }));
  safeWrite([...additions, ...existing]);
  // notify listeners (same-tab + cross-tab via storage event)
  try { window.dispatchEvent(new CustomEvent('solarops:mentions-updated')); } catch {}
}

export function markRead(mentionId: string): void {
  const next = safeRead().map(m => m.id === mentionId ? { ...m, read: true } : m);
  safeWrite(next);
  try { window.dispatchEvent(new CustomEvent('solarops:mentions-updated')); } catch {}
}

export function markAllRead(userId: string): void {
  const next = safeRead().map(m => m.userId === userId ? { ...m, read: true } : m);
  safeWrite(next);
  try { window.dispatchEvent(new CustomEvent('solarops:mentions-updated')); } catch {}
}

export function clearMentions(): void {
  safeWrite([]);
  try { window.dispatchEvent(new CustomEvent('solarops:mentions-updated')); } catch {}
}
