// MentionsWidget, Ops Center widget showing @mentions for the current user
// Reads from mentionsStore. Auto-refreshes on mentions-updated event.

import React, { useState, useEffect, useMemo } from 'react';
import { AtSign, Check, ExternalLink, Search, X } from 'lucide-react';
import { getMentionsFor, markRead, markAllRead, MentionRecord } from '../lib/mentionsStore';
import { Avatar } from './ui/Avatar';
import { User } from '../types';

interface Props {
  userId: string;
  users: User[];
  onOpenCustomer?: (customerId: string) => void;
  onOpenWorkOrder?: (jobId: string) => void;
}

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

export const MentionsWidget: React.FC<Props> = ({ userId, users, onOpenCustomer, onOpenWorkOrder }) => {
  const [tick, setTick] = useState(0);
  const [filter, setFilter] = useState<'unread' | 'all'>('unread');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const refresh = () => setTick(t => t + 1);
    window.addEventListener('solarops:mentions-updated', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('solarops:mentions-updated', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const all = useMemo(() => getMentionsFor(userId), [userId, tick]);
  const q = query.trim().toLowerCase();
  const visible = all
    .filter(m => (filter === 'unread' ? !m.read : true))
    .filter(m => !q
      || m.snippet.toLowerCase().includes(q)
      || m.notifierName.toLowerCase().includes(q)
      || (m.sourceLabel ?? '').toLowerCase().includes(q));
  const unreadCount = all.filter(m => !m.read).length;

  const handleOpen = (m: MentionRecord) => {
    markRead(m.id);
    if (m.sourceType === 'customer') onOpenCustomer?.(m.sourceId);
    else if (m.sourceType === 'workOrder') onOpenWorkOrder?.(m.sourceId);
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <AtSign className="w-4 h-4 text-orange-500" />
          <span className="text-sm font-semibold text-slate-900">My Mentions</span>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <span className="text-[11px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-semibold">
              {unreadCount} unread
            </span>
          )}
          {/* Only show unread, iOS-style toggle switch */}
          <button
            type="button"
            role="switch"
            aria-checked={filter === 'unread'}
            aria-label="Only show unread mentions"
            onClick={() => setFilter(filter === 'unread' ? 'all' : 'unread')}
            className="flex items-center gap-1.5 group"
          >
            <span className="text-[10px] font-medium text-slate-500 group-hover:text-slate-700 select-none">
              Only show unread
            </span>
            <span
              className={`relative inline-flex h-4 w-7 flex-shrink-0 rounded-full transition-colors ${
                filter === 'unread' ? 'bg-orange-500' : 'bg-slate-300'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${
                  filter === 'unread' ? 'translate-x-3' : 'translate-x-0'
                }`}
              />
            </span>
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-2 flex-shrink-0">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search mentions: text, person, order..."
          className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-2 pr-1">
        {visible.length === 0 ? (
          <div className="text-center py-8">
            <AtSign className="w-8 h-8 text-slate-200 mx-auto mb-2" />
            <p className="text-xs text-slate-400">
              {q ? 'No mentions match your search.'
                : filter === 'unread' ? "You're all caught up, no unread mentions." : 'No mentions yet.'}
            </p>
          </div>
        ) : visible.map(m => {
          const author = users.find(u => u.name === m.notifierName);
          return (
            <button
              key={m.id}
              onClick={() => handleOpen(m)}
              className={`w-full text-left flex gap-2 p-2 rounded-lg border transition-colors group ${
                m.read
                  ? 'bg-white border-slate-100 hover:border-slate-200'
                  : 'bg-orange-50/40 border-orange-200 hover:border-orange-300'
              }`}
            >
              <Avatar user={author ?? { name: m.notifierName }} name={m.notifierName} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <p className="text-xs font-semibold text-slate-800 truncate">
                    {m.notifierName}
                    <span className="text-slate-300 mx-1">·</span>
                    <span className="text-slate-500 font-normal">{relTime(m.createdAt)}</span>
                    {!m.read && <span className="ml-1.5 w-1.5 h-1.5 bg-orange-500 rounded-full inline-block" />}
                  </p>
                  <ExternalLink className="w-3 h-3 text-slate-300 group-hover:text-orange-500 flex-shrink-0" />
                </div>
                <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">
                  {m.sourceType === 'workOrder' ? '🔧' : m.sourceType === 'customer' ? '👤' : '📝'} {m.sourceLabel}
                </p>
                <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">{m.snippet}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer */}
      {unreadCount > 0 && (
        <button
          onClick={() => markAllRead(userId)}
          className="mt-2 flex items-center justify-center gap-1.5 w-full py-1.5 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors flex-shrink-0"
        >
          <Check className="w-3 h-3" />
          Mark all read
        </button>
      )}
    </div>
  );
};
