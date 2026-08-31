// Messenger, internal staff direct messages plus the @mentions inbox.
//
// Left rail is the From -> To list: one row per person you have a conversation
// with, plus a pinned "Mentions" row fed by the server-backed notifications
// App already polls and realtime-subscribes. Right pane is the
// selected thread.
//
// ponytail: no group threads, no typing indicators, no attachments, no search
// inside a thread. Mentions are read-only here (they are created elsewhere by
// the @mention flow); clicking one opens its source record.
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { AtSign, Send, MessageSquare, Search, ExternalLink, Wrench, User as UserIcon, FileText } from 'lucide-react';
import { Avatar } from './ui/Avatar';
import { User, AppNotification } from '../types';
import {
  Message, fetchMyMessages, sendMessage, markThreadRead,
  subscribeToMessages, unsubscribeFromMessages,
} from '../lib/messenger';
import { getMentionsFor, MentionRecord } from '../lib/mentionsStore';

interface Props {
  currentUser: User | null;
  users: User[];
  notifications: AppNotification[];
  onMarkMentionRead: (notificationId: string) => void;
  onMarkAllMentionsRead: () => void;
  onOpenCustomer?: (customerId: string) => void;
  onOpenWorkOrder?: (jobId: string) => void;
}

const MENTIONS = '__mentions__';

