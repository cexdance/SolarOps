import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

/** Dropdown sizing. MIN is the floor we will shove the list into rather than
 *  render something unusably short; MAX matches the old max-h-64. */
const MIN_DROP_HEIGHT = 140;
const MAX_DROP_HEIGHT = 256;

/** Where to put the fixed-position dropdown relative to the textarea.
 *
 *  Pure so it can be tested: getting this wrong renders the list off-screen,
 *  which is indistinguishable from "the @ menu is broken". The Customers note
 *  composer sits near the bottom of its modal and needs the upward flip; the
 *  service-order panel has room below and must keep dropping downward.
 */
export function placeDropdown(
  rect: { top: number; bottom: number; left: number; width: number },
  viewportHeight: number,
): { top: number; left: number; width: number; maxHeight: number; below: boolean } {
  const spaceBelow = viewportHeight - rect.bottom - 8;
  const spaceAbove = rect.top - 8;
  const below = spaceBelow >= MIN_DROP_HEIGHT || spaceBelow >= spaceAbove;
  const room = below ? spaceBelow : spaceAbove;
  const maxHeight = Math.max(Math.min(MAX_DROP_HEIGHT, room), MIN_DROP_HEIGHT);
  return {
    top: below ? rect.bottom + 4 : Math.max(8, rect.top - maxHeight - 4),
    left: rect.left,
    width: rect.width,
    maxHeight,
    below,
  };
}

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
  onBlur?: () => void;
}

/** The @handle for a user, and the single place that decides it.
 *
 *  Staff display names carry a role suffix ("Daniel Matos (Admin)"), so the
 *  no-username fallback has to strip anything that is not handle-legal, or it
 *  produces "@danielmatos(admin)" which parseMentions can never match back and
 *  the mention silently notifies nobody.
 */
export function handleFor(u: MentionUser): string {
  const explicit = u.username?.trim().replace(/^@/, '');
  return explicit || nameHandle(u.name);
}

/** "Daniel Matos (Admin)" -> "danielmatos". Role suffix out, handle-illegal
 *  characters out, so the result always survives the /@([\w.]+)/ reader. */
function nameHandle(name: string): string {
  return name.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^\w.]+/g, '');
}

/** Filter + rank users for the @mention dropdown.
 *
 *  Matches on any word start, not just the start of the whole field, so both
 *  "@dmatos" and "@matos" find Daniel Matos. Prefix hits still rank first, so
 *  typing "d" puts @dmatos above a mid-word match. Returns everyone on an empty
 *  query: the caller is responsible for scrolling, never for truncating, since
 *  a silent cap is what hid the 7th-through-9th staff member.
 */
