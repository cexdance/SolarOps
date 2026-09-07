# Council synthesis, database level, 2026-09-07

Council: fatso (data flow), karen (render path), plus live read-only verification against production Supabase by the orchestrator. Inputs: `DB_COUNCIL_fatso.md`, `DB_COUNCIL_karen.md`.

No data was changed. Everything below is read-only evidence.

## Complaint 2: partial sync, always missing some customers. CAUSE FOUND

`deleted_customer_ids` holds **984 ids**. There are **412** live `customer:*` rows. **62 of those 412 live customers are also on the tombstone list.**

```
live customer:* rows            412
deleted_customer_ids entries    984
live AND tombstoned              62
```

All 62 carry the identical `updated_at` of `2026-08-25 05:03:28.499792+00`, which is a single bulk write, not 62 human edits. That is the signature of a stale tab mass re-pushing its whole customer set (same pattern recorded for jobs in the 06-12 incident and the LL/Trello notes). The rows came back; the tombstone naming them was never cleared.

Result, and it matches the complaint exactly: a client that has adopted the tombstone list filters those 62 out; a client that has not still renders them. Per browser, inconsistent, and it never self-heals because `pullFromSupabase` UNIONs the remote `deleted_*_ids` into local on every poll, so clearing the tombstone locally is reverted within about 30 seconds.

Sample of affected real customers: TX-26022 Jose Flores, TX-26052 Kate Bugusky, TX-26054 Bill Kiker, TX-26041 Michael and Katy Rachui, US-15435 Jose Tobar, US-15661 Ed Chase, US-15657 Beresford Reid. 2 of the 62 carry file attachments.

Fix, smallest first: decide per id whether the row or the tombstone wins, then write the shortened `deleted_customer_ids` back to Supabase (a local clear alone is reverted by the next pull). The durable guard is that a resurrect-by-push must remove the id from the tombstone list in the same transaction, otherwise the two states stay contradictory forever.

Not yet decided: whether those 62 are meant to be deleted or meant to be live. That is a business call, not a code call.

## Complaint 1: uploaded document not visible to the other user. TWO PATHS, ONLY ONE SYNCS

There are two separate customer attachment systems, which is why the two reviewers described different code.

Path A, the synced one. `Customers.tsx` uploads through `lib/customerFileStorage.ts` to the Supabase Storage bucket `customer-files`, stores a real URL (not a data URL), and the metadata rides the per-record `customer:{id}` push. Receive-side union of `files` by id is correct in `mergeCustomerPair` (`syncEngine.ts:1441-1448`), and `pullPrefix` paginates correctly. Live evidence that this path works: **197 files across 61 customers are present in Supabase**, most recent 2026-09-04. Bucket `customer-files` is confirmed `public: true`, so a stored URL is readable by any user.

Path B, the local-only one. `CustomerManagement.tsx` (the CRM customer card, `App.tsx:3381`) has its own drag-and-drop attachment handler at `CustomerManagement.tsx:391-414` writing through `lib/customerStore.ts:28-63`, which is pure `localStorage`. No Supabase import, no `KV_SYNC_KEYS` registration, no `solarflow-remote-update` dispatch, and the component hydrates once at mount (`:249-270`) with no re-hydration listener. Anything dropped here never leaves the uploader's browser and can never be seen by anyone else.

Same shape as the `solarflow_contractor_notifications` dead-code incident.

Open question for the user: which screen was the document dropped on. If Path B, the file only exists in one browser's localStorage and is recoverable only from that machine. If Path A, the file is in Supabase and the problem is elsewhere.

## Hypotheses tested and cleared

Fatso's ranked causes were checked live and do not hold as deployed:

1. Cleared. The claim that `technician` is missing from `is_staff()` and the `user_roles` CHECK constraint is true of the migration file on disk but NOT of the deployed database. Live `is_staff()` reads `role in ('admin','coo','support','sales','technician')` and the live constraint is `'admin','coo','support','sales','technician','contractor'`. The migration file is superseded. No technician RLS lockout exists.
2. Cleared. Bucket `customer-files` is `public: true`. No 403 for non-uploaders.
3. Not reached. Role rows are also clean: every one of the 11 real staff and contractor accounts has a `user_roles` row matching its `raw_user_meta_data->>'role'`. Only two never-signed-in accounts (a pentest probe and a personal gmail) have no role, which is correct.

Karen's render-side pass: the `d61f477` hidden-column filter fix holds at `Customers.tsx:561`, and no other view repeats that shape. Not the cause here.

## Also noted, not the reported bug

- A legacy `customers` blob (264 entries, last written 2026-06-11) still coexists with the 412 per-record rows. 15 ids exist only in the blob, 163 only per-record. Stale, and a trap for anyone reading the wrong source.
- Many of the 62 resurrected rows share `clientId` `64793`, which is not a valid per-customer client number. Worth a separate look.
- `dropStaleRows` (`syncEngine.ts:841-879`) drops an entire stale customer push, including a fresh attachment, without trying `mergeCustomerPair` first. Narrow race, real.

## Recommended order

1. Decide the fate of the 62 contradicted customers, then write the corrected `deleted_customer_ids` to Supabase and hard-refresh every open tab.
2. Add the tombstone-removal-on-resurrect guard so this cannot recur.
3. Confirm which screen the document upload happened on, then either wire `customerStore.ts` into the sync engine or remove the Path B upload affordance so it stops silently eating files.