// data.users can still hold seeded demo rows (ids like "user-mia-lopez") before
// /api/users replaces them. Those are not auth accounts, so messaging them is a
// 400 from Postgres. Only real auth uuids can be a From or a To.
const isAuthUser = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const Messenger: React.FC<Props> = ({ currentUser, users, notifications, onMarkMentionRead, onMarkAllMentionsRead, onOpenCustomer, onOpenWorkOrder }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [selected, setSelected] = useState<string>(MENTIONS);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [query, setQuery] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  // currentUser is null for the first render or two after a reload while the
  // session rehydrates, so every hook below reads through `uid`.
  const uid = currentUser?.id ?? '';

  // Load + subscribe
  useEffect(() => {
    if (!uid) return () => {};
    let live = true;
    fetchMyMessages().then(m => { if (live) setMessages(m); });
    subscribeToMessages(uid, (m) => {
      // Realtime can race the initial fetch, so dedupe by id.
      setMessages(prev => prev.some(p => p.id === m.id) ? prev : [m, ...prev]);
    });
    return () => { live = false; unsubscribeFromMessages(); };
  }, [uid]);

  const mentions = useMemo(
    () => (uid ? getMentionsFor(notifications, uid) : []),
    [notifications, uid],
  );
  const mentionUnread = mentions.filter(m => !m.read).length;

  /** Who the message is with, from my point of view. */
  const counterpart = useCallback(
    (m: Message) => (m.fromUser === uid ? m.toUser : m.fromUser),
    [uid],
  );

  // One row per person: everyone I can message, ordered by most recent activity.
  const threads = useMemo(() => {
    const last = new Map<string, Message>();
    for (const m of messages) {
      const other = counterpart(m);
      const prev = last.get(other);
      if (!prev || m.createdAt > prev.createdAt) last.set(other, m);
    }
    const unread = new Map<string, number>();
    for (const m of messages) {
      if (m.toUser === uid && !m.read) {
        unread.set(m.fromUser, (unread.get(m.fromUser) ?? 0) + 1);
      }
    }
    const q = query.trim().toLowerCase();
    return users
      .filter(u => u.id !== uid && u.active !== false && isAuthUser(u.id))
      .filter(u => !q || u.name.toLowerCase().includes(q) || (u.username ?? '').toLowerCase().includes(q))
      .map(u => ({ user: u, last: last.get(u.id), unread: unread.get(u.id) ?? 0 }))
      .sort((a, b) => (b.last?.createdAt ?? '').localeCompare(a.last?.createdAt ?? '') || a.user.name.localeCompare(b.user.name));
  }, [messages, users, uid, query, counterpart]);

  // Selected thread, oldest first for reading order
  const thread = useMemo(
    () => messages.filter(m => counterpart(m) === selected).slice().reverse(),
    [messages, selected, counterpart],
  );

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [thread.length, selected]);

  // Opening a thread clears its unread badge, locally and remotely.
  useEffect(() => {
    if (selected === MENTIONS) return;
    const hasUnread = messages.some(m => m.fromUser === selected && m.toUser === uid && !m.read);
    if (!hasUnread) return;
    setMessages(prev => prev.map(m =>
      m.fromUser === selected && m.toUser === uid ? { ...m, read: true } : m));
    markThreadRead(selected);
  }, [selected, messages, uid]);

  const handleSend = async () => {
    const body = draft.trim();
    if (!body || selected === MENTIONS || sending) return;
    setSending(true);
    const sent = await sendMessage(selected, body);
    setSending(false);
    if (!sent) return; // keep the draft so the text is not lost
    setDraft('');
    setMessages(prev => [sent, ...prev]);
  };

  const openMention = (m: MentionRecord) => {
    onMarkMentionRead(m.id);
    if (m.activityId) window.location.hash = `activity-${m.activityId}`;
    if (m.sourceType === 'customer') onOpenCustomer?.(m.sourceId);
    else if (m.sourceType === 'workOrder') onOpenWorkOrder?.(m.sourceId);
  };

  const selectedUser = users.find(u => u.id === selected);

  if (!currentUser) {
    return (
      <div className="h-[calc(100vh-3rem)] flex items-center justify-center text-xs text-slate-400">
        Loading your messages...
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-3rem)] m-4 flex bg-white rounded-xl border border-slate-200 overflow-hidden min-h-0">
      {/* From -> To rail */}
      <aside className="w-64 flex-shrink-0 border-r border-slate-200 flex flex-col min-h-0">
        <div className="p-3 border-b border-slate-100 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search people..."
              className="w-full pl-8 pr-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          <button
            onClick={() => setSelected(MENTIONS)}
            className={`w-full text-left flex items-center gap-2 px-3 py-2.5 border-b border-slate-100 transition-colors ${
              selected === MENTIONS ? 'bg-orange-50' : 'hover:bg-slate-50'
            }`}
          >
            <span className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
              <AtSign className="w-4 h-4 text-orange-600" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-xs font-semibold text-slate-800">Mentions</span>
              <span className="block text-[11px] text-slate-500 truncate">Where you were tagged</span>
            </span>
            {mentionUnread > 0 && (
              <span className="text-[10px] bg-orange-500 text-white px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0">
                {mentionUnread}
              </span>
            )}
          </button>

          {threads.map(({ user, last, unread }) => (
            <button
              key={user.id}
              onClick={() => setSelected(user.id)}
              className={`w-full text-left flex items-center gap-2 px-3 py-2.5 border-b border-slate-50 transition-colors ${
                selected === user.id ? 'bg-orange-50' : 'hover:bg-slate-50'
              }`}
            >
              <Avatar user={user} name={user.name} size="sm" />
              <span className="flex-1 min-w-0">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-800 truncate">{user.name}</span>
                  {last && <span className="text-[10px] text-slate-400 flex-shrink-0">{relTime(last.createdAt)}</span>}
                </span>
                <span className="block text-[11px] text-slate-500 truncate">
                  {last
                    ? `${last.fromUser === uid ? 'You: ' : ''}${last.body}`
                    : 'No messages yet'}
                </span>
              </span>
              {unread > 0 && (
                <span className="text-[10px] bg-orange-500 text-white px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0">
                  {unread}
                </span>
              )}
            </button>
          ))}
        </div>
      </aside>

      {/* Thread */}
      <section className="flex-1 flex flex-col min-h-0">
        {selected === MENTIONS ? (
          <>
            <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 flex-shrink-0">
              <div className="flex items-center gap-2">
                <AtSign className="w-4 h-4 text-orange-500" />
                <h2 className="text-sm font-semibold text-slate-900">Mentions</h2>
              </div>
              {mentionUnread > 0 && (
                <button
                  onClick={onMarkAllMentionsRead}
                  className="text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-2 py-1 hover:bg-slate-50"
                >
                  Mark all read
                </button>
              )}
            </header>
            <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-2">
              {mentions.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-10">No mentions yet.</p>
              ) : mentions.map(m => {
                const author = users.find(u => u.name === m.notifierName);
                return (
                  <button
                    key={m.id}
                    onClick={() => openMention(m)}
                    className={`w-full text-left flex gap-2 p-2.5 rounded-lg border transition-colors group ${
                      m.read ? 'bg-white border-slate-100 hover:border-slate-200'
                             : 'bg-orange-50/40 border-orange-200 hover:border-orange-300'
                    }`}
                  >
                    <Avatar user={author ?? { name: m.notifierName }} name={m.notifierName} size="sm" />
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-800 truncate">
                          {m.notifierName}
                          <span className="text-slate-300 mx-1">-&gt;</span>
                          <span className="font-normal text-slate-600">{currentUser.name}</span>
                          <span className="text-slate-300 mx-1">·</span>
                          <span className="text-slate-500 font-normal">{relTime(m.createdAt)}</span>
                        </span>
                        <ExternalLink className="w-3 h-3 text-slate-300 group-hover:text-orange-500 flex-shrink-0" />
                      </span>
                      <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-400 my-0.5">
                        {m.sourceType === 'workOrder' ? <Wrench className="w-3 h-3" />
                          : m.sourceType === 'customer' ? <UserIcon className="w-3 h-3" />
                          : <FileText className="w-3 h-3" />}
                        {m.sourceLabel}
                      </span>
                      <span className="block text-xs text-slate-600 line-clamp-2 leading-relaxed">{m.snippet}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        ) : !selectedUser ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <MessageSquare className="w-8 h-8 mb-2 text-slate-200" />
            <p className="text-xs">Pick someone to message.</p>
          </div>
        ) : (
          <>
            <header className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 flex-shrink-0">
              <Avatar user={selectedUser} name={selectedUser.name} size="sm" />
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-900 truncate">{selectedUser.name}</h2>
                <p className="text-[11px] text-slate-500 truncate">
                  {currentUser.name} <span className="text-slate-300">-&gt;</span> {selectedUser.name}
                </p>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-2">
              {thread.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-10">
                  No messages with {selectedUser.name} yet.
                </p>
              )}
              {thread.map(m => {
                const mine = m.fromUser === uid;
                return (
                  <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] rounded-2xl px-3 py-2 ${
                      mine ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-800'
                    }`}>
                      <p className="text-xs whitespace-pre-wrap break-words">{m.body}</p>
                      <p className={`text-[10px] mt-0.5 ${mine ? 'text-orange-100' : 'text-slate-400'}`}>
                        {relTime(m.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>

            <div className="flex items-end gap-2 p-3 border-t border-slate-200 flex-shrink-0">
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
                }}
                rows={1}
                placeholder={`Message ${selectedUser.name}...`}
                className="flex-1 resize-none px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 max-h-32"
              />
              <button
                onClick={handleSend}
                disabled={!draft.trim() || sending}
                aria-label="Send message"
                className="flex items-center justify-center w-9 h-9 rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:bg-slate-200 disabled:text-slate-400 transition-colors flex-shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
};
