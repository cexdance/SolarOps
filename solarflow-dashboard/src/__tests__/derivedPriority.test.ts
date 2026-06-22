import { describe, it, expect } from 'vitest';
import { derivedPriority } from '../components/Jobs';
import type { Job } from '../types';

const daysAgo = (d: number) => new Date(Date.now() - d * 86400_000).toISOString();
const job = (p: Partial<Job>): Job => ({ id: 'j', createdAt: daysAgo(0), ...(p as Job) });

describe('derivedPriority', () => {
  it('open order defaults to Low and bumps one level every 3 days', () => {
    expect(derivedPriority(job({ woStatus: 'scheduled', createdAt: daysAgo(0) }))).toBe('low');
    expect(derivedPriority(job({ woStatus: 'scheduled', createdAt: daysAgo(3) }))).toBe('medium');  // 3d
    expect(derivedPriority(job({ woStatus: 'scheduled', createdAt: daysAgo(6) }))).toBe('high');    // 6d
    expect(derivedPriority(job({ woStatus: 'scheduled', createdAt: daysAgo(9) }))).toBe('critical'); // 9d+
    expect(derivedPriority(job({ woStatus: 'scheduled', createdAt: daysAgo(30) }))).toBe('critical'); // capped
  });

  it('completed-but-not-invoiced stays Low (no escalation)', () => {
    expect(derivedPriority(job({ woStatus: 'completed', createdAt: daysAgo(60) }))).toBe('low');
  });

  it('invoiced resets the counter and escalates every 3 days off invoicedAt', () => {
    const base = { woStatus: 'invoiced' as const, createdAt: daysAgo(90) };
    expect(derivedPriority(job({ ...base, invoicedAt: daysAgo(0) }))).toBe('low');
    expect(derivedPriority(job({ ...base, invoicedAt: daysAgo(3) }))).toBe('medium');  // 3d
    expect(derivedPriority(job({ ...base, invoicedAt: daysAgo(6) }))).toBe('high');    // 6d
    expect(derivedPriority(job({ ...base, invoicedAt: daysAgo(9) }))).toBe('critical'); // 9d+
  });
});
