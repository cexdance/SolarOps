import { describe, expect, it } from 'vitest';
import { evaluate, reconcile, emptyState, shiftDay, floridaSite, reviewSubject, type Reading, type Site } from '../../../api/_productionReview';
const now = new Date('2026-10-04T11:00:00Z');
const site: Site = { siteId: 1, name: 'US-123 Test', location: { state: 'FL', timezone: 'America/New_York' } };
const readings = (weekly: number): Reading[] => Array.from({ length: 77 }, (_, i) => ({ timestamp: `${shiftDay('2026-07-19', i)}T00:00:00-04:00`, value: i < 70 ? 100 : weekly / 7 }));
describe('Florida production review', () => {
  it('uses completed local days and ten preceding weeks, including exact 40%', () => {
    const result = evaluate(site, [], readings(420), now); expect(result.production).toBe('checked'); expect(result.findings[0]).toMatchObject({ averageWh: 700, weeklyWh: 420, dropPercent: 40 });
    expect(evaluate(site, [], readings(421), now).findings).toEqual([]);
  });
  it('flags confirmed zero and does not turn missing readings into zero', () => {
    expect(evaluate(site, [], readings(0), now).findings[0]?.dropPercent).toBe(100);
    const missing = readings(0); missing[76]!.value = null; expect(evaluate(site, [], missing, now).findings).toEqual([]);
    expect(evaluate(site, [], readings(0).slice(1), now).production).toBe('insufficient');
  });
  it('ignores current day and handles local dates across DST', () => {
    expect(evaluate(site, [], [...readings(700), { timestamp: '2026-10-04T00:00:00-04:00', value: 0 }], now).findings).toEqual([]);
    expect(evaluate(site, [], [], new Date('2026-11-01T03:00:00Z')).window).toBe('2026-10-24 to 2026-10-30');
  });
  it('requires 48 hours and actual SolarEdge firstTrigger evidence', () => {
    const fault = { siteId: 1, type: 'RAPID_SITE_COMMUNICATION_FAULT', status: 'OPEN', firstTrigger: '2026-10-02T11:00:00Z' };
    expect(evaluate(site, [fault], [], now).findings[0]?.kind).toBe('communication');
    expect(evaluate(site, [{ ...fault, firstTrigger: '2026-10-02T11:00:01Z' }], [], now).findings).toEqual([]);
    expect(evaluate(site, [{ ...fault, status: 'CLOSED' }], [], now).findings).toEqual([]);
    expect(evaluate(site, [{ ...fault, type: 'INVERTER_COMMUNICATION_FAULT' }], [], now).findings).toEqual([]);
  });
  it('does not invent communication evidence from ambiguous timestamps', () => {
    expect(evaluate({ ...site, lastUpdateTime: '2026-09-01 00:00:00' }, [], readings(0), now).communication).toBe('unknown');
    expect(evaluate(site, [], null, now).findings).toEqual([]);
  });
  it('preserves decisions, deduplicates and opens a new episode after recovery', () => {
    const finding = evaluate(site, [], readings(0), now);
    let state = reconcile(emptyState(), [finding]); state.reviews[0]!.status = 'reviewed'; state.reviews[0]!.notes = 'Weather confirmed';
    state = reconcile(state, [finding]); expect(state.reviews).toHaveLength(1); expect(state.reviews[0]!.notes).toBe('Weather confirmed');
    const failure = evaluate(site, [], null, now); failure.error = '429'; state = reconcile(state, [failure]); expect(state.reviews[0]!.active).toBe(true);
    state = reconcile(state, [evaluate(site, [], readings(700), now)]); expect(state.reviews[0]!.active).toBe(false);
    state = reconcile(state, [{ ...finding, checkedAt: '2026-10-06T11:00:00Z' }]); expect(state.reviews).toHaveLength(2); expect(state.reviews[1]!.status).toBe('open');
    expect(reviewSubject(state.reviews)).toContain('1 Florida site needs');
  });
  it('covers explicit Florida and naming fallback, excluding other states', () => {
    expect(floridaSite(site)).toBe(true); expect(floridaSite({ ...site, location: { state: 'Georgia' } })).toBe(false); expect(floridaSite({ ...site, location: {} })).toBe(true);
  });
});

import { energyWindows } from '../../../api/_productionReview';
it('splits long daily history into requests below the one-month API limit', () => {
  const windows = energyWindows('2026-07-19', '2026-10-03'); expect(windows).toHaveLength(3);
  for (const w of windows) expect(Date.parse(w.to) - Date.parse(w.from)).toBeLessThan(28 * 86400000);
});
