import React from 'react';
import { isStaleChunkError, reloadForStaleChunk } from '../lib/staleChunk';

const searilizeError = (error: any) => {
  if (error instanceof Error) {
    return error.message + '\n' + error.stack;
  }
  return JSON.stringify(error, null, 2);
};

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: any }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown) {
    if (isStaleChunkError(error)) reloadForStaleChunk();
  }

  render() {
    if (this.state.hasError) {
      if (isStaleChunkError(this.state.error)) {
        // componentDidCatch is reloading; show a quiet refresh note instead of
        // the red error wall (also covers the reload-guard window).
        return (
          <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-slate-500">
            <p className="text-sm font-medium">A new version of SolarOps is available.</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-orange-500 text-white text-sm font-semibold rounded-lg hover:bg-orange-600"
            >
              Reload now
            </button>
          </div>
        );
      }
      return (
        <div className="p-4 border border-red-500 rounded">
          <h2 className="text-red-500">Something went wrong.</h2>
          <pre className="mt-2 text-sm">{searilizeError(this.state.error)}</pre>
        </div>
      );
    }

    return this.props.children;
  }
}
