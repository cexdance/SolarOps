-- Add related_activity_id to notifications.
--
-- The mention permalink feature (b6ab95d, "notification opens the exact comment,
-- not just the record") writes this column from the notify handler and selects it
-- in fetchMyNotifications(). Neither the table definition nor any migration ever
-- added it, so the column existed only in application code.
--
-- That mismatch is load-bearing in both directions:
--   * A SELECT naming a column PostgREST does not know fails the whole request,
--     which takes down the notification bell for every user and every
--     notification type, not just mentions.
--   * An INSERT naming it fails the same way, so notifications stop being
--     created at all.
--
-- IF NOT EXISTS so this is safe to run against a database where the column was
-- already added by hand out of band.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS related_activity_id TEXT;

-- Verify:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'notifications';
