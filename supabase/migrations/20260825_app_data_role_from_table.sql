-- 0015_rls_references_user_metadata: 4 policies on public.app_data + public.change_log
--
-- WHY: every policy below gated access on
--   auth.jwt() -> 'user_metadata' ->> 'role'
-- user_metadata is writable by the end user (supabase.auth.updateUser), so any
-- contractor could set role='admin' on themselves and read every customer and
-- job row. Authorization now comes from public.user_roles, which the client
-- cannot write (RLS enabled, zero policies: service role only).
--
-- ALSO FIXED (user decision 2026-08-25): the old predicate was
-- "role <> 'contractor'", which FAILS OPEN. Two accounts with no role at all
-- (cesarajurado@gmail.com, pentest_probe2_donotuse@mailinator.com, neither has
-- ever logged in) therefore had full staff access to all customer and job data.
-- The new predicate is is_staff(), which FAILS CLOSED: no row in user_roles
-- means no access to customer:/job: keys.
--
-- Discovery facts, checked live 2026-08-25:
--   app_data = (key text, value jsonb, updated_at timestamptz). No user_id, no
--     team_id, and no membership/team/org table exists. Single tenant, so the
--     rule is role-based; ownership and membership are not expressible.
--   auth.users: 15 rows. 13 carry raw_user_meta_data->>'role',
--     ZERO carry raw_app_meta_data->>'role', so app_metadata was not a usable
--     trusted source without a backfill plus a forced re-login for everyone.
--     Roles: admin 4, contractor 4, support 2, sales 2, coo 1, none 2.

begin;

-- 1. Trusted role store -------------------------------------------------------
create table if not exists public.user_roles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  role       text not null check (role in ('admin','coo','support','sales','contractor')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_roles enable row level security;
-- Deliberately NO policies. Nothing but the service role touches this table
-- directly; the policy predicates reach it through the SECURITY DEFINER helper
-- below, which bypasses RLS. A user cannot read or change their own role.

comment on table public.user_roles is
  'Trusted authorization source for RLS. Service-role writable only. Replaces auth.jwt()->user_metadata->>role, which end users can edit.';

-- 2. One-time trust bootstrap -------------------------------------------------
-- Seeds from today's user_metadata: an untrusted source, but it is the current
-- de facto state and it was reviewed by hand before this ran. After this
-- migration user_metadata is never consulted again by the database.
insert into public.user_roles (user_id, role)
select u.id, u.raw_user_meta_data ->> 'role'
from auth.users u
where u.raw_user_meta_data ->> 'role' in ('admin','coo','support','sales','contractor')
on conflict (user_id) do nothing;

-- 3. Helper -------------------------------------------------------------------
-- STABLE so the planner evaluates it once per statement, not once per row.
-- (select auth.uid()) so the uid is an initPlan rather than a per-row call.
-- search_path pinned to '' because SECURITY DEFINER runs as the owner.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = (select auth.uid())
      and r.role in ('admin','coo','support','sales')
  );
$$;

revoke all on function public.is_staff() from public;
grant execute on function public.is_staff() to authenticated;

comment on function public.is_staff() is
  'Trusted staff check for RLS. Reads public.user_roles, never user_metadata. Fails closed: an unknown or role-less user is not staff.';

-- 4. Replace the 4 policies ---------------------------------------------------
-- auth.role()='authenticated' is dropped from each predicate because TO
-- authenticated enforces it declaratively.

drop policy if exists team_read on public.app_data;
create policy team_read on public.app_data
  for select to authenticated
  using (
    public.is_staff()
    or (key not like 'customer:%' and key not like 'job:%')
  );

-- The same forgeable predicate gated writes. Left alone it would let a
-- contractor overwrite every customer and job row, so it goes too.
drop policy if exists team_insert on public.app_data;
create policy team_insert on public.app_data
  for insert to authenticated
  with check (
    public.is_staff()
    or (key not like 'customer:%' and key not like 'job:%')
  );

drop policy if exists team_update on public.app_data;
create policy team_update on public.app_data
  for update to authenticated
  using (
    public.is_staff()
    or (key not like 'customer:%' and key not like 'job:%')
  )
  with check (
    public.is_staff()
    or (key not like 'customer:%' and key not like 'job:%')
  );

-- change_log.team_read carried the identical predicate (its key filter never
-- matched: change_log has no key column). ~13k rows, many holding customer
-- emails. Contractors WRITE it via logJobChange and must never read it, so
-- SELECT is staff-only while INSERT is untouched.
drop policy if exists team_read on public.change_log;
create policy team_read on public.change_log
  for select to authenticated
  using (public.is_staff());

-- No DELETE policy on either table, unchanged: deletes stay service-role only.

-- 5. Indexes ------------------------------------------------------------------
-- None added. user_roles.user_id is the PK and is the only column any policy
-- predicate touches. app_data is ~700 rows keyed by its own PK, and the LIKE
-- runs against rows already fetched, so a text_pattern_ops index would not be
-- chosen. Revisit if app_data passes ~100k rows.

commit;

revoke execute on function public.is_staff() from anon;
