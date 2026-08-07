import React, { useEffect, useState } from 'react';
import { AlertTriangle, X, Download } from 'lucide-react';
import { AppState } from '../types';
import { logChange } from '../lib/changeLog';

/** Bytes currently held in localStorage. Capped near 5 MB per origin on iOS Safari. */
export function measureLocalStorage(): number {
  try {
    let bytes = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      bytes += k.length + (localStorage.getItem(k)?.length ?? 0);
    }
    return bytes;
  } catch { return -1; }
}

/** Origin-wide usage/quota, which is what IndexedDB actually draws on. */
async function measureOrigin(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (!navigator?.storage?.estimate) return null;
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota };
  } catch { return null; }
}

/**
 * Listens for `solarops:storage-warning` events emitted by `saveData()` when
 * localStorage quota is exceeded. Two states:
 *   - `trimmed`: the save succeeded after stripping woPhotos/activityHistory.
 *   - `failed`: the save failed entirely; the user's most recent edits are at risk.
 *
 * On `failed` this renders a BLOCKING modal (data loss is imminent), on `trimmed`
 * a dismissible banner. Both offer an "Export backup" button that downloads the
 * full in-memory state as JSON so the user can rescue data the quota strip drops.
 *
 * Render once near the app root (e.g., inside <Layout>). Pass a getter for the
 * current full state so the export always reflects the latest in-memory data.
 */
interface Props {
  getSnapshot: () => AppState;
}

interface WarningDetail {
  kind:    'trimmed' | 'failed';
  reason?: string;   // 'idb-write-failed' | 'quota-exceeded'
  source?: string;   // e.g. 'contractor_jobs'
}

export const StorageWarningBanner: React.FC<Props> = ({ getSnapshot }) => {
  const [state, setState] = useState<'trimmed' | 'failed' | null>(null);
  const [diag, setDiag] = useState<WarningDetail | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<WarningDetail>).detail;
      if (!detail?.kind) return;
      setState(detail.kind);
      setDiag(detail);

      // Both emitters have always sent `reason`/`source`; this component used to
      // read only `kind` and drop them, so a report of "storage full" could not be
      // traced to localStorage-quota vs an IndexedDB write failure without the
      // user's device. Record it so it reaches the admin Log Viewer.
      void (async () => {
        try {
          logChange('storage.warning', 'storage', detail.source ?? 'app', {
            kind:   detail.kind,
            reason: detail.reason ?? 'unspecified',
            source: detail.source ?? 'app',
            // The two numbers that tell the failures apart: localStorage is capped
            // near 5 MB per origin, IndexedDB draws on the much larger origin quota.
            // A ~5 MB localStorage reading means the cap; a usage close to quota with
            // small localStorage means the origin is full (photo blobs), not the cap.
            localStorageBytes: measureLocalStorage(),
            origin:            await measureOrigin(),
            ua:                typeof navigator !== 'undefined' ? navigator.userAgent : '',
          });
        } catch { /* logging must never mask the warning itself */ }
      })();
    };
    window.addEventListener('solarops:storage-warning', handler);
    return () => window.removeEventListener('solarops:storage-warning', handler);
  }, []);

  const exportBackup = () => {
    try {
      const snapshot = getSnapshot();
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      a.href = url;
      a.download = `solarops-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[StorageWarning] export failed', err);
    }
  };

  if (!state) return null;

  const failed = state === 'failed';

  // Failed: imminent data loss. Block the screen until the user acts.
  if (failed) {
    return (
      <div className="fixed inset-0 z-[1000] bg-black/60 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl border border-red-200 max-w-md w-full p-6">
          <div className="flex items-start gap-3">
            <div className="inline-flex p-2 rounded-xl bg-red-50 flex-shrink-0">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-slate-900">This device is out of storage</h2>
              <p className="text-sm text-slate-600 mt-2">
                Your edits were sent to the cloud, but this device could not keep its own local copy.
                They are not lost. Until you free space, this device may not hold your work while
                offline. Export a backup to be safe, then clear old work order photos or sign in on
                another device.
              </p>
              {diag && (
                <p className="text-[11px] text-slate-400 mt-2 font-mono break-all">
                  {diag.reason ?? 'unspecified'}
                  {diag.source ? ` · ${diag.source}` : ''}
                  {` · local ${(measureLocalStorage() / 1048576).toFixed(1)} MB`}
                </p>
              )}
            </div>
          </div>
          <div className="mt-5 flex flex-col gap-2">
            <button
              onClick={exportBackup}
              className="w-full flex items-center justify-center gap-2 py-3 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl transition-colors cursor-pointer"
            >
              <Download className="w-5 h-5" />
              Export backup
            </button>
            <button
              onClick={() => setState(null)}
              className="w-full py-2.5 text-slate-500 text-sm font-medium hover:bg-slate-50 rounded-xl cursor-pointer"
            >
              I understand, continue anyway
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Trimmed: save succeeded after dropping photos/history. Non-blocking, but offer export.
  return (
    <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[200] max-w-md w-[calc(100%-1rem)] rounded-xl shadow-lg border px-4 py-3 flex items-start gap-3 bg-amber-50 border-amber-300 text-amber-800">
      <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" />
      <div className="flex-1 text-sm">
        <p className="font-semibold">Storage almost full</p>
        <p className="text-xs mt-1 opacity-90">
          Photos and activity history were trimmed locally to make room. The full data is still synced
          to the cloud. Export a backup to be safe, then delete completed jobs to free space.
        </p>
        <button
          onClick={exportBackup}
          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg text-xs font-semibold cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          Export backup
        </button>
      </div>
      <button
        onClick={() => setState(null)}
        className="p-1 rounded-md hover:bg-amber-100 cursor-pointer"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
