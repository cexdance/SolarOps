import React, { useState } from 'react';
import { ImageDown, Loader2, Check, AlertTriangle } from 'lucide-react';
import type { AppState } from '../../types';
import { saveData } from '../../lib/dataStore';
import { estimateDataUrlBytes, recompressDataUrl } from '../../lib/photoCompress';

const STORAGE_KEY = 'solarflow_data';
const OVERSIZE_THRESHOLD = 400 * 1024;

type RunStatus = 'idle' | 'running' | 'done' | 'error';

interface RunResult {
  jobsScanned: number;
  jobsRewritten: number;
  photosCompressed: number;
  bytesSaved: number;
  errors: number;
}

const formatKB = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export const PhotoCleanupCard: React.FC = () => {
  const [status, setStatus] = useState<RunStatus>('idle');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [result, setResult] = useState<RunResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const run = async () => {
    setStatus('running');
    setResult(null);
    setErrorMessage(null);

    let state: AppState;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) throw new Error('No local app state — open the app once before running cleanup.');
      state = JSON.parse(raw) as AppState;
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : String(err));
      return;
    }

    const jobs = state.jobs ?? [];
    setProgress({ current: 0, total: jobs.length });

    let jobsRewritten = 0;
    let photosCompressed = 0;
    let bytesSaved = 0;
    let errors = 0;
    const updatedJobs = [...jobs];

    for (let i = 0; i < updatedJobs.length; i++) {
      const job = updatedJobs[i];
      setProgress({ current: i + 1, total: updatedJobs.length });

      const photos = job.woPhotos;
      if (!photos || photos.length === 0) continue;

      let jobChanged = false;
      const nextPhotos = await Promise.all(
        photos.map(async photo => {
          if (!photo?.dataUrl) return photo;
          const before = estimateDataUrlBytes(photo.dataUrl);
          if (before <= OVERSIZE_THRESHOLD) return photo;
          try {
            const next = await recompressDataUrl(photo.dataUrl);
            if (!next) return photo;
            const after = estimateDataUrlBytes(next);
            if (after >= before) return photo;
            jobChanged = true;
            photosCompressed += 1;
            bytesSaved += before - after;
            return { ...photo, dataUrl: next };
          } catch {
            errors += 1;
            return photo;
          }
        }),
      );

      if (jobChanged) {
        updatedJobs[i] = { ...job, woPhotos: nextPhotos };
        jobsRewritten += 1;
      }
    }

    if (jobsRewritten > 0) {
      const nextState: AppState = { ...state, jobs: updatedJobs };
      try {
        saveData(nextState);
      } catch (err) {
        setStatus('error');
        setErrorMessage(err instanceof Error ? err.message : String(err));
        return;
      }
    }

    setResult({
      jobsScanned: jobs.length,
      jobsRewritten,
      photosCompressed,
      bytesSaved,
      errors,
    });
    setStatus('done');
  };

  const isRunning = status === 'running';

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
          <ImageDown className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-900">Photo storage cleanup</h3>
          <p className="text-sm text-slate-500 mt-0.5">
            Recompresses any Work Order photos still stored at full phone resolution
            (~3–8 MB each) so they fit in a single Supabase row and sync to other devices.
          </p>

          {status === 'running' && progress.total > 0 && (
            <p className="text-xs text-slate-500 mt-2">
              Scanning job {progress.current} of {progress.total}…
            </p>
          )}

          {status === 'done' && result && (
            <div className="mt-3 text-sm bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-emerald-900 space-y-0.5">
              <div className="flex items-center gap-1.5 font-semibold">
                <Check className="w-4 h-4" />
                {result.photosCompressed === 0
                  ? 'All clear — nothing oversized to rewrite.'
                  : `Rewrote ${result.photosCompressed} photo${result.photosCompressed === 1 ? '' : 's'}.`}
              </div>
              <div className="text-xs text-emerald-800/90">
                {result.jobsScanned} jobs scanned · {result.jobsRewritten} jobs updated
                {result.bytesSaved > 0 ? ` · ${formatKB(result.bytesSaved)} saved` : ''}
                {result.errors > 0 ? ` · ${result.errors} errors` : ''}
              </div>
              {result.jobsRewritten > 0 && (
                <div className="text-xs text-emerald-800/90 pt-1">
                  Changes saved locally and pushed to Supabase via the normal sync.
                </div>
              )}
            </div>
          )}

          {status === 'error' && (
            <div className="mt-3 text-sm bg-red-50 border border-red-200 rounded-lg p-3 text-red-900 flex gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{errorMessage ?? 'Cleanup failed.'}</span>
            </div>
          )}

          <button
            type="button"
            onClick={run}
            disabled={isRunning}
            className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isRunning && <Loader2 className="w-4 h-4 animate-spin" />}
            {isRunning ? 'Compressing…' : 'Run cleanup now'}
          </button>
        </div>
      </div>
    </div>
  );
};
