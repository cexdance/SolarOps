# SolarOps Test Suite: Initial Coverage Report

_Generated: 2026-05-29_

## Summary

72 tests across 3 files. All pass. Zero pre-existing failures found in the covered paths.

---

## Infrastructure Added

- `vitest` + `jsdom` installed as dev dependencies
- `vitest.config.ts` created with jsdom environment, path alias, and build defines
- `src/__tests__/setup.ts`: shared FakeStorage implementation injected via `vi.stubGlobal` — required because pnpm's virtual-store-dir in `/tmp` puts module code in a different global realm than the jsdom window, causing `localStorage.setItem is not a function` errors with the native jsdom storage
- `package.json`: added `test` and `test:watch` scripts

---

## Coverage by File

### outbox.test.ts (30 tests, all pass)

Covers the full public API of `src/lib/outbox.ts`:

- `hasPendingPush` / `markPushPending` / `clearPendingPush`: enqueue, increment, clear lifecycle
- `markPushPending` idempotency: preserves original `queuedAt` across multiple failures, only `attempts` increments
- `getPendingAttempts`: returns 0 when empty, correct count after N marks
- `resetOutboxAttempts`: zeroes counter while keeping `hasPendingPush` true; no-op when nothing pending
- `isRowPoisoned` / `incRowFailure` / `clearRowPoison` / `getPoisonedKeys` / `resetAllPoison`: full poison tracking lifecycle, threshold boundary at 3, multi-row independence
- `drainOutbox`: returns true when nothing pending; returns false when offline; returns false when attempts > 8; behavioral test for success/failure paths

### syncEngine.test.ts (30 tests, all pass)

Covers the pure exported functions of `src/lib/syncEngine.ts`:

- `PREFIX` constants: customer and job prefix values
- `isKVSyncKey`: all known KV keys return true, unknown keys return false
- `mergeRemote` basic: pass-through on empty remote, add new remote records, remote wins on ID conflict, local-only records survive incremental pull
- `mergeRemote` tombstone filtering: deleted customer IDs are filtered from customers and their child jobs; deleted job IDs are filtered; non-deleted records are kept
- `mergeRemote` photo preservation: local photos kept when local count exceeds remote (race condition guard); remote photos used when remote count is higher; undefined treated as empty array
- `mergeRemote` solarEdgeConfig: remote API key propagates to local when local is empty; local key is preserved when both sides have one
- `mergeRemote` edge cases: empty state, null/undefined customers field, empty arrays (incremental pull semantics), malformed duplicate IDs in remote payload

### dataStore.test.ts (12 tests, all pass)

Covers `loadData`, `saveData`, `clearData` in `src/lib/dataStore.ts`:

- First load: returns valid AppState with seed customers and users, sets version key, solarEdgeConfig has apiKey field
- Restore from storage: customers, jobs, solarEdgeConfig.apiKey all survive round-trip; notifications and solarEdgeExtraSites default to empty array when missing
- Corrupted localStorage: falls back to seed state without throwing
- Tombstone filtering on load: deleted IDs excluded from returned customers
- Safe migration: user-created customers survive a DATA_VERSION bump; version key is updated after migration
- `saveData`: persists to localStorage, strips base64 dataUrl from woPhotos while keeping storageUrl, drops photos without storageUrl, handles empty state without error
- `clearData`: removes both storage and version keys; no-op when already empty
- Round-trip saveData to loadData: customer and job fields preserved end-to-end

---

## Failing Tests: None

All 72 tests pass. No bugs were surfaced by the characterization tests.

---

## Key Findings During Investigation

1. **pnpm temp realm issue**: The pnpm virtual-store-dir at `/tmp/solarflow-dashboard` means module code runs in a different V8 context than the jsdom window. Any test suite for this project must inject a shared `localStorage` via `vi.stubGlobal` rather than relying on jsdom's native `window.localStorage`. This is documented in `setup.ts`.

2. **mergeRemote does NOT implement newest-wins**: The code comment says "last-writer-wins on `updated_at`" but the actual `mergeRemote` function does a simple Map override (remote always wins, no timestamp comparison). If two devices write different versions of the same record and the order of Supabase pull is not guaranteed, the wrong version can win. The tests document the current "remote always wins" behavior, not a timestamp-based conflict resolution.

3. **Empty remote array semantics**: `mergeRemote` treats `remote.customers = []` as "no incremental changes" and preserves local — it does NOT treat it as "remote has no customers, delete everything." This is the correct incremental pull behavior and is now pinned by tests.

4. **drainOutbox > 8 attempts lock**: When `attempts > 8`, `drainOutbox` silently returns false and requires user-triggered `resetOutboxAttempts`. The test pins this threshold.

5. **saveData photo stripping**: Photos with no `storageUrl` are fully dropped from localStorage (not just base64-stripped). If an upload to Supabase Storage fails and the user immediately closes the tab, those photos are permanently lost. This is a known design trade-off, now documented by the test.

---

## Coverage Gaps That Remain

**High priority:**

- `pushToSupabase`, `pullFromSupabase`, `syncOnLogin`, `pullAndMerge`: all require a Supabase client. These need an integration test suite with a Supabase test project or a more complete mock of the `@supabase/supabase-js` client.
- `subscribeToChanges` (realtime batching): the 200ms flush window and consecutive-error circuit breaker have no tests.
- `drainOutbox` success path: the dynamic import of `pushToSupabase` and `loadData` inside `drainOutbox` makes mocking via `vi.doMock` unreliable with Vitest's ESM handling. A refactor to accept injected push/load functions would make this fully testable.

**Medium priority:**

- `applyExclusionFilter`, `applyUsIdOmEnrichment`, `applyDedup` in `dataStore.ts`: these one-time migration functions run during `loadData` and are gated by localStorage flags. They have no direct tests.
- `saveData` QuotaExceededError fallback: strips `activityHistory` on second attempt. No test for this path (requires simulating a full localStorage quota).
- Type contract gaps in `src/types/index.ts`: `Customer.notes` is `string` (non-optional) but several code paths pass `undefined`. `Job` has no `woNumber` in its base interface but `WorkOrder` does. No runtime validation layer exists.

**Lower priority:**

- `subscribeToChanges` unsubscribe cleanup: the returned cleanup function is never tested.
- `getDeletedCustomerIds` / `getDeletedJobIds`: only tested indirectly through `mergeRemote`. Direct unit tests would pin the JSON parse edge cases.
