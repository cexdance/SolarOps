# Existing RMA timestamp backfill, 2026-09-15

Status: backfill attempted, sync race found, application fix verified locally.

The live preflight found 50 RMA entries. All 10 standalone RMAs already had valid `updatedAt` values. Forty RMA entries embedded in 38 service-order rows had valid IDs and `createdAt` values but no `updatedAt`. The affected creation times range from May 21 through September 15, 2026. There were no duplicate IDs, malformed creation timestamps, or future RMA edit timestamps.

Migration `supabase/migrations/20260915_backfill_rma_entry_timestamps.sql` changes only missing or blank embedded RMA `updatedAt` fields, copying each entry's existing `createdAt`. This preserves the entry's historical chronology rather than making every legacy RMA appear edited today. Existing timestamps and every RMA business field remain unchanged.

Before changing rows, the migration copies every affected service-order row into `public.rma_timestamp_backfill_backup_20260915`. Row-level security is enabled and public, anonymous, and authenticated table access is revoked. This backup contains complete service-order values and must remain protected.

The transactional dry run passed all count and content assertions, then rolled back. The first live application exposed a separate client merge defect: 17 stamps remained, while active stale clients restored 23 missing timestamps. The backup contained all 38 original rows and remained inaccessible to anonymous and authenticated roles. Every affected database row received a server timestamp, but 28 values differed from the expected normalized backup projection after client sync activity.

Root cause: `mergeJobFields` selected `rmaEntries` as one whole field. An active client with a stale job could therefore overwrite entry-level backfill data. The application fix makes `rmaEntries` a dedicated merge field and unions entries by stable ID, choosing the newest `updatedAt` per RMA. It also preserves RMAs added independently by office and field clients. Two regression cases were added. The relevant merge suites pass 46 tests; the complete application passes 951 tests across 94 files, and the configured production build passes.

The application fix must be deployed before the idempotent migration is rerun. Final live counts will be appended after the deployed version has propagated and the remaining 23 entries stay corrected through the verification window.
