# Storage-full modal: read-and-diagnose audit (2026-08-06)

Scope: read-only. No source files changed except this report.

## 1. The trigger path (every emitter of `solarops:storage-warning`)

Listener: `src/components/StorageWarningBanner.tsx:26-31`. Only `kind:'failed'` blocks
the screen; there is no emitter left that sends `kind:'trimmed'` (the banner code
for it is dead UI at the moment, harmless).

Two emitters, both `kind:'failed'`:

**A. `src/lib/dataStore.ts:479-486`** (`saveData()`)
- Fires when `idbSetState(slimState)` (IndexedDB write of the main `AppState` blob,
  key `solarflow_data`) rejects.
- Since the 07-22 migration this is IndexedDB, not localStorage. IDB has no fixed
  5MB cap on iOS Safari, but it shares ONE per-origin disk quota with every other
  IndexedDB database on the origin, including `solarops_photos` (photoStore.ts) and
  `solarops_state` (stateStore.ts). A fat photo DB can push the origin over its
  device-level quota (iOS: a fraction of free disk, can be very small on a full
  phone) and this write fails as collateral damage even though `solarflow_data`
  itself is small. Payload: full `AppState` minus base64 (customers, jobs metadata,
  woPhotos with dataUrl stripped once durable). Bounded by business size, not by
  photos, typically low single-digit MB.
- reason code: `idb-write-failed`.

**B. `src/lib/contractorStore.ts:517-547`** (`saveContractorJobs()`)
- Fires when `localStorage.setItem(CONTRACTOR_JOBS_KEY, ...)` throws
  (`QuotaExceededError`), i.e. actual 5MB localStorage cap hit.
- reason code: `quota-exceeded`, source: `contractor_jobs`.
- This is a REAL localStorage write, still capped at ~5MB/origin on iOS Safari,
  and it is the one most likely to actually throw on a contractor's phone (see 3).

## 2. The localStorage surface that remains (every `localStorage.setItem` in src/)

Full inventory (non-test files), by key, with growth classification:

| Key | File | Bounded? | Notes |
|---|---|---|---|
| `solarflow_contractor_jobs` | contractorStore.ts:536 | **NO** | See 3. Prime suspect. |
| `solarflow_customers` | customerStore.ts:54 | NO | Live path (App.tsx:1754/3048). Legacy CRM customer store, parallel to `AppState.customers`. No trim. Small per-record but no cap. |
| `solarflow_interactions` | customerStore.ts:63 | **NO, append-only** | `addInteraction` prepends and is never trimmed (App.tsx:1758-1759, :3064). Every call/email/SMS/note/meeting logged forever, one array, one localStorage key. Small per-entry (~300-600B) but strictly monotonic since the org's founding. |
| `solarflow_crm_data` | crmStore.ts:176 | unaudited fully | Leads/XP/badges blob (CRMDashboard, DispatchDashboard, LeadLobby, ContractorDashboard). Not append-only by inspection but not deeply audited this pass. |
| `solarops_change_log` | changeLog.ts:77 | YES (2000 entries) | `writeLog` slices to `MAX_ENTRIES=2000` on every write. Each entry carries a `payload` that can include full before/after values for non-"heavy" fields (heavy fields — `woPhotos`, `photos`, `lineItems`, `rmaEntries`, `activityHistory`, `parts` — are summarized to a count). Worst case ~2000 * 1-2KB ≈ 2-4MB, but capped. |
| `solarops_mentions_v1` | mentionsStore.ts:33 | YES (200) | `safeWrite` slices to `MAX=200`. Fine. |
| `solarops_outbox_v1` | outbox.ts:69 | unaudited size cap | Sync retry queue; not fully audited this pass, worth a follow-up if candidate B is fixed and the modal still fires. |
| `solarops_inventory_v1`-ish | inventoryStore.ts:431/457 | unaudited | Equipment/tools; not photo-bearing by name, likely small. |
| `solarflow_deleted_customer_ids` / `solarflow_deleted_job_ids` | dataStore.ts:132, syncEngine.ts:1127/1140 | grows, but tiny (just ids) | Tombstone lists, unioned across devices; small strings, not a realistic quota risk on their own. |
| Everything else (`solarops_billing_view`, `solarops_jobs_view`, column sorts, calendar view/status, dashboard config, XP data, SMTP settings, dispatch layout, coord caches, todoStore, toolStore, siteProfileStore, monitoringColumnStore, projectStore, removedSitesStore) | various | small, bounded by nature | UI prefs / small config objects. Not credible culprits. |

