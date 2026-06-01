// ActivityFeed — shared timeline component
// Used everywhere the team talks: customer comments, work order comments,
// future to-do threads. Twitter/Trello-style: avatar + name + relative time,
// full-width body (never truncated), inline edit, reactions, @mention chips.
//
// Compose box is intentionally NOT part of this component — each caller wires
// its own (Customer notes already has paste-image support, etc.). This file
// renders the read/edit/react surface only.

import React, { useState, useRef, useEffect } from 'react';
import { Pencil, Trash2, Smile, Link as LinkIcon, Check, Paperclip } from 'lucide-react';
import { Activity } from '../../types';
import { Avatar } from './Avatar';

export interface FeedFile {
  id: string;
  name: string;
  url: string;
  mimeType?: string;
}

export interface FeedUser {
  id: string;
  name: string;
  username?: string;
  avatar?: string;
  role?: string;
}

interface Props {
  activities: Activity[];
  users: FeedUser[];
  currentUser: FeedUser | null;
  onEdit: (activityId: string, newText: string) => void;
  onDelete: (activityId: string) => void;
  onReact: (activityId: string, emoji: string) => void;
  onMentionClick?: (userId: string) => void;
  // Only these activity types are user-editable; others are auto-generated
  editableTypes?: Activity['type'][];
  emptyMessage?: string;
  // Customer/job files — used to resolve thumbnails for legacy comments whose
  // attachment is only referenced as "📎 filename" text in the description.
  files?: FeedFile[];
}

const isImageAttachment = (a: { mimeType?: string; name?: string; url?: string }): boolean =>
  (a.mimeType?.startsWith('image/') ?? false) ||
  /\.(png|jpe?g|gif|webp|bmp|svg|heic)$/i.test(a.name || a.url || '');

const REACTION_EMOJIS = ['👍', '❤️', '😂', '🔥', '✅', '👀'];

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d > 365 ? 'numeric' : undefined });
}

function exactTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

// URL detection regex — matches http(s)://, www., and bare domain.tld URLs
const URL_REGEX = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|\b[a-zA-Z0-9.\-]+\.(com|net|org|io|co|us|app|dev|gov|edu|info|biz)(\/[^\s<>"']*)?)/g;

// Combined regex for splitting: matches either @mentions, URLs, or email addresses
const TOKEN_REGEX = /(@[\w.]+|https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b)/g;

// Render text with @mentions as clickable chips + auto-linked URLs/emails
const MentionBody: React.FC<{
  text: string;
  users: FeedUser[];
  onMentionClick?: (userId: string) => void;
}> = ({ text, users, onMentionClick }) => {
  const parts = text.split(TOKEN_REGEX);
  return (
    <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed break-words">
      {parts.map((part, i) => {
        if (!part) return null;

        // @mention chip
        if (part.startsWith('@')) {
          const handle = part.slice(1).toLowerCase();
          const user = users.find(u =>
            u.username?.toLowerCase() === handle ||
            u.name.toLowerCase().replace(/\s+/g, '') === handle ||
            u.name.toLowerCase() === handle,
          );
          if (!user) {
            // Unknown mention — render as plain text
            return <span key={i} className="text-slate-500">{part}</span>;
          }
          return (
            <button
              key={i}
              type="button"
              onClick={() => onMentionClick?.(user.id)}
              title={user.name}
              className="inline-flex items-center text-orange-600 font-semibold bg-orange-50 hover:bg-orange-100 px-1 rounded transition-colors cursor-pointer"
            >
              {part}
            </button>
          );
        }

        // URL → clickable link (opens in new tab)
        if (part.startsWith('http://') || part.startsWith('https://') || part.startsWith('www.')) {
          const href = part.startsWith('www.') ? `https://${part}` : part;
          return (
            <a
              key={i}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 underline break-all"
            >
              {part}
            </a>
          );
        }

        // Email → mailto link
        if (/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(part)) {
          return (
            <a
              key={i}
              href={`mailto:${part}`}
              className="text-blue-600 hover:text-blue-800 underline"
            >
              {part}
            </a>
          );
        }

        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </p>
  );
};

// Auto-grow textarea for inline edit
const AutoGrowTextarea: React.FC<{
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}> = ({ value, onChange, onSave, onCancel }) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = ref.current.scrollHeight + 'px';
      ref.current.focus();
      ref.current.selectionStart = ref.current.value.length;
    }
  }, [value]);
  return (
    <div className="space-y-1.5">
      <textarea
        ref={ref}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if ((e.key === 'Enter') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSave(); }
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        }}
        rows={3}
        className="w-full text-sm border border-orange-300 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-orange-400 leading-relaxed"
      />
      <div className="flex items-center gap-2">
        <button onClick={onSave} className="px-3 py-1 bg-orange-500 text-white text-xs font-medium rounded-lg hover:bg-orange-600">Save</button>
        <button onClick={onCancel} className="px-3 py-1 bg-slate-200 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-300">Cancel</button>
        <span className="text-[10px] text-slate-400">⌘+Enter to save · Esc to cancel</span>
      </div>
    </div>
  );
};

