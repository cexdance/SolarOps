// messenger, internal staff direct messages (From -> To)
//
// One `public.messages` row per message. RLS: you can read a row only if you
// are the sender or the recipient, you can only insert as yourself, and only
// the recipient can flip `read`. Delivery is Supabase Realtime, same pattern as
// lib/notifications.ts.
//
// ponytail: no threads/channels/attachments/edit/delete. A conversation is just
// "every row where the other party is X", derived in the UI. Add a threads table
// when group chat is actually requested.
import { supabase } from './supabase';

export interface Message {
  id: string;
  fromUser: string;
  toUser: string;
  body: string;
  read: boolean;
  createdAt: string;
}

const COLS = 'id, from_user, to_user, body, read, created_at';

function rowToMessage(row: Record<string, unknown>): Message {
  return {
    id: row['id'] as string,
    fromUser: row['from_user'] as string,
    toUser: row['to_user'] as string,
    body: row['body'] as string,
    read: row['read'] as boolean,
    createdAt: row['created_at'] as string,
  };
}

/**
 * Every message the current user has sent or received, newest first.
 * ponytail: capped at 500 with no pagination. Add a per-thread .range() when a
 * real conversation outgrows one screenful of history.
 */
export async function fetchMyMessages(): Promise<Message[]> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return [];
    const uid = session.user.id;

    const { data, error } = await supabase
      .from('messages')
      .select(COLS)
      .or(`from_user.eq.${uid},to_user.eq.${uid}`)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error || !data) return [];
    return data.map(rowToMessage);
  } catch {
    return [];
  }
}

/** Send a message. Returns the stored row, or null if it did not land. */
export async function sendMessage(toUserId: string, body: string): Promise<Message | null> {
  const text = body.trim();
  if (!text) return null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;

    const { data, error } = await supabase
      .from('messages')
      .insert({ from_user: session.user.id, to_user: toUserId, body: text.slice(0, 4000) })
      .select(COLS)
      .single();

    if (error || !data) return null;
    return rowToMessage(data);
  } catch {
    return null;
  }
}

/** Mark every unread message received from `fromUserId` as read. */
export async function markThreadRead(fromUserId: string): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    await supabase
      .from('messages')
      .update({ read: true })
      .eq('to_user', session.user.id)
      .eq('from_user', fromUserId)
      .eq('read', false);
  } catch {
    // optimistic local state already updated
  }
}

// Realtime ────────────────────────────────────────────────────────────────────

let _channel: ReturnType<typeof supabase.channel> | null = null;

/** Fire `onNew` on every message addressed to `userId`. */
export function subscribeToMessages(userId: string, onNew: (m: Message) => void): void {
  unsubscribeFromMessages();
  _channel = supabase
    .channel(`messages:${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `to_user=eq.${userId}` },
      (payload) => { if (payload.new) onNew(rowToMessage(payload.new as Record<string, unknown>)); },
    )
    .subscribe();
}

export function unsubscribeFromMessages(): void {
  if (_channel) {
    supabase.removeChannel(_channel);
    _channel = null;
  }
}
