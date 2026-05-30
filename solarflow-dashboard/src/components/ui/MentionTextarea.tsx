import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

export interface MentionUser {
  id: string;
  name: string;
  username?: string;
  email?: string;
}

interface Props {
  value: string;
  onChange: (val: string) => void;
  users: MentionUser[];
  placeholder?: string;
  rows?: number;
  className?: string;
  disabled?: boolean;
  onPaste?: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
}

/** Textarea with live @mention dropdown.
 *
 *  The dropdown is rendered through a React portal at document.body and
 *  positioned with `position:fixed` so it is never clipped by an ancestor
 *  with overflow:hidden (e.g. the WO panel modal).
 */
export const MentionTextarea: React.FC<Props> = ({
  value,
  onChange,
  users,
  placeholder,
  rows = 4,
  className = '',
  disabled,
  onPaste,
}) => {
  const [query, setQuery]         = useState('');
  const [start, setStart]         = useState(-1);
  const [open, setOpen]           = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [dropPos, setDropPos]     = useState<{ top: number; left: number; width: number } | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  // Re-measure textarea position whenever the dropdown opens or value changes.
  // This keeps the dropdown anchored when the panel scrolls.
  useEffect(() => {
    if (!open || !ref.current) { setDropPos(null); return; }
    const r = ref.current.getBoundingClientRect();
    setDropPos({ top: r.bottom + 4, left: r.left, width: r.width });
  }, [open, value]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = () => setOpen(false);
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val    = e.target.value;
    const cursor = e.target.selectionStart ?? val.length;
    onChange(val);
    const before  = val.slice(0, cursor);
    const atMatch = before.match(/@(\w*)$/);
    if (atMatch) {
      setQuery(atMatch[1]);
      setStart(cursor - atMatch[0].length);
      setActiveIdx(0);
      setOpen(true);
    } else {
      setOpen(false);
    }
  };

  const filtered = (
    query
      ? users.filter(u => {
          const q = query.toLowerCase();
          return u.username?.toLowerCase().startsWith(q) || u.name.toLowerCase().startsWith(q);
        })
      : users.slice(0, 8)
  ).slice(0, 6);

  const select = (user: MentionUser) => {
    const handle = user.username?.trim() || user.name.replace(/\s+/g, '').toLowerCase();
    const cursorPos = ref.current?.selectionStart ?? value.length;
    const before = value.slice(0, start);
    const after  = value.slice(cursorPos);
    onChange(`${before}@${handle} ${after}`);
    setOpen(false);
    setTimeout(() => ref.current?.focus(), 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open || filtered.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      select(filtered[activeIdx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const dropdown = open && filtered.length > 0 && dropPos ? createPortal(
    <ul
      style={{ position: 'fixed', top: dropPos.top, left: dropPos.left, width: dropPos.width, zIndex: 9999 }}
      className="bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden"
      onMouseDown={e => e.preventDefault()} // prevent textarea blur
    >
      {filtered.map((u, i) => (
        <li key={u.id}>
          <button
            type="button"
            onMouseDown={() => select(u)}
            className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${
              i === activeIdx ? 'bg-orange-50' : 'hover:bg-slate-50'
            }`}
          >
            <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-700 text-xs font-bold flex items-center justify-center shrink-0">
              {u.name[0]?.toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="font-medium text-slate-800 truncate">{u.name}</p>
              {u.username && (
                <p className="text-xs text-slate-400">@{u.username}</p>
              )}
            </div>
          </button>
        </li>
      ))}
    </ul>,
    document.body,
  ) : null;

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onPaste={onPaste}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        rows={rows}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
      />
      {dropdown}
    </div>
  );
};

/** Split text on @handles and render each as an orange highlight. */
export function renderWithMentions(text: string): React.ReactNode {
  return text.split(/(@\S+)/g).map((part, i) =>
    part.startsWith('@')
      ? <span key={i} className="text-orange-600 font-semibold">{part}</span>
      : part,
  );
}

/** Extract user IDs for every @handle found in text. */
export function parseMentions(text: string, users: MentionUser[]): string[] {
  const ids: string[] = [];
  for (const m of text.match(/@([\w.]+)/g) ?? []) {
    const handle = m.slice(1).toLowerCase();
    const user = users.find(u =>
      u.username?.toLowerCase() === handle ||
      u.name.toLowerCase().replace(/\s+/g, '') === handle ||
      u.name.toLowerCase() === handle,
    );
    if (user && !ids.includes(user.id)) ids.push(user.id);
  }
  return ids;
}

/** Extract emails for every @handle found in text (for API matching). */
export function parseMentionEmails(text: string, users: (MentionUser & { email?: string })[]): string[] {
  const emails: string[] = [];
  for (const m of text.match(/@([\w.]+)/g) ?? []) {
    const handle = m.slice(1).toLowerCase();
    const user = users.find(u =>
      u.username?.toLowerCase() === handle ||
      u.name.toLowerCase().replace(/\s+/g, '') === handle ||
      u.name.toLowerCase() === handle,
    );
    if (user?.email && !emails.includes(user.email)) emails.push(user.email);
  }
  return emails;
}

/** Fire mention notifications via /api/notify (non-blocking) + add to local inbox. */
export async function fireMentionNotifications(opts: {
  mentionedUserIds: string[];
  mentionedUserEmails?: string[];
  notifierName: string;
  context: string;
  contextId: string;
  contextType: 'workOrder' | 'customer';
  message: string;
}): Promise<void> {
  if (opts.mentionedUserIds.length === 0 && (!opts.mentionedUserEmails || opts.mentionedUserEmails.length === 0)) return;
  try {
    const { addMentions } = await import('../../lib/mentionsStore');
    const snippet = opts.message.length > 240 ? opts.message.slice(0, 237) + '...' : opts.message;
    addMentions(opts.mentionedUserIds.map(uid => ({
      userId:        uid,
      notifierName:  opts.notifierName,
      sourceType:    opts.contextType,
      sourceId:      opts.contextId,
      sourceLabel:   opts.context,
      snippet,
      createdAt:     new Date().toISOString(),
    })));
  } catch {/* ignore */}
  try {
    const { supabase } = await import('../../lib/supabase');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    await fetch('/api/notify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        mentionedUserIds:    opts.mentionedUserIds,
        mentionedUserEmails: opts.mentionedUserEmails ?? [],
        notifierName:        opts.notifierName,
        customerName:        opts.context,
        customerId:          opts.contextId,
        message:             opts.message,
        contextType:         opts.contextType,
      }),
    });
  } catch {
    // non-blocking
  }
}
