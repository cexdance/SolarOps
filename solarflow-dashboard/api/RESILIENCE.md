# API Fault-Tolerance / Redundancy

Defense-in-depth around the serverless API layer so a single missing config
value can never silently take down production again.

## Background: the failure this prevents

A missing `SUPABASE_SERVICE_ROLE_KEY` made `api/_auth.ts` call
`createClient('')` **at module import time**, which throws. Because the throw
happened on import, every one of the 7 endpoints importing the shared auth
guard crashed with `FUNCTION_INVOCATION_FAILED`. There was no early warning and
no graceful degradation: users just hit 500s.

## The five layers

| # | Layer | File | Guarantee |
|---|-------|------|-----------|
| 1 | Lazy auth client | `api/_auth.ts` | A missing key returns a clean `500 {"error":"Server auth not configured"}` instead of crashing on import. |
| 2 | Env contract | `api/_env.ts` | One source of truth for what each integration needs. Reports presence only, never secret values. |
| 3 | Health endpoint | `api/health.ts` | `GET /api/health` -> `200 ok`, `200 degraded`, or `503 critical`. The warning light for monitoring. |
| 4 | Build guard | `scripts/check-env.mjs` | Blocks a production deploy (`VERCEL_ENV=production` or `STRICT_ENV=1`) when a critical var is missing. Warns locally. |
| 5 | Client resilience | `src/lib/resilientFetch.ts` | Retries transient 5xx/network with backoff, classifies failures, lets the UI fall back to cached data. |

Regression test: `src/__tests__/apiResilience.test.ts` reproduces the exact
import-time crash and pins graceful degradation for every guarded handler.

## Critical vs optional

- **Critical** (`auth`): without it every proxy is down. Blocks deploys.
- **Optional** (solaredge, trello, xero, ups, email, ai): only that one feature
  degrades; everything else keeps working.

Keep the `critical` flags in `api/_env.ts` and the `CRITICAL` list in
`scripts/check-env.mjs` in sync.

## Monitoring setup (do this once)

1. Point an uptime monitor (or Vercel monitoring) at `GET /api/health`.
2. Alert on HTTP `503` (a critical integration is down) or `status: "critical"`.
3. `degraded` is informational: a non-essential feature is unconfigured.

## Required env vars (set in Vercel project settings)

- `SUPABASE_SERVICE_ROLE_KEY` (CRITICAL) - Supabase -> Project Settings -> API
- `SOLAREDGE_API_KEY`, `TRELLO_API_KEY`, `TRELLO_TOKEN`, `XERO_CLIENT_SECRET`,
  `UPS_ACCESS_TOKEN`, `RESEND_API_KEY`, `ANTHROPIC_API_KEY` (per-feature)
