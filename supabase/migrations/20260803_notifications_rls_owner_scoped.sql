-- Scope notifications RLS to the owning user.
--
-- THE HOLE
-- `rls_policies.sql` granted every authenticated user unrestricted access to
-- EVERY row of public.notifications:
--
--     create policy "notifications authenticated read"
--       on public.notifications for select to authenticated using (true);
--     create policy "notifications authenticated write"
--       on public.notifications for all to authenticated using (true) with check (true);
--
-- `for all ... using (true) with check (true)` means any signed-in account could
-- read, forge, alter or delete anyone else's notifications straight through the
-- client SDK, bypassing api/notify.ts entirely. Mention notifications quote the
-- message body and name the sender, so this exposed staff conversation content
-- across accounts, not just row ids.
--
-- Anonymous access was never affected: both policies are scoped `to
-- authenticated`, and an anon-key read returns [] (verified 2026-08-03). The
-- problem is strictly authenticated-user-to-authenticated-user.
--
-- NOTE: the repo contained two contradictory definitions for this table.
-- `notifications_table.sql` declared the correct owner-scoped policies, while
-- `rls_policies.sql` declared these permissive ones. Whichever ran last won, so
-- the live state was not determinable from the repo. This migration drops all
-- four by name and recreates the correct pair, making it correct regardless of
-- which was in effect. It is safe to run more than once.
--
-- WHY ONLY SELECT AND UPDATE
-- The client does exactly three things with this table (src/lib/notifications.ts):
-- one select in fetchMyNotifications, and two updates in
-- markNotificationReadRemote / markAllNotificationsReadRemote. It never inserts
-- or deletes. Rows are created by api/notify.ts using the service-role key,
-- which bypasses RLS, so no insert policy is needed and adding one would only
-- widen the surface.

alter table public.notifications enable row level security;

-- Drop both the permissive pair and the older correct pair, so this converges
-- from any starting state.
drop policy if exists "notifications authenticated read"  on public.notifications;
drop policy if exists "notifications authenticated write" on public.notifications;
drop policy if exists "Users can read own notifications"   on public.notifications;
drop policy if exists "Users can update own notifications" on public.notifications;

create policy "notifications owner read"
  on public.notifications for select
  to authenticated
  using (user_id = (select auth.uid()));

-- `with check` as well as `using` is the part that matters. `using` alone would
-- let a user update a row they own and rewrite user_id to someone else's,
-- handing their own notification to another account. `using` gates which rows
-- are visible to the update; `with check` gates what the row is allowed to
-- become.
create policy "notifications owner update"
  on public.notifications for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Verify (expect exactly the two policies above):
--   select policyname, cmd, qual, with_check
--     from pg_policies
--    where schemaname = 'public' and tablename = 'notifications';
