import { useState, useEffect } from 'react';
import { APP_VERSION } from '../lib/versionConfig';

export function useVersionPoll(): boolean {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    const BUILT_VERSION = APP_VERSION;
    let mounted = true;

    const check = async () => {
      try {
        const res = await fetch('/version.json', { cache: 'no-store' });
        if (!res.ok) return;
        const { version } = await res.json() as { version: string };
        if (mounted && version && version !== BUILT_VERSION) setUpdateAvailable(true);
      } catch {
        // offline or missing endpoint — ignore
      }
    };

    check();
    const interval = setInterval(check, 5 * 60 * 1000);
    window.addEventListener('focus', check);
    return () => {
      mounted = false;
      clearInterval(interval);
      window.removeEventListener('focus', check);
    };
  }, []);

  return updateAvailable;
}
