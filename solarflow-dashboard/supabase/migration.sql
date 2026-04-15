-- ============================================================
-- SolarOps Fault-Tolerant Data Infrastructure
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. Shared key-value store (customers, jobs, config blobs)
CREATE TABLE IF NOT EXISTS app_data (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Append-only change log — every mutation recorded forever
CREATE TABLE IF NOT EXISTS change_log (
  id          TEXT PRIMARY KEY,
  op_type     TEXT NOT NULL,      -- e.g. 'customer.create', 'job.update'
  entity_type TEXT NOT NULL,      -- 'customer' | 'job' | 'config'
  entity_id   TEXT NOT NULL,
  payload     JSONB NOT NULL,
  user_email  TEXT,
  device_id   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast log lookups
CREATE INDEX IF NOT EXISTS change_log_entity_idx   ON change_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS change_log_created_idx  ON change_log (created_at DESC);
CREATE INDEX IF NOT EXISTS change_log_op_idx       ON change_log (op_type);

-- ============================================================
-- Row Level Security: any authenticated staff user can
-- read and write all org data (team platform, single org)
-- ============================================================

ALTER TABLE app_data   ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_log ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if re-running
DROP POLICY IF EXISTS "team_rw"     ON app_data;
DROP POLICY IF EXISTS "team_read"   ON change_log;
DROP POLICY IF EXISTS "team_insert" ON change_log;

CREATE POLICY "team_rw" ON app_data
  USING  (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "team_read" ON change_log
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "team_insert" ON change_log
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ============================================================
-- Helper: auto-update updated_at on upsert
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_app_data_updated_at ON app_data;
CREATE TRIGGER set_app_data_updated_at
  BEFORE UPDATE ON app_data
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
