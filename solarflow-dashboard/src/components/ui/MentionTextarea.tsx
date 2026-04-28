import { useState, useRef } from 'react';

export interface MentionUser {
  id: string;
  name: string;
  username?: string;
}

interface Props {
  value: string;
  onChange: (val: string) => void;
  users: MentionUser[];
  placeholder?: string;
  rows?: number;
  className?: string;
  disabled?: boolean;
}

/** Textarea with live @mention dropdown. Selecting a user inserts @handle. */
export const MentionTextarea: React.FC<Props> = ({
  value,
  onChange,
  users,
  placeholder,
  rows = 4,
  className = '',
  disabled,
}) => {
  const [query, setQuery]       = useState('');
  const [start, setStart]       = useState(-1);
  const [open, setOpen]         = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val    = e.target.value;
    const cursor = e.target.selectionStart ?? val.length;
    onChange(val);
    const before   = val.slice(0, cursor);
    const atMatch  = before.match(/@(\w*)$/);
    if (atMatch) {
      setQuery(atMatch[1]);
      setStart(cursor - atMatch[0].length);
      setOpen(true);
    } else {
      setOpen(false);
    }
  };

  const select = (user: MentionUser) => {
    const handle = user.username?.trim() || user.name.replace(/\s+/g, '').toLowerCase();
    const before = value.slice(0, start);
    const after  = value.slice(ref.current?.selectionStart ?? value.length);
    onChange(`${before}@${handle} ${after}`);
    setOpen(false);
    setTimeout(() => ref.current?.focus(), 0);
  };

  const filtered = (
    query
      ? users.filter(u => {
          const q = query.toLowerCase();
          return u.username?.toLowerCase().startsWith(q) || u.name.toLowerCase().startsWith(q);
        })
      : users.slice(0, 8)
  ).slice(0, 6);

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        rows={rows}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute bottom-full mb-1 left-0 z-50 w-56 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          {filtered.map(u => (
            <li key={u.id}>
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); select(u); }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-orange-50 flex items-center gap-2 transition-colors"
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
        </ul>
      )}
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

/** Fire mention notifications via /api/notify (non-blocking). */
export async function fireMentionNotifications(opts: {
  mentionedUserIds: string[];
  notifierName: string;
  context: string;      // e.g. "WO-2604-50310"
  contextId: string;    // workOrderId or customerId
  contextType: 'workOrder' | 'customer';
  message: string;
}): Promise<void> {
  if (opts.mentionedUserIds.length === 0) return;
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
        mentionedUserIds: opts.mentionedUserIds,
        notifierName:     opts.notifierName,
        customerName:     opts.context,
        customerId:       opts.contextId,
        message:          opts.message,
        contextType:      opts.contextType,
      }),
    });
  } catch {
    // non-blocking — notification failure never breaks the save
  }
}
