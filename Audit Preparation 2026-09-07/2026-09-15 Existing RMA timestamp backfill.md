# Existing RMA timestamp backfill, 2026-09-15

Status: deployed, backfilled, and live-verified.

The live preflight found 50 RMA entries. All 10 standalone RMAs already had valid `updatedAt` values. Forty RMA entries embedded in 38 service-order rows had valid IDs and `createdAt` values but no `updatedAt`. The affected creation times range from May 21 through September 15, 2026. There were no duplicate IDs, malformed creation timestamps, or future RMA edit timestamps.

Migration `supabase/migrations/20260915_backfill_rma_entry_timestamps.sql` changes only missing or blank embedded RMA `updatedAt` fields, copying each entry's existing `createdAt`. This preserves the entry's historical chronology rather than making every legacy RMA appear edited today. Existing timestamps and every RMA business field remain unchanged.

Before changing rows, the migration copies every affected service-order row into `public.rma_timestamp_backfill_backup_20260915`. Row-level security is enabled and public, anonymous, and authenticated table access is revoked. This backup contains complete service-order values and must remain protected.

The transactional dry run passed all count and content assertions, then rolled back. The first live application exposed a separate client merge defect: 17 stamps remained, while active stale clients restored 23 missing timestamps. The backup contained all 38 original rows and remained inaccessible to anonymous and authenticated roles. Every affected database row received a server timestamp, but 28 values differed from the expected normalized backup projection after client sync activity.

Root cause: `mergeJobFields` selected `rmaEntries` as one whole field. An active client with a stale job could therefore overwrite entry-level backfill data. The application fix makes `rmaEntries` a dedicated merge field and unions entries by stable ID, choosing the newest `updatedAt` per RMA. It also preserves RMAs added independently by office and field clients. Two regression cases were added. The relevant merge suites pass 46 tests; the complete application passes 951 tests across 94 files, and the configured production build passes.

Application commit `b62ddd9` was deployed and confirmed live as build `v1.7.6.3+b62ddd9.1789481540631`. GitHub CI passed its build and test jobs. The local release also passed 951 tests across 94 files and the configured production build.

Open browser tabs can continue running an old application bundle until refreshed. To prevent those clients from removing the repaired timestamps, `supabase/migrations/20260915_guard_rma_entry_timestamps.sql` installs a write guard on `app_data`. For any `job:*` insert or update, it fills only missing or blank RMA `updatedAt` values from that entry's existing `createdAt`. Its function is not executable as an anonymous or authenticated RPC. A transactional test restored an original legacy row and confirmed that the guard normalized it, then rolled back.

After installing the guard, the idempotent backfill was rerun. Final live results:

- 40 service-order RMA entries exist, all 40 have `updatedAt = createdAt`, and none is missing a timestamp.
- 10 standalone RMAs were already valid and were not rewritten.
- The protected backup contains all 38 affected service-order rows. Anonymous and authenticated roles cannot read it.
- RMA-level comparison against the backup found 40 matching stable IDs, zero added RMAs, zero missing RMAs, and zero business-field differences when excluding the new `updatedAt` field.
- All 38 affected parent rows received a newer server-controlled `app_data.updated_at` during the repair.
- Parent service-order JSON changed during the verification window because active clients continued syncing. Those parent-level differences were not counted as RMA changes; the RMA-specific comparison confirms the repair did not change manufacturer, part, number, case, status, compensation, creator, creation time, or linkage fields.

No customer rows, standalone RMAs, or financial values were rewritten by the backfill. No probe rows remain. The protected backup is retained for recovery and should be removed only through a separately reviewed retention decision.
