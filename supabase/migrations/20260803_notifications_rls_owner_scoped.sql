-- Remove the permissive notifications policies, and make sure RLS is on.
--
-- WHAT WAS ACTUALLY WRONG
-- Not the live database. Verified 2026-08-03 against production, the live
-- policies are correct and owner-scoped:
--
--   Users can read own notifications    SELECT  (auth.uid() = user_id)
--   Users can update own notifications  UPDATE  (auth.uid() = user_id)
--
-- The problem was the REPO. `rls_policies.sql` declared a contradictory pair
-- granting every authenticated user unrestricted access to every row:
--
--   create policy "notifications authenticated read"
--     on public.notifications for select to authenticated using (true);
--   create policy "notifications authenticated write"
--     on public.notifications for all to authenticated using (true) with check (true);
--
-- Those were never applied, but they were one `psql -f rls_policies.sql` away
-- from replacing the correct ones and exposing every user's notifications to
-- every other signed-in account. Mention notifications quote the message body
-- and name the sender, so that would have leaked staff conversation content.
--
-- This migration is deliberately NARROW. It does not rename or recreate the
-- working policies, because churning correct DDL on a live table buys nothing.
-- It only:
--   1. guarantees RLS is actually enabled, and
--   2. drops the dangerous definitions if they were ever applied.
--
-- Safe to run repeatedly, and safe to run on a database that never saw the bad
-- policies: every statement is idempotent.

-- (1) Policies are inert if row-level security is switched off on the table.
-- No-op when already enabled.
alter table public.notifications enable row level security;

-- (2) Drop the permissive pair if present. `if exists` so this is a no-op on a
-- healthy database. The correct policies, "Users can read own notifications" and
-- "Users can update own notifications", are intentionally left untouched.
drop policy if exists "notifications authenticated read"  on public.notifications;
drop policy if exists "notifications authenticated write" on public.notifications;

-- (3) And "service_insert" from migration_v1.7.0.sql, which was worse than the
-- pair above. `FOR INSERT WITH CHECK (true)` with no TO clause defaults to
-- PUBLIC, so it granted INSERT to every caller: anyone could forge a
-- notification to any user, with any sender name and body. It granted the
-- service role nothing, since the service key bypasses RLS anyway.
drop policy if exists "service_insert" on public.notifications;

-- Verify. Expect rls_enabled = true, and exactly the two "own notifications"
-- policies with qual (auth.uid() = user_id):
--
--   select relrowsecurity as rls_enabled
--     from pg_class where oid = 'public.notifications'::regclass;
--
--   select policyname, cmd, qual, with_check
--     from pg_policies
--    where schemaname = 'public' and tablename = 'notifications';
--
-- Note on the live policies, both of which look wrong and are not:
--   * with_check is NULL. Postgres applies the USING expression to the new row
--     when an UPDATE policy omits WITH CHECK, so reassigning user_id to another
--     account is already blocked.
--   * roles is {public}, not {authenticated}. The qual carries it: auth.uid() is
--     NULL for an anonymous request, so `NULL = user_id` is never true and anon
--     gets no rows.
