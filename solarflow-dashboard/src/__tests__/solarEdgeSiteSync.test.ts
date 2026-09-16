// The RMA board's site transfer lane advances off SolarEdge site NAMES, which
// live in the solarEdgeExtraSites blob. That blob used to be pushed but never
// pulled, so any browser that had not run a SolarEdge sync itself saw an empty
// list and reported every transfer as "waiting on SolarEdge".
import { describe, it, expect } from 'vitest';
import { mergeRemote } from '../lib/syncEngine';
import type { AppState } from '../types';

type Site = NonNullable<AppState['solarEdgeExtraSites']>[number];
const site = (siteId: string, siteName: string, lastUpdate: string) =>
  ({ siteId, siteName, lastUpdate }) as unknown as Site;

const state = (over: Partial<AppState>) =>
  ({ customers: [], jobs: [], ...over }) as unknown as AppState;

describe('mergeRemote, SolarEdge site cache', () => {
  it('hands the synced list to a browser that has none', () => {
    const remote = { solarEdgeExtraSites: [site('2305719', 'US-15631 Jakson Roche', '2026-09-12')] };
    const merged = mergeRemote(state({ solarEdgeExtraSites: [] }), remote);
    expect(merged.solarEdgeExtraSites).toHaveLength(1);
    expect(merged.solarEdgeExtraSites?.[0].siteName).toBe('US-15631 Jakson Roche');
  });

  it('keeps the local list when the remote blob is empty', () => {
    const local = state({ solarEdgeExtraSites: [site('451846', 'US-15691 Danielle Ferrari', '2026-09-12')] });
    const merged = mergeRemote(local, { solarEdgeExtraSites: [] });
    expect(merged.solarEdgeExtraSites).toHaveLength(1);
    expect(merged.solarEdgeExtraSites?.[0].siteId).toBe('451846');
  });

  it('unions both sides by site id', () => {
    const local = state({ solarEdgeExtraSites: [site('1', 'US-1 One', '2026-09-01')] });
    const merged = mergeRemote(local, { solarEdgeExtraSites: [site('2', 'US-2 Two', '2026-09-01')] });
    expect(merged.solarEdgeExtraSites?.map(s => s.siteId).sort()).toEqual(['1', '2']);
  });

  it('takes the newer record when both sides know a site', () => {
    // The rename is exactly what the board is watching for, so the fresher
    // name has to win rather than the local copy.
    const local = state({ solarEdgeExtraSites: [site('2305719', 'Roche, Jakson TSP1', '2026-09-01')] });
    const merged = mergeRemote(local, { solarEdgeExtraSites: [site('2305719', 'US-15631 Jakson Roche', '2026-09-12')] });
    expect(merged.solarEdgeExtraSites).toHaveLength(1);
    expect(merged.solarEdgeExtraSites?.[0].siteName).toBe('US-15631 Jakson Roche');
  });

  it('does not let a stale remote name overwrite a newer local one', () => {
    const local = state({ solarEdgeExtraSites: [site('2305719', 'US-15631 Jakson Roche', '2026-09-12')] });
    const merged = mergeRemote(local, { solarEdgeExtraSites: [site('2305719', 'Roche, Jakson TSP1', '2026-09-01')] });
    expect(merged.solarEdgeExtraSites?.[0].siteName).toBe('US-15631 Jakson Roche');
  });
});
