import { useEffect } from 'react';
import { setBadge } from '../lib/faviconBadge';

export function useUnreadBadge(count: number): void {
  useEffect(() => {
    setBadge(count);
  }, [count]);
}