export const ActivityFeed: React.FC<Props> = ({
  activities,
  users,
  currentUser,
  onEdit,
  onDelete,
  onReact,
  onMentionClick,
  editableTypes = ['note_added'],
  emptyMessage = 'No activity yet — start the conversation below.',
  files = [],
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [emojiPickerFor, setEmojiPickerFor] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (activities.length === 0) {
    return (
      <div className="text-center py-10 text-sm text-slate-400">
        {emptyMessage}
      </div>
    );
  }

  const copyPermalink = async (activityId: string) => {
    const url = `${window.location.origin}${window.location.pathname}#activity-${activityId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(activityId);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {/* ignore */}
  };

  return (
    <div className="space-y-4">
      {activities.map((a) => {
        const author = users.find(u => u.id === a.userId);
        const isAuthor = !!currentUser && (a.userId === currentUser.id || a.userName === currentUser.name);
        const isAdmin = currentUser?.role === 'admin';
        const canEdit = (isAuthor || isAdmin) && editableTypes.includes(a.type);
        const isEditing = editingId === a.id;
        const reactions = a.reactions ?? {};

        // Resolve attachments. Prefer the structured field; otherwise parse legacy
        // "📎 filename" lines from the description and match them against `files`,
        // so older comments still render their image as a thumbnail.
        const legacyNames = a.attachments?.length
          ? []
          : (a.description.match(/📎[^\n]*/g) || []).map(s => s.replace(/^📎\s*/, '').trim());
        const legacyAttachments = legacyNames
          .map(name => files.find(f => f.name === name))
          .filter((f): f is FeedFile => !!f);
        const attachments: FeedFile[] = a.attachments?.length ? a.attachments : legacyAttachments;
        // If we turned legacy "📎 ..." text into thumbnails, drop those lines from the body.
        const displayText = legacyAttachments.length
          ? a.description.split('\n').filter(l => !/^\s*📎/.test(l)).join('\n').trim()
          : a.description;

        return (
          <div
            key={a.id}
            id={`activity-${a.id}`}
            className="flex gap-3 group"
          >
            <Avatar user={author ?? { name: a.userName ?? '?' }} name={a.userName} size="md" />
            <div className="flex-1 min-w-0">
              {/* Header line */}
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-1.5 text-sm min-w-0">
                  <span className="font-semibold text-slate-800 truncate">{a.userName ?? 'System'}</span>
                  <span className="text-slate-300">·</span>
                  <span
                    className="text-xs text-slate-500 cursor-help"
                    title={exactTime(a.timestamp)}
                  >
                    {relativeTime(a.timestamp)}
                  </span>
                  {a.type !== 'note_added' && (
                    <span className="ml-1 text-[10px] uppercase tracking-wider text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                      {a.type.replace(/_/g, ' ')}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 relative">
                  <button
                    onClick={() => copyPermalink(a.id)}
                    title="Copy link to this comment"
                    className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                  >
                    {copiedId === a.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <LinkIcon className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => setEmojiPickerFor(emojiPickerFor === a.id ? null : a.id)}
                    title="Add reaction"
                    className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-yellow-500"
                  >
                    <Smile className="w-3.5 h-3.5" />
                  </button>
                  {canEdit && (
                    <>
                      <button
                        onClick={() => { setEditingId(a.id); setEditingText(a.description); }}
                        title="Edit"
                        className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onDelete(a.id)}
                        title="Delete"
                        className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                  {emojiPickerFor === a.id && (
                    <div className="absolute right-0 top-7 z-50 bg-white border border-slate-200 rounded-xl shadow-lg p-1.5 flex gap-0.5">
                      {REACTION_EMOJIS.map(emoji => (
                        <button
                          key={emoji}
                          onClick={() => { onReact(a.id, emoji); setEmojiPickerFor(null); }}
                          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-lg transition-colors"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Body */}
              {(isEditing || displayText) && (
                <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                  {isEditing ? (
                    <AutoGrowTextarea
                      value={editingText}
                      onChange={setEditingText}
                      onSave={() => { onEdit(a.id, editingText.trim()); setEditingId(null); }}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : (
                    <MentionBody text={displayText} users={users} onMentionClick={onMentionClick} />
                  )}
                </div>
              )}

              {/* Attachments — image files render as thumbnails, others as a chip link */}
              {!isEditing && attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {attachments.map(att => (
                    isImageAttachment(att) ? (
                      <a
                        key={att.id}
                        href={att.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={att.name}
                        className="block w-24 h-24 rounded-lg overflow-hidden border border-slate-200 bg-slate-50 hover:border-orange-400 transition-colors"
                      >
                        <img src={att.url} alt={att.name} className="w-full h-full object-cover" loading="lazy" />
                      </a>
                    ) : (
                      <a
                        key={att.id}
                        href={att.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={att.name}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-600 hover:border-orange-400 hover:text-orange-600 transition-colors max-w-[180px]"
                      >
                        <Paperclip className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{att.name}</span>
                      </a>
                    )
                  ))}
                </div>
              )}

              {/* Reactions row */}
              {Object.keys(reactions).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {Object.entries(reactions).map(([emoji, userIds]) => {
                    const mine = currentUser ? userIds.includes(currentUser.id) : false;
                    return (
                      <button
                        key={emoji}
                        onClick={() => onReact(a.id, emoji)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${
                          mine ? 'bg-orange-50 border-orange-300 text-orange-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <span>{emoji}</span>
                        <span className="font-semibold text-[11px]">{userIds.length}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
