import React from 'react';

const searilizeError = (error: any) => {
  if (error instanceof Error) {
    return error.message + '\n' + error.stack;
  }
  return JSON.stringify(error, null, 2);
};

// A failed lazy-chunk load means the tab is on a previous deploy whose hashed
// asset files no longer exist; a reload fixes it by loading the new build.
const isStaleChunkError = (error: unknown): boolean =>
  error instanceof Error &&
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(error.message);

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
    if (!isStaleChunkError(error)) return;
    // Reload once to pick up the new deploy. Same loop guard as the
    // vite:preloadError handler in main.tsx.
    const last = Number(sessionStorage.getItem('solarops_chunk_reload') ?? 0);
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem('solarops_chunk_reload', String(Date.now()));
    window.location.reload();
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