**Nothing writes base64 image data to localStorage.** Confirmed by inspection:
- `dataStore.ts` `saveData()` explicitly strips `f.data`/`woPhotos[].dataUrl` before
  the (IDB, not localStorage) write (dataStore.ts:433-467).
- `contractorStore.ts` `saveContractorJobs()` explicitly filters out any
  `photos[cat]` entry starting with `data:` before the localStorage write
  (contractorStore.ts:527-536).
- Both comments say so explicitly and the code matches.

**The one genuinely unbounded, append-only array that is NOT capped:**
`solarflow_interactions` (customerStore.ts). Low bytes/entry but literally never
trimmed. Not the current fire, but a slow-burn candidate; recommend adding an
`MAX_ENTRIES`-style cap or moving it off localStorage like `AppState` was.

## 3. The actual culprit, ranked

**#1 `solarflow_contractor_jobs` (contractorStore.ts) — top suspect for Cesar specifically.**

Why this ranks above everything else:
- It is a **single whole-company blob**, not scoped per contractor. Confirmed via
  `syncEngine.ts`: `solarflow_contractor_jobs` is a flat KV sync key
  (`KV_SYNC_KEYS`, syncEngine.ts:92), merged with `mergeContractorJobs`
  (syncEngine.ts:416, 560), and pulled down whole. There is no `filter(j =>
  j.contractorId === me)` on the client before the localStorage write — every
  contractor's phone stores every OTHER contractor's job history too. (Memory
  note `spec_cjob_perrecord_migration.md`: per-record `cjob:{id}` sync was
  *speced but never implemented*; the whole-blob model is still live.)
- Each `ContractorJob.photos` object (`types/contractor.ts:312-328`) has **14
  categories**, each `string[]` of URLs (before/serial/parts/process/after/
  progress/ppe/voltage/old_serial/string_voltage/cabinet_old/cabinet_new/
  new_serial/inv_overview). Once uploaded, entries are ~90-140 byte Supabase
  Storage URLs, not base64 — but there is no per-job or per-category cap, and no
  retention/archival: a completed job from 8 months ago still carries its full
  photo-URL manifest in this blob forever.
- `saveContractorJobs()` (contractorStore.ts:505-548) has **no trim, no
  windowing, no "drop jobs older than N days"** logic of any kind — unlike
  `dataStore.ts` (IDB, effectively uncapped) and `changeLog.ts` (hard 2000-entry
  cap). It is architecturally the same shape as `dataStore.ts` before the 07-22
  migration: a monotonically growing JSON blob written straight to
  `localStorage.setItem`.
- It is the literal code path that throws `QuotaExceededError` and fires
  `kind:'failed'` (contractorStore.ts:541-546) — a real, still-capped-at-5MB
  localStorage write, unlike dataStore's IDB path.

Rough math: at, say, 40 active/historical jobs per contractor visible company-wide
across N contractors, with photo arrays averaging even 10-20 URLs total per job
(~1.5-3KB), the blob for a mid-size op could sit in the hundreds of KB to low MB
range — not dramatic on its own, but it is a *shared, unscoped, ever-growing*
company-wide blob sitting in the SAME localStorage as `solarflow_customers`,
`solarflow_interactions`, `solarflow_crm_data`, and `solarops_change_log`
(bounded but up to several MB), all racing for the same 5MB/origin cap. The
modal firing is very plausibly the aggregate of several bounded-but-nontrivial
keys plus one genuinely unbounded one (`solarflow_contractor_jobs`), not any
single dramatic offender.

**#2 IDB-quota collateral damage via `solarops_photos` (photoStore.ts).**
`purgeUploadedBlobs()` (photoStore.ts:155-167) reclaims blobs of rows uploaded
AND older than `keepDays=30` (default). Rows newer than 30 days, or rows whose
upload never completed (`uploadStatus !== 'uploaded'`), keep their blob
indefinitely. On a device that is frequently offline or has connectivity gaps in
the field, "failed"/"pending" rows can accumulate without ever reaching
`uploaded`, so they are never reclaimed regardless of age. This is IDB not
localStorage, so it does not itself throw the 5MB error, but per the file's own
comment (photoStore.ts:134-138) it shares the ORIGIN's overall storage quota with
`solarflow_data`'s IDB store, and can starve `dataStore.ts`'s `idbSetState` write,
producing emitter A above.

