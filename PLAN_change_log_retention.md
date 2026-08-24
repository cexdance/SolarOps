# `change_log` upkeep and retention

Written 2026-08-23 against live data. Table: 17,838 rows, 29 MB, oldest 2026-04-15.

## Headline: you do not have a retention problem

I flagged this as "70k rows/year and climbing." That framing was wrong, and the data says so.

**27 rows hold 13.5 MB of the 29 MB table.** Not 17,838 rows. Twenty-seven.

Deleting by age would throw away thousands of small, useful rows and barely dent the size, while
leaving the actual cause untouched. The size problem is payload bloat, and it is **already fixed**.

## What is actually in there

### By operation, worst first

| op_type | rows | payload total | avg | max |
|---|---:|---:|---:|---:|
| `job.update` | 2,300 | **15 MB** | 6.6 KB | **1,430,960** |
| `job.contractor_update` | 5,577 | 3.0 MB | 568 B | 1,487 |
| `job.field_update` | 7,165 | 2.5 MB | 368 B | 416 |
| `photo.delete` | **15** | **1.4 MB** | **99,938** | 639,590 |
| `customer.update` | 331 | 632 KB | 1.9 KB | 5,747 |
| `photo.add` | 958 | 265 KB | 283 B | 290 |
| everything else (25 op types) | 1,492 | ~900 KB | small | small |

Two anomalies carry nearly half the table:

- **`job.update` → `woPhotos`**: 24 rows, **12 MB**, one value at 1.43 MB. The entire photo array
  was being snapshotted into the audit payload.
- **`photo.delete` → `url`**: 3 rows, 1.46 MB, all three confirmed base64 `data:` URLs. The full
  image bytes were stored in the audit log.

### By month, which shows it is historical

| month | rows | bytes | rows w/ `woPhotos` | their bytes | biggest row |
|---|---:|---:|---:|---:|---:|
| 2026-04 | 12 | 14 KB | 0 | 0 | 2,590 |
| **2026-05** | **1,179** | **13 MB** | 401 | **13 MB** | **1,430,960** |
| 2026-06 | 5,236 | 2.8 MB | 45 | 47 KB | 4,640 |
| 2026-07 | 5,232 | 4.3 MB | 39 | 35 KB | 639,590 |
| 2026-08 | 6,179 | 3.3 MB | 30 | 27 KB | 4,257 |

May 2026 is the whole problem. From June on, rows still carry a `woPhotos` key but it averages
about 1 KB, because it is now photo *metadata* rather than photo *bytes*. July's single 639 KB
row is the last of the base64 `photo.delete` entries.

**This was already fixed, twice, by work that predates me:** photos moved to Supabase Storage,
and `describeUrl()` now rewrites any `data:` URL to `[data:image/jpeg 639315 bytes]` before it is
logged. Both are live.

### Steady state today

**5,549 rows/month, 3.38 MB/month.** That is ~66k rows and ~40 MB per year. For Postgres that is
nothing. A table like this becomes interesting somewhere north of 50-100M rows.

## What I recommend

### 1. Reclaim the 13 MB (optional, biggest single win)

Rewrite the ~401 May rows to replace the heavy `woPhotos` value with a marker, keeping the audit
record itself:

```sql
-- Strips the BYTES, keeps the FACT. The row, its actor, its timestamp and every
-- other field survive; only the oversized value is replaced, and the replacement
-- announces itself so the edit is never mistaken for original content.
update change_log
set payload = jsonb_set(
      payload, '{woPhotos}',
      jsonb_build_object(
        '_stripped', 'woPhotos',
        '_reason',   'oversized photo snapshot, reclaimed 2026-08-23',
        'count',     jsonb_array_length(payload->'woPhotos'),
        'bytes',     pg_column_size(payload->'woPhotos')))
where payload ? 'woPhotos'
  and pg_column_size(payload->'woPhotos') > 20000;
```

**This mutates the audit log, so it is your call, not mine.** The argument for: the photo bytes
were never audit evidence, the photos themselves live in Storage, and a 1.43 MB row is a liability
in every backup and every query plan. The argument against: an audit trail you edit is an audit
trail you can edit. The marker exists so the edit is self-declaring.

Runs as a migration (RLS has no UPDATE policy, and it should not get one; migrations run as
`postgres`, which bypasses RLS). Follow with `vacuum (analyze) change_log` to reclaim the space
into the table. Do **not** use `VACUUM FULL`, it takes an exclusive lock.

If you would rather not touch history at all, that is a defensible answer. The table is 29 MB.

### 2. Retention policy

Retention should follow the *value* of the record, not its age alone. Three tiers:

