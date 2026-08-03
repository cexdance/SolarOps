-- SolarOps — Notifications table
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.notifications (
  id                   TEXT        PRIMARY KEY,
  user_id              UUID        NOT NULL,
  type                 TEXT        NOT NULL,  -- 'mention' | 'contractor_completed' | etc.
  title                TEXT        NOT NULL,
  message              TEXT        NOT NULL DEFAULT '',
  related_job_id       TEXT,
  related_contractor_id TEXT,
  related_customer_id  TEXT,
  read                 BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast per-user lookups (most common query)
CREATE INDEX IF NOT EXISTS notifications_user_id_idx
  ON public.notifications (user_id, created_at DESC);

-- Row Level Security: each user can only see their own notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Policies for this table are NOT defined here. They live in exactly one place:
--
--     supabase/migrations/20260803_notifications_rls_owner_scoped.sql
--     (mirrored in solarflow-dashboard/supabase/rls_policies.sql)
--
-- This file used to declare its own owner-scoped pair while rls_policies.sql
-- declared a contradictory permissive pair (`using (true)` for every
-- authenticated user). Whichever script ran last won, which meant the live
-- policy could not be determined from the repo at all. That ambiguity is the
-- bug, so the definitions were consolidated on 2026-08-03 rather than fixed in
-- two places. Add policy changes to the migration, not here.
--
-- Rows are inserted by api/notify.ts with the service-role key, which bypasses
-- RLS, so no insert policy exists or is needed.
