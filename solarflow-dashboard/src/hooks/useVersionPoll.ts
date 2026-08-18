import { useState, useEffect, useRef, useCallback } from 'react';
import { BUILD_ID } from '../lib/versionConfig';
import { hasPendingPush } from '../lib/outbox';

// How long the page must have been hidden before a resume is allowed to reload
// itself without asking. A phone that has been backgrounded this long is a
// resumed session, not someone who glanced away mid-sentence.
//
// This threshold is the entire safety margin: there is no beforeunload guard and
// no dirty-form tracking anywhere in the app, so a reload discards whatever a
// user had typed but not committed. 30 minutes is chosen to sit well past a
// phone call or a walk to the truck. Do NOT lower it without adding a real
// unsaved-work check first.
export const RESUME_RELOAD_AFTER_HIDDEN_MS = 30 * 60 * 1000;

/**
 * May a resumed page reload itself to pick up a new build, or must it ask?
 *
 * Pure so the gate can be tested without mounting the hook or faking
 * visibility events, because getting this wrong destroys user input.
 */
export function shouldAutoReloadOnResume(hiddenForMs: number, pendingPush: boolean): boolean {
  if (pendingPush) return false; // a queued write outranks a version upgrade
  return hiddenForMs >= RESUME_RELOAD_AFTER_HIDDEN_MS;
}

type CheckState = 'idle' | 'checking' | 'up-to-date' | 'update-available';

interface VersionPollResult {
  state: CheckState;
  remoteVersion: string | null;
  checkNow: () => Promise<void>;
}

export function useVersionPoll(): VersionPollResult {
  const [state, setState] = useState<CheckState>('idle');
  const [remoteVersion, setRemoteVersion] = useState<string | null>(null);
  const initialCheckDone = useRef(false);
  const mountedRef = useRef(true);
  // When the page went hidden, so a resume can tell a long suspend from a glance.
  const hiddenSince = useRef<number | null>(null);

  const check = useCallback(async (isInitial = false, autoReload = false) => {
    if (!isInitial) setState('checking');
    try {
      const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) {
        console.warn('[version-poll] /version.json returned', res.status);
        if (mountedRef.current) setState('idle');
        return;
      }
      const data = await res.json() as { version?: string; build?: string };
      const remote = data?.build ?? data?.version;
      if (!mountedRef.current || !remote) return;

      if (remote === BUILD_ID) {
        setState('up-to-date');
        setTimeout(() => { if (mountedRef.current) setState('idle'); }, 2000);
        return;
      }

      setRemoteVersion(data?.version ?? remote);
      // A stale build on a long-suspended phone is the case that stranded mobile
      // sessions on the broken pull: they resumed, checked, put up a banner, and
      // sat there unread until someone reported missing data. Reload those
      // outright. Never reload out from under a queued write.
      if (isInitial || autoReload) {
        window.location.reload();
        return;
      }
      setState('update-available');
    } catch (err) {
      console.warn('[version-poll] fetch failed', err);
      if (mountedRef.current) setState('idle');
    }
  }, []);

  const checkNow = useCallback(async () => {
    await check(false);
  }, [check]);

  useEffect(() => {
    mountedRef.current = true;
    if (BUILD_ID === 'dev') return undefined;

    if (!initialCheckDone.current) {
      initialCheckDone.current = true;
      check(true);
    }

    const interval = setInterval(() => check(false), 10 * 60 * 1000);

    const onVisible = () => {
      if (document.visibilityState !== 'visible') {
        hiddenSince.current = Date.now();
        return;
      }
      // Only a genuinely resumed session may reload itself. A quick tab switch
      // (or a plain window focus, which never sets hiddenSince) still just gets
      // the banner, so nobody loses a half-typed form to a glance away.
      const hiddenFor = hiddenSince.current ? Date.now() - hiddenSince.current : 0;
      hiddenSince.current = null;
      check(false, shouldAutoReloadOnResume(hiddenFor, hasPendingPush()));
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [check]);

  return { state, remoteVersion, checkNow };
}
