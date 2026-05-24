-- Quote approval tokens for email-based quote approval flow
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS quote_approvals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id TEXT NOT NULL UNIQUE,
  token TEXT NOT NULL UNIQUE,
  customer_email TEXT NOT NULL,
  customer_name TEXT,
  wo_number TEXT NOT NULL,
  grand_total NUMERIC(10, 2),
  line_items JSONB,
  expires_at TIMESTAMPTZ NOT NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_quote_approvals_token ON quote_approvals (token);
CREATE INDEX idx_quote_approvals_job_id ON quote_approvals (job_id);
