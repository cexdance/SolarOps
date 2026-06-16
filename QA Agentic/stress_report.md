# SolarOps Stress Test Report

**Date:** 2026-05-29
**Agent:** Reliability Tester
**Test file:** `solarflow-dashboard/src/__tests__/stress.test.ts`
**Run result:** 36/36 tests passed (full suite: 108/108)
**Scope:** Local only. No real network calls made. All Supabase/db calls mocked.

---

## Summary

All 36 stress tests pass. That means the app does not crash or throw under any tested load or fault condition. However, passing tests do not mean "no data loss." Several tests deliberately confirm known silent data-loss failure modes. These are ranked below by severity.

---

## Breaking Points Ranked by Severity

### CRITICAL: Stale Remote Overwrites Newer Local Edit (mergeRemote has no timestamp guard)

**Symptom:** A remote record with a timestamp from the year 2000 silently overwrites a local record edited in 2025. No error. No warning. The local edit is gone.

**Test that confirms it:** `mergeRemote does NOT compare updated_at timestamps: newer local edit is silently overwritten`

**Cause:** `mergeRemote` uses a plain Map override: `for (const [id, c] of remoteMap) merged.set(id, c)`. The comment in the code says "last-writer-wins on `updated_at`" but no timestamp comparison is actually performed. Remote always wins unconditionally.

**Realistic trigger:** Any incremental pull that returns a record that was modified by another device earlier in the same day, after the local user has also edited that record offline. The local edit is silently replaced.

**Fix needed:** Compare `updated_at` (or `createdAt` as fallback) before overwriting. Only apply remote if `remote.updated_at >= local.updated_at`.

---

### CRITICAL: activityHistory Silently Stripped on localStorage Quota Pressure

**Symptom:** When the first `localStorage.setItem` throws `QuotaExceededError`, the fallback path saves a "heavily trimmed" state with `activityHistory: undefined` for every customer. No confirmation is asked. The data is permanently gone from local storage at that moment.

**Test that confirms it:** `activityHistory data loss on first-level quota: CONFIRMED data-loss scenario`

**Cause:** `saveData` has a two-level fallback. Level 1 strips photos (correct). Level 2 strips all `activityHistory` entries from every customer. This second-level fallback runs silently whenever the storage is nearly full (not just when it is completely full). A `console.warn` is emitted and a `solarops:storage-warning` event is dispatched, but no UI prompt blocks the user.

**Realistic trigger:** A device with many customers and rich activity logs (notes, calls, emails) approaches the 5 MB jsdom/browser localStorage limit. The next auto-save strips all history.

**Fix needed:** The `solarops:storage-warning` event should trigger a visible, blocking UI alert explaining that activity history was dropped and prompting the user to export or clear data.

---

### HIGH: base64 Photos with No storageUrl Are Permanently Lost on Save

**Symptom:** A photo that was captured but whose Supabase Storage upload has not yet completed has `dataUrl` populated and `storageUrl` undefined. `saveData` filters these out (`filter(p => p.storageUrl)`). After the next save the photo is gone from localStorage with no recovery path.

**Test that confirms it:** `saveData drops jobs that have only base64 photos (no storageUrl): confirms data-loss scenario`

**Cause:** The filter was added to prevent base64 blobs from filling localStorage, which is correct. But there is no retry queue or IndexedDB fallback for photos whose Supabase upload is still in-flight. If the app is closed or the page reloads before the upload completes, the photo is lost.

**Realistic trigger:** Technician takes a photo on a slow connection, saves the work order, then navigates away before the upload finishes.

**Fix noted in codebase comment:** "Phase 2 will replace this with per-record row upserts." Until that lands, this is an active data-loss risk.

---

### HIGH: Outbox Locked After 8 Failures With No Automatic Recovery Path

**Symptom:** After 9 consecutive push failures (`attempts > 8`), `drainOutbox` returns `false` immediately and stops retrying. The outbox flag stays set in localStorage forever unless the user manually triggers a reset. All subsequent offline edits accumulate silently but will not be pushed.

