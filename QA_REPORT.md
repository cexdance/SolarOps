# SolarOps QA Report

_Generated: 2026-05-29_
_Orchestrated QA pass: codemapper, security, testwriter, stress (4 agents)_

This pass found bugs, proved them, and ranked them. The only files added are tests (109 passing) and these reports.

---

## Remediation status (updated 2026-05-29)

Fix work is now underway against the ranked order below.

| Item | Status | Notes |
|------|--------|-------|
| ST-1 mergeRemote LWW timestamp guard | DONE | Per-record last-writer-wins; 109 tests pass |
| SEC-1/2/3/4/5/6 paid-API proxy auth | DONE | Shared `api/_auth.ts` JWT guard on parse-lead-image, xero-token, solaredge, xero-api, xero-connections, ups-tracking, trello-card; client uses `authedFetch` |
| SEC-7 wo_number XSS in approve-quote | DONE | `escapeHtml()` at both injection sites |
| SEC SSRF on solaredge proxy | DONE | Path allow-list guard |
| RLS role-based access (admin/staff/contractor) | DONE | App-layer gating in `src/lib/access.ts`, route guard in App.tsx, nav + mobile bottom bar in Layout.tsx, money widgets hidden on Dashboard. Supabase policies in `solarflow-dashboard/supabase/rls_policies.sql` (authenticated-only on app_data/change_log/notifications; lock quote_approvals to service role) |
| Contractor UI: Start Job hidden behind bottom bar | DONE | Layout `<main>` gains `pb-24` on mobile so bottom CTAs clear the fixed nav. Contractor JobDetail already had `pb-32`. In-browser confirmation needs a login. |
| ST-2 quota-strip blocking UI | DONE | StorageWarningBanner rewritten: blocking modal on `failed` with Export-backup + acknowledge; dismissible banner on `trimmed`. Mounted with `getSnapshot={() => data}` in App.tsx |
| SEC-9 Trello creds in client bundle | DONE | api/trello-card.ts reads `TRELLO_API_KEY`/`TRELLO_TOKEN` (server-only, VITE_ fallback retained); .env.example documents no-VITE-prefix rule |
| SEC-12 customer PII in client bundle | DONE | initialCustomers/initialInteractions emptied in customerStore.ts; clients hydrate from Supabase. Fresh production build confirmed no PII. NOTE: trelloImport.ts still in working tree + git history — purge needs explicit user go-ahead (destructive) |
| ST-3 in-flight photo durability | DONE | saveData keeps `dataUrl` for photos lacking storageUrl/photoStoreId so they survive reload before upload; strips base64 only once durable |
| ST-4 outbox lock auto-recovery | DONE | drainOutbox uses exponential backoff (5s→5min cap) instead of hard-locking after 8 failures |
| Mentions/notifications end-to-end (MN-1..5) | DONE | WorkOrderPanel WO-notes + SOW-distribution triggers now pass `mentionedUserEmails` (bell + email previously reached nobody — UUID vs internal-id mismatch); AppRouter `users` prop carries email; `MentionUser` type gained `email`. Customer-note path was already correct. MN-5 (draft-WO comment gated on woNumber) left open as minor |

---

## Method

| Agent | Scope | Output |
|-------|-------|--------|
| codemapper | Repo inventory, git churn, fragility signals | 20 ranked hotspots |
| security | Deps, secrets, API auth, input validation | 18 findings |
| testwriter | Characterization tests on data-layer hotspots | 72 tests, 1 behavioral bug |
| stress | Local load + fault injection (mocked APIs, no live quota) | 36 tests, 2 critical data-loss modes confirmed |

Sandbox boundaries held: no deploys, no production traffic, no real third-party API calls. Stress tests ran locally against mocked Supabase/APIs.

---

## Top of the fix list

The single most important issue is **ST-1 / TC-1: mergeRemote silently loses data.** Two independent agents (testwriter by reading, stress by executing) confirmed it. It is the highest-impact, lowest-effort fix in this report. Do it first.

