// SolarOps — Per-user TODO list storage
// All users' todos stored under a single key: solarops_todos (Record<userId, TodoItem[]>)
// This allows proper Neon sync via dbSet.

import { dbSet } from './db';

export interface TodoItem {
  id: string;
  task: string;
  dueDate: string; // YYYY-MM-DD, empty string if no due date
  done: boolean;
  createdAt: string;
}

const STORAGE_KEY = 'solarops_todos';

const loadAll = (): Record<string, TodoItem[]> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Record<string, TodoItem[]>;
  } catch {}
  // Migrate from old per-user keys if present
  const migrated: Record<string, TodoItem[]> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith('solarops_todos_')) {
      const userId = k.replace('solarops_todos_', '');
      try {
        const v = localStorage.getItem(k);
        if (v) migrated[userId] = JSON.parse(v);
      } catch {}
    }
  }
  return migrated;
};

const saveAll = (all: Record<string, TodoItem[]>): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    dbSet(STORAGE_KEY, all);
  } catch {}
};

export const loadTodos = (userId: string): TodoItem[] => {
  return loadAll()[userId] ?? [];
};

export const saveTodos = (userId: string, todos: TodoItem[]): void => {
  const all = loadAll();
  all[userId] = todos;
  saveAll(all);
};
