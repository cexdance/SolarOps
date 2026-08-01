/**
 * Mentions are the workflow backbone: a mention notification must open the exact
 * comment. This pins the `#activity-<id>` permalink parser that the bell,
 * copy-permalink, and pasted URLs all share.
 */
import { describe, it, expect } from 'vitest';
import { activityIdFromHash } from '../components/ui/ActivityFeed';

describe('activityIdFromHash', () => {
  it('extracts ids that themselves contain hyphens', () => {
    expect(activityIdFromHash('#activity-wo-cmt-1783524929412')).toBe('wo-cmt-1783524929412');
    expect(activityIdFromHash('#activity-activity-1783524929412')).toBe('activity-1783524929412');
    expect(activityIdFromHash('#activity-wo-cmt-note-123')).toBe('wo-cmt-note-123');
  });

  it('ignores unrelated or empty hashes', () => {
    expect(activityIdFromHash('')).toBeNull();
    expect(activityIdFromHash('#')).toBeNull();
    expect(activityIdFromHash('#activity-')).toBeNull();
    expect(activityIdFromHash('#settings')).toBeNull();
    expect(activityIdFromHash('#not-activity-123')).toBeNull();
  });
});
