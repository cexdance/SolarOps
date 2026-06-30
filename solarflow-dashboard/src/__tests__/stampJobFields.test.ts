import { describe, it, expect } from 'vitest';
import { stampJobFields } from '../lib/jobService';
import type { Job } from '../types';

// Phase 1 of field-level job merge (spec_job_field_level_merge): the write side
// must stamp fieldTimes ONLY for fields that actually changed, and bump updatedAt.
// These pin that contract so Phase 2's merge can trust the stamps.

const base = (over: Partial<Job> = {}): Job =>
  ({ id: 'j1', createdAt: '2026-01-01T00:00:00Z', status: 'assigned', ...over } as Job);

describe('stampJobFields', () => {
  it('stamps only the changed field, leaves others untouched', () => {
    const prev = base({ contractorId: 'c-A', scheduledDate: '2026-06-30', fieldTimes: { contractorId: 'T0', scheduledDate: 'T0' } });
    const next = base({ contractorId: 'c-B', scheduledDate: '2026-06-30' }); // only contractor changed
    const out = stampJobFields(prev, next);
    expect(out.fieldTimes!.contractorId).not.toBe('T0'); // bumped
    expect(out.fieldTimes!.scheduledDate).toBe('T0');     // preserved
    expect(out.updatedAt).toBeTruthy();
  });

  it('stamps every field for a brand-new job (prev undefined)', () => {
    const next = base({ contractorId: 'c-A', scheduledDate: '2026-06-30' });
    const out = stampJobFields(undefined, next);
    expect(out.fieldTimes!.contractorId).toBeTruthy();
    expect(out.fieldTimes!.scheduledDate).toBeTruthy();
    expect(out.fieldTimes!.fieldTimes).toBeUndefined(); // never stamps the meta field itself
  });

  it('does not bump a field whose value is unchanged (deep compare)', () => {
    const prev = base({ lineItems: [{ id: 'li1', description: 'x' }] as Job['lineItems'], fieldTimes: { lineItems: 'T0' } });
    const next = base({ lineItems: [{ id: 'li1', description: 'x' }] as Job['lineItems'] }); // structurally equal
    const out = stampJobFields(prev, next);
    expect(out.fieldTimes!.lineItems).toBe('T0');
  });
});
