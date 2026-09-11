---
date: 2026-09-10
status: source-reviewed-migration-unapplied
tags: [solarops, supabase, council, sync]
---

# Supabase database council

Scope: current repository and safe live GET requests. No production writes, schema changes, repairs, role changes, or storage changes were performed. Historical `DB_COUNCIL_fatso.md` was revalidated, not treated as current evidence. Source line references describe the inspected pre-fix sync implementation; the parallel sync council may move them.

## Ranked findings

1. **P1: inserts trust the client clock.** `solarflow-dashboard/src/lib/syncEngine.ts:223` supplies client `updated_at`; `solarflow-dashboard/supabase/migration.sql:63` and `migration_v1.7.0.sql:58` stamp only UPDATE. A newly inserted row from a fast-clock device can advance the incremental cursor into the future (`syncEngine.ts:1369`) and suppress normal subsequent changes. Prepared `supabase/migrations/20260910_app_data_server_timestamp.sql`, unapplied. It atomically replaces the existing trigger with INSERT OR UPDATE coverage using a dedicated, schema-qualified, invoker function with a pinned empty search path. Client RPC execution is revoked; access policies are untouched. Existing future timestamps and already-poisoned browser cursors require separate measured recovery; this migration does not rewrite them.

2. **P1: shared-key permissions bypass the intended customer/job boundary.** `supabase/migrations/20260825_app_data_role_from_table.sql:93-109` allows every authenticated user to modify any key except `customer:%` and `job:%`. This includes `deleted_customer_ids` and `deleted_job_ids`, adopted into staff tombstone unions at `syncEngine.ts:1255-1272`, and CRM/contractor/report configuration blobs listed at `:106-132`. A contractor can therefore hide staff records through tombstones under the checked-in policy without modifying a customer/job row. Live effective policies remain unverified. Remediation needs explicit per-key access and server-mediated contractor writes; blanket restriction would break current sync. No policy changes included.

3. **P1 conditional: legacy policy script can reopen protected tables.** `solarflow-dashboard/supabase/rls_policies.sql:31-57` creates unrestricted authenticated SELECT/ALL policies for app_data and change_log. The subsequent migrations remove different `team_*` policy names, so these permissive policies would survive if that script were applied. This would permit contractor reads, physical deletes, and audit modification. Whether those legacy policies exist live is unknown. Remove unsafe bootstrap definitions and inspect/drop the exact obsolete policy names through a reviewed forward migration; neither was performed here.

4. **P1: incomplete pulls can advance a shared cursor.** Historical current-source inspection found page errors return accumulated rows as success (`syncEngine.ts:1149-1153`) and the cursor advances using the combined job/customer results (`:1369`). A successful newer prefix can skip an older failed prefix/page. This was handed to the parallel sync implementation council; consult its final report/tests for correction status.

## Live evidence and stale historical findings

Safe service-role GETs against the project configured in `.env.vercel.prod` returned aggregate trusted roles: admin 4, contractor 4, support 2, COO 1, sales 2. No user identities or credentials were included in output. The storage bucket `customer-files` currently has `public=true`. No object bodies were fetched.

The historical fatso technician conclusion is stale: `20260825b_user_roles_permissions.sql:19-21,49-59` already adds technician to the CHECK and staff helper. There are currently no technician role rows. Live helper/constraint definitions still require SQL inspection. Private bucket settings do not explain the currently observed configuration; an actual second-user file request was not tested.

No Supabase SQL/MCP tool was exposed. Read-only REST access does not establish effective RLS definitions, triggers, grants, migration history, publication state, query plans, or index existence. No provider advisor result is claimed.

## Timestamp choice and remaining consistency limits

