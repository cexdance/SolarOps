import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import './index.css'
import App from './App.tsx'
import { reclaimLocalStorage } from './lib/changeLog.ts'

// Run BEFORE React mounts and before any store writes. A device already at the
// localStorage quota used to stay wedged: the log's byte cap only applied on the
// next logChange, so a session that threw on some other key first never reclaimed
// anything and showed "out of storage" every time. Fully guarded internally.
reclaimLocalStorage()

// Stale-deploy recovery: after a new deploy, an open tab still references the
// previous build's hashed chunk files; navigating to a lazy view then fails
// with "Failed to fetch dynamically imported module". Vite fires
// vite:preloadError for exactly this case - reload once to pick up the new
// build instead of showing the error boundary. The timestamp guard stops a
// reload loop if the network itself is down.
window.addEventListener('vite:preloadError', (event) => {
  const last = Number(sessionStorage.getItem('solarops_chunk_reload') ?? 0)
  if (Date.now() - last < 60_000) return // already retried in the last minute
  sessionStorage.setItem('solarops_chunk_reload', String(Date.now()))
  event.preventDefault()
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
