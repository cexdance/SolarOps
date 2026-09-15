-- Prevent legacy clients from removing per-entry RMA timestamps when they
-- write an older whole-job snapshot after the one-time backfill.
begin;
set local lock_timeout = '5s';

create or replace function public.app_data_normalize_rma_timestamps()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.key like 'job:%'
     and jsonb_typeof(new.value->'rmaEntries') = 'array'
     and exists (
       select 1
       from jsonb_array_elements(new.value->'rmaEntries') entry
       where nullif(pg_catalog.btrim(entry->>'updatedAt'), '') is null
         and nullif(pg_catalog.btrim(entry->>'createdAt'), '') is not null
     ) then
    new.value := jsonb_set(
      new.value,
      '{rmaEntries}',
      (
        select jsonb_agg(
          case
            when nullif(pg_catalog.btrim(entry.value->>'updatedAt'), '') is null
              and nullif(pg_catalog.btrim(entry.value->>'createdAt'), '') is not null
            then entry.value || jsonb_build_object('updatedAt', entry.value->>'createdAt')
            else entry.value
          end
          order by entry.ordinality
        )
        from jsonb_array_elements(new.value->'rmaEntries')
          with ordinality entry(value, ordinality)
      ),
      false
    );
  end if;
  return new;
end;
$$;

revoke execute on function public.app_data_normalize_rma_timestamps()
  from public, anon, authenticated;

drop trigger if exists app_data_normalize_rma_timestamps on public.app_data;
create trigger app_data_normalize_rma_timestamps
  before insert or update on public.app_data
  for each row execute function public.app_data_normalize_rma_timestamps();

commit;