**Test that confirms it:** `drainOutbox returns false when attempts > 8 (locked state)`

**Nuance found:** The lock threshold is `> 8` (strictly greater than), not `>= 8`. Exactly 8 failures still allows a drain attempt (test: `8 exact failures: drainOutbox still attempts drain`). This is a subtle off-by-one that could confuse future developers.

**Cause by design:** This was intentional to prevent reconnect storms. However, `resetOutboxAttempts` requires a user action via a UI component (`SyncStatusIndicator`). If that component is not visible or the user does not notice the warning, the device can stay offline-only indefinitely.

**Fix needed:** Add a visible, persistent banner (not just a small indicator) when the outbox is locked. Consider an exponential-backoff retry instead of a hard lock.

---

### MEDIUM: mergeRemote with Empty Remote Array Preserves Local (Correct Behaviour, But Fragile Contract)

**Symptom:** When the incremental pull returns an empty `customers: []` array, all local records are kept. This is the intended behaviour for incremental pulls (only changed records returned).

**Test that confirms it:** `mergeRemote with empty remote customers array preserves all local records`

**Risk:** The code comment says "ghost-purge removed." A future developer adding a full-sync path who passes `customers: []` (no remote records) expecting it to wipe local records will get the opposite behaviour. The contract is correct but not obvious.

---

### MEDIUM: mergeRemote Accepts null id Fields Without Crashing (Map Corruption Risk)

**Symptom:** A remote customer with `id: null` is accepted by `mergeRemote` without throwing. The Map stores it under the key `null` (coerced to string `"null"`). This can corrupt the customer list if a malformed Supabase row is returned.

**Test that confirms it:** `mergeRemote with customers containing null id fields: does not crash (may corrupt map)`

**Cause:** No input validation before the `new Map(remote.customers.map(c => [c.id, c]))` call.

**Fix needed:** Filter out records with falsy `id` before merging.

---

### LOW: saveData/loadData Timing Under Large Datasets (No Performance Regression)

All timing tests passed well within budget:
- 10k customers: save completed in under 2 seconds (budget: 2 s)
- 50k customers with 5 activity entries each: save completed in under 10 seconds (budget: 10 s)
- mergeRemote for 1000 jobs with 10 photos each: completed in under 3 seconds (budget: 3 s)
- mergeRemote for 50k remote customers: no hang or crash

No unbounded growth was detected at tested volumes.

---

### LOW: Realtime subscribeToChanges Batching (Not Stress-Tested — External Dependency)

The 200 ms flush window and `pendingEvents` array in `subscribeToChanges` were not load-tested because they require a live Supabase channel. The batching logic itself is sound (events collapse into one React render pass). Risk: an event storm (e.g., 10k rapid inserts) could grow `pendingEvents` unboundedly before the 200 ms timer fires. No unbounded-growth guard exists on the array.

**Recommendation:** Add a `MAX_BATCH_SIZE` cap to `pendingEvents` that triggers an early flush if the array exceeds, for example, 500 events.

---

## Test Coverage Added

| Suite | Tests | Covers |
|---|---|---|
| Volume: saveData/loadData | 6 | 1k/10k/50k customers, photo stripping, timing |
| Fault: QuotaExceededError | 3 | First-level fallback, total failure, activityHistory data loss |
| Concurrency: mergeRemote | 5 | Remote-wins, no-timestamp-check, 100-round interleave, ghost-purge, tombstone |
| Fault: outbox drain | 6 | Lock at >8, offline, reset-then-retry, boundary at 8, poison threshold, rapid accumulation |
| Clock skew: mergeRemote | 4 | Future ts, past ts, missing ts, 1000-record mixed skew |
| Oversized payloads | 5 | 50k remote, empty array, undefined, null id, 1000-job timing |
| Total failure: saveData | 2 | No-throw guarantee, previous save not corrupted |

**Total:** 36 new tests across 7 suites.
