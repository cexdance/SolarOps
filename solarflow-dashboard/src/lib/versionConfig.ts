/**
 * Version Configuration
 *
 * Frontend version: Updated with each release
 * Database version: Updated when data schema changes (matches DATA_VERSION in dataStore.ts)
 */

export const APP_VERSION = 'v1.6.0';
export const DB_VERSION = 'db-2026-04-15';

export const getVersionString = (): string => `${APP_VERSION} • ${DB_VERSION}`;
