# Plan: `change_log` read/write separation

Status: ready to implement. Written 2026-08-23 against live data.
Closes the side door left open by `app_data_contractor_row_isolation` (shipped earlier today).

## Why this is not the `app_data` treatment

`app_data` got one predicate applied identically to SELECT, INSERT and UPDATE, because a
contractor has no business either reading or writing `customer:`/`job:` rows.

`change_log` is asymmetric. Contractors **must keep writing** it (every contractor-side edit
calls `logJobChange`), and they **never read** it. So the read and write policies diverge, and
that asymmetry is the whole design.

## Evidence this is safe (all verified, not assumed)

**Contractors write, never read.** `components/contractor/JobDetail.tsx` imports exactly
`logChange, logJobChange, describeUrl`. It calls `logJobChange` (line 480) and `logChange`
(lines 493, 544). It does not import or call `fetchLogForEntity` or `fetchLogForUser`.

**The only Supabase reads are staff surfaces.**

| caller | function | surface |
|---|---|---|
| `components/ServiceOrderPanel.tsx:759` | `fetchLogForEntity('job', job.id, 100)` | SO History tab (staff) |
| `components/admin/UserActivityLog.tsx:70` | `fetchLogForUser(userEmail, 200)` | admin activity log |

**Both read paths already degrade gracefully.** Each is wrapped in try/catch and does
`if (error || !data) return local;`. An RLS denial returns an empty set with no error, which
these treat as "no remote rows" and fall back to the local log. So even a mistake here cannot
throw in the UI. (Note the flip side: a denial is *silent*, which is why the verification step
below asserts row counts rather than trusting the screen.)

**`actor_uid` is already trustworthy.** Migration `20260804_change_log_server_stamped_actor.sql`
installed `change_log_stamp_actor_trg`, confirmed live. **4,210 rows written since 2026-08-05,
zero with a NULL `actor_uid`.** The 13,478 NULLs are all pre-migration. So `user_email` is
client-supplied and can lie, but `actor_uid` is server-stamped from `auth.uid()` and cannot, and
a mismatch between them makes a forgery visible. No work needed here.

**No server-side writer.** `grep -rn change_log api/` returns nothing, so no serverless function
depends on these policies. (`service_role` bypasses RLS regardless.)

## Current state

```
change_log: RLS enabled, 2 policies, 0 role-aware
  team_read   SELECT  using       (auth.role() = 'authenticated')
  team_insert INSERT  with check  (auth.role() = 'authenticated')
```
No UPDATE policy and no DELETE policy, so the table is already append-only at the RLS layer.

17,838 rows, 29 MB, oldest 2026-04-15. **13,299 rows contain an email address; 957 are customer
entities.** Any authenticated contractor can read all of it today.

---

## Step 1 (the fix): role-aware SELECT, INSERT untouched

```sql
-- Contractors write the audit log (logJobChange on every contractor-side edit)
-- but never read it: contractor/JobDetail.tsx imports only logChange/logJobChange,
-- and the two Supabase read paths (ServiceOrderPanel SO History, admin
-- UserActivityLog) are staff-only surfaces. So SELECT and INSERT diverge here,
-- unlike app_data where one predicate covered both.
--
-- Role source matches lib/authRouting.ts isContractorAccount() exactly:
-- user_metadata.role === 'contractor'. Everything else, including a missing
-- role, an empty user_metadata, and dual-role staff carrying isContractor, is
-- staff and keeps full read.
drop policy if exists team_read on public.change_log;

create policy team_read on public.change_log for select
using (
  auth.role() = 'authenticated'
  and coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') <> 'contractor'
);

-- team_insert is deliberately NOT changed. Contractors must keep writing, and
-- actor_uid is already server-stamped by change_log_stamp_actor_trg, so an
-- `actor_uid = auth.uid()` check here would be redundant with the trigger.
--
-- Still no UPDATE and no DELETE policy: the audit log stays append-only.
```

**Extension point, deliberately not built:** if a contractor-facing "my activity" view is ever
wanted, the predicate becomes `... <> 'contractor' or actor_uid = auth.uid()`. That is safe
*only* because `actor_uid` is trigger-stamped. Do not key it off `user_email`, which is forgeable.

## Step 2 (client, small): make the audit push genuinely append-only

`lib/changeLog.ts` `pushEntry` uses `.upsert(...)` with no conflict option. On a retry of an
entry that already landed (insert succeeded, the local "mark synced" write did not), the upsert
takes the UPDATE path, which **no policy allows**, so it errors, is swallowed by the catch, is
never marked synced, and is retried on every subsequent flush. A slow leak, not an outage.