PostgreSQL defines `now()` as transaction-start time, while `clock_timestamp()` returns wall time at evaluation, even within a statement. The new trigger uses `pg_catalog.clock_timestamp()` so a transaction that began long before its write does not stamp that old start time. [PostgreSQL 15 date/time documentation](https://www.postgresql.org/docs/15/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT).

This is row-write time, not commit time. A transaction can write a row, remain uncommitted beyond the client's overlap window, and commit after another pull has advanced. Server clock adjustments can also move wall time backward. Therefore this migration removes client clock poisoning but does not establish a totally ordered change feed. Periodic complete reconciliation or a durable server change-stream/cursor design remains necessary for that stronger guarantee. Do not use `greatest(old.updated_at, clock_timestamp())`: that would preserve existing future poison.

## Performance and live inspection still needed

The incremental timestamp index is already declared at `solarflow-dashboard/supabase/migration_v1.7.0.sql:13-14`; do not add a redundant index speculatively. Verify live row counts, JSON payload sizes, `pg_indexes`, and representative `EXPLAIN (ANALYZE, BUFFERS)` on a safe environment before prescribing composite/prefix indexes. The helper comment claiming STABLE guarantees one evaluation per statement should not be treated as an execution-plan measurement.

Before applying the prepared migration, capture `pg_get_triggerdef` for all app_data triggers and `pg_get_functiondef` for their functions. Check for other timestamp writers, inspect future-dated rows using counts only, and verify the migration on a disposable database. Application behavior, RLS and actual authenticated upserts need staging coverage. The SQL below was prepared but not executed: no local PostgreSQL runtime was established during this review.

## Disposable regression SQL

Run only after applying the candidate migration to a disposable database with Supabase roles. This temp-table harness invokes the exact candidate function and checks INSERT, UPDATE, new-row UPSERT, conflict UPSERT, a NULL timestamp, and wall time after transaction start. It does not touch public.app_data or prove its RLS behavior.

```sql
begin;
create temporary table council_timestamp_probe (
  key text primary key,
  value jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
create trigger stamp_probe
  before insert or update on council_timestamp_probe
  for each row execute function public.app_data_stamp_updated_at();

do $$
declare
  lower_bound timestamptz;
  stamped timestamptz;
begin
  perform pg_sleep(0.05);
  lower_bound := clock_timestamp();
  insert into council_timestamp_probe (key, updated_at)
    values ('insert', '2100-01-01') returning updated_at into stamped;
  if stamped < lower_bound or stamped > clock_timestamp() then
    raise exception 'INSERT trusted client clock or transaction start';
  end if;
  lower_bound := clock_timestamp();
  update council_timestamp_probe set updated_at = '1900-01-01'
    where key = 'insert' returning updated_at into stamped;
  if stamped < lower_bound or stamped > clock_timestamp() then
    raise exception 'UPDATE was not stamped';
  end if;
  lower_bound := clock_timestamp();
  insert into council_timestamp_probe (key, updated_at) values ('upsert', '2100-01-01')
    on conflict (key) do update set updated_at = excluded.updated_at
    returning updated_at into stamped;
  if stamped < lower_bound or stamped > clock_timestamp() then
    raise exception 'UPSERT INSERT was not stamped';
  end if;
  lower_bound := clock_timestamp();
  insert into council_timestamp_probe (key, updated_at) values ('upsert', '1900-01-01')
    on conflict (key) do update set updated_at = excluded.updated_at
    returning updated_at into stamped;
  if stamped < lower_bound or stamped > clock_timestamp() then
    raise exception 'UPSERT UPDATE was not stamped';
  end if;
  lower_bound := clock_timestamp();
  insert into council_timestamp_probe (key, updated_at) values ('null', null)
    returning updated_at into stamped;
  if stamped is null or stamped < lower_bound or stamped > clock_timestamp() then
    raise exception 'NULL INSERT was not stamped';
  end if;
  if has_function_privilege('anon', 'public.app_data_stamp_updated_at()', 'execute')
     or has_function_privilege('authenticated', 'public.app_data_stamp_updated_at()', 'execute') then
    raise exception 'Client RPC execute remains granted';
  end if;
end;
$$;
rollback;
```

Inspect the applied trigger separately in staging:

```sql
select pg_get_triggerdef(oid)
from pg_trigger
where tgrelid = 'public.app_data'::regclass and not tgisinternal;
```

Expect `set_app_data_updated_at` to cover both INSERT and UPDATE and invoke `public.app_data_stamp_updated_at()` (schema may be omitted in rendered output). The function contains no table access and needs no SECURITY DEFINER privileges.

## Rollback SQL

This restores the checked-in previous trigger, not an unknown customized live definition. Prefer the exact pre-application captured definition if production differs. The old shared `public.set_updated_at()` function is deliberately left unchanged by the forward migration. Rollback restores the old INSERT clock weakness; use only for a demonstrated regression.

```sql
begin;
drop trigger if exists set_app_data_updated_at on public.app_data;
create trigger set_app_data_updated_at
  before update on public.app_data
  for each row execute function public.set_updated_at();
drop function public.app_data_stamp_updated_at();
commit;
```

No migration was applied. No existing timestamp, cursor, permission, role, backup, or customer record was repaired during this council task.
