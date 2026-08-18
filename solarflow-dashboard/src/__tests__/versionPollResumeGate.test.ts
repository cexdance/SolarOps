import { describe, it, expect } from 'vitest';
import { shouldAutoReloadOnResume, RESUME_RELOAD_AFTER_HIDDEN_MS } from '../hooks/useVersionPoll';

// There is no beforeunload guard and no dirty-form tracking in the app, so this
// predicate is the only thing standing between a stale build and a contractor
// losing a half-typed job report. Pin every branch.
describe('shouldAutoReloadOnResume', () => {
  const OVER  = RESUME_RELOAD_AFTER_HIDDEN_MS + 1;
  const UNDER = RESUME_RELOAD_AFTER_HIDDEN_MS - 1;

  it('reloads a long-suspended phone', () => {
    // The reported case: backgrounded PWA resumes still running the old build.
    expect(shouldAutoReloadOnResume(OVER, false)).toBe(true);
  });

  it('never reloads while a write is still queued', () => {
    expect(shouldAutoReloadOnResume(OVER, true)).toBe(false);
  });

  it('does not reload after a brief glance away', () => {
    expect(shouldAutoReloadOnResume(UNDER, false)).toBe(false);
  });

  it('does not reload on a plain focus with no hidden period', () => {
    // window focus never sets hiddenSince, so hiddenFor is 0.
    expect(shouldAutoReloadOnResume(0, false)).toBe(false);
  });

  it('treats the threshold itself as long enough', () => {
    expect(shouldAutoReloadOnResume(RESUME_RELOAD_AFTER_HIDDEN_MS, false)).toBe(true);
  });
});
