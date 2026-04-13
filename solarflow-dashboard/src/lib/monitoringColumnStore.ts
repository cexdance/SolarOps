// Standalone column-config store — persists column order & visibility to localStorage
// Pattern follows removedSitesStore.ts (zero external imports)

const KEY = 'solarops_monitoring_columns';

export interface ColumnConfig {
  /** Column IDs in display order */
  order: string[];
  /** Column IDs that are hidden */
  hidden: string[];
}

export const getColumnConfig = (): ColumnConfig | null => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ColumnConfig;
    if (Array.isArray(parsed.order) && Array.isArray(parsed.hidden)) return parsed;
    return null;
  } catch {
    return null;
  }
};

export const saveColumnConfig = (config: ColumnConfig): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(config));
  } catch (e) {
    console.warn('monitoringColumnStore: could not persist', e);
  }
};

export const resetColumnConfig = (): void => {
  try {
    localStorage.removeItem(KEY);
  } catch (e) {
    console.warn('monitoringColumnStore: could not reset', e);
  }
};
