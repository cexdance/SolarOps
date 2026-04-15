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

DROP POLICY IF EXISTS "Users can read own notifications" ON public.notifications;
CREATE POLICY "Users can read own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role can insert notifications (used by api/notify.ts with service key)
-- (Service role bypasses RLS automatically)
