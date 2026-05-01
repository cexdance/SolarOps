/**
 * Version Configuration
 *
 * APP_VERSION  — human-readable, manually bumped per release (drives the badge UI).
 * BUILD_ID     — unique stamp per build (git-sha + epoch); injected by vite.config.ts.
 *                Same value lands in public/version.json so useVersionPoll detects deploys.
 */

declare const __APP_VERSION__: string;
declare const __BUILD_ID__: string;
declare const __BUILT_AT__: string;

export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'v1.7.0';
export const BUILD_ID = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';
export const BUILT_AT = typeof __BUILT_AT__ !== 'undefined' ? __BUILT_AT__ : new Date().toISOString();
export const DB_VERSION = '04-28';

export const getVersionString = (): string => `${APP_VERSION} • db ${DB_VERSION}`;
