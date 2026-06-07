// SolarOps — Per-user TODO list storage
// All users' todos stored under a single key: solarops_todos (Record<userId, TodoItem[]>)
// This is the SINGLE source of truth for the "My To-Do" widget shown in BOTH the
// Home Dashboard and the Ops Center (DispatchDashboard). Previously the Home
// Dashboard kept its own divergent copy under `solarops_todos_v1_<uid>` with a
// `text` field, so a user's todos didn't match between the two views. loadAll()
// now merge-migrates those legacy keys into this canonical store on first read.

import { dbSet } from './db';

export interface TodoItem {
  id: string;
  task: string;          // the todo text (Home dashboard previously called this `text`)
  dueDate: string;       // YYYY-MM-DD, '' if no due date
  done: boolean;
  createdAt: string;
  // Optional client link (used by the Home dashboard widget)
  customerId?: string;
  customerName?: string;
}

const STORAGE_KEY = 'solarops_todos';

// Legacy shapes: Home dashboard used `text`; older keys may already use `task`.
interface LegacyTodo {
  id: string;
  text?: string;
  task?: string;
  dueDate?: string;
  done?: boolean;
  createdAt?: string;
  customerId?: string;
  customerName?: string;
}

const normalize = (t: LegacyTodo): TodoItem => ({
  id: t.id,
  task: t.task ?? t.text ?? '',
  dueDate: t.dueDate ?? '',
  done: !!t.done,
  createdAt: t.createdAt ?? new Date().toISOString(),
  ...(t.customerId ? { customerId: t.customerId } : {}),
  ...(t.customerName ? { customerName: t.customerName } : {}),
});

const saveAll = (all: Record<string, TodoItem[]>): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    dbSet(STORAGE_KEY, all);
  } catch (e) { console.error('[todoStore] saveAll failed', e); }
};

const loadAll = (): Record<string, TodoItem[]> => {
  let all: Record<string, TodoItem[]> = {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) all = JSON.parse(raw) as Record<string, TodoItem[]>;
  } catch (e) { console.error('[todoStore] loadAll parse failed', e); }

  // One-time merge-migration of legacy per-user keys into the canonical record:
  //   solarops_todos_v1_<uid>  (Home dashboard widget — `text` field, no due date)
  //   solarops_todos_<uid>     (older variant)
  // Items are normalized (text→task) and merged by id, then the legacy key is
  // deleted so it can't drift again.
  const legacyKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k !== STORAGE_KEY && k.startsWith('solarops_todos_')) legacyKeys.push(k);
  }
  let migratedAny = false;
  for (const k of legacyKeys) {
    const uid = k.startsWith('solarops_todos_v1_')
      ? k.slice('solarops_todos_v1_'.length)
      : k.slice('solarops_todos_'.length);
    try {
      const v = localStorage.getItem(k);
      if (uid && v) {
        const items = (JSON.parse(v) as LegacyTodo[]).map(normalize);
        const existing = all[uid] ?? [];
        const seen = new Set(existing.map(t => t.id));
        all[uid] = [...existing, ...items.filter(t => !seen.has(t.id))];
        migratedAny = true;
      }
    } catch { /* skip unparseable legacy key */ }
    try { localStorage.removeItem(k); } catch (e) { console.error('[todoStore] legacy key removeItem failed', k, e); }
  }
  if (migratedAny) saveAll(all);
  return all;
};

export const loadTodos = (userId: string): TodoItem[] => {
  return loadAll()[userId] ?? [];
};

export const saveTodos = (userId: string, todos: TodoItem[]): void => {
  const all = loadAll();
  all[userId] = todos;
  saveAll(all);
};
