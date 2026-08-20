import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import './index.css'
import App from './App.tsx'
import { reclaimLocalStorage } from './lib/changeLog.ts'
import { reloadForStaleChunk } from './lib/staleChunk.ts'

// Run BEFORE React mounts and before any store writes. A device already at the
// localStorage quota used to stay wedged: the log's byte cap only applied on the
// next logChange, so a session that threw on some other key first never reclaimed
// anything and showed "out of storage" every time. Fully guarded internally.
reclaimLocalStorage()

// Stale-deploy recovery: Vite fires vite:preloadError when an open tab tries to
// import a chunk from the previous build. Reload once instead of showing the
// error boundary; reloadForStaleChunk holds the shared loop guard.
window.addEventListener('vite:preloadError', (event) => {
  // Suppress Vite's default throw only when we are actually reloading. If the
  // guard says we already retried this minute, let it throw so the boundary
  // renders instead of the tab sitting on a half-loaded view.
  if (reloadForStaleChunk()) event.preventDefault()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
