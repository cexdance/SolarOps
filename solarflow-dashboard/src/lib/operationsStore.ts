// SolarOps Operations Data Store
// SolarEdge Alerts

import { SolarEdgeAlert } from '../types';

const ALERTS_KEY = 'solarops_alerts';

export const loadAlerts = (): SolarEdgeAlert[] => {
  try {
    const stored = localStorage.getItem(ALERTS_KEY);
    if (stored) return JSON.parse(stored);
  } catch (e) {
    console.error('Failed to load alerts:', e);
  }
  return [];
};
