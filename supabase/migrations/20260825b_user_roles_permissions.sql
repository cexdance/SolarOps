-- Follow-up to 20260825_app_data_role_from_table.sql
--
-- Two gaps found while auditing api/users.ts:
--
-- 1. 'technician' is in that file's STAFF_ROLES but was missing from the
--    user_roles CHECK. Under the OLD policy ("role <> 'contractor'") a
--    technician had full access, so leaving them out of is_staff() would be a
--    SILENT NARROWING the day someone creates one. Zero exist today, which is
--    exactly why it would not have been noticed. Added to both.
--
-- 2. permissions (notably 'users.manage') lived only in user_metadata, which
--    the user can edit. api/users.ts gated every write on it, so any user could
--    self-grant users.manage and then create admins, re-role anyone, or delete
--    staff. Same escalation class as the RLS lint, one layer up. Permissions
--    move into this table so the API can read them from a trusted source.

begin;

alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check
  check (role in ('admin','coo','support','sales','technician','contractor'));

alter table public.user_roles
  add column if not exists permissions text[] not null default '{}';

comment on column public.user_roles.permissions is
  'Trusted permit list (users.manage, financials.view, ...). Authoritative for api/users.ts. user_metadata.permissions is a display mirror only and must never gate a write.';

-- Backfill both from the current metadata, same one-time bootstrap rationale as
-- the first migration: untrusted source, reviewed by hand, never read again.
insert into public.user_roles (user_id, role, permissions)
select u.id,
       u.raw_user_meta_data ->> 'role',
       coalesce(
         array(select jsonb_array_elements_text(u.raw_user_meta_data -> 'permissions')
               where jsonb_typeof(u.raw_user_meta_data -> 'permissions') = 'array'),
         '{}'
       )
from auth.users u
where u.raw_user_meta_data ->> 'role'
      in ('admin','coo','support','sales','technician','contractor')
on conflict (user_id) do update
  set permissions = excluded.permissions,
      updated_at  = now()
  where public.user_roles.permissions = '{}';

-- is_staff() now includes technician, restoring the access the old policy gave
-- them. Contractor remains the only role walled off from customer:/job: keys.
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
      and r.role in ('admin','coo','support','sales','technician')
  );
$$;

revoke all on function public.is_staff() from public;
revoke execute on function public.is_staff() from anon;
grant execute on function public.is_staff() to authenticated;

commit;
