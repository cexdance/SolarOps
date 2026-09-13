---
date: 2026-09-12
status: tested-awaiting-deployment
tags: [solarops, service-orders, visits, release]
---

# Follow-up visit implementation

Extends Claude's a299395 implementation. The current visit has an explicit ID, service type, proposed schedule and approval record; earlier visits retain completed work and billing. No schema migration or retrospective reconstruction of old labor/photo ownership is performed.

## Behavior

- A technician uses Finish Visit, Return Needed, selects the follow-up service type and proposed date, and records remaining work. Office users can request a return from the Visits workspace too.
- The authenticated server checks assignment/role, validates catalog service/date, caps the order at 11 total visits, uses a deterministic visit ID for retries, and conditionally writes against the fetched database timestamp. A competing update returns a refresh/retry error rather than overwriting it.
- The request archives the completed visit's report, parts, labor, photos and billing. The new visit goes to Create Quote. Daniel gets a deduplicated notification resolved from the authenticated user directory and trusted admin roles. No appointment confirmation email is sent by requesting a return.
- Only admin/COO may record quote approval or Included, no additional charge through the visit API. Approval records the authenticated actor, time and reference. An included decision zeros the additional customer charge and allows closeout without generating another invoice. Scheduling follows approval.
- Assigned technicians can see a pending follow-up but cannot start it in the application. Quote and scheduling controls direct the office to explicit approval.
- Parts, labor, service type and report are recorded per visit. Photos store their originating visit ID in IndexedDB and on synchronized records; late uploads retain that ID. Current photo editors exclude past-visit photos and saves preserve historical photos.
- The Visits selector displays completed records and their billing. Historical invoice payments can be recorded by an admin without altering the active visit. Reports include visit-specific service type, parts, work summaries, hours and photos. Customer reports omit labor rates.
- Sync selects newer visit identities before timestamps, preserves historical billing during late photo merges, and rejects old-visit local editor updates. Legacy orders still use top-level fields for their original visit.

## Tests

- Production build passed using the configured check-env, TypeScript project build and Vite pipeline.
- 949 tests passed across 94 test files, including request idempotency, 10-follow-up boundary, missing/invalid input, quote gate, admin-only decision API, contractor assignment, compare-and-swap conflict, prior-visit stale save, delayed photo ownership, labor/part attribution and historical payment preservation.
- Synthetic browser tests passed at 1440px and 390px. Each ran contractor request, pending start lock, admin included approval, historical visit selection, current visit labor, second return request, actual quote-preview save and explicit quote approval. No page errors or horizontal overflow.
- Replay: start Vite on port 5197, then `node solarflow-dashboard/scripts/test-visits-browser.mjs` from repository root. The fixture is development-only and is not imported into the production entry. It intercepts external data and uses synthetic records; no customer or real notification is created by this browser suite.

## Operational limits

- Creating or approving a follow-up needs connectivity; a failed request leaves the current visit intact and shows a retry error. Existing documentation and photo capture retain the app's offline storage behavior.
- The server transition checks are in the authenticated API. This release does not redesign the existing broad staff app_data policies, deploy database triggers, or certify raw REST writes by old/modified clients. Existing clients should refresh to use the new flow. The unrelated timestamp migration remains outside this release.
- Older snapshots without service type, labor or stable photo ownership are preserved as recorded. No inferred historical costs are fabricated.
- Previous invoice records remain in visit history; external accounting reconciliation and collection of historical balances remain office work.
- Notification delivery failure does not undo a saved visit: the Create Quote queue remains the durable work item. No live customer order was used for the synthetic end-to-end tests.