| tier | ops | keep | rows today | why |
|---|---|---|---:|---|
| **A. Never auto-delete** | `*.create`, `*.delete`, `customer.merge`, `user.permits_changed`, `user.update`, `contractor.paid_notified`, `job.contractor_schedule_*` | indefinite | ~700 | Lifecycle, permission and money events. Tiny volume, highest evidentiary value. These are the ones you would actually want in a dispute. |
| **B. Standard audit** | `job.update`, `job.field_update`, `job.contractor_update`, `customer.update`, `photo.add`, `photo.delete`, the 2026-06-12 remediation ops | **24 months** | ~16,800 | "Who changed this work order and when." Useful well past a job's close-out; rarely useful past two years. |
| **C. Telemetry, not audit** | `photo.upload_start`, `photo.upload_success`, `photo.upload_fail`, `storage.warning` | **90 days** | 331 | Operational debugging output. It answers "did the upload work last week," never "who did this." |

At 5,549 rows/month, tier B stabilises around 133k rows / ~80 MB and stops growing. That is a
healthy steady state that never needs revisiting.

**The one thing I cannot decide for you:** whether any legal, contractual, insurance or warranty
obligation requires longer. Solar work touches permits, warranties and lien windows, and those
periods are often longer than two years. **If any such requirement exists, it overrides tier B
entirely and the answer is simply "keep everything," which at 40 MB/year is affordable for a
decade.** Check before enabling any deletion. Tier A is written to be safe either way.

### 3. How to run the upkeep

`pg_cron` is available on this project but **not currently installed** (installed extensions:
`pg_stat_statements`, `pgcrypto`, `plpgsql`, `supabase_vault`, `uuid-ossp`). Enable it from the
Supabase dashboard under Database → Extensions, then:

```sql
-- Monthly, 03:10 UTC on the 1st. Deletes are batched so the job never holds a
-- long lock on a table that contractors are actively inserting into.
select cron.schedule('change_log-retention', '10 3 1 * *', $$
  with doomed as (
    select id from public.change_log
    where (
      -- Tier C: telemetry, 90 days
      (op_type in ('photo.upload_start','photo.upload_success','photo.upload_fail','storage.warning')
       and created_at < now() - interval '90 days')
      or
      -- Tier B: standard audit, 24 months. Tier A is excluded by omission.
      (op_type in ('job.update','job.field_update','job.contractor_update','customer.update',
                   'photo.add','photo.delete','customer.address_reaudit','customer.audit_reapply',
                   'customer.sweep_restore','customer.comment_restore','job.comment_restore',
                   'job.photo_dedupe_repair','customer.import_update','job.note_update')
       and created_at < now() - interval '24 months')
    )
    limit 20000
  )
  delete from public.change_log c using doomed d where c.id = d.id;
$$);
```

Note the design: the tier lists are **allow-lists, not deny-lists**. A new `op_type` that nobody
adds to this job is never deleted. That is the correct default for an audit log, and it is the
opposite of what a `where created_at < x` sweep would do.

`limit 20000` caps each run. Nothing today comes close, but it means the first run after a long
gap cannot turn into an hour-long transaction.

No `DELETE` policy is needed or wanted on the table: cron runs as `postgres` and bypasses RLS,
while application users stay unable to delete audit rows. That is exactly right.

**If you would rather not install pg_cron**, the same statement works as a Supabase Scheduled Edge
Function, or honestly as a calendar reminder to run it by hand once a quarter. At this volume the
scheduling mechanism matters far less than having the policy written down.

### 4. Performance

Already healthy, and one thing was fixed today:

- `change_log_user_email_idx (user_email, created_at desc)` was added this session. `fetchLogForUser`
  had been sequentially scanning 29 MB on every admin activity view.
- `change_log_entity_idx (entity_type, entity_id)` already serves the SO History tab.
- `change_log_created_idx (created_at desc)` serves the retention delete above.

**Do not partition this table.** Partitioning earns its keep in the hundreds of millions of rows.
At 66k/year it would add operational complexity and buy nothing.

The genuine performance risk is not row count, it is a repeat of May: one 1.4 MB row makes every
query touching it slow and bloats every backup. Which leads to the last item.

### 5. The real preventative

Cap payload size on the way in, so a future May cannot happen. `slimPayload()` already exists in
`lib/changeLog.ts` but is deliberately applied only to the localStorage copy; the comment states
that the full payload goes to Supabase as the real audit store. That reasoning is sound, but it
assumes payloads are bounded, and `woPhotos` proved they are not.

Cheapest durable guard, at the database rather than in five call sites:

```sql
alter table public.change_log
  add constraint change_log_payload_size
  check (pg_column_size(payload) <= 65536);
```

