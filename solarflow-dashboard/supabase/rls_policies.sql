-- SolarOps - Row Level Security policies
-- Apply in the Supabase SQL editor (or via migration). Idempotent: safe to re-run.
--
-- Threat model
--   The browser app talks to Supabase with the ANON key but ALWAYS over an
--   authenticated session (Supabase Auth). Without RLS, the anon key allows
--   anyone on the internet to read and write every row in these tables.
--   These policies restrict direct table access to signed-in users only.
--   Server-side API functions use the SERVICE ROLE key, which bypasses RLS,
--   so the serverless endpoints keep working unchanged.
--
-- Role-based field visibility (admin vs staff vs contractor) is NOT enforced
-- here. The app stores the entire org dataset in a single shared KV row set
-- (app_data: key TEXT, value JSONB), so RLS cannot strip financial fields per
-- role at the row level. That gating lives in the app/view layer:
--   src/lib/access.ts          - canSeeFinancials / FINANCIAL_VIEWS
--   src/App.tsx                - route guard for financial views
--   src/components/Layout.tsx  - nav + mobile bottom bar gating
--   src/components/Dashboard.tsx - hides money widgets from non-admins
-- RLS below is the perimeter (authenticated-only); access.ts is the field-level
-- policy. Keep both in sync.

begin;

-- ── app_data: shared org KV (read/write by any signed-in user) ──────────────
alter table public.app_data enable row level security;

drop policy if exists "app_data authenticated read"  on public.app_data;
drop policy if exists "app_data authenticated write" on public.app_data;

create policy "app_data authenticated read"
  on public.app_data for select
  to authenticated
  using (true);

create policy "app_data authenticated write"
  on public.app_data for all
  to authenticated
  using (true)
  with check (true);

-- ── change_log: append-only audit trail (signed-in users only) ──────────────
alter table public.change_log enable row level security;

drop policy if exists "change_log authenticated read"  on public.change_log;
drop policy if exists "change_log authenticated write" on public.change_log;

create policy "change_log authenticated read"
  on public.change_log for select
  to authenticated
  using (true);

create policy "change_log authenticated write"
  on public.change_log for all
  to authenticated
  using (true)
  with check (true);

-- ── notifications: DELIBERATELY NOT DEFINED HERE ────────────────────────────
-- Removed 2026-08-03. This block used to declare:
--
--   create policy "notifications authenticated read"
--     on public.notifications for select to authenticated using (true);
--   create policy "notifications authenticated write"
--     on public.notifications for all to authenticated using (true) with check (true);
--
-- `for all ... using (true) with check (true)` would let any signed-in account
-- read, forge, alter or delete anyone else's notifications through the client
-- SDK, bypassing api/notify.ts. Mention notifications quote the message body and
-- name the sender, so it would leak staff conversation content across accounts.
--
-- It was never applied. Production has always run the correct owner-scoped
-- policies (verified 2026-08-03). But it sat one `psql -f rls_policies.sql` away
-- from replacing them, and having two files disagree meant the live policy could
-- not be determined from the repo at all.
--
-- notifications RLS lives in ONE place now:
--   solarflow-dashboard/supabase/notifications_table.sql
-- Do not add notifications policies to this file.

-- ── quote_approvals: customer quote sign-off ────────────────────────────────
-- Touched ONLY by service-role API functions (api/approve-quote.ts,
-- api/send-quote.ts). The public customer never hits this table directly.
-- Enable RLS with NO permissive policy so anon and authenticated clients are
-- denied; service role still bypasses RLS. This closes prior open anon access.
alter table public.quote_approvals enable row level security;

drop policy if exists "quote_approvals anon read"  on public.quote_approvals;
drop policy if exists "quote_approvals anon write" on public.quote_approvals;
drop policy if exists "Enable read access for all users" on public.quote_approvals;
drop policy if exists "Enable insert for all users"      on public.quote_approvals;

commit;
