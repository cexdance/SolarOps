# Audit: "Something went wrong" screen + local-machine call sweep
2026-08-20

## 1. Which screen this actually is

The screenshot is NOT `src/components/ErrorBoundary.tsx` (the red-bordered one that
prints the stack). It is `src/shared/components/ErrorBoundary.tsx`, mounted in
`App.tsx:3648` — i.e. INSIDE the `main.tsx:30` boundary, so it catches first and the
outer one (which would have shown the stack) never sees the error.

## 2. Why you have no logs

`ErrorBoundary.tsx:44` gates the error details on
`(process.env as Record<string,string>)['NODE_ENV'] === 'development'`.
esbuild constant-folds this to `false` in the prod bundle (verified: the compiled
chunk `dist/assets/index-*.js` ends the fallback with `,!1]`). So in production:

- the details block is dead code, permanently hidden;
- the only trace is `console.error('ErrorBoundary caught:', ...)` (line 21), which
  nobody collects — there is no Sentry, no `/api/log`, no remote sink anywhere;
- `this.state.error` is discarded on Refresh.

**That is the root cause of "I can't diagnose this."** The crash itself is still
unidentified — no error text was captured anywhere. Nothing in this repo can tell
you what threw.

## 3. Local-machine call audit: CLEAN

Swept `src/`, `api/`, repo-root config, and the built `dist/` bundle for
`localhost`, `127.0.0.1`, `0.0.0.0`, `192.168.*`, `:5173`, `:54321`, `.local`.

Hits in source, all dev/test-only, none reachable from a prod build:

| File | Hit | Verdict |
|---|---|---|
| `solarflow-dashboard/playwright.config.ts:11,23` | `http://localhost:5173` | test harness, not bundled |
| `solarflow-dashboard/vitest.config.ts:24` | `http://localhost:54321` | test env stub, not bundled |
| `solarflow-dashboard/vite.config.ts:101,128` | `new URL(req.url, 'http://localhost')` | dev-proxy URL parsing base, server-side only |
| `solarflow-dashboard/mobile-audit-contractor-portal.json:3` | `http://localhost:5173` | audit artifact, not code |

Hits in the prod bundle, all inside vendored `@supabase/supabase-js`:
- gotrue's unused `http://localhost:9999` default constant (a real URL is always passed);
- webauthn hostname allowlists containing `localhost` / `127.0.0.1`.

`src/lib/supabase.ts:4` reads `VITE_SUPABASE_URL` with an **empty-string** fallback,
not a localhost fallback. No app-authored code points at your machine.
No hardcoded LAN IPs, no `.local` hostnames, no dev-server URLs in shipped code.

## 4. Root cause fix (do this first, it is the diagnostic)

Make the crash visible before trying to fix a crash you cannot see.

**Step 1 — surface the error in prod.** In `src/shared/components/ErrorBoundary.tsx`:
drop the `NODE_ENV` gate and always render the collapsed `<details>` with
`error.message` + `error.stack` + the current build sha (`__BUILD_ID__` is already
defined in `vite.config.ts`). It is a `<details>` — collapsed, no UX cost, and it
turns every future user screenshot into a usable bug report.

**Step 2 — stop swallowing it.** Keep `console.error`, and additionally stash the
last error in `sessionStorage` under `solarops_last_error` so a Refresh does not
erase it.

**Step 3 — inherit the stale-chunk handling.** The shared boundary has none. The
`main.tsx` boundary knows how to detect a stale lazy-chunk load and self-reload
(`isStaleChunkError`), but the shared boundary sits inside it and swallows those
errors first. Import `isStaleChunkError` from `src/components/ErrorBoundary.tsx`
and re-use the same reload-once path. **A stale deploy is the single most likely
cause of the screenshot**, given how often this app ships.

**Step 4 (optional, only if steps 1-3 do not identify it).** POST the error to a
tiny `api/log.ts`. Skip until proven necessary — Vercel Hobby caps `api/` at 12
functions, so a new endpoint has real cost here.

## 5. Follow-up worth doing separately

Two error boundaries with the same name and different behavior is the reason the
better one never ran. After the crash is identified, delete the shared one and use
`src/components/ErrorBoundary.tsx` everywhere, or fold the good UI into it.
