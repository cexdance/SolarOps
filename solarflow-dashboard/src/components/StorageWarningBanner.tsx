import React, { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

/**
 * Listens for `solarops:storage-warning` events emitted by `saveData()` when
 * localStorage quota is exceeded. Two states:
 *   - `trimmed`: the save succeeded after stripping woPhotos/activityHistory.
 *   - `failed`: the save failed entirely; the user's most recent edits are at risk.
 *
 * Render once near the app root (e.g., inside <Layout>).
 */
export const StorageWarningBanner: React.FC = () => {
  const [state, setState] = useState<'trimmed' | 'failed' | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ kind: 'trimmed' | 'failed' }>).detail;
      if (detail?.kind) setState(detail.kind);
    };
    window.addEventListener('solarops:storage-warning', handler);
    return () => window.removeEventListener('solarops:storage-warning', handler);
  }, []);

  if (!state) return null;

  const failed = state === 'failed';
  return (
    <div
      className={`fixed top-2 left-1/2 -translate-x-1/2 z-[200] max-w-md w-[calc(100%-1rem)] rounded-xl shadow-lg border px-4 py-3 flex items-start gap-3 ${
        failed ? 'bg-red-50 border-red-300 text-red-800' : 'bg-amber-50 border-amber-300 text-amber-800'
      }`}
    >
      <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" />
      <div className="flex-1 text-sm">
        <p className="font-semibold">
          {failed ? 'Storage full — recent changes may not be saved' : 'Storage almost full'}
        </p>
        <p className="text-xs mt-1 opacity-90">
          {failed
            ? 'Your device storage is exceeded. Close some tabs, clear old work order photos, or sign in on a fresh device.'
            : 'Photos and activity history were trimmed to make room. Move work orders to the cloud or delete completed jobs to free space.'}
        </p>
      </div>
      <button
        onClick={() => setState(null)}
        className={`p-1 rounded-md ${failed ? 'hover:bg-red-100' : 'hover:bg-amber-100'} cursor-pointer`}
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
