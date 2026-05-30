# SolarOps QA Findings Board
_Started: 2026-05-29_

## Structural / Architecture

| # | Severity | File | Finding | Source |
|---|----------|------|---------|--------|
| S-1 | HIGH | src/lib/trelloImport.ts | 31,580-line file, likely generated data blob bundled as TypeScript. Bundle inflation risk and possible embedded customer data. | codemapper |
| S-2 | HIGH | (repo root) | No Supabase migrations directory. Schema changes are not version-controlled. | codemapper |
| S-3 | HIGH | (entire repo) | Zero test files found. All quality assurance is manual only. | codemapper |
| S-4 | MEDIUM | src/App.tsx | 2,561-line monolithic root component (43 commits). Auth gate, routing, and shared state all in one file. | codemapper |
| S-5 | MEDIUM | src/components/Customers.tsx | 5,785 lines, 42 commits. Likely has 15+ useState/useEffect hooks creating closure-bug risk. | codemapper |
| S-6 | MEDIUM | src/lib/syncEngine.ts | Three separate multi-commit fix cycles (phase1/2/3). Still no test coverage. | codemapper |
| S-7 | LOW | (entire repo) | Zero TODO/FIXME markers. Known debt is invisible. | codemapper |

## Data Integrity / Sync

| # | Severity | File | Finding | Source |
|---|----------|------|---------|--------|
| D-1 | HIGH | src/lib/syncEngine.ts | Unclear behavior when sync write fails mid-batch. Outbox may silently drop writes. | codemapper |
| D-2 | HIGH | src/components/WorkOrderPanel.tsx | 3,453 lines, 26 commits. Prior P0 data loss bugs (stale-closure auto-save, photo stomp). Patches on patches. | codemapper |
| D-3 | MEDIUM | src/lib/dataStore.ts | 18 commits on 470 lines. Frequent schema churn without migration guards. | codemapper |

## Telemetry / Alerts

| # | Severity | File | Finding | Source |
|---|----------|------|---------|--------|
| T-1 | MEDIUM | api/solaredge.ts | Proxy may return silent 200 on SolarEdge rate limit, causing stale alert dashboard with no warning. | codemapper |
| T-2 | MEDIUM | src/lib/solarEdgeSites.ts | 3,653-line site mapping. Possible stale site ID field names after recent schema fixes. | codemapper |

## Security

| # | Severity | File | Finding | Source |
|---|----------|------|---------|--------|
| SEC-1 | CRITICAL | api/parse-lead-image.ts | No authentication. Open proxy to paid Anthropic Vision API. Quota exhaustion / cost DoS. | security |
| SEC-2 | CRITICAL | api/xero-token.ts | No authentication on Xero OAuth token exchange. Attacker can exchange supplied auth code for tokens. | security |
| SEC-3 | CRITICAL | api/solaredge.ts | No authentication, no path allowlist. Open proxy: drain 300-call/day quota + enumerate all monitored sites (SSRF-ish). | security |
| SEC-4 | HIGH | api/xero-api.ts | No app-user JWT check, forwards arbitrary paths to api.xero.com. | security |
| SEC-5 | HIGH | api/ups-tracking.ts | No authentication. Dangerous pattern before real UPS key is wired in. | security |
| SEC-6 | HIGH | api/trello-card.ts | No authentication. Company Trello credentials abusable by anyone. | security |
| SEC-7 | HIGH | api/approve-quote.ts:83,114 | Stored XSS: wo_number interpolated unsanitized into public HTML approval page. | security |
| SEC-8 | HIGH | api/send-report.py:84,92 | Wildcard CORS (*) + SMTP password transmitted plaintext per-request. | security |
| SEC-9 | MEDIUM | .env.production / .env.local | VITE_TRELLO_API_KEY + VITE_TRELLO_TOKEN inlined into browser bundle = full Trello account access. | security |
| SEC-10 | MEDIUM | .env / Settings.tsx | VITE_GOOGLE_MAPS_API_KEY in bundle with no referrer restriction. | security |
| SEC-11 | MEDIUM | api/xero-token.ts | Xero OAuth flow missing CSRF state validation. | security |
| SEC-12 | MEDIUM | src/lib/trelloImport.ts | 292 real customer emails + PII embedded in browser bundle and git history. | security |
| SEC-13 | MEDIUM | api/xero-api.ts | Verifies Xero token presence only, not a valid app-user identity. Privilege escalation. | security |
| SEC-14 | LOW | api/notify.ts, users.ts, send-quote.ts, approve-quote.ts | Hardcoded Supabase project URL instead of env var. | security |
| SEC-15 | LOW | vercel.json:58 | CSP uses script-src 'unsafe-inline', weakening XSS protection. | security |
| SEC-16 | LOW | package.json | xlsx (SheetJS) prototype-pollution + ReDoS, no upstream fix. | security |
| SEC-17 | HIGH | (npm audit) | 21 vulns: 11 high (undici HTTP smuggling, lodash code injection, vite path traversal), 10 moderate. | security |
| SEC-18 | MEDIUM | src/lib/syncEngine.ts | Client-set updated_at = clock-manipulation can win all last-writer-wins conflicts. Deletions tracked in localStorage (resurrect risk). | security |

**Note:** No secrets are committed to git. Service-role key correctly kept server-side. Anon-key exposure is by design but only safe IF Supabase RLS is enabled (not verifiable from source, needs manual check).

## Test Coverage / Behavioral Bugs

