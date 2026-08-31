import { describe, it, expect } from 'vitest';
import { findPowercareCaseNo } from '../lib/woHelpers';

describe('findPowercareCaseNo', () => {
  it('prefers the RMA entry, then the customer record, then the story', () => {
    expect(findPowercareCaseNo({
      rmaEntries: [{ caseNumber: ' 7021404 ' }],
      customer: { powerCareCaseNumber: '9999999' },
    })).toBe('7021404');

    expect(findPowercareCaseNo({
      rmaEntries: [{ caseNumber: '' }],
      customer: { powerCareCaseNumber: '9999999' },
      job: { notes: 'case #1111111' },
    })).toBe('9999999');
  });

  it('reads the case # out of the client story on either record', () => {
    expect(findPowercareCaseNo({
      job: { activityHistory: [{ description: 'Called SE, Case #: 7021404 opened' }] },
    })).toBe('7021404');

    expect(findPowercareCaseNo({
      customer: { activityHistory: [{ description: 'case 7021404' }] },
    })).toBe('7021404');
  });

  it('is empty when nothing carries a number, and ignores short digit runs', () => {
    expect(findPowercareCaseNo({})).toBe('');
    expect(findPowercareCaseNo({ job: { notes: 'case #123' } })).toBe('');
  });
});