**#3 `solarflow_interactions` (customerStore.ts) — slow burn, not the current fire**, per section 2.

**Ruled out:** base64/photo data in localStorage anywhere (confirmed absent, see
section 2); `changeLog.ts` (hard-capped); `mentionsStore.ts` (hard-capped);
`inventoryStore.ts`/`toolStore.ts`/`siteProfileStore.ts` (small, config-shaped,
not inspected line-by-line for a hard cap but not photo-bearing by type).

## 4. The upload path (work-order photos, contractor side)

Trace, `src/components/contractor/JobDetail.tsx` `addPhoto()` (lines 476-522):

1. Capture (camera or library `<input type=file>`) → `dataUrl` (base64).
2. `setPhotos(...)` — base64 preview shown immediately in React state only.
   Comment at line 481-482 confirms: "never written to localStorage."
3. `dataUrlToBlob(dataUrl)` → native `Blob`.
4. **IDB-first durability**: `appendPhoto({ jobId, category, blob })`
   (`photoStore.ts:82-101`) writes the blob to IndexedDB (`solarops_photos`)
   BEFORE attempting upload. This is the row that survives app close / network
   drop / quota events on `solarflow_data`.
5. `uploadPhotoToStorage(blob, job.id, row.id)` (`lib/photoStorage.ts`) attempts
   the Supabase Storage upload immediately, same call.
   - Success: `setPhotos` swaps the base64 preview for the permanent `https://`
     URL (JobDetail.tsx:503-509). `mirrorRow()` (photoStore.ts:270-303) also
     marks the IDB row `uploadStatus:'uploaded'`, `supabaseUrl:<url>` on the
     SAME upload path used by the retry sweep, so both converge on one URL
     (comment at photoStore.ts:277-281 documents a prior dedupe bug this fixed).
   - Failure (offline etc.): base64 stays in React state, `uploadError` set,
     row stays `pending`/`failed` in IDB. `retryPendingPhotoUploads()`
     (JobDetail.tsx:547-...) runs on mount and on `online`, calls
     `flushPendingMirrors()` (photoStore.ts:169-182) to retry every
     pending/failed row, then swaps base64 → URL in state once uploaded.
6. Local retention after a successful upload: `dataUrl` is stripped to `''` when
   persisted (both `dataStore.ts` woPhotos and `contractorStore.ts` photos array
   only ever keep the URL once `storageUrl`/`photoStoreId` exists), but the IDB
   `PhotoRow.blob` itself is NOT freed at upload time — only later, by
   `purgeUploadedBlobs(keepDays=30)`. Per `ba54944` (git log) this reclaim now
   runs; confirm its call site is on a real cadence (boot / interval), not just
   defined — did not chase that call site this pass, flag as a follow-up.

**Data-loss verdict: no path found where a photo is unrecoverable once uploaded.**
- If the quota trim strips `woPhotos` from `AppState`/`ContractorJob` (the
  base64-stripped, URL-only version), the URL string itself survives in the
  *other* representation (job.woPhotos vs job.photos[cat]) or in Supabase
  Storage directly; the binary is never solely dependent on the trimmed field.
- A photo exists ONLY locally (unrecoverable if IDB is wiped) exactly during the
  window between step 4 (IDB write) and a successful step 5 (upload) while
  offline. This is a real but narrow window: from `appendPhoto()` completing to
  either (a) `uploadPhotoToStorage` succeeding inline, or (b) the next
  `retryPendingPhotoUploads()` sweep (mount + `online` event) succeeding. If the
  user force-quits, clears site data, or the OS evicts the IDB database (iOS
  under storage pressure CAN evict entire origin storage, not just prune) during
  that window, on a job that was never brought back online, the photo is gone
  with no server copy. This is the genuine tail risk, and it is orthogonal to
  the localStorage modal — it does not depend on `solarflow_contractor_jobs`
  hitting quota at all.

## 5. How to test it

**What CAN be verified in vitest without Cesar's phone:**

