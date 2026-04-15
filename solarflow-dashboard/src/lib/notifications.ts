/**
 * SolarOps — Client-side notification helpers
 *
 * Fetches, polls, and marks notifications from the Supabase `notifications` table.
 */
import { supabase } from './supabase';
import type { AppNotification } from '../types';

// ── Map Supabase row → AppNotification ───────────────────────────────────────

function rowToNotification(row: Record<string, unknown>): AppNotification {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    type: row.type as AppNotification['type'],
    title: row.title as string,
    message: row.message as string,
    relatedJobId: row.related_job_id as string | undefined,
    relatedContractorId: row.related_contractor_id as string | undefined,
    relatedCustomerId: row.related_customer_id as string | undefined,
    read: row.read as boolean,
    createdAt: row.created_at as string,
  };
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

/**
 * Pull the latest 50 notifications for the current authenticated user.
 * Returns [] if not authenticated or on error.
 */
export async function fetchMyNotifications(): Promise<AppNotification[]> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return [];

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error || !data) return [];
    return data.map(rowToNotification);
  } catch {
    return [];
  }
}

// ── Mark Read ─────────────────────────────────────────────────────────────────

/** Mark a single notification as read in Supabase. Fire-and-forget. */
export async function markNotificationReadRemote(id: string): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', id);
  } catch {
    // silently ignore — local state already updated optimistically
  }
}

/** Mark all notifications as read in Supabase for the current user. Fire-and-forget. */
export async function markAllNotificationsReadRemote(): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', session.user.id)
      .eq('read', false);
  } catch {
    // silently ignore
  }
}

// ── Polling ───────────────────────────────────────────────────────────────────

let _pollInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start polling for new notifications every `intervalMs` (default 45 s).
 * Calls `onNewNotifications` with the full latest list whenever it changes.
 * Call `stopNotificationPolling()` on logout.
 */
export function startNotificationPolling(
  onNewNotifications: (notifications: AppNotification[]) => void,
  intervalMs = 45_000,
): void {
  stopNotificationPolling();

  const poll = async () => {
    const notifications = await fetchMyNotifications();
    if (notifications.length > 0) {
      onNewNotifications(notifications);
    }
  };

  // Immediate first fetch
  poll();
  _pollInterval = setInterval(poll, intervalMs);
}

export function stopNotificationPolling(): void {
  if (_pollInterval !== null) {
    clearInterval(_pollInterval);
    _pollInterval = null;
  }
}
