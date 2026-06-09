// Avatar, circular initials or uploaded photo
// Initials derived from name (first + last). Background color hashed from name
// so each teammate gets a stable, distinct color. Falls back to user.avatar URL
// if provided (set in Settings → Profile).

import React from 'react';

interface AvatarUser {
  id?: string;
  name?: string;
  avatar?: string;
}

const SIZE_CLASSES = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
} as const;

const PALETTE = [
  'bg-orange-500', 'bg-amber-500', 'bg-emerald-500', 'bg-teal-500',
  'bg-sky-500', 'bg-indigo-500', 'bg-violet-500', 'bg-fuchsia-500',
  'bg-rose-500', 'bg-red-500', 'bg-lime-600', 'bg-cyan-600',
];

function hashColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

function initials(name?: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface Props {
  user?: AvatarUser | null;
  name?: string;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
  ring?: 'none' | 'orange' | 'green' | 'amber' | 'blue';
  title?: string;
}

const RING_CLASSES = {
  none: '',
  orange: 'ring-2 ring-orange-300',
  green: 'ring-2 ring-emerald-300',
  amber: 'ring-2 ring-amber-300',
  blue: 'ring-2 ring-blue-300',
} as const;

export const Avatar: React.FC<Props> = ({ user, name, size = 'sm', className = '', ring = 'none', title }) => {
  const displayName = user?.name ?? name ?? '?';
  const avatarUrl = user?.avatar;
  const sizeCls = SIZE_CLASSES[size];
  const ringCls = RING_CLASSES[ring];

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={displayName}
        title={title ?? displayName}
        className={`${sizeCls} ${ringCls} rounded-full object-cover flex-shrink-0 ${className}`}
      />
    );
  }

  const bgClass = hashColor(user?.id ?? displayName);
  return (
    <div
      title={title ?? displayName}
      className={`${sizeCls} ${ringCls} ${bgClass} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 select-none ${className}`}
    >
      {initials(displayName)}
    </div>
  );
};
