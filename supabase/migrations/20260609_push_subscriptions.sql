-- Push notification subscriptions for Web Push (Tier 3 badge)
-- Run in Supabase Dashboard > SQL Editor > New Query
create table if not exists push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  endpoint      text not null,
  subscription  jsonb not null,
  created_at    timestamptz default now(),
  unique (user_id, endpoint)
);

alter table push_subscriptions enable row level security;
