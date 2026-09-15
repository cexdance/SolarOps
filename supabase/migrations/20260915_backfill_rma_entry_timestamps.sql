-- Backfill legacy service-order RMA entries that predate per-entry updatedAt.
-- Standalone RMAs are already stamped and are deliberately left unchanged.
-- Idempotent: only entries with a missing or blank updatedAt are changed.
begin;
set local lock_timeout = '5s';

create table if not exists public.rma_timestamp_backfill_backup_20260915 (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null,
  backed_up_at timestamptz not null default pg_catalog.clock_timestamp()
);

alter table public.rma_timestamp_backfill_backup_20260915 enable row level security;
revoke all on table public.rma_timestamp_backfill_backup_20260915
  from public, anon, authenticated;

insert into public.rma_timestamp_backfill_backup_20260915 (key, value, updated_at)
select a.key, a.value, a.updated_at
from public.app_data a
where a.key like 'job:%'
  and jsonb_typeof(a.value->'rmaEntries') = 'array'
  and exists (
    select 1
    from jsonb_array_elements(a.value->'rmaEntries') entry
    where nullif(pg_catalog.btrim(entry->>'updatedAt'), '') is null
      and nullif(pg_catalog.btrim(entry->>'createdAt'), '') is not null
  )
on conflict (key) do nothing;

update public.app_data a
set value = jsonb_set(
  a.value,
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
    from jsonb_array_elements(a.value->'rmaEntries') with ordinality entry(value, ordinality)
  ),
  false
)
where a.key like 'job:%'
  and jsonb_typeof(a.value->'rmaEntries') = 'array'
  and exists (
    select 1
    from jsonb_array_elements(a.value->'rmaEntries') entry
    where nullif(pg_catalog.btrim(entry->>'updatedAt'), '') is null
      and nullif(pg_catalog.btrim(entry->>'createdAt'), '') is not null
  );

commit;
