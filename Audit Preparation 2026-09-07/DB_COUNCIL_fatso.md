DB / data-flow audit: customer document visibility and partial customer sync
Scope: read-only code audit. No data changed. No live Supabase query tool was
available in this session (no supabase MCP tools exposed), so anything marked
"VERIFIED (code)" is confirmed by reading the checked-in source and migration
files; anything marked "NEEDS LIVE CHECK" requires an actual Supabase query to
confirm against the running database, which I did not have access to run.

## Top 3 ranked root causes

### 1. RANKED #1: `is_staff()` and the `user_roles` CHECK constraint both omit
   the 'technician' role, so any technician-role user is silently denied all
   read AND write access to customer:/job: rows under the 2026-08-25 RLS
   rewrite. This explains both complaints simultaneously.

   Evidence (VERIFIED by reading the files):
   - `src/types/index.ts:7`: `export type UserRole = 'admin' | 'technician' | 'coo' | 'support' | 'sales';`
     'technician' is a first-class staff role. `src/components/Layout.tsx:79-84`
     grants technicians full nav access to Customers/Jobs/Dispatch.
     `src/components/admin/UserPermissionsPanel.tsx:25`: `ROLES = ['admin','coo','support','sales','technician']`,
     and its default state is `useState<UserRole>('technician')` (line 328) -
     it is the app's ordinary default role, not an edge case.
   - `api/users.ts:6`: `STAFF_ROLES = new Set(['admin','coo','support','sales','technician'])`.
     The admin API accepts and will attempt to persist role='technician'.
   - `supabase/migrations/20260825_app_data_role_from_table.sql`:
     - Line 31: `user_roles.role` has `check (role in ('admin','coo','support','sales','contractor'))`.
       'technician' is NOT in this list, so any INSERT/UPDATE of
       `user_roles` with role='technician' violates the CHECK constraint and fails.
     - Line 51: the one-time bootstrap that seeded `user_roles` from existing
       `user_metadata.role` also filters `role in ('admin','coo','support','sales','contractor')`,
       so any account that already had `user_metadata.role = 'technician'`
       before this migration ran got ZERO row inserted into `user_roles`.
     - Lines 58-70, `is_staff()`: `role in ('admin','coo','support','sales')`
       - again no 'technician'. A technician can never satisfy `is_staff()`.
     - Lines 82-110: `team_read`/`team_insert`/`team_update` on `app_data` use
       `is_staff() OR (key not like 'customer:%' and key not like 'job:%')`.
       For a technician, `is_staff()` is always false, and every `customer:`/
       `job:` key fails the second clause, so **every SELECT/INSERT/UPDATE on
       customer:/job: rows from a technician's session is denied by RLS.**
   - Consequence for `api/users.ts`: `upsertRoleRow` (line 43) will fail its
     Supabase REST call whenever `role='technician'` because of the CHECK
     constraint. In `POST` (line 195) a failed upsert deletes the just-created
     auth user and returns 500 - so newly created technicians via the admin
     UI fail loud. In `PATCH` (line 240) a failed upsert returns 500 "Failed to
     update role" - so promoting an existing user to technician via the admin
     UI also fails loud. That means the only way a live account currently has
     `role: 'technician'` is if it predates the 08-25 migration and was never
     touched by `PATCH /api/users` since (its `user_metadata.role` still says
     technician, its `auth.jwt()` claims may still say technician, but its
     `user_roles` row is either absent or, if someone attempted a fix via the
     UI, still failed).

   Why this produces complaint 1 (documents invisible to other users):
   A technician who edits a customer (adds a note, uploads a file) writes the
   file bytes fine (Storage bucket policies key off `authenticated`, not
   `is_staff()` - see item 3 below), but the customer-record write that
   attaches the file metadata (`customer.files`/`activityHistory`) goes through
   `handleUpdateCustomer` -> `pushToSupabase` -> `pushRows`
   (`src/lib/syncEngine.ts:210-216`), which does
   `supabase.from('app_data').upsert(...)`. That upsert is rejected by
   `team_insert`/`team_update` RLS for a `customer:{id}` key. `pushRows` throws
   (line 216), the outer catch in `pushToSupabase` (`src/lib/syncEngine.ts:1076-1083`)
   fires `markPushPending` and a misleading "Connection lost. Working
   offline..." toast, and the write is retried by the outbox forever without
   ever succeeding, because the failure is permanent (a permission denial),
   not transient. The uploaded file physically exists in Storage, but no
   customer record anywhere in `app_data` ever points at it, so no other
   browser's pull/Realtime can ever surface it.

   Why this produces complaint 2 (some customers always missing on one
   client): if the affected client is logged in as a technician, `pullPrefix`
   (`src/lib/syncEngine.ts:1117-1162`) queries `app_data` for
   `key like 'customer:%'`/`'job:%'` and RLS filters every row out - PostgREST
   returns `200` with an empty array, which is indistinguishable in the
   client from "nothing changed since last sync" (`error === null`). The
   client's local cache (whatever it loaded before 08-25, or before this
   account's session started) stays exactly as it was; new customers/jobs
   created afterward never arrive. That is precisely the "some customers are
   always missing on this one client" symptom, and it is silent: no error
   surfaces because the RLS-filtered empty result looks identical to a
   legitimate incremental no-op.

   Smallest fix: add `'technician'` to both the `user_roles` CHECK constraint
   and the `is_staff()` role list in a new migration (mirror
   `20260825_app_data_role_from_table.sql`'s pattern: `alter table
   public.user_roles drop constraint ...; add constraint ... check (role in
   ('admin','coo','support','sales','technician','contractor'));` then
   `create or replace function public.is_staff() ... where r.role in
   ('admin','coo','support','sales','technician')`). Then run a one-time
   backfill insert for any `auth.users` whose `user_metadata.role =
   'technician'` and has no `user_roles` row, exactly mirroring the bootstrap
   step in the existing migration. This is a database migration, not app code;
   flagging per instructions rather than authoring it here.

   NEEDS LIVE CHECK to confirm before treating as certain:
   - Query `select user_id, role from public.user_roles` and compare against
     `select id, raw_user_meta_data->>'role' from auth.users` to find any
     technician accounts missing a row (this is the population actually
     affected right now).
   - Query `app_data` as that user's JWT (`set local role authenticated; set
     local request.jwt.claims = ...`) to confirm `select` on a `customer:%`
     key returns 0 rows, confirming the RLS denial is real in the live DB
     (the migration is checked in and presumably applied, but "applied"
     should be confirmed, e.g. via `select proname from pg_proc where
     proname='is_staff'` and `select conname, pg_get_constraintdef(oid) from
     pg_constraint where conrelid = 'public.user_roles'::regclass`).

### 2. RANKED #2 (lower severity, narrower blast radius): Storage bucket
   `customer-files` visibility depends on the bucket-level `public` flag,
   which the app code never checks or falls back from. `customerFileStorage.ts`
   always calls `getPublicUrl` (line 89) and never `createSignedUrl`. Per
   `DB_RLS_AUDIT.md` (dated 2026-08-04), the bucket was confirmed live as
   `public = true`, which means the 2026-08-04 `storage.objects` RLS grant for
   `authenticated` SELECT is actually moot for reads (`public=true` bypasses
   RLS entirely and serves any object unauthenticated). That audit finding
   means storage RLS should NOT presently be blocking cross-user reads - but
   it is dated over a month before this audit, and nothing in the codebase
   enforces that flag or alerts if it changes. If any remediation from
   `DB_RLS_AUDIT.md` section 6 step 2 (flip `customer-files` to private) was
   ever applied without also switching the client to signed URLs, every
   existing and future customer file URL would silently 403 for every viewer
   except within a short-lived cached browser tab, which matches "the
   uploader can see it, nobody else can."
   NEEDS LIVE CHECK: `select public from storage.buckets where id =
   'customer-files'` and, from a second non-uploading authenticated user's
   session, an actual `fetch()` of a recent uploaded file's public URL to
   confirm it returns 200, not 400/403.
   Smallest fix if it has flipped to private: switch
   `uploadCustomerFile`/`allFiles` rendering to `createSignedUrl` with a
   reasonable TTL (or revert the bucket to public and keep the current code),
   whichever the security review actually intends per `DB_RLS_AUDIT.md`
   remediation step 2. Do not flip this blind; that document explicitly warns
   every caller of the public URL pattern must be found first.

### 3. RANKED #3 (defense-in-depth, not confirmed as an active incident):
   `dropStaleRows` (`src/lib/syncEngine.ts:841-879`) silently drops a customer
   push when the SERVER's `updatedAt` is newer than the LOCAL copy's, without
   attempting a merge first. For customers this is normally masked by
   `mergeCustomerPair`'s union-by-id on `files`/`activityHistory` at pull time
   (`src/lib/syncEngine.ts:1440-1448`), so a later pull usually recovers a
   dropped file attachment once this client pulls again. But if a client is
   offline or its pull is failing (for any reason, including cause #1 above)
   at the moment it tries to push a fresh file attachment, and the server
   copy is concurrently newer (e.g. someone else edited the same customer),
   the whole customer push - including the newly uploaded file's metadata -
   is dropped with only a `console.warn`, no user-facing message
   (`src/lib/syncEngine.ts:875-877`), and `markClean` is called on it (line
   869), so the record will NOT be retried until the user edits the customer
   again. This is consistent with "I attached a file and it vanished" reports
   under concurrent-edit conditions, distinct from cause #1's total,
   permanent block.
   Smallest fix: when `dropStaleRows` drops a customer row (not a job row,
   which already has per-field merge), re-run `mergeCustomerPair` against the
   just-fetched server copy before dropping, so the file/activity union still
   happens even when the rest of the record is stale, instead of discarding
   the whole write.

## What is verified working correctly (ruled out)

- `KV_SYNC_KEYS` / `KV_MERGERS` (`src/lib/syncEngine.ts:101-123`): customer
  documents are NOT stored in a KV blob at all, so a missing KV_SYNC_KEYS
  registration is not the mechanism here. Customers are per-record
  (`customer:{id}`) rows (`src/lib/syncEngine.ts:71`, `PREFIX.customer`).
- Pull pagination (`pullPrefix`, `src/lib/syncEngine.ts:1117-1162`) correctly
  paginates with `.range()` and a stable `.order('key')`, with an explicit
  comment documenting the PostgREST max-rows-truncation-with-error-null trap
  this repo hit before. This is not the cause of partial sync.
  `PULL_PAGE_SIZE = 200` (line 1110).
- Customer array hygiene: `files` and `activityHistory` are unioned by id on
  both the pull path (`mergeCustomerPair`, line 1441-1448) and the Realtime
  path (`src/hooks/useSyncEngine.ts:133-145`), so a stale client cannot wipe
  another client's uploaded files via whole-record LWW under normal
  (non-RLS-blocked) operation.
- Job tombstones and customer tombstones are unioned into local, never
  overwritten (`src/lib/syncEngine.ts:1245-1266`), and are re-pushed on the
  push side too (`src/lib/syncEngine.ts:999-1012`), so deletes propagate
  correctly; this is not a resurrection/removal bug for the reported
  symptoms.
- The upload path itself (`src/lib/customerFileStorage.ts`,
  `src/components/Customers.tsx:3257-3289` and `3588-3660`) uploads real bytes
  to Supabase Storage and stores a real URL (not a data: URL) in
  `customer.files`/`activity.attachments`, so this is not the "data URL
  embedded in a whole-record LWW save" hazard for this feature.
- Contractor accounts are correctly and deliberately excluded from
  customer:/job: sync entirely (`pullContractorScope`,
  `src/lib/syncEngine.ts:1177-1230`, and the push-side guard at
  `src/lib/syncEngine.ts:943-946`) - that is by design, not a bug, and is a
  different code path from the technician RLS gap in cause #1.

## Distinguishing the failure classes

- Authorization (cause #1, confirmed by code + migration inspection, not yet
  confirmed live): RLS denies the read/write outright. Symptom: total,
  permanent, silent (empty result set, not an error) for the affected
  account.
- Fetch/pagination: ruled out, correctly implemented.
- Merge: mostly correct (union-by-id for customer files/activity, per-field
  LWW for jobs); one narrow gap in cause #3 under a specific race.
- Local-cache/authorization interaction: the "stale local data never
  refreshes" symptom in complaint 2 is a direct consequence of cause #1, not
  a caching bug on its own - the cache is doing exactly what it should with
  an empty (RLS-filtered) pull result.
- Storage RLS: not the blocker per the most recent audit found in the repo,
  but that audit is over a month old and nothing in code guards against the
  bucket's public flag changing (cause #2).
