/**
 * Version Configuration
 *
 * Frontend version: Updated with each release
 * Database version: Updated when data schema changes (matches DATA_VERSION in dataStore.ts)
 */

export const APP_VERSION = 'v1.6.0';
export const DB_VERSION = '04-21';

export const getVersionString = (): string => `${APP_VERSION} • db ${DB_VERSION}`;
