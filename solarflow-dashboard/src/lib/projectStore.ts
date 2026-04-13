import { SolarProject } from '../types/project';
import { dbSet, dbGet } from './db';

const KEY = 'solarops_projects';

export function loadProjects(): SolarProject[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch { /* fall through */ }
  return [];
}

export function saveProjects(projects: SolarProject[]): void {
  localStorage.setItem(KEY, JSON.stringify(projects));
  dbSet(KEY, projects);
}

export async function syncProjectsFromDB(): Promise<void> {
  const remote = await dbGet(KEY) as SolarProject[] | null;
  if (Array.isArray(remote) && remote.length > 0) {
    localStorage.setItem(KEY, JSON.stringify(remote));
  }
}
