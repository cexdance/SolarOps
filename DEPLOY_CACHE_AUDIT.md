# SolarOps Deploy/Cache Audit — 2026-04-30

## What the user reports
Push updates do not reach browsers. Users must clear cache + history to see new versions.

## Evidence collected

### 1. Domain map
| Host | Server | Role |
|---|---|---|
| `solarops.us`, `app.solarops.us`, `www.solarops.us` | nginx + Laravel (`set-cookie: XSRF-TOKEN`, `solarops_session`, `csrf-token` meta, title "Solar Solutions for Your Lifestyle") on AWS IPs (52.89.197.32 / 54.184.226.240 / 16.147.131.57) | Laravel **marketing site** — NOT the dashboard |
| `solarflow-dashboard.vercel.app` | `server: Vercel`, assets `/assets/index-BeGgKMzL.js` | **Active dashboard deploy** |
| `solarops.vercel.app` | Vercel, assets `/assets/brainwave-symbol-…` | Different app (`brainwave` template) — stale/leftover project |

### 2. Live headers on `solarflow-dashboard.vercel.app/`
```
cache-control: public, max-age=0, must-revalidate     ← Vercel DEFAULT
age: 16
x-vercel-cache: HIT                                    ← edge IS caching index.html
etag: "0caadc1451cb3fecf97861462c777ad7"
```
**The headers from `vercel.json` are NOT applied.** Expected `no-cache, no-store, must-revalidate` plus `CDN-Cache-Control: no-store`, `Vercel-CDN-Cache-Control: no-store`. None present.

### 3. `/version.json`
Returns **HTTP 404 `x-vercel-error: NOT_FOUND`** on both `solarflow-dashboard.vercel.app` and `solarops.vercel.app`. Locally `solarflow-dashboard/public/version.json` exists with `{"version":"v1.7.0"}`. So either the file isn't in the deployed `dist/`, or the SPA rewrite catches it first.

### 4. Version-poll silently dies
- `useVersionPoll.ts:16` — `if (!res.ok) return;` → 404 swallowed, no banner, no reload.
- `index.html:43-60` — same `.catch(()=>{})` swallow, no fallback.

So even though the React/HTML version-guard logic is correct, **no remote check ever succeeds**, so no client ever upgrades.

### 5. No service worker / PWA / workbox in repo. Not the cause.

## Root cause(s) — ranked

1. **Root `vercel.json` is ignored by the Vercel project.** Most likely the project's *Root Directory* in the Vercel dashboard is set to `solarflow-dashboard/`, so the file at repo root is invisible. Effect: no custom cache headers, no rewrites, no immutable asset directive. The CDN happily caches `index.html`.
2. **`/version.json` 404** — either consequence of #1 (file present but rewrite/SPA-fallback misroutes it) or `public/` isn't reaching `dist/`. Either way the auto-update mechanism is non-functional.
3. **Stale edge cache** on index.html (age=16, x-vercel-cache: HIT) — once a returning user has the old hashed-asset HTML, they keep loading old `/assets/index-XXXX.js` until edge expires AND their browser revalidates. With no version.json check working, they never know.

## COUNCIL

### Option A — Minimal: move `vercel.json` into `solarflow-dashboard/`
- **Pros:** one-line fix; root cause #1 dies; cache headers + rewrites finally apply; verifiable in 30s with curl.
- **Cons:** doesn't directly fix `/version.json` 404 if rewrite catches it; doesn't validate that dashboard Root Directory matches.
- **Risk:** low.

### Option B — Headers via Vercel dashboard, not file
Configure cache rules in Vercel UI.
- **Pros:** zero-code; survives repo refactors.
- **Cons:** invisible in git; future agents can't audit; same root cause for version.json remains.
- **Risk:** medium (config drift).

### Option C — Recommended Hybrid (A + sharper rewrite + build-stamp verification)
1. Move `vercel.json` → `solarflow-dashboard/vercel.json`.
2. Tighten rewrite to exclude statics that must serve verbatim:
   `"source": "/((?!api/|assets/|version\\.json|.*\\..*).*)"`
   (Last clause: any path with a dot is a static file, never SPA route.)
3. Confirm `scripts/stamp-version.js` writes a fresh git-SHA into `public/version.json` at every build (currently writes `v1.7.0` — static).
4. Add a deploy-verification curl to CI: `curl -fsI <prod>/version.json | grep '200'` — fail the deploy if it 404s.
5. Replace silent `.catch(()=>{})` on version.json fetch with a `console.warn` so future regressions surface in browser logs.
- **Pros:** kills cause #1, #2, #3; future-proofs; one round-trip to verify.
- **Cons:** ~30 min to implement vs Option A's 5 min.
- **Risk:** low; all changes reversible.

### Option D — Service Worker w/ skipWaiting
- **Pros:** strongest update-control once installed.
- **Cons:** adds a new caching layer that itself can become stale; users on old SW hard to recover; defeats the user's "no cache clearing" requirement during transition.
- **Risk:** high. Reject for this codebase.

### Option E — Hash everything, never serve `index.html` from CDN
Configure Vercel to set `Cache-Control: private, no-store` on `text/html` only via header rule scoped to `\\.html$` and specific paths.
- Functionally a subset of Option C. Roll into C.

## Recommendation
**Option C.** Restores cache headers, fixes version.json, hardens against silent regression. Estimated 30 min implementation, immediately verifiable with curl.

## Questions for the user before proceeding
1. Confirm the production URL real users hit. Is it `solarflow-dashboard.vercel.app` or a custom domain (e.g., `dashboard.solarops.us`) you've added in Vercel? I see no CNAME for that — please confirm.
2. May I delete the stale `solarops.vercel.app` project (`brainwave` template, not the dashboard)?
3. Is the Vercel project's *Root Directory* setting `solarflow-dashboard`? (1-line check in dashboard → Settings → General.)
