import path from "path"
import { execSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"
import sourceIdentifierPlugin from 'vite-plugin-source-identifier'


// ── Build-info: stamps a unique id into the bundle AND public/version.json ────
// Same id in both places → useVersionPoll can detect any new deploy reliably.
function computeBuildInfo() {
  const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'))
  const version = `v${pkg.version}`
  // Vercel's build sandbox has no .git, so `git rev-parse` fails there. It does
  // inject VERCEL_GIT_COMMIT_SHA (40-char), so use it first, fall back to git locally.
  let sha = (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || 'local'
  if (sha === 'local') {
    try { sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { /* not a git repo or git unavailable */ }
  }
  const now = new Date()
  const builtAt = now.toISOString()
  const buildId = `${version}+${sha}.${Date.now()}`
  // DB_VERSION = mm-dd of build date (auto-advances per deploy, no manual maintenance)
  const dbVersion = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return { version, sha, builtAt, buildId, dbVersion }
}

export default defineConfig(({ command, mode }) => {
  const info = computeBuildInfo()
  // .env* is not on process.env inside this config; load it for the dev proxies.
  const env = loadEnv(mode, __dirname, '')

  // Only stamp version.json on production builds — keeps `vite dev` deterministic.
  if (command === 'build') {
    writeFileSync(
      path.resolve(__dirname, 'public/version.json'),
      JSON.stringify({ version: info.version, build: info.buildId, sha: info.sha, builtAt: info.builtAt }) + '\n',
    )
    console.log(`[vite] stamped public/version.json → build=${info.buildId}`)
  }

  return {
  plugins: [
    react(),
    sourceIdentifierPlugin({
      // Dev only. This was `!isProd`, driven by BUILD_MODE, which Vercel never
      // sets (vercel.json runs `pnpm run build`, not `build:prod`), so every
      // production bundle shipped data-matrix-* attributes carrying source file
      // paths, line numbers and URL-encoded component props into the live DOM.
      // Keying off Vite's own command removes the env-var dependency entirely.
      enabled: command !== 'build',
      attributePrefix: 'data-matrix',
      includeProps: true,
    })
  ],
  define: {
    __APP_VERSION__: JSON.stringify(info.version),
    __BUILD_ID__: JSON.stringify(command === 'build' ? info.buildId : 'dev'),
    __BUILT_AT__: JSON.stringify(info.builtAt),
    __DB_VERSION__: JSON.stringify(info.dbVersion),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      // Proxy Xero token endpoint to avoid CORS in dev
      '/xero-token': {
        target: 'https://identity.xero.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/xero-token/, '/connect/token'),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            // Strip browser cookies — they bloat headers past Xero's 8192 byte limit
            proxyReq.removeHeader('cookie');
            proxyReq.removeHeader('origin');
          });
        },
      },
      // Proxy Xero API (invoices, contacts, connections)
      '/xero-api': {
        target: 'https://api.xero.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/xero-api/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('cookie');
            proxyReq.removeHeader('origin');
          });
        },
      },
      // Dev-only stand-in for the /api/trello-card Vercel function, which does not
      // run under `vite dev` — without this the Trello import fails at the fetch
      // locally and can only be tested on a deploy. Mirrors that function's query
      // exactly so the importer parses an identical payload either way.
      // ponytail: hits Trello direct rather than the deployed function, so there is
      // no prod URL to keep in sync. Keep the query in step with api/trello-card.ts.
      '/api/trello-card': {
        target: 'https://api.trello.com',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            const raw = new URL(req.url!, 'http://localhost').searchParams.get('cardId') ?? '';
            const id = (raw.match(/trello\.com\/c\/([a-zA-Z0-9]+)/)?.[1] ?? raw).trim();
            const q = new URLSearchParams({
              key: env.VITE_TRELLO_API_KEY || env.TRELLO_API_KEY || '',
              token: env.VITE_TRELLO_TOKEN || env.TRELLO_TOKEN || '',
              fields: 'name,desc,due,shortUrl,labels',
              attachments: 'true',
              attachment_fields: 'all',
              checklists: 'all',
              customFieldItems: 'true',
              actions: 'commentCard,updateCard',
              actions_limit: '1000',
            });
            proxyReq.path = `/1/cards/${encodeURIComponent(id)}?${q}`;
            // authedFetch sends a Supabase bearer token; Trello 401s on a foreign
            // Authorization header even when key/token are in the query.
            proxyReq.removeHeader('authorization');
            proxyReq.removeHeader('cookie');
          });
        },
      },
      // Proxy SolarEdge Monitoring API — rewrites /api/solaredge?path=/X&... → /X?...
      '/api/solaredge': {
        target: 'https://monitoringapi.solaredge.com',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            const url = new URL(req.url!, 'http://localhost');
            const apiPath = url.searchParams.get('path') || '/sites/list';
            url.searchParams.delete('path');
            proxyReq.path = apiPath + (url.searchParams.toString() ? '?' + url.searchParams.toString() : '');
          });
        },
      },
    },
  },
  }
})
