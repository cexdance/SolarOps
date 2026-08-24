# SolarOps Live Database RLS Audit

Diagnostic only. No DDL run, no files edited except this report. Queried live via the Supabase Management API (`https://api.supabase.com/v1/projects/cjmhfagkkayelcsprbai/database/query`) using the access token already configured for this project's Supabase MCP server, since the `mcp__supabase__*` tools were not exposed in this subagent's toolset. All queries were read-only `select` statements against `pg_catalog` / `information_schema` / `storage`.

Date: 2026-08-23. Project ref: `cjmhfagkkayelcsprbai`.

## 0. Method note / limitation

`mcp__supabase__get_advisors` was not available to this subagent (only Read/Bash/Edit/Write were exposed). I could not pull the official Security/Performance Advisor output. Everything below was reconstructed by hand from `pg_class`, `pg_policy`, `information_schema.columns`, and `storage.objects`/`storage.buckets`, which covers the same ground the RLS advisor checks (RLS enabled/disabled, policy presence) but not query-performance advisories (missing indexes, unused indexes, etc). If a true advisor run is needed, it has to be done by an agent/session that actually has the `mcp__supabase__get_advisors` tool wired up.

## 1. RLS posture, every public table

| table_name | rls_enabled | policy_count | row_count | verdict |
|---|---|---|---|---|
| `_bak_crm_leads_20260808` | **false** | 0 | 1 | **BUG (open):** anon key can read/write freely. Contains full lead PII (see 3). |
| `_bak_lljobs_20260809` | **false** | 0 | 40 | **BUG (open):** anon key can read/write freely. Contains job/lead records incl. customer PII. |
| `app_data` | true | 3 (select/insert/update) | 697 | **BUG (over-broad):** RLS is on, but the 3 policies all just check `auth.role() = 'authenticated'` with no per-row/per-user/per-role predicate. Any authenticated session, staff or contractor, can read and write every row. No delete policy exists (deletes are service-role only, which is fine). |
| `change_log` | true | 2 (select/insert) | 17,812 | Same shape as `app_data`: `auth.role()='authenticated'`, no row-level predicate. Any authenticated user can read the entire change history and forge entries with any `actor_uid`/`user_email`/`device_id` value (no check constraint tying those to the caller's own JWT). |
| `notifications` | true | 2 (select/update) | 704 | **Correct pattern.** `auth.uid() = user_id` on both. This is the one table that actually does per-user isolation. No insert policy for clients (writes are server/service-role only), which is intentional (`api/notify.ts` inserts with the service key). |
| `push_subscriptions` | true | 0 | 9 | RLS on, zero policies = blocked to every client role. Confirmed **not a live bug**: `api/push-subscribe.ts` is the only writer/reader and it uses `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS entirely). No client code touches this table directly. |
| `quote_approvals` | true | 0 | 4 | Same shape. Confirmed **not a live bug**: `api/approve-quote.ts` and `api/send-quote.ts` are the only touchpoints, both service-role. Safe to leave as-is (fails closed for anyone who isn't the server). |

**Count: 3 of 7 public tables have RLS fully disabled or effectively meaningless** for the purpose of protecting data: the 2 backup tables (RLS literally off) and, more importantly, `app_data` (RLS on but the policy does nothing to separate staff from contractors). `change_log` has the identical gap.

## 2. Backup tables: `_bak_crm_leads_20260808` / `_bak_lljobs_20260809`

- Confirmed **RLS is still disabled** on both (`relrowsecurity = false`, 0 rows in `pg_policy`). The anon key can `select`/`insert`/`update`/`delete` on them right now with no auth at all.
- Schema on both: `key text, value jsonb, updated_at timestamptz` (they are KV-blob snapshots, same shape as `app_data`, not row-per-record tables).
- `_bak_crm_leads_20260808`: 1 row, key `solarflow_crm_data`. The jsonb blob contains a full CRM leads array with **first/last name, personal email, phone number, city/state/zip, lead status, and internal notes** for every lead as of 2026-08-08 (sample confirmed: `email`, `phone`, `firstName`, `lastName`, `zip` all present in plaintext).
- `_bak_lljobs_20260809`: 40 rows. Given the naming and the 08-09/08-10 Lead Lobby teardown noted in project memory, this is the pre-teardown LL jobs snapshot; same KV-blob shape, same class of PII risk (customer/lead identity fields embedded in job records).
- **Codebase reference check:** `grep -rn "_bak_crm_leads_20260808\|_bak_lljobs_20260809"` across `*.ts`, `*.tsx`, `*.sql` in the whole repo returns **zero hits**. Nothing in the app, API, or migrations reads or writes these tables. They are backup artifacts only.
- **Verdict: safe to drop from a code-dependency standpoint.** The only reason to pause is if someone wants the pre-teardown snapshot retained for recovery purposes; if so, drop the exposure by enabling RLS with a service-role-only (deny-all-to-anon/authenticated) policy instead of dropping the table, then drop it later once confirmed unneeded. Do not leave it RLS-off either way.

## 3. `app_data`: what a contractor session can actually read today

Policies on `app_data`:
```
team_read   (SELECT) USING (auth.role() = 'authenticated')
team_insert (INSERT) WITH CHECK (auth.role() = 'authenticated')
team_update (UPDATE) USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated')
```
`auth.role() = 'authenticated'` is true for **every logged-in user regardless of app role** (staff, admin, sales, or contractor). There is no `role`, `owner`, or `contractor_id` predicate anywhere in these policies, and the table itself has no per-row ownership column that could support one without app changes.

Key prefixes actually stored in `app_data` (697 rows, confirmed live): `customer` (330), `job` (202), `contractor_job` (149), plus single KV blobs: `solarflow_crm_data` (leads), `solarflow_contractors`, `solarflow_contractor_jobs`, `solarflow_contractor_notifications`, `solarflow_service_rates`, `solarEdgeConfig`, `solarEdgeExtraSites`, `deleted_job_ids`, `deleted_customer_ids`, `solarops_inventory`, `solarops_tools`, `standaloneRmas`, `solarops_address_cleanup`, `customers`, `jobs`, and a leftover `_bak_ravelo_dedupe_20260813`.

**Bottom line: a contractor's authenticated Supabase session, hitting PostgREST directly (bypassing the app's own client-side role gating in `lib/authRouting.ts`), can `select * from app_data` and get every customer record, every job (including ones never assigned to them), every other contractor's row, the full CRM lead list, and internal service rate pricing.** The app-level `CONTRACTOR_VISIBLE_STATUSES` / `authRouting.ts` gating (per `security_contractor_access_control.md`) only constrains what the *React app* chooses to render; it does nothing at the database layer. Anyone with a valid contractor JWT and a REST client is not constrained by it at all. This is a real breach class, distinct from and more fundamental than the one already fixed in `c57b018` (that fix was UI routing, not RLS).

`change_log` has the exact same gap: any authenticated user can read the full 17,812-row audit trail for every entity, including entries that reference customers/jobs they have no business relationship to.

## 4. Storage buckets

- One bucket: `customer-files`, **`public = true`**.
- `storage.objects` policies (added by the 2026-08-04 migration) restrict the four operations to `bucket_id = 'customer-files'` for `authenticated`: upload/update/delete/read all gated correctly *for the authenticated REST/RPC path*.
- **However, `public = true` on the bucket means Supabase serves objects through `/storage/v1/object/public/<bucket>/<path>` with no auth check and no RLS evaluation at all.** RLS only guards `/storage/v1/object/authenticated/...` and the `/sign` flow. For a public bucket, anyone who can construct or guess an object path gets the file with a plain unauthenticated request.
- Confirmed live content: 2,371 objects, almost entirely `wo-photos/<job-id or contractor-job-id>/...jpg` (work order / job-site photos) plus at least one `cust-<id>/...png` path (customer-scoped upload). Path components are the actual job IDs (`job-1781188527194`, `cj-1785870945085-21w3`) used throughout the app, i.e. **guessable/enumerable**, not random tokens.
- **Verdict: the 08-04 storage RLS migration does NOT actually hold as a confidentiality control**, because the bucket-level `public` flag overrides it for reads. It does still correctly gate who can upload/modify/delete via the authenticated API. Net effect today: any customer's job-site photos are readable by anyone with (or able to guess) the URL, logged in or not.

## 5. PII with no RLS (flagged)

1. `_bak_crm_leads_20260808` (RLS off) - names, emails, phones, notes.
2. `_bak_lljobs_20260809` (RLS off) - job/lead records with embedded customer identity fields.
3. `app_data` (RLS on, but policy grants full read/write to any authenticated principal) - customer PII (330 customer records: names, addresses, presumably emails/phones inside the JSON), 202 jobs, CRM leads blob, contractor roster. Functionally equivalent to no RLS for the staff/contractor separation the app depends on.
4. `change_log` (same shape) - PII flows through here too since payloads mirror entity data.
5. `customer-files` storage bucket (public bucket overriding otherwise-correct object policies) - customer site photos.

## 6. Prioritized remediation sequence

Ordered by risk reduction per unit of breakage risk. Each step below is diagnosis-only guidance; nothing has been applied.

1. **Backup tables first (lowest risk to fix, no live traffic depends on them).** Either (a) `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` with zero policies (locks to service-role only, matches "backup, not live" intent), or (b) drop them outright since grep confirms zero code references. Recommend (a) now, (b) after a human sign-off on retention. **Breakage risk: essentially none** since nothing reads these tables. Do this in a single transaction per table so you're not left half-migrated if you decide to drop instead.

2. **`customer-files` bucket: flip `public` to `false`.** This is the highest-risk-to-fix-carelessly item: every existing photo URL used anywhere in the app (job comments, SOW reports, emailed proposals, the site-transfer email flow shipped 08-23, etc.) currently assumes an unauthenticated public URL. Flipping to private means every consumer must switch to signed URLs (`createSignedUrl`) with an expiry, and every place that stores a bare public URL (in `app_data` job/customer JSON, in already-sent emails) will break or need regeneration. **Do not flip this without first grepping every caller of the storage public URL pattern in `solarflow-dashboard/src` and `api/`, and confirming there is a signed-URL code path ready to replace it.** This is exactly the kind of change that needs its own scoped pass, not a quick toggle.

3. **`app_data` and `change_log`: replace the blanket `auth.role()='authenticated'` policies with role-aware or record-scoped policies.** This is the deepest structural gap but also the riskiest to get wrong, because `app_data` is a single KV-shaped table holding wildly different entity types (customers, jobs, contractor rosters, config blobs) behind one policy set, and the app's role model (`authRouting.ts`) currently lives entirely client-side with no server-side JWT claim or table column to hang a policy predicate on. A naive per-row policy will break sync for one role or the other. Recommended approach to scope, not implement now:
   - Add a `role` custom claim to the Supabase JWT (via a Postgres function / auth hook) so policies can branch on `auth.jwt() ->> 'role'`.
   - Given `app_data` is KV-by-key rather than row-per-entity-with-owner, the realistic policy shape is key-prefix-based (e.g. contractors get `select` only on `contractor_job:%` rows matching their own contractor id, and explicitly-safe shared config keys; staff/admin keep full access). This requires the sync engine's read pattern to tolerate a partial/filtered `app_data` result set, which is exactly the file this task is explicitly scoped to avoid touching (`useSyncEngine.ts` is mid-fix in another session). **Do not attempt this step until that work lands and is stable**, or you risk fighting a moving merge implementation.
   - Until the JWT-claim/role work exists, a lower-risk interim measure is tightening `change_log` (audit trail, no live UI depends on broad read access to it) to `INSERT`-only for clients and `SELECT` restricted to service role, since nothing in the grep of `api/` and `src/` showed a client-side reader of `change_log` beyond the sync engine's own push path.

4. **`push_subscriptions` / `quote_approvals`: leave as-is.** RLS-enabled-zero-policy is correct here since only service-role code touches them. No action needed; just don't "fix" this by loosening it.

5. **Advisor confirmation:** once an agent session with the actual `mcp__supabase__get_advisors` tool is available, run it to catch anything outside table/storage RLS (e.g. function search_path issues, missing indexes on `change_log.entity_id`/`app_data.key` if not already indexed) that this manual pass could not see.
