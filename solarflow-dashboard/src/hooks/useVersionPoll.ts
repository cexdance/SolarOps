import { useState, useEffect, useRef } from 'react';
import { BUILD_ID } from '../lib/versionConfig';

/**
 * Polls /version.json and flips `updateAvailable` when the deployed build id
 * differs from the bundle's compiled-in BUILD_ID. Refresh handler in App.tsx
 * calls window.location.reload() when the user clicks the banner.
 *
 * Disabled during `vite dev` (BUILD_ID === 'dev') so the dev server doesn't
 * thrash on every save.
 */
export function useVersionPoll(): boolean {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const initialCheckDone = useRef(false);

  useEffect(() => {
    if (BUILD_ID === 'dev') return; // skip in dev — no real deploys to detect
    let mounted = true;

    const check = async (isInitial = false) => {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) {
          console.warn('[version-poll] /version.json returned', res.status);
          return;
        }
        const data = await res.json() as { version?: string; build?: string };
        const remote = data?.build ?? data?.version;
        if (!mounted || !remote || remote === BUILD_ID) return;
        if (isInitial) {
          window.location.reload();
          return;
        }
        setUpdateAvailable(true);
      } catch (err) {
        console.warn('[version-poll] fetch failed', err);
      }
    };

    if (!initialCheckDone.current) {
      initialCheckDone.current = true;
      check(true);
    }

    const interval = setInterval(() => check(false), 2 * 60 * 1000);

    const onVisible = () => {
      if (document.visibilityState === 'visible') check(false);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      mounted = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);

  return updateAvailable;
}
