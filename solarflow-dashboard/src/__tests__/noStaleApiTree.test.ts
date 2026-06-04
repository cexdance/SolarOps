/**
 * Single-source-of-truth guard for the serverless API.
 *
 * History: the repo once had TWO parallel api/ trees - one at the repo root and
 * one at solarflow-dashboard/api. Vercel deploys ONLY solarflow-dashboard/api
 * (project Root Directory = solarflow-dashboard). The trees silently diverged
 * and edits landed in the dead root tree, shipping bugs to production
 * (e.g. the GET-only users.ts stub, and ff7ae75 editing the wrong users.ts).
 *
 * This test fails the build if a repo-root /api directory reappears, so all
 * serverless handlers stay in the one deployed location.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url)); // .../solarflow-dashboard/src/__tests__
const repoRoot = resolve(here, '..', '..', '..'); // repo root
const staleApiDir = join(repoRoot, 'api');

describe('serverless API single source of truth', () => {
  it('has no stale repo-root /api tree (deploy uses solarflow-dashboard/api only)', () => {
    if (!existsSync(staleApiDir)) {
      expect(existsSync(staleApiDir)).toBe(false);
      return;
    }
    // If it exists, it must contain no handler files (.ts/.js/.py).
    const handlers = readdirSync(staleApiDir).filter(
      (f) => /\.(ts|js|mjs|py)$/.test(f) && statSync(join(staleApiDir, f)).isFile(),
    );
    expect(
      handlers,
      `A repo-root /api tree reappeared with handlers: ${handlers.join(', ')}. ` +
        `Vercel does NOT deploy it - put all serverless functions in solarflow-dashboard/api/.`,
    ).toEqual([]);
  });
});