1. **The `quota-exceeded` emitter fires and the blob is not silently dropped.**
   `src/__tests__/stress.test.ts` already has a pattern for this
   (`localStorage.setItem` monkeypatch around line 189-197, 460, and an existing
   IDB-failure test at stress.test.ts:293-311). Add a sibling test:
   - Monkeypatch `localStorage.setItem` to throw `QuotaExceededError` only for
     `key === 'solarflow_contractor_jobs'` (pass through for everything else, so
     `dbSet`'s own metadata writes don't false-fail).
   - Call `saveContractorJobs(jobs)` with a fixture job list.
   - Assert: (a) `dbSet` (mocked) was still called with the FULL unstripped
     payload (proves cloud write is attempted regardless of local quota,
     contractorStore.ts:518-522 "push to cloud first" contract); (b) a
     `solarops:storage-warning` event with `detail.kind==='failed'` and
     `detail.source==='contractor_jobs'` was dispatched; (c) no exception
     escaped `saveContractorJobs` (the try/catch contract holds).

2. **Reproduce realistic blob growth and prove/disprove #1 as root cause.**
   Build a fixture generator: N contractors × M jobs each × up to 14 photo
   categories × K URL strings (~110 bytes each, realistic Supabase Storage URL
   length — grab one real example from `photoStorage.ts` to size accurately).
   Serialize with `JSON.stringify`, measure `.length`, and compare against a
   5MB budget shared with fixture-sized `solarflow_customers`,
   `solarflow_interactions`, `solarflow_crm_data`, and a 2000-entry
   `solarops_change_log`. This directly tests the "aggregate of several bounded
   keys plus one unbounded one" hypothesis in section 3 without needing a real
   device, and gives a concrete number (how many jobs/contractors until 5MB is
   hit) instead of a hand-wave.

3. **Stress-test the existing `idb-write-failed` path** (already has a test at
   stress.test.ts:293-311) — extend it to assert `saveData()` still calls
   `dbSet` (Supabase) even when IDB rejects, matching contractorStore's
   cloud-first contract, so both emitters are proven to preserve the cloud copy
   under local storage failure.

**What CANNOT be verified without Cesar's actual phone / a real device:**
- The actual iOS Safari per-origin disk quota under real device storage
  pressure (this is OS/device-state dependent, not a fixed 5MB in practice for
  the *shared* IDB pool, only localStorage has a firm ~5MB ceiling).
- Whether `purgeUploadedBlobs()` is actually being invoked on a schedule on his
  device (call-site/cadence not confirmed this pass — needs a source read of
  where it's scheduled, e.g. app boot, plus confirmation via
  `indexedDB.databases()`/storage estimate on his device, or Safari's
  Web Inspector storage panel over USB).
- Whether his `solarflow_contractor_jobs` blob is in fact large (needs an
  on-device `localStorage.getItem('solarflow_contractor_jobs').length` reading,
  or a remote Supabase `app_data` row-size check for `key='solarflow_contractor_jobs'`
  as a proxy since it mirrors what every client pulls).
- Whether the modal he is hitting is emitter A (IDB, `idb-write-failed`) or
  emitter B (localStorage, `quota-exceeded`) — the two have different root
  causes and different fixes. **Recommend adding `reason`/`source` to the
  visible copy in `StorageWarningBanner.tsx` (currently discarded, only `kind`
  is read at line 27) or logging it to `change_log` via `logChange`, so the
  NEXT time Cesar hits it, the actual emitter is captured server-side instead of
  guessed from code reading.**

## Summary verdict

The blocking modal has two distinct triggers wired to the same UI. The
localStorage one (`contractorStore.ts` `saveContractorJobs`, key
`solarflow_contractor_jobs`) is the stronger suspect for a contractor
specifically: it is an unscoped, whole-company, never-trimmed blob with no cap
of any kind, structurally identical to the `dataStore.ts` blob before its 07-22
IndexedDB migration — but that migration was never applied to
`contractorStore.ts`. No base64/photo binary was found in any localStorage
write; the growth is from photo URL arrays with no per-job/per-category/
per-contractor scoping or retention, compounding with several OTHER bounded
localStorage keys sharing the same 5MB origin cap. Recommended next step (not
done this pass, diagnose-only): scope `solarflow_contractor_jobs` to the
current contractor before the localStorage write (keep the full blob only in
the Supabase push), and/or land the previously-speced per-record `cjob:{id}`
sync so a phone only ever holds ITS OWN jobs locally.
