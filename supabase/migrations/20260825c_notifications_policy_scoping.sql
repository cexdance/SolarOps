-- Audit follow-up. These two were already correct (own-row via auth.uid(), no
-- user_metadata), but were untargeted and re-evaluated auth.uid() per row.
-- Same access, scoped and wrapped. No INSERT/DELETE policy: service role only.
drop policy if exists "Users can read own notifications" on public.notifications;
create policy "Users can read own notifications" on public.notifications
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can update own notifications" on public.notifications;
create policy "Users can update own notifications" on public.notifications
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