---

## Prioritized findings

Severity x effort. Effort is a rough estimate: S = under an hour, M = half a day, L = multi-day.

### P0 - Critical (data loss or open credential abuse)

| ID | Finding | File | Effort | Why first |
|----|---------|------|--------|-----------|
| ST-1 | mergeRemote has no timestamp comparison. Stale remote record silently overwrites a newer local edit on every incremental pull. Comment claims last-writer-wins but code is plain Map override. | src/lib/syncEngine.ts | **S** | Active silent data loss for any multi-device user. Fix: apply remote only if `remote.updated_at >= local.updated_at`. Tests already pin current behavior. |
| ST-2 | localStorage quota fallback silently strips ALL customer activityHistory (notes/calls/emails). Only a console.warn, no blocking UI. | src/lib/dataStore.ts | **M** | Permanent loss of CRM history on data-heavy devices. Fix: make the `solarops:storage-warning` event raise a blocking UI alert + export prompt. |
| SEC-1 | api/parse-lead-image.ts has zero auth. Open proxy to billed Anthropic Vision API. | api/parse-lead-image.ts | **S** | Anyone on the internet can drain Anthropic spend. Fix: add the Supabase JWT check already used in notify.ts. |
| SEC-2 | api/xero-token.ts has zero auth on the OAuth token exchange. | api/xero-token.ts | **S** | Open token exchange + no CSRF state. Fix: JWT verify + validate OAuth `state`. |
| SEC-3 | api/solaredge.ts has zero auth and no path allowlist. Open proxy to the company SolarEdge key. | api/solaredge.ts | **M** | Quota drain + enumeration of all monitored sites. Fix: JWT verify + restrict `path` to an explicit allowlist. |

### P1 - High (credential exposure, XSS, data durability)

| ID | Finding | File | Effort |
|----|---------|------|--------|
| SEC-7 | Stored XSS: `wo_number` interpolated unsanitized into the public, unauthenticated quote-approval HTML page. | api/approve-quote.ts:83,114 | S |
| SEC-4 | No app-user JWT check, forwards arbitrary paths to api.xero.com. | api/xero-api.ts | S |
| SEC-6 | No auth, company Trello credentials abusable by anyone. | api/trello-card.ts | S |
| SEC-5 | No auth on UPS tracking proxy. Dangerous before the real UPS key is wired in. | api/ups-tracking.ts | S |
| SEC-8 | Wildcard CORS (*) + SMTP password sent plaintext per-request. | api/send-report.py | M |
| SEC-17 | npm audit: 21 vulns (11 high) incl. undici HTTP smuggling, lodash code injection, vite path traversal. | package.json | M |
| ST-3 / TC-2 | In-flight photos (no storageUrl) permanently dropped on next save. Reload before upload finishes = lost. | src/lib/dataStore.ts | M |
| ST-4 / TC-3 | Outbox hard-locks after >8 failures, no auto-recovery, only a small indicator. Offline edits silently stop pushing. | src/lib/outbox.ts | M |

### P2 - Medium (privacy, hardening, correctness)

| ID | Finding | File | Effort |
|----|---------|------|--------|
| SEC-12 | 292 real customer emails + PII embedded in the browser bundle and git history (trelloImport.ts, 31,580 lines). | src/lib/trelloImport.ts | L |
| SEC-9 | VITE_TRELLO_API_KEY + VITE_TRELLO_TOKEN inlined into the browser bundle = full Trello account access. | .env.production / .env.local | S |
| SEC-10 | VITE_GOOGLE_MAPS_API_KEY in bundle with no referrer restriction. | .env / Settings.tsx | S |
| SEC-13 | api/xero-api.ts verifies Xero token presence, not app-user identity. Privilege escalation. | api/xero-api.ts | S |
| SEC-11 | Xero OAuth flow missing CSRF state validation. | api/xero-token.ts | S |
| ST-5 | mergeRemote accepts id:null without validation, corrupts the customer Map. | src/lib/syncEngine.ts | S |
| ST-6 | Empty-remote-array preserves-local is correct but an undocumented fragile contract for future full-sync work. | src/lib/syncEngine.ts | S |
| D-3 / S-6 | dataStore + syncEngine churned through 3 reactive fix phases with no migration guards. | src/lib/dataStore.ts, syncEngine.ts | M |

