---
date: 2026-09-10
status: reviewed-local-fixes-verified-not-deployed
tags: [solarops, supabase, council, performance]
---

# Supabase sync and loading council review

Fatso reviewed the full data path, a loading reviewer checked React startup and session lifecycle, and a database reviewer checked migrations and safe live REST metadata. The primary agent reconciled findings, implemented the outbox fix, reviewed the combined diff, and ran final tests/build. The interrupted loading council was retried at the user's request. This is a review with bounded local reliability fixes, not a production reliability certification.

## Verified local fixes

| Defect and trigger | Resulting behavior | Evidence |
| --- | --- | --- |
| Customer/page fetch fails while a newer job fetch succeeds, advancing the shared cursor past missing records. KV and contractor errors also looked like successful hydration. | Every required read must succeed before adoption, cursor advancement, or initial push authorization. Failed reads preserve retry position. Cursor version 4 performs one full recovery pull for existing clients. | Six mocked transport regressions, including partial pagination, KV failure, contractor 503, empty success and cursor recovery. Three defect tests failed before the fix. |
| Outbox drain treats a resolved but deferred push as success, clearing pending edits after session expiry or before first hydration. | Only the writer acknowledges completion; drain retains pending work when the writer defers. | Both expired-session and pre-pull cases failed against original code and pass after the fix. Success, rejection and backoff tests also pass. |
| Realtime setup runs only at mount, while fresh login occurs later. | Authenticated sign-in starts realtime and hydration without reload. Repeated auth notices do not duplicate channels; sign-out/unmount clean them up. Auth callback schedules asynchronous work outside the auth lock. | Six React hook regressions cover session lifecycle, unfinished mount pull, overlap and deep sync. Reviewer reproduced five assertions failing against the original hook. |
| Customer/job fetches finish before the KV fetch begins; focus/online can start overlapping hook syncs. | Independent required reads run concurrently. Hook triggers share the in-flight cycle. Fresh sign-in waits for an older cycle then performs its own authenticated pull; deep sync waits before resetting the cursor. | Transport and hook tests pass. This removes a serial round trip and duplicate requests; no production latency percentage is claimed. |

Changed app files: `solarflow-dashboard/src/lib/syncEngine.ts`, `solarflow-dashboard/src/lib/outbox.ts`, and `solarflow-dashboard/src/hooks/useSyncEngine.ts`. Tests added or updated in `src/__tests__/syncPullReliability.test.ts`, `syncSessionLifecycle.test.tsx`, `outbox.test.ts`, `pullPrefixPagination.test.ts`, and `stress.test.ts`.

## Remaining priorities

These are open findings, not fixes included in this patch.

1. **P1: durable shared-key retries.** `syncEngine.ts` pushKeyValue records a shared pending flag, but drainOutbox replays AppState rather than each failed KV value. A successful unrelated KV write can clear shared pending work. Add a durable pending-key queue with independent acknowledgements and current-value replay. Test offline reload, two different keys, failed remote merge reads and concurrent updates.
2. **P1: startup local-cache safety and status.** App.tsx startup awaits initial IndexedDB hydration before attaching the timeout race, and does not adopt that initial hydrated snapshot into React before waiting for network. Timeout then sets dbReady, enabling persistence of potentially stale/default React data. `db.ts` syncFromDB swallows failed/null pulls, so the startup success path can also clear degraded status without remote success. Use separate local-hydrated and remote-synced states, adopt local data before network wait, and test stalled IDB/network plus recovery. See the loading council note if available.
3. **P1: timestamp authority.** Existing SQL bootstrap triggers stamp UPDATE only; INSERT can retain a device-supplied future updated_at. Prepared `supabase/migrations/20260910_app_data_server_timestamp.sql` stamps both paths. It is unapplied and not SQL-executed locally. Existing future-dated rows need measured inspection and a separate recovery decision; cursor reset alone does not repair their timestamps.
4. **P1: shared-key access and legacy permissive policies.** Source policies permit authenticated writes to non-customer/job keys, including shared tombstones. The old rls_policies.sql also contains permissive policy names not removed by later scripts. Inspect live effective policies before any permission migration; preserve required contractor flows with per-key authorization/server mediation. See [[2026-09-10 Supabase database council]].
5. **P1: transient failures can quarantine job rows indefinitely.** Three failures poison a row; normal pushes skip it, with no retry expiry. Classify transient versus permanent failures and retain an independently visible retry state.
6. **P1: stale-write guard discards independent edits.** dropStaleRows marks an entire older record clean before field/array reconciliation, potentially abandoning independent job edits or customer attachments. Fix with server-value reconciliation plus concurrency protection, not another unguarded read-then-upsert.
7. **P2: remaining loading and merge behavior.** App and hook still have separate startup pull paths. Startup photo-count comparison can restore deleted photos; customer realtime scalars do not select the timestamp winner; hook adoption ignores config-only changes when job/customer arrays match. Cover these paths with isolated integration fixtures before changing merge semantics.

## Final validation

- `pnpm test`: **825 tests passed across 85 files** on the final application changes.
- `pnpm run build`: passed environment precheck in lenient mode, TypeScript project build and Vite compilation. Existing large-chunk/Browserslist warnings remain. The local precheck reported missing server proxy secrets; the build is not evidence of production environment completeness.
- `git diff --check`: passed.
- Regression tests use local mocked transport/React; no real customer data or live write/fault/load test was used.
- No authenticated multi-browser production smoke test or measured production startup benchmark was performed.
- No local PostgreSQL executable was found and Docker daemon was unavailable. Migration SQL execution remains unverified; the database note includes disposable verification SQL and rollback.
- Raw test/build logs stay under `/private/tmp/solarops-sync-review-*`; no credentials or customer payloads are stored in this note.
- No commit, push, deployment, live migration, role change, or data repair was performed. Existing unrelated working-tree edits were preserved.

## Live evidence and performance follow-up

The database reviewer used safe GET requests: customer-files remains public; trusted role rows contain no technicians. A later source migration already includes technicians, so the historical Fatso leading hypothesis is superseded. Live SQL policies, triggers, index definitions and query plans remain unknown.

An updated_at index is already declared in the repository. Inspect actual query plans and cardinality before adding indexes. Capture cold/warm authenticated load timings, request counts, transferred bytes and realtime reconnect behavior on desktop/mobile under a controlled network fixture. Supabase documents that Postgres Changes authorization work scales with subscribers, so subscription duplication and policy cost warrant measurement before a compute upgrade: [Supabase Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes).


## Deployment follow-up, September 11

User authorized deployment. Reviewed application fixes released as `b565594` and verified live; 864 tests passed against the current production base, configured build passed, 33 session checks passed, live desktop/mobile smoke passed. API authentication gates respond correctly. See [[2026-09-11]]. The timestamp migration remains unapplied and open findings remain unresolved.
