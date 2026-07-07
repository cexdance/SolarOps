import { describe, it, expect } from 'vitest';
import { resolvePriority } from '../components/Jobs';
import type { Job } from '../types';

// Invariant suite for job priority, written BEFORE any new escalation logic.
// Context: 6acc277 added a 3-day age-based escalation counter off createdAt;
// dec1ca8 reverted it because every pre-existing job is old, so the whole
// backlog saturated to Critical overnight. These tests pin the current
// manual-only behavior and must keep passing through any future change:
// existing records must never have their priority mutated by age alone.

const daysAgo = (d: number) => new Date(Date.now() - d * 86400_000).toISOString();
const job = (over: Partial<Job> = {}): Job =>
  ({ id: 'j1', createdAt: daysAgo(0), status: 'assigned', ...over } as Job);

describe('resolvePriority invariants', () => {
  it('a legacy job with no urgency set defaults to low, regardless of age', () => {
    expect(resolvePriority(job({ createdAt: daysAgo(0) }))).toBe('low');
    expect(resolvePriority(job({ createdAt: daysAgo(400) }))).toBe('low'); // real backlog age
    expect(resolvePriority(job({ createdAt: daysAgo(4000) }))).toBe('low'); // pathological legacy row
  });

  it('an explicit urgency is preserved verbatim, age never overrides it', () => {
    for (const u of ['low', 'medium', 'high', 'critical'] as const) {
      expect(resolvePriority(job({ urgency: u, createdAt: daysAgo(0) }))).toBe(u);
      expect(resolvePriority(job({ urgency: u, createdAt: daysAgo(4000) }))).toBe(u);
    }
  });

  it('does not mutate the job passed in', () => {
    const j = job({ urgency: 'high', createdAt: daysAgo(30) });
    const before = JSON.stringify(j);
    resolvePriority(j);
    expect(JSON.stringify(j)).toBe(before);
  });

  it('status/woStatus has no bearing on priority (no hidden age-off-invoicedAt path)', () => {
    for (const status of ['assigned', 'completed', 'invoiced', 'paid', 'archived'] as const) {
      expect(resolvePriority(job({ status, createdAt: daysAgo(4000) }))).toBe('low');
    }
  });
});