```ts
// Append-only: an audit row is never rewritten. ON CONFLICT DO NOTHING also
// makes a redelivery cheap instead of an RLS violation, since no UPDATE policy
// exists on change_log by design.
.upsert({ ... }, { onConflict: 'id', ignoreDuplicates: true })
```

Independent of Step 1 and safe to ship on its own.

## Step 3 (hygiene, optional): index the user lookup

`fetchLogForUser` filters `.eq('user_email', email)` and there is no index on `user_email`
(indexes today: `id` pkey, `created_at desc`, `(entity_type, entity_id)`, `op_type`). That is a
sequential scan over 29 MB on every admin activity view.

```sql
create index concurrently if not exists change_log_user_email_idx
  on public.change_log (user_email, created_at desc);
```
`concurrently`, so it cannot lock writes. Run outside a transaction.

## Step 4 (deferred, needs a decision): retention

~4,210 rows in the last ~3 weeks, so roughly 70k rows/year and 29 MB and climbing. `trimLog` is
localStorage-only; nothing trims the server side. Options: time-based delete, or partition by
month. **Needs a call on the legal/audit retention period before anything deletes.** Explicitly
out of scope here.

---

## Verification, before and after

Same method that verified `app_data`: run inside a transaction, simulate each JWT shape, assert
row counts, `rollback`. Nothing is committed until the numbers are right.

```sql
begin;
-- (paste the Step 1 policy here)
set local role authenticated;
create temp table probe(who text, visible int) on commit drop;

select set_config('request.jwt.claims','{"role":"authenticated","sub":"1","user_metadata":{"role":"contractor"}}',true);
insert into probe select 'contractor', count(*) from public.change_log;              -- expect 0

select set_config('request.jwt.claims','{"role":"authenticated","sub":"2","user_metadata":{"role":"admin"}}',true);
insert into probe select 'admin', count(*) from public.change_log;                   -- expect 17838

select set_config('request.jwt.claims','{"role":"authenticated","sub":"3","user_metadata":{}}',true);
insert into probe select 'no role (staff)', count(*) from public.change_log;         -- expect 17838

select set_config('request.jwt.claims','{"role":"authenticated","sub":"4","user_metadata":{"role":"support","isContractor":true}}',true);
insert into probe select 'dual-role staff', count(*) from public.change_log;         -- expect 17838

-- The write that MUST survive: a contractor logging a job change.
select set_config('request.jwt.claims','{"role":"authenticated","sub":"1","user_metadata":{"role":"contractor"}}',true);
insert into public.change_log(id,op_type,entity_type,entity_id,payload,user_email,device_id)
values ('rls-probe-'||gen_random_uuid(), 'job.contractor_update','job','probe','{}'::jsonb,'c@x.com','dev');
insert into probe values ('contractor', -1);  -- marker: contractor INSERT allowed

select * from probe;
rollback;
```

Then, after applying for real, re-run the four SELECT probes without the policy DDL to confirm
the live policies behave identically.

**Post-deploy, in the app:** open a Service Order's History tab as staff and confirm entries
still render (this is the `fetchLogForEntity` path). The silent-fallback behaviour means an
empty History tab is the failure signature, not an error toast.

## Rollout order

Unlike `app_data`, order does not matter here: no client change is required for Step 1, because
contractors already never read. Steps are independent.

1. Step 1 dry run, then apply. **This is the one that closes the exposure.**
2. Step 2 client fix, ship normally through CI.
3. Step 3 index.
4. Step 4 deferred pending a retention decision.

## Rollback

```sql
drop policy if exists team_read on public.change_log;
create policy team_read on public.change_log for select
using (auth.role() = 'authenticated');
```
Instant and total. No data is modified by any step, so there is nothing to restore.

## Residual risk after this lands

- Contractors keep INSERT on `change_log`, so a malicious contractor can still write *noise*
  into the audit log. They cannot forge the actor (`actor_uid` is trigger-stamped) and cannot
  read or modify existing entries. Rate limiting is not proposed; the write is required for the
  product to function.
- Pre-2026-08-05 rows have NULL `actor_uid` and only the forgeable `user_email`. Historical
  attribution before that date is weaker. Nothing to do about it retroactively.
- **`customer-files` is still a public bucket (2,371 objects).** After this, that is the largest
  remaining data exposure and should be next.
