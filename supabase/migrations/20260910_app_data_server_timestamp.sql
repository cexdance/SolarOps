-- Prepared 2026-09-10; validated and applied 2026-09-15.
-- Client-supplied updated_at on INSERT can poison the incremental sync cursor.
-- Stamp both write paths; do not change the shared public.set_updated_at helper.
-- clock_timestamp() is wall time at row write, not transaction-start time.
-- This does not provide commit ordering or repair existing future timestamps.
begin;
set local lock_timeout = '5s';

create or replace function public.app_data_stamp_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

-- Trigger execution is authorized when the trigger is created. This helper is
-- not an RPC API, and needs no callable client grant.
revoke execute on function public.app_data_stamp_updated_at()
  from public, anon, authenticated;

-- Reuse the existing trigger name so UPDATE never has competing timestamp
-- triggers from the checked-in bootstrap migrations.
drop trigger if exists set_app_data_updated_at on public.app_data;
create trigger set_app_data_updated_at
  before insert or update on public.app_data
  for each row execute function public.app_data_stamp_updated_at();

commit;
