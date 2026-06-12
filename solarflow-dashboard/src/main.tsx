import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import './index.css'
import App from './App.tsx'

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
