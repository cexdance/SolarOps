-- Run after the sync migration in the SAME transaction, then ROLLBACK.
-- Uses a disposable mailbox and synthetic message only; never touches IONOS.
do $$ begin
 if exists(select 1 from public.mailbox_sync_state) then raise exception 'Use an empty test database or a rollback transaction before activation'; end if;
end $$;
set local role service_role;
select public.mailbox_sync_start('test@example.invalid','{"INBOX":{"uidValidity":"123","cursor":99,"direction":"inbound"}}');
select * from public.mailbox_sync_claim('11111111-1111-4111-8111-111111111111');
do $$ begin
 if exists(select 1 from public.mailbox_sync_claim('22222222-2222-4222-8222-222222222222')) then raise exception 'Concurrent lease granted'; end if;
end $$;
select public.mailbox_sync_commit('11111111-1111-4111-8111-111111111111','INBOX','123',100,'[{"id":"synthetic-mailbox-check","message_id":"<test@example.invalid>","subject":"Synthetic test","direction":"inbound","content_status":"complete","payload":{}}]');
select public.mailbox_sync_commit('11111111-1111-4111-8111-111111111111','INBOX','123',100,'[{"id":"synthetic-mailbox-check","message_id":"<test@example.invalid>","subject":"Synthetic test","direction":"inbound","content_status":"complete","payload":{}}]');
do $$ begin
 if (select count(*) from public.mailbox_messages) <> 1 then raise exception 'Duplicate message stored'; end if;
 if (select folders->'INBOX'->>'cursor' from public.mailbox_sync_state) <> '100' then raise exception 'Checkpoint not advanced'; end if;
end $$;
select public.mailbox_sync_pause();
do $$ declare rejected boolean := false; begin
 begin
  perform public.mailbox_sync_commit('11111111-1111-4111-8111-111111111111','INBOX','123',101,'[]');
 exception when others then rejected:=true; end;
 if not rejected then raise exception 'Paused worker committed data'; end if;
end $$;
reset role;
do $$ begin
 if has_table_privilege('authenticated','public.mailbox_messages','SELECT') then raise exception 'Messages readable by browser'; end if;
 if has_function_privilege('authenticated','public.mailbox_sync_claim(uuid)','EXECUTE') then raise exception 'Lease RPC exposed'; end if;
end $$;
