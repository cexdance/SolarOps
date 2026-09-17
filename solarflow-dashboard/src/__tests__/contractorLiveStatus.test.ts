import { describe, it, expect } from 'vitest';
import { contractorLiveStatus } from '../lib/visits';

describe('contractorLiveStatus', () => {
  const followUp = { currentVisit: { requestedAt: '2026-09-15T22:52:25.351Z' } };
  it('ignores the previous visit completion once a follow-up is open (SO-2609-78916)', () => {
    expect(contractorLiveStatus({ status: 'completed', completedAt: '2026-09-11T14:49:53.918Z' }, followUp)).toBeNull();
    expect(contractorLiveStatus({ status: 'completed' }, followUp)).toBeNull();
  });
  it('accepts a completion stamped after the follow-up request', () => {
    expect(contractorLiveStatus({ status: 'completed', completedAt: '2026-09-17T15:00:00.000Z' }, followUp)).toBe('completed');
    expect(contractorLiveStatus({ status: 'in_progress', startedAt: '2026-09-17T13:00:00.000Z' }, followUp)).toBe('in_progress');
  });
  it('keeps single-visit behavior', () => {
    expect(contractorLiveStatus({ status: 'completed' }, {})).toBe('completed');
    expect(contractorLiveStatus({ status: 'en_route' }, {})).toBe('in_progress');
    expect(contractorLiveStatus({ status: 'assigned' }, {})).toBeNull();
  });
});
