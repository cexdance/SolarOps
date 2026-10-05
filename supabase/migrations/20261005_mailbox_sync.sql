-- Admin pilot: server-only storage and fenced, atomic checkpoints.
create table if not exists public.mailbox_sync_state (
 id text primary key check (id = 'primary'),
 enabled boolean not null default false,
 mailbox_email text not null,
 folders jsonb not null default '{}'::jsonb,
 started_at timestamptz not null default now(),
 lease_token uuid,
 lease_until timestamptz,
 last_completed_at timestamptz,
 last_error text
);
create table if not exists public.mailbox_messages (
 id text primary key,
 mailbox_id text not null default 'primary' references public.mailbox_sync_state(id),
 message_id text,
 subject text not null default '',
 message_date timestamptz,
 direction text not null check (direction in ('inbound','outbound')),
 raw_path text,
 content_status text not null check (content_status in ('complete','too_large')),
 payload jsonb not null,
 created_at timestamptz not null default now()
);
create index if not exists mailbox_messages_date_idx on public.mailbox_messages (message_date desc);
alter table public.mailbox_sync_state enable row level security;
alter table public.mailbox_messages enable row level security;
revoke all on public.mailbox_sync_state, public.mailbox_messages from anon, authenticated;
grant select, insert, update, delete on public.mailbox_sync_state, public.mailbox_messages to service_role;
insert into storage.buckets (id,name,public,file_size_limit) values ('mailbox-originals','mailbox-originals',false,15728640) on conflict (id) do nothing;
-- Restrictive policy also protects this bucket if an older broad write policy exists.
do $$ begin
 if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='mailbox originals server only') then
  create policy "mailbox originals server only" on storage.objects as restrictive for all to anon, authenticated using (bucket_id <> 'mailbox-originals') with check (bucket_id <> 'mailbox-originals');
 end if;
end $$;

create or replace function public.mailbox_sync_start(p_email text, p_folders jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
begin
 insert into public.mailbox_sync_state(id,enabled,mailbox_email,folders)
 values ('primary',true,p_email,p_folders)
 on conflict(id) do update set enabled=true,last_error=null
 where public.mailbox_sync_state.mailbox_email=p_email and public.mailbox_sync_state.enabled=false
 and (public.mailbox_sync_state.lease_until is null or public.mailbox_sync_state.lease_until < clock_timestamp());
 if not found then raise exception 'Mailbox already active or does not match the initialized mailbox'; end if;
end $$;
create or replace function public.mailbox_sync_claim(p_token uuid)
returns setof public.mailbox_sync_state language sql security invoker set search_path = '' as $$
 update public.mailbox_sync_state set lease_token=p_token,lease_until=clock_timestamp()+interval '90 seconds'
 where id='primary' and enabled and (lease_until is null or lease_until<clock_timestamp()) returning *;
$$;
create or replace function public.mailbox_sync_commit(p_token uuid,p_folder text,p_validity text,p_cursor bigint,p_messages jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare state public.mailbox_sync_state; item jsonb;
begin
 select * into state from public.mailbox_sync_state where id='primary' for update;
 if not found or not state.enabled or state.lease_token is distinct from p_token or state.lease_until<clock_timestamp() then
   raise exception 'Mailbox sync lease expired';
 end if;
 if state.folders->p_folder->>'uidValidity' is distinct from p_validity then raise exception 'Mailbox folder identity changed'; end if;
 if p_cursor < (state.folders->p_folder->>'cursor')::bigint then raise exception 'Mailbox cursor cannot move backwards'; end if;
 for item in select value from jsonb_array_elements(p_messages) loop
  insert into public.mailbox_messages(id,message_id,subject,message_date,direction,raw_path,content_status,payload)
  values(item->>'id',item->>'message_id',coalesce(item->>'subject',''),(item->>'message_date')::timestamptz,item->>'direction',item->>'raw_path',item->>'content_status',item->'payload')
  on conflict(id) do nothing;
 end loop;
 update public.mailbox_sync_state set folders=jsonb_set(folders,array[p_folder,'cursor'],to_jsonb(p_cursor)) where id='primary';
end $$;
create or replace function public.mailbox_sync_finish(p_token uuid,p_error text default null,p_pause boolean default false)
returns void language sql security invoker set search_path = '' as $$
 update public.mailbox_sync_state set lease_token=null,lease_until=null,last_error=p_error,
 enabled=case when p_pause then false else enabled end,
 last_completed_at=case when p_error is null then clock_timestamp() else last_completed_at end
 where id='primary' and lease_token=p_token;
$$;
create or replace function public.mailbox_sync_pause()
returns void language sql security invoker set search_path = '' as $$
 update public.mailbox_sync_state set enabled=false,lease_token=null,lease_until=null where id='primary';
$$;
revoke all on function public.mailbox_sync_start(text,jsonb),public.mailbox_sync_claim(uuid),public.mailbox_sync_commit(uuid,text,text,bigint,jsonb),public.mailbox_sync_finish(uuid,text,boolean),public.mailbox_sync_pause() from public, anon, authenticated;
grant execute on function public.mailbox_sync_start(text,jsonb),public.mailbox_sync_claim(uuid),public.mailbox_sync_commit(uuid,text,text,bigint,jsonb),public.mailbox_sync_finish(uuid,text,boolean),public.mailbox_sync_pause() to service_role;
