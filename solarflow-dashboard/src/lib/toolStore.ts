// Tool persistence: localStorage, synced to Supabase via the KV path.
//
// Tools were demo-only until now: InventoryModule held them in
// `useState<ToolItem[]>(demoTools)` with no store behind it, so every edit,
// check-out and status change was lost on reload and no other device ever saw
// one. This gives them the same treatment inventory got, union merge plus
// `deletedAt` tombstones, because tools are multi-writer for the same reason
// inventory is: the office assigns them and techs check them in and out.

import { ToolItem } from '../types';
import { dbSet } from './db';

const TOOLS_KEY = 'solarops_tools';

/** Raw persisted array INCLUDING tombstones. Internal use only. */
function loadRaw(): ToolItem[] {
  try {
    const raw = localStorage.getItem(TOOLS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // unreadable, treat as empty
  }
  return [];
}

export function loadTools(): ToolItem[] {
  return loadRaw().filter(t => !t.deletedAt);
}

/**
 * Stamp `updatedAt` only on tools whose content actually changed.
 *
 * A blanket stamp would make whichever device saved last win every field, which
 * is exactly the clobber the merge exists to prevent. Same rule as inventory.
 */
function stampChanged(tools: ToolItem[], prevRaw: string | null): ToolItem[] {
  let prevById = new Map<string, string>();
  try {
    const prev: ToolItem[] = prevRaw ? JSON.parse(prevRaw) : [];
    if (Array.isArray(prev)) {
      prevById = new Map(prev.filter(p => p?.id).map(p => [p.id, JSON.stringify(p)]));
    }
  } catch {
    // Unreadable previous state: treat everything as new rather than lose the save.
  }
  const now = new Date().toISOString();
  return tools.map(tool => {
    if (!tool?.id) return tool;
    const before = prevById.get(tool.id);
    const { updatedAt: _drop, ...bare } = tool;
    const beforeBare = before ? (() => {
      try { const { updatedAt: _d, ...b } = JSON.parse(before); return JSON.stringify(b); }
      catch { return null; }
    })() : null;
    if (beforeBare !== null && beforeBare === JSON.stringify(bare)) return tool; // untouched
    return { ...tool, updatedAt: now };
  });
}

export function saveTools(tools: ToolItem[]): void {
  const prevRaw = localStorage.getItem(TOOLS_KEY);
  const stamped = stampChanged(tools, prevRaw);

  // Re-attach tombstones: callers hold the LIVE list, so persisting `tools`
  // alone would drop every tombstone and the union merge would resurrect the
  // tool from any device that still has it.
  const live = new Set(stamped.map(t => t.id));
  const tombstones = loadRaw().filter(t => t.deletedAt && !live.has(t.id));
  const persisted = [...stamped, ...tombstones];

  try {
    localStorage.setItem(TOOLS_KEY, JSON.stringify(persisted));
  } catch (err) {
    console.warn('[tools] localStorage save failed (likely quota); persisting to DB only', err);
  }
  dbSet(TOOLS_KEY, persisted);
}

/** Soft-delete, so the delete propagates. See `deleteInventoryItem` for why. */
export function deleteTool(id: string): ToolItem[] {
  const now = new Date().toISOString();
  const all = loadRaw().map(t =>
    t.id === id ? { ...t, deletedAt: now, updatedAt: now } : t
  );
  try {
    localStorage.setItem(TOOLS_KEY, JSON.stringify(all));
  } catch (err) {
    console.warn('[tools] localStorage delete failed (likely quota); persisting to DB only', err);
  }
  dbSet(TOOLS_KEY, all);
  return all.filter(t => !t.deletedAt);
}

/** Check a tool out to a contractor, or back in when `contractorId` is null. */
export function setToolAssignment(
  tool: ToolItem,
  contractorId: string | null,
  contractorName?: string,
): ToolItem {
  const now = new Date().toISOString();
  return contractorId
    ? { ...tool, status: 'in_use', assignedContractorId: contractorId,
        assignedTo: contractorName ?? tool.assignedTo, checkedOutAt: now, updatedAt: now }
    : { ...tool, status: 'available', assignedContractorId: undefined,
        assignedTo: undefined, checkedOutAt: undefined, updatedAt: now };
}