72 characterization tests added (vitest + jsdom), all passing. Was zero before. Files: outbox.test.ts (30), syncEngine.test.ts (30), dataStore.test.ts (12).

| # | Severity | File | Finding | Source |
|---|----------|------|---------|--------|
| TC-1 | HIGH | src/lib/syncEngine.ts mergeRemote | Comment claims "last-writer-wins on updated_at" but code does plain Map override (remote always wins, NO timestamp comparison). Wrong version can win if pull order varies. Matches SEC-18. | testwriter |
| TC-2 | MEDIUM | src/lib/dataStore.ts saveData | Photos with no storageUrl are fully dropped from localStorage. If Supabase upload fails and user closes tab, photos lost permanently. | testwriter |
| TC-3 | MEDIUM | src/lib/outbox.ts drainOutbox | After 8 failed attempts, silently returns false and locks until manual resetOutboxAttempts. No user-visible warning. | testwriter |
| TC-4 | LOW | src/types/index.ts | Customer.notes typed string (non-optional) but code passes undefined; Job lacks woNumber that WorkOrder has. No runtime validation layer. | testwriter |

**Top remaining coverage gaps:** pushToSupabase / pullFromSupabase / syncOnLogin (need Supabase integration tests), subscribeToChanges realtime batching + circuit breaker, drainOutbox success path (needs DI refactor to test), dataStore one-time migration functions.

## Stress / Reliability (local sandbox, mocked APIs)

36 stress tests added (stress.test.ts). Full suite now 108/108 passing. No crashes under load, but several tests confirm silent data-loss modes.

| # | Severity | File | Finding | Source |
|---|----------|------|---------|--------|
| ST-1 | CRITICAL | src/lib/syncEngine.ts mergeRemote | A remote record stamped year-2000 silently overwrites a 2025 local edit. No timestamp guard at all. Confirms TC-1/SEC-18, escalated: real silent data loss on any incremental pull after an offline edit. | stress |
| ST-2 | CRITICAL | src/lib/dataStore.ts saveData | On localStorage quota pressure, level-2 fallback silently strips ALL customer activityHistory (notes/calls/emails). Only a console.warn fires, no blocking UI. Permanent local loss. | stress |
| ST-3 | HIGH | src/lib/dataStore.ts saveData | In-flight photos (dataUrl set, storageUrl undefined) permanently dropped on next save. Reload before upload finishes = photo lost. (Same root as TC-2.) | stress |
| ST-4 | HIGH | src/lib/outbox.ts drainOutbox | Outbox hard-locks after >8 failures, no auto-recovery. Offline edits accumulate silently and never push until user clicks a small indicator. Off-by-one: exactly 8 still drains. | stress |
| ST-5 | MEDIUM | src/lib/syncEngine.ts mergeRemote | Remote customer with id:null accepted without validation, stored under "null" key, corrupts the Map. | stress |
| ST-6 | MEDIUM | src/lib/syncEngine.ts mergeRemote | Empty remote array preserved-as-local is correct for incremental pull but a fragile undocumented contract that will bite a future full-sync refactor. | stress |
| ST-7 | LOW | src/lib/syncEngine.ts subscribeToChanges | pendingEvents array has no max-size cap; an insert storm could grow it unboundedly before the 200ms flush. Add MAX_BATCH_SIZE early flush. | stress |

**Performance:** No regression. 10k customers save <2s, 50k save <10s, mergeRemote 50k no hang.

## Mentions / Notifications (end-to-end audit)

Two parallel mention systems: local `mentionsStore` (localStorage, Ops Center MentionsWidget, keyed by internal user id) and Supabase `notifications` table (cross-device bell + Resend email, keyed by Supabase auth UUID, written server-side by api/notify.ts). `api/notify.ts` matches recipients by EMAIL first (internal ids never equal Supabase UUIDs), UUID match is fallback only. So any client trigger MUST pass `mentionedUserEmails` or the bell/email silently delivers to nobody.

| # | Severity | File | Finding | Status |
|---|----------|------|---------|--------|
| MN-1 | HIGH | src/components/WorkOrderPanel.tsx:~1232 | WO notes/serviceReport/nextSteps mention trigger passed only `mentionedUserIds`, no emails. Bell + email reached nobody (UUID match against internal ids always empty); only the local widget fired. | FIXED — now passes `parseMentionEmails(allText, users)` |
| MN-2 | HIGH | src/components/WorkOrderPanel.tsx:~1255 | SOW-completion distribution notification had the same no-email gap. | FIXED — builds `distEmails` from distribution users |
| MN-3 | MEDIUM | src/components/AppRouter.tsx:214 | WorkOrderPanel `users` prop mapped without `email`, so emails were unavailable even after MN-1/2. App.tsx main mount already passed email. | FIXED — added `email: u.email` to the map |
| MN-4 | LOW | src/components/ui/MentionTextarea.tsx:4 | `MentionUser` type did not declare `email`, so the field was untyped/easy to drop at call sites. | FIXED — added `email?: string` |
| MN-5 | LOW | src/components/WorkOrderPanel.tsx:988 | Comment mention notifications gated on `job?.woNumber`; a draft WO without a number drops the bell/email (local widget still fires). Edge case, left as-is. | OPEN (minor) |

Customer-note path (Customers.tsx handleSaveNote) was already correct: passes `parseMentionEmails`. Receiver side verified: notifications.ts filters `user_id == session.user.id`, realtime subscribe + 5-min poll. Browser end-to-end could not be exercised (login requires a password Claude must not enter).
