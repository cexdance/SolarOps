-- ============================================================
-- SolarOps v1.7.0 — Incremental Migration
-- Run in: Supabase Dashboard → SQL Editor → New Query
--
-- Safe to re-run (all statements are idempotent).
-- Previous migrations (migration.sql, notifications_table.sql)
-- must already be applied.
-- ============================================================

-- ── Phase 2 Sync: index for incremental pulls ─────────────────
-- pullPrefix() uses .gt('updated_at', since) for fast delta syncs.
-- Without this index every pull does a full table scan on app_data.
CREATE INDEX IF NOT EXISTS app_data_updated_at_idx
  ON public.app_data (updated_at DESC);

-- ── Realtime: enable postgres_changes on app_data ─────────────
-- Required by subscribeToChanges() in syncEngine.ts.
-- If already enabled via Supabase Dashboard this is a no-op.
ALTER TABLE public.app_data REPLICA IDENTITY FULL;

-- Add app_data to the supabase_realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'app_data'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.app_data;
  END IF;
END $$;

-- ── Notifications: ensure service-role insert is unrestricted ──
-- The service key used by api/notify.ts bypasses RLS by default,
-- but this makes the intent explicit and survives policy resets.
DROP POLICY IF EXISTS "service_insert" ON public.notifications;
CREATE POLICY "service_insert" ON public.notifications
  FOR INSERT WITH CHECK (true);

-- ── app_data: ensure updated_at is kept current on every write ─
-- (Trigger was created in migration.sql; this is a safety re-apply.)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_app_data_updated_at ON public.app_data;
CREATE TRIGGER set_app_data_updated_at
  BEFORE UPDATE ON public.app_data
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── change_log: add performance index on user_email for audit ──
CREATE INDEX IF NOT EXISTS change_log_user_email_idx
  ON public.change_log (user_email, created_at DESC);

-- ── Verify ────────────────────────────────────────────────────
-- Run these SELECT statements to confirm everything is in place:
--
-- SELECT tablename, pubname FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
-- SELECT indexname FROM pg_indexes WHERE tablename = 'app_data';
-- SELECT policyname FROM pg_policies WHERE tablename IN ('app_data','notifications','change_log');
