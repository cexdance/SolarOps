import React, { useEffect, useState } from 'react';
import { AlertTriangle, X, Download } from 'lucide-react';
import { AppState } from '../types';

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

export const StorageWarningBanner: React.FC<Props> = ({ getSnapshot }) => {
  const [state, setState] = useState<'trimmed' | 'failed' | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ kind: 'trimmed' | 'failed' }>).detail;
      if (detail?.kind) setState(detail.kind);
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
              <h2 className="text-lg font-bold text-slate-900">Storage full, changes not saved</h2>
              <p className="text-sm text-slate-600 mt-2">
                This device ran out of local storage, so your most recent edits could not be saved
                locally. Export a backup now so nothing is lost, then free space by clearing old work
                order photos or signing in on another device.
              </p>
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
