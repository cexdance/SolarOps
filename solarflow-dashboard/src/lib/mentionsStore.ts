// mentionsStore, the per-user inbox of @mentions across the app.
//
// This used to be a localStorage array, which meant it never worked: the writer
// (`fireMentionNotifications`) stored the record in the NOTIFIER's browser under
// the RECIPIENT's user id, so the person actually mentioned never had the row on
// their own device. The widget showed "No mentions yet" while 758 real mention
// rows sat in Supabase.
//
// The server row is the source of truth and always was. `/api/notify` writes one
// `notifications` row per mentioned user, and App already fetches, polls,
// realtime-subscribes and read-marks that table. So this module is now a pure
// derivation over `AppNotification[]`: no storage, no cache, no event bus.
import type { AppNotification } from '../types';

export interface MentionRecord {
  id: string;                // the notification row id
  userId: string;            // mentioned user id
  notifierName: string;      // who wrote it
  sourceType: 'customer' | 'workOrder' | 'todo';
  sourceId: string;          // customerId / jobId / todoId
  sourceLabel: string;       // e.g. "US-15583 Ella Mae Arnold" or "WO-2604-96746"
  activityId?: string;       // the comment itself, so opening scrolls straight to it
  snippet: string;           // the comment body
  createdAt: string;         // ISO
  read: boolean;
}

// `/api/notify` composes these two strings and nothing else writes the table, so
// unpicking them here is safe. Verified against all 758 live mention rows:
// every title matches, and every message is the `In ...: "..."` form.
//   title:   `${notifier} mentioned you`
//   message: `In ${label}: "${body}"`  |  `You were mentioned in ${label}`
const TITLE_RE = /^(.*?) mentioned you$/;
const MSG_QUOTED_RE = /^In ([\s\S]*?): "([\s\S]*)"$/;
const MSG_PLAIN_RE = /^You were mentioned in ([\s\S]*)$/;

function parseMessage(message: string): { label: string; snippet: string } {
  const quoted = MSG_QUOTED_RE.exec(message);
  if (quoted) return { label: quoted[1] ?? '', snippet: quoted[2] ?? '' };
  const plain = MSG_PLAIN_RE.exec(message);
  if (plain) return { label: plain[1] ?? '', snippet: '' };
  // Unknown shape: show the raw message rather than dropping the mention.
  return { label: '', snippet: message };
}

export function mentionFromNotification(n: AppNotification): MentionRecord {
  const { label, snippet } = parseMessage(n.message ?? '');
  const sourceId = n.relatedJobId ?? n.relatedCustomerId ?? '';
  return {
    id: n.id,
    userId: n.userId,
    notifierName: TITLE_RE.exec(n.title ?? '')?.[1] ?? n.title ?? 'Someone',
    sourceType: n.relatedJobId ? 'workOrder' : n.relatedCustomerId ? 'customer' : 'todo',
    sourceId,
    sourceLabel: label,
    activityId: n.relatedActivityId,
    snippet,
    createdAt: n.createdAt,
    read: n.read,
  };
}

/** Every @mention addressed to `userId`, newest first. */
export function getMentionsFor(notifications: AppNotification[], userId: string): MentionRecord[] {
  return notifications
    .filter(n => n.type === 'mention' && n.userId === userId)
    .map(mentionFromNotification)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function unreadCountFor(notifications: AppNotification[], userId: string): number {
  return notifications.filter(n => n.type === 'mention' && n.userId === userId && !n.read).length;
}
