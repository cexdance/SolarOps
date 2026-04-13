// Site Profile Store — persists customer story, file attachments, and interaction notes
// Stored in localStorage under key: solarops_site_profiles (+ Neon via dbSet)

import { dbSet } from './db';

const STORAGE_KEY = 'solarops_site_profiles';

export type SiteClientStatus =
  | 'om'
  | 'outstanding_balance'
  | 'system_down'
  | 'wo_pending'
  | 'quote_approval';

export const CLIENT_STATUS_CONFIG: Record<SiteClientStatus, { label: string; color: string; bg: string; border: string; critical?: boolean }> = {
  om:                  { label: 'O&M',                    color: 'text-emerald-700', bg: 'bg-emerald-100', border: 'border-emerald-300' },
  outstanding_balance: { label: 'Outstanding Balance',    color: 'text-red-700',     bg: 'bg-red-100',     border: 'border-red-400',     critical: true },
  system_down:         { label: 'System Down',            color: 'text-red-700',     bg: 'bg-red-100',     border: 'border-red-400',     critical: true },
  wo_pending:          { label: 'Work Order Pending',     color: 'text-amber-700',   bg: 'bg-amber-100',   border: 'border-amber-300' },
  quote_approval:      { label: 'Quote Sent for Approval',color: 'text-violet-700',  bg: 'bg-violet-100',  border: 'border-violet-300' },
};

export interface SiteAttachment {
  id: string;
  name: string;
  type: string;   // MIME type
  size: number;   // bytes
  dataUrl?: string; // base64 — stored for images; omitted for large non-image files
  createdAt: string;
}

export interface SiteNote {
  id: string;
  content: string;
  author: string;
  createdAt: string;
  attachments: SiteAttachment[];
}

export interface SiteProfile {
  siteId: string;
  clientStatus?: string;   // predefined SiteClientStatus key OR any free-text value
  description: string;
  descriptionAttachments: SiteAttachment[];
  notes: SiteNote[];
  updatedAt: string;
}

type ProfileMap = Record<string, SiteProfile>;

const load = (): ProfileMap => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const save = (map: ProfileMap): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    dbSet(STORAGE_KEY, map);
  } catch (e) {
    console.warn('siteProfileStore: localStorage quota exceeded', e);
  }
};

export const getProfile = (siteId: string): SiteProfile => {
  const map = load();
  return map[siteId] ?? {
    siteId,
    description: '',
    descriptionAttachments: [],
    notes: [],
    updatedAt: new Date().toISOString(),
  };
};

export const saveProfile = (profile: SiteProfile): void => {
  const map = load();
  map[profile.siteId] = { ...profile, updatedAt: new Date().toISOString() };
  save(map);
};

export const addNote = (siteId: string, content: string, author: string, attachments: SiteAttachment[] = []): SiteNote => {
  const profile = getProfile(siteId);
  const note: SiteNote = {
    id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    content,
    author,
    createdAt: new Date().toISOString(),
    attachments,
  };
  profile.notes = [note, ...profile.notes]; // newest first
  saveProfile(profile);
  return note;
};

export const deleteNote = (siteId: string, noteId: string): void => {
  const profile = getProfile(siteId);
  profile.notes = profile.notes.filter(n => n.id !== noteId);
  saveProfile(profile);
};

export const updateClientStatus = (siteId: string, status: string | undefined): void => {
  const profile = getProfile(siteId);
  profile.clientStatus = status;
  saveProfile(profile);
};

export const updateDescription = (siteId: string, description: string, attachments?: SiteAttachment[]): void => {
  const profile = getProfile(siteId);
  profile.description = description;
  if (attachments !== undefined) profile.descriptionAttachments = attachments;
  saveProfile(profile);
};

// File → SiteAttachment (reads as base64 for images, metadata-only for others > 2MB)
export const fileToAttachment = (file: File): Promise<SiteAttachment> =>
  new Promise((resolve) => {
    const isImage = file.type.startsWith('image/');
    const tooLarge = file.size > 2 * 1024 * 1024; // 2 MB threshold

    const attachment: SiteAttachment = {
      id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: file.name,
      type: file.type,
      size: file.size,
      createdAt: new Date().toISOString(),
    };

    if (isImage && !tooLarge) {
      const reader = new FileReader();
      reader.onload = (e) => {
        attachment.dataUrl = e.target?.result as string;
        resolve(attachment);
      };
      reader.readAsDataURL(file);
    } else {
      resolve(attachment); // metadata only
    }
  });

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// Removed-sites logic lives in removedSitesStore.ts (no imports, avoids TDZ)
