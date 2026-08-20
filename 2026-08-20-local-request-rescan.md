# Rescan: local requests, dead pulls, and what actually 404s
2026-08-20, follow-up to `2026-08-20-error-audit.md`

The first pass only looked for `localhost` string literals and came back clean.
This pass asked the harder question: **which requests resolve on a dev machine
but not in production?** That found two real defects, both now fixed.

## Verdict on "calls to my local machine": still none

No shipped code points at your machine. Re-confirmed and extended:

- No absolute filesystem paths (`/Users/`, `/home/`, `C:\`) anywhere in `src/`.
- The two dev-server proxies in `vite.config.ts` (`/xero-token`, `/xero-api`)
  have **zero callers in `src/`**. Dead config, harmless, left alone.
- The other two dev proxies (`/api/trello-card`, `/api/solaredge`) are correct
  by design: same path in dev and prod, a real Vercel function behind them in
  prod, a direct-to-vendor stand-in under `vite dev`.
- Every `/api/*` path the app calls has a matching function in the repo-root
  `api/` directory, with one exception, below.
- Leaflet tiles come from `{s}.tile.openstreetmap.org`, covered by CSP `img-src https:`.
- Every fetch host is inside `vercel.json`'s CSP `connect-src`. (`router.project-osrm.org`
  is allowlisted but unused: a dead entry, not an error.)

## Defect 1: `/api/track` never existed, and customers hit the 404

`src/components/Customers.tsx` built every customer report email against
`https://solarflow-dashboard-sooty.vercel.app/api/track`. There is no
`api/track.ts`. There never was. Verified live:

```
/api/track?event=open&id=x  ->  404  [VERCEL NOT_FOUND]
```

`vercel.json`'s SPA rewrite deliberately excludes `api/`, so this does not fall
through to `index.html` - it serves Vercel's 404 page. The blast radius:

- a 1x1 tracking pixel that silently 404s on every email open (cosmetic);
- **three customer-facing links that wrap their real destination in a
  `?redirect=` parameter this dead endpoint was supposed to unwrap.** "View
  Invoice", "Leave Us a Google Review", and the `conexsol.us` footer link all
  dropped the customer on a Vercel 404 instead of Xero, Google, or the website.

Nothing writes track events, no table stores them, nothing reads them. The
analytics this was built for do not exist.

**Fix:** deleted the pixel and pointed the three links straight at their
destinations. No new serverless function, which matters: `api/` holds 11
deployable routes against Hobby's cap of 12, so an endpoint whose only consumer
is analytics nobody reads is not worth the slot. If open/click tracking is
actually wanted, that is a real feature and should be scoped as one.

## Defect 2: dev instrumentation was shipping to production

`vite.config.ts` gated `vite-plugin-source-identifier` on
`enabled: !isProd`, where `isProd = process.env.BUILD_MODE === 'prod'`.
**Vercel never sets `BUILD_MODE`** - root `vercel.json` runs
`pnpm run build`, not `build:prod`. So `isProd` was always `false` in
production and the plugin was always on.

Every element in the live DOM carried:

```
data-matrix-id="src/shared/components/SuspenseFallback.tsx:11:6"
data-matrix-name="div"
data-component-content="%7B%22className%22%3A%22flex%20h-%5B400px%5D..."
```

Measured against the live deployment: **8,442 occurrences across 108 chunks.**
That is your full source tree layout - file paths, line numbers, component names
and URL-encoded props - published to anyone who opens devtools.

Cost, measured live vs. the rebuild:

| | chunks | total JS |
|---|---|---|
| live (plugin on) | 108 | 6,335,447 B |
| fixed (plugin off) | 108 | 3,154,562 B |

**3.18 MB removed, a 50.2% cut in JavaScript.** On the contractors' phones that
is the whole app loading twice as fast.

**Fix:** `enabled: command !== 'build'`, keyed off Vite's own command rather than
an env var nobody sets. Deleted the now-dead `isProd` const and the `build:prod`
script, whose only purpose was setting `BUILD_MODE` (nothing else referenced it).

## Rule this bought

**A build flag that depends on an env var the deploy pipeline does not set is
off, and it fails silently in the direction that ships more.** Same shape as the
`NODE_ENV` bug fixed in c55d1dd a few hours earlier: both were conditionals that
looked like they gated dev-only behavior and in fact resolved the wrong way in
production, invisibly. Prefer a condition the build system itself owns
(`command !== 'build'`) over one an operator has to remember to pass.
