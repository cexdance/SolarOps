import { describe, it, expect, beforeEach } from 'vitest';
import { getLogDraft, setLogDraft } from '../components/LeadPanel';

// On 2026-08-24 two real call notes were lost: the user typed into "Log a
// contact action", the panel re-rendered/remounted underneath them (a contact
// field's onBlur save propagates through sync asynchronously, and the parent
// dropped the panel whenever the jobs array transiently missed the lead), and
// useState('') wiped the text. Both entries saved as the bare fallback
// "Call: contacted". The draft now lives at module scope so it outlives a
// remount; these pin that contract.
describe('lead log draft', () => {
  beforeEach(() => {
    setLogDraft('job-a', '');
    setLogDraft('job-b', '');
  });

  it('survives being read back, which is what a remount does', () => {
    setLogDraft('job-a', 'Left voicemail, calling back Tuesday');
    expect(getLogDraft('job-a')).toBe('Left voicemail, calling back Tuesday');
  });

  it('keeps drafts separate per lead', () => {
    setLogDraft('job-a', 'spoke to owner');
    setLogDraft('job-b', 'wrong number');
    expect(getLogDraft('job-a')).toBe('spoke to owner');
    expect(getLogDraft('job-b')).toBe('wrong number');
  });

  it('clears once the entry is logged, so the next note starts empty', () => {
    setLogDraft('job-a', 'spoke to owner');
    setLogDraft('job-a', '');
    expect(getLogDraft('job-a')).toBe('');
  });

  it('returns empty string for a lead that was never typed into', () => {
    expect(getLogDraft('never-touched')).toBe('');
  });
});