### P3 - Low / structural

| ID | Finding | File | Effort |
|----|---------|------|--------|
| SEC-14 | Hardcoded Supabase project URL in 4 serverless functions. | api/*.ts | S |
| SEC-15 | CSP uses script-src 'unsafe-inline', weakening XSS protection. | vercel.json:58 | M |
| SEC-16 | xlsx (SheetJS) prototype pollution + ReDoS, no upstream fix. | package.json | M |
| ST-7 | subscribeToChanges pendingEvents array has no max-size cap (insert-storm risk). | src/lib/syncEngine.ts | S |
| TC-4 | Type contract gaps: Customer.notes non-optional but passed undefined; Job lacks woNumber. No runtime validation. | src/types/index.ts | M |
| S-1 | trelloImport.ts at 31,580 lines bloats the bundle (see also SEC-12). | src/lib/trelloImport.ts | L |
| S-2 | No Supabase migrations tracked in repo. Schema changes are invisible to history. | (repo) | M |
| S-4/S-5 | App.tsx (2,561 lines) and Customers.tsx (5,785 lines) monoliths, high closure-bug risk. | src/App.tsx, Customers.tsx | L |
| S-7 | Zero TODO/FIXME markers. Known debt is invisible. | (repo) | - |

---

## Missing test coverage (biggest gaps)

Now covered: outbox, mergeRemote, dataStore save/load, and stress/fault paths (108 tests).

Still uncovered and high-value:
- **Supabase I/O paths**: pushToSupabase, pullFromSupabase, syncOnLogin, pullAndMerge. Need an integration suite against a Supabase test project. This is where the real sync bugs will hide.
- **Realtime**: subscribeToChanges batching window + circuit breaker.
- **Serverless functions**: none of the api/*.ts handlers have tests. The auth fixes above should ship with tests.
- **dataStore one-time migrations**: applyExclusionFilter, applyUsIdOmEnrichment, applyDedup run on load behind localStorage flags, untested.

---

## Recommended fix order

1. **ST-1** (mergeRemote timestamp guard) - smallest fix, stops active data loss. Tests already exist.
2. **SEC-1, SEC-2, SEC-3** (add JWT auth to the three unauthenticated paid-API proxies) - same one-line pattern from notify.ts each.
3. **SEC-7** (escape wo_number) - one helper function, closes the public XSS.
4. **ST-2** (blocking UI on quota strip) - stops silent CRM history loss.
5. **SEC-4/5/6, SEC-8** (remaining unauthenticated proxies + CORS) - batch the auth pattern across all api/ handlers.
6. **SEC-9, SEC-12** (pull Trello creds + customer PII out of the browser bundle; purge from git history).
7. **ST-3, ST-4** (photo durability + outbox lock UX).
8. Structural: Supabase migrations, monolith splits, CSP hardening, dependency upgrades.

A single themed PR for items 2 + 5 ("add auth to all serverless proxies") would close 6 of the 8 critical/high security findings at once, since they all share one fix pattern.

---

## Important caveats

- **RLS could not be verified from source.** The Supabase anon key is exposed in the bundle by design, which is only safe if Row Level Security is correctly configured on every table. This needs a manual check in the Supabase dashboard. If RLS is off or incomplete, several MEDIUM findings become CRITICAL.
- All 108 tests **pass**, but passing does not mean "no bug." Several tests deliberately pin current buggy behavior (ST-1, ST-2, ST-3) so any future fix will visibly flip them. Treat those as red, not green.
- Detailed per-agent reports: `QA Agentic/codemapper_report.md`, `security_report.md`, `testwriter_report.md`, `stress_report.md`. Running findings board: `findings.md`.
