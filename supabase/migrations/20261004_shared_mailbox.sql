-- A single shared IONOS mailbox for the initial communications pilot.
-- Credentials are encrypted by the API with MAILBOX_ENCRYPTION_KEY.
create table if not exists public.shared_mailbox (
  id text primary key check (id = 'primary'),
  encrypted_config text not null,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.shared_mailbox enable row level security;
revoke all on public.shared_mailbox from anon, authenticated;
grant select, insert, update, delete on public.shared_mailbox to service_role;
