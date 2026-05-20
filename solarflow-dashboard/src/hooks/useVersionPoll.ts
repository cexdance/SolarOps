import { useState, useEffect, useRef, useCallback } from 'react';
import { BUILD_ID } from '../lib/versionConfig';

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

  const check = useCallback(async (isInitial = false) => {
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
      if (isInitial) {
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
    if (BUILD_ID === 'dev') return;

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
      mountedRef.current = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [check]);

  return { state, remoteVersion, checkNow };
}
