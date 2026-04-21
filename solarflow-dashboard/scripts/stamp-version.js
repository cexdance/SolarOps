#!/usr/bin/env node
/**
 * stamp-version.js
 * Writes the current APP_VERSION from versionConfig.ts into public/version.json
 * before every build so the live /version.json always reflects the deployed version.
 *
 * Usage: node scripts/stamp-version.js  (called automatically via "prebuild" in package.json)
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Extract APP_VERSION from versionConfig.ts without importing TypeScript
const src = readFileSync(join(root, 'src/lib/versionConfig.ts'), 'utf8');
const match = src.match(/APP_VERSION\s*=\s*'([^']+)'/);
if (!match) {
  console.error('stamp-version: could not parse APP_VERSION from versionConfig.ts');
  process.exit(1);
}

const version = match[1];
const outPath = join(root, 'public/version.json');
writeFileSync(outPath, JSON.stringify({ version }) + '\n');
console.log(`stamp-version: wrote ${version} → public/version.json`);
