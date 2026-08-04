-- Stamp the audit log's actor server-side, so identity is a fact and not a claim.
--
-- WHAT IS ALREADY RIGHT (verified against production 2026-08-04, do not "fix")
--   * 13,475 entries back to 2026-04-15, 11,438 of them job.*
--   * payloads are audit-grade: job.contractor_update carries {status, woNumber,
--     changed}, job.field_update carries {fieldsUpdated, contractorId, source},
--     every row has device_id and a device fingerprint
--   * RLS is genuinely append-only. Live policies are exactly:
--       team_read    SELECT  qual       (auth.role() = 'authenticated')
--       team_insert  INSERT  with_check (auth.role() = 'authenticated')
--     There is NO update policy and NO delete policy, so both are default-denied.
--     Nobody can rewrite or erase history, and anonymous callers can do neither.
--
-- THE GAP
-- `user_email` is supplied by the CLIENT. logChange() takes it as an argument
-- (defaulting to the string 'unknown') and src/lib/changeLog.ts writes straight
-- to this table with the user's own session. Nothing server-side verifies it.
--
-- So any authenticated user can insert an entry claiming to be anyone. The log
-- cannot be edited or deleted, but it CAN be written with a false author. For a
-- log that gets used to settle a dispute, a forged entry is worse than a missing
-- one, because it looks exactly as credible as a real one.
--
-- Same class of bug as api/notify.ts trusting `notifierName` from the request
-- body, fixed 2026-08-03: the token is the only trustworthy claim about identity.
--
-- THE FIX
-- Add `actor_uid`, populated by a trigger from auth.uid() on every insert. A
-- DEFAULT would not be enough: a client can override a default by supplying the
-- column explicitly. A BEFORE INSERT trigger that assigns unconditionally cannot
-- be overridden.
--
-- `user_email` is deliberately left alone. It stays the client's claim, and
-- actor_uid becomes the verified fact. Keeping both is what makes a forgery
-- visible: an entry whose user_email does not correspond to its actor_uid is
-- evidence of tampering rather than a silently rewritten record.
--
-- Backfill is impossible by design. Rows written before this migration have no
-- verified actor, and inventing one would be worse than a NULL. NULL actor_uid
-- means "written before 2026-08-04, identity is claimed but unverified".
--
-- Safe to run repeatedly; every statement is idempotent.

alter table public.change_log
  add column if not exists actor_uid uuid;

comment on column public.change_log.actor_uid is
  'Server-stamped author, from auth.uid() at insert. Trustworthy, unlike user_email which is a client-supplied claim. NULL for rows written before 2026-08-04.';

create or replace function public.change_log_stamp_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Unconditional assignment. Ignores whatever the client sent for this column,
  -- which is the entire point.
  new.actor_uid := auth.uid();
  return new;
end;
$$;

drop trigger if exists change_log_stamp_actor_trg on public.change_log;
create trigger change_log_stamp_actor_trg
  before insert on public.change_log
  for each row
  execute function public.change_log_stamp_actor();

-- Verify:
--   1. the column and trigger exist
--        select column_name from information_schema.columns
--         where table_name = 'change_log' and column_name = 'actor_uid';
--        select tgname from pg_trigger where tgrelid = 'public.change_log'::regclass;
--
--   2. new entries get stamped (run as a signed-in user, not the service role,
--      because auth.uid() is NULL for service-role connections)
--        select user_email, actor_uid, created_at
--          from public.change_log
--         order by created_at desc limit 5;
--
--   3. find claimed authors that do not match the verified actor
--        select id, user_email, actor_uid, op_type, created_at
--          from public.change_log
--         where actor_uid is not null
--           and user_email is distinct from (
--             select email from auth.users where id = actor_uid
--           );
--      Any row returned is a mismatch worth investigating.
--
-- NOTE: api/notify.ts and other service-role writers will stamp NULL, since
-- auth.uid() is NULL on a service-role connection. That is correct: those are
-- system writes with no human actor, and NULL says so honestly.