export function filterMentionUsers<T extends MentionUser>(users: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return users;
  const hits: { u: T; rank: number }[] = [];
  for (const u of users) {
    const fields = [u.username ?? '', u.name ?? '', (u.email ?? '').split('@')[0]]
      .map(f => f.toLowerCase())
      .filter(Boolean);
    let rank = Infinity;
    for (const f of fields) {
      if (f.startsWith(q)) rank = Math.min(rank, 0);
      else if (f.split(/[\s._-]+/).some(w => w.startsWith(q))) rank = Math.min(rank, 1);
      else if (f.includes(q)) rank = Math.min(rank, 2);
    }
    if (rank !== Infinity) hits.push({ u, rank });
  }
  // Array.prototype.sort is stable, so equal ranks keep the caller's order.
  return hits.sort((a, b) => a.rank - b.rank).map(h => h.u);
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
  onBlur,
}) => {
  const [query, setQuery]         = useState('');
  const [start, setStart]         = useState(-1);
  const [open, setOpen]           = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [dropPos, setDropPos]     = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Re-measure the textarea whenever the dropdown opens or the value changes.
  // The list is position:fixed, so it does NOT follow the textarea on its own:
  // scrolling the WO panel (a scrollable modal) or resizing the window would
  // otherwise leave it stranded where the textarea used to be. `true` on the
  // scroll listener catches scrolls in any ancestor, which is where the panel
  // actually scrolls, not on window.
  useEffect(() => {
    if (!open || !ref.current) { setDropPos(null); return undefined; }
    const measure = () => {
      if (!ref.current) return;
      const { top, left, width, maxHeight } = placeDropdown(ref.current.getBoundingClientRect(), window.innerHeight);
      setDropPos({ top, left, width, maxHeight });
    };
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [open, value]);

  // Close on outside click. Must ignore mousedowns inside the dropdown itself:
  // it is portaled to document.body, so it is NOT a DOM descendant of this
  // component, and a naive document-level handler closed the list before the
  // option's own onMouseDown could fire. That is the "clicking a name sometimes
  // does nothing" half of the reported inconsistency.
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e: MouseEvent) => {
      if (listRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val    = e.target.value;
    const cursor = e.target.selectionStart ?? val.length;
    onChange(val);
    const before  = val.slice(0, cursor);
    const atMatch = before.match(/@([\w.]*)$/);
    if (atMatch) {
      setQuery(atMatch[1]);
      setStart(cursor - atMatch[0].length);
      setActiveIdx(0);
      setOpen(true);
    } else {
      setOpen(false);
    }
  };

  // No cap: the list scrolls instead. Slicing to 6 silently hid every staff
  // member past the 6th alphabetically (Daniel Matos is 7th of 9), so typing a
  // bare "@" appeared to prove he did not exist.
  const filtered = filterMentionUsers(users, query);

  // Narrowing the query shrinks the list, so a previously-highlighted index can
  // fall off the end. Clamp it, or Enter selects undefined and throws.
  const safeIdx = Math.min(activeIdx, Math.max(filtered.length - 1, 0));

  const select = (user: MentionUser) => {
    const handle = handleFor(user);
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
      select(filtered[safeIdx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const dropdown = open && filtered.length > 0 && dropPos ? createPortal(
    <ul
      ref={listRef}
      style={{ position: 'fixed', top: dropPos.top, left: dropPos.left, width: dropPos.width, maxHeight: dropPos.maxHeight, zIndex: 9999 }}
      className="bg-white border border-slate-200 rounded-xl shadow-xl overflow-y-auto"
      onMouseDown={e => e.preventDefault()} // prevent textarea blur
    >
      {filtered.map((u, i) => (
        <li key={u.id}>
          <button
            type="button"
            onMouseDown={() => select(u)}
            className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${
              i === safeIdx ? 'bg-orange-50' : 'hover:bg-slate-50'
            }`}
          >
            <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-700 text-xs font-bold flex items-center justify-center shrink-0">
              {u.name[0]?.toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="font-medium text-slate-800 truncate">{u.name}</p>
              <p className="text-xs text-slate-400">@{handleFor(u)}</p>
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
        onBlur={() => { setTimeout(() => setOpen(false), 150); onBlur?.(); }}
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

/** Resolve one written @handle back to the user it names. */
function matchHandle<T extends MentionUser>(handle: string, users: T[]): T | undefined {
  const h = handle.toLowerCase();
  return users.find(u =>
    // handleFor first: it is what select() actually inserted.
    handleFor(u).toLowerCase() === h ||
    u.username?.toLowerCase().replace(/^@/, '') === h ||
    // Typed by hand rather than picked from the list: "@danielmatos" for
    // "Daniel Matos (Admin)". Without this the role suffix loses the mention.
    nameHandle(u.name) === h ||
    u.name.toLowerCase().replace(/\s+/g, '') === h ||
    u.name.toLowerCase() === h,
  );
}

/** Extract user IDs for every @handle found in text. */
export function parseMentions(text: string, users: MentionUser[]): string[] {
  const ids: string[] = [];
  for (const m of text.match(/@([\w.]+)/g) ?? []) {
    const user = matchHandle(m.slice(1), users);
    if (user && !ids.includes(user.id)) ids.push(user.id);
  }
  return ids;
}

/** Extract emails for every @handle found in text (for API matching). */
export function parseMentionEmails(text: string, users: (MentionUser & { email?: string })[]): string[] {
  const emails: string[] = [];
  for (const m of text.match(/@([\w.]+)/g) ?? []) {
    const user = matchHandle(m.slice(1), users);
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
  /** Id of the activity/comment being posted, so the bell can open that exact comment. */
  activityId?: string;
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
        activityId:          opts.activityId,
      }),
    });
  } catch {
    // non-blocking
  }
}

/**
 * Email an appointment confirmation directly to the customer via /api/notify
 * (action: 'customer-appointment'). Non-blocking, returns true on a 2xx send.
 */
export async function sendCustomerAppointmentEmail(opts: {
  customerEmail: string;
  customerName: string;
  when: string;
  orderNo?: string;
  contractorName?: string;
}): Promise<boolean> {
  if (!opts.customerEmail || !/.+@.+\..+/.test(opts.customerEmail)) return false;
  try {
    const { supabase } = await import('../../lib/supabase');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return false;
    const res = await fetch('/api/notify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action: 'customer-appointment', ...opts }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
