import { Component, ErrorInfo, ReactNode } from 'react';
import { isStaleChunkError, reloadForStaleChunk } from '../../lib/staleChunk';
import { BUILD_ID } from '../../lib/versionConfig';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

const LAST_ERROR_KEY = 'solarops_last_error';

const describeError = (error: Error): string =>
  [
    `build: ${BUILD_ID}`,
    `at:    ${new Date().toISOString()}`,
    `url:   ${window.location.href}`,
    '',
    error.stack || `${error.name}: ${error.message}`,
  ].join('\n');

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    // Survive the Refresh below: without this the only copy of the error is in
    // state, and the button the user reaches for is what destroys it.
    try {
      sessionStorage.setItem(LAST_ERROR_KEY, describeError(error) + '\n' + (errorInfo.componentStack ?? ''));
    } catch {
      // Quota or private mode. The console.error above is still there.
    }
    // This boundary sits INSIDE the main.tsx one, so it catches stale-chunk
    // failures first and must handle them itself or they never reach the
    // boundary that knows how to recover.
    if (isStaleChunkError(error)) reloadForStaleChunk();
  }

  render() {
    if (this.state.hasError) {
      if (isStaleChunkError(this.state.error)) {
        // componentDidCatch is reloading; a version notice, not a crash wall.
        // Also covers the 60s reload-guard window.
        return (
          <div className="flex min-h-[400px] flex-col items-center justify-center gap-3 p-4 text-center">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
              A new version of SolarOps is available.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Reload now
            </button>
          </div>
        );
      }
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="flex min-h-[400px] items-center justify-center p-4">
          <div className="text-center">
            <div className="mb-4 flex justify-center"><svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg></div>
            <h2 className="mb-2 text-xl font-semibold text-gray-900 dark:text-gray-100">
              Something went wrong
            </h2>
            <p className="mb-4 text-gray-600 dark:text-gray-400">
              We encountered an unexpected error. Please try refreshing the page.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Refresh Page
            </button>
            {this.state.error && (
              // Always rendered, in prod too. This was gated on NODE_ENV, which
              // esbuild folds to false in the bundle, so every production crash
              // reported itself as a blank screen with no error anywhere.
              // Collapsed by default: no UX cost, and a screenshot of it is a
              // usable bug report.
              <details className="mx-auto mt-4 max-w-lg text-left text-sm text-gray-500 dark:text-gray-400">
                <summary className="cursor-pointer">Error details</summary>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-gray-100 p-2 text-xs dark:bg-gray-800">
                  {describeError(this.state.error)}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
