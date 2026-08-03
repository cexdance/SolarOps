-- Take DELETE away from app_data. Nobody uses it; everybody has it.
--
-- LIVE STATE (queried 2026-08-03, not read from a file):
--
--   tablename  policyname  cmd  roles     qual
--   app_data   team_rw     ALL  {public}  (auth.role() = 'authenticated')
--
-- `ALL` includes DELETE, and the qual is only "are you signed in" with no
-- row-level condition. app_data holds 585 rows: 416 customer records and 155
-- jobs, plus the CRM blobs. There are 15 accounts (3 admin, 1 coo, 2 sales,
-- 2 support, 5 contractor, 2 unset), and every one of them can currently
-- `DELETE FROM app_data` and take the entire CRM with it.
--
-- WHY THIS IS SAFE
-- The application never deletes from this table. Verified across the client and
-- every live handler: 4 `.select()`, 3 `.upsert()`, zero `.delete()`. Customer
-- and job removal is done with tombstone arrays (solarflow_deleted_customer_ids,
-- solarflow_deleted_job_ids), not row deletes. So the DELETE grant is pure
-- downside: no feature depends on it, and it is the single permission that turns
-- one compromised or disgruntled account into total data loss.
--
-- This matters more than it looks. syncPushGate.test.ts documents a 2026-06-12
-- incident where a client bug blind-upserted 269 customer rows as empty
-- skeletons. RLS offered no backstop then. This is the cheapest backstop
-- available against the delete-shaped version of that.
--
-- WHAT THIS DOES *NOT* FIX
-- Read scope. Every authenticated account, contractors included, can still read
-- all 416 customer records. That is NOT fixable at the RLS layer as the app
-- stands: the contractor portal pulls the full dataset and filters client-side
-- (App.tsx:2854 and :3309 call pickupJobsForContractor(id, data.jobs) and look
-- up data.customers). Restricting contractor reads here would break the portal.
-- Closing that needs the portal to stop pulling everything, which is a design
-- change, not a policy change.
--
-- Idempotent and safe to re-run.

-- Replace the single ALL policy with the three verbs the app actually uses.
-- No delete policy is created: with RLS enabled, an operation without a
-- permitting policy is denied by default. That is the whole mechanism here.
drop policy if exists "team_rw" on public.app_data;

create policy "team_read"
  on public.app_data for select
  using (auth.role() = 'authenticated');

create policy "team_insert"
  on public.app_data for insert
  with check (auth.role() = 'authenticated');

-- Both clauses are required for upsert to keep working: `using` decides which
-- existing rows may be updated, `with check` validates the resulting row.
create policy "team_update"
  on public.app_data for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Verify. Expect exactly team_read/SELECT, team_insert/INSERT, team_update/UPDATE
-- and NO row with cmd = DELETE or ALL:
--
--   select policyname, cmd, qual, with_check
--     from pg_policies
--    where schemaname = 'public' and tablename = 'app_data';
--
-- Then confirm the app still works: load the dashboard, edit a customer, and
-- confirm the edit survives a refresh. Reads and upserts are unchanged; only the
-- unused DELETE path is removed.
