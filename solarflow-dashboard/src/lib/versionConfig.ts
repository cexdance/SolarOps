/**
 * Version Configuration
 *
 * All values are auto-derived at build time by vite.config.ts:
 *   APP_VERSION  — reads `version` from package.json (single source of truth)
 *   BUILD_ID     — unique stamp per build (version+git-sha+epoch); also written to public/version.json
 *   BUILT_AT     — ISO timestamp of the build
 *   DB_VERSION   — mm-dd of the build date (advances automatically per deploy)
 *
 * Non-Vite environments (Jest, Node scripts) fall back to package.json import.
 */

import pkg from '../../package.json';

declare const __APP_VERSION__: string;
declare const __BUILD_ID__: string;
declare const __BUILT_AT__: string;
declare const __DB_VERSION__: string;

export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : `v${pkg.version}`;
export const BUILD_ID = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';
export const BUILT_AT = typeof __BUILT_AT__ !== 'undefined' ? __BUILT_AT__ : new Date().toISOString();
export const DB_VERSION = typeof __DB_VERSION__ !== 'undefined'
  ? __DB_VERSION__
  : `${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;

export const getVersionString = (): string => `${APP_VERSION} • db ${DB_VERSION}`;