64 KB is ~10x the current worst legitimate row (4,257 bytes in August) and ~1/20th of the May
outlier. A violation surfaces as a failed insert the day someone reintroduces the bug, rather than
as a 15 MB table three months later. **Apply this only after step 1**, or the existing fat rows
will make the constraint fail validation.

## Suggested order

1. Decide the legal retention question. Everything else waits on it.
2. Apply the 64 KB payload constraint (after the strip in step 1, if you do it). This is the fix
   that prevents recurrence, and it is one line.
3. Optionally strip the 401 May rows and `vacuum (analyze)`.
4. Install `pg_cron` and schedule the retention job.

Steps 2 and 3 are worth doing regardless. Step 4 is genuinely not urgent: at 40 MB/year you could
leave this table entirely alone for five years and be fine. The value in scheduling it now is that
the policy gets written down while the reasoning is fresh, not that the bytes matter.

---

# DECISION (2026-08-23): warranty record lives on the service order

Owner's call: the 24-month warranty record is the **service order itself**, not `change_log`.
That settles the legal question and simplifies retention. It also has a consequence that needs
recording, because it is not obvious.

## Consequence: for 36 service orders, `change_log` IS the only surviving record

Verified against live data:

| | |
|---|---:|
| `job.delete` events | 42 |
| ...that were real service orders (had a `woNumber`) | **36** |
| ...deleted while `paid` or `completed` | **5** |
| ...that were leads/drafts (no `woNumber`) | 6 |
| most recent deletion | 2026-08-20 |

Deleting a service order is a **hard delete**. `syncEngine.ts:1030` reaps tombstoned rows with
`supabase.from('app_data').delete().in('key', keys)` and the row is gone from Postgres. There is
no soft-delete tier and no recovery path.

So for those 36 orders, the only thing that still describes them is the `snapshot` inside their
`job.delete` audit row (~2.1 KB each). **Five of them were completed or paid work, which is
precisely what a 24-month warranty covers.**

**Therefore `job.delete`, `customer.delete` and `customer.merge` are not merely "tier A, low
volume." They are warranty evidence and must never be deleted by any retention job, ever.** The
tier A list above already excludes them from deletion; this is the reason it must stay that way.

Note the snapshot averages ~2.1 KB, so it holds the job's fields but **not** its photos. Photo
evidence for a deleted service order is not in `change_log`; whatever remains is orphaned in the
`customer-files` bucket with nothing pointing at it.

## Second finding: the tombstone reap is currently a silent no-op

`app_data` has **0 DELETE policies**. PostgREST returns success with zero rows affected when RLS
blocks a delete, and the reap only inspects `error`:

```ts
const { error } = await supabase.from('app_data').delete().in('key', keys);
if (error) console.warn(...)          // never fires: RLS denial is not an error
```

Live state confirms the split: 29 job ids and 921 customer ids are tombstoned, but **7 job rows
and 1 customer row are still physically present**. The rest were removed back when deletes still
went through. So the code believes it is reaping and is not.

Right now that failure is *protective*: it is the only reason recently deleted service orders
still exist in the database at all. But a silent failure that happens to help is not a design, and
it should not be left as one.

**Two coherent options, and this is a product decision, not a technical one:**

1. **Service orders are never hard-deleted** (fits the warranty position). Make the intent
   explicit: keep the reap for leads/drafts only, or replace deletion with an archived/void state.
   The current accidental behaviour becomes the documented behaviour.
2. **Deletion really means deletion.** Add a DELETE policy so the reap works, and accept that
   deleting an order destroys the warranty record, with the `job.delete` snapshot as the only trace.

Either way, **make the reap report reality**: check the affected-row count rather than only
`error`, so "I deleted 29 rows" and "I deleted 0 rows" stop looking identical.

## Retention, settled

Because the warranty record is the service order, `change_log` carries no legal weight for
surviving orders, and tier B has no external deadline to satisfy.

- **Tier A (never delete): unchanged, and now load-bearing.** `*.delete`, `customer.merge`,
  permission and payment events. This is the warranty trace for the 36 deleted orders.
- **Tier B: 24 months** is fine, and could be 12. Nothing depends on it.
- **Tier C (telemetry): 90 days.**

**Recommendation: do not schedule the deletion job yet.** At 3.38 MB/month the table reaches
~200 MB in five years, which Postgres will not notice. Automating deletion buys nothing today and
introduces a job that can only ever destroy data. The policy above is written down; wire it up when
the table passes ~500 MB or when a query actually gets slow, whichever comes first.

What *was* worth doing immediately is shipped: the 64 KB payload guard, which prevents the only
problem this table has ever actually had.
