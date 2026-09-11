-- Client numbers (US-1XXXX) are allocated HERE, not in the Google Sheet.
--
-- Until 2026-09-11 two allocators handed out the same numbers without talking
-- to each other: the registry sheet ("first row with a blank name") and the
-- Create Customer modal (the app's own highest number + 1). Cherrington took
-- US-15703 through the modal while the sheet still showed it blank, so every
-- lead conversion was then offered US-15703 and refused. Earlier the same gap
-- produced Daniel Torres, Taylor Williams, Blackstone and Deorta.
--
-- A primary key cannot hand a number out twice, whatever the clients do.
--
-- The sheet is now a MIRROR. The app writes each allocated name into it for the
-- office. A name somebody types into the sheet by hand is imported here as
-- 'sheet-manual' (by the app when it meets one, and nightly by the audit), so it
-- is never handed to anyone else and never overwritten.

create table if not exists public.client_numbers (
  number       integer primary key check (number between 10000 and 99999),
  client_id    text generated always as ('US-' || number::text) stored unique,
  customer_id  text,
  name         text not null default '',
  -- convert | create | edit | seed-app | sheet-manual | audit-app
  source       text not null default 'app',
  created_at   timestamptz not null default now(),
  created_by   uuid default auth.uid()
);

alter table public.client_numbers enable row level security;

drop policy if exists client_numbers_staff_read on public.client_numbers;
create policy client_numbers_staff_read on public.client_numbers
  for select to authenticated using ((select public.is_staff()));
-- No insert/update/delete policies. Every write goes through the functions
-- below, which are SECURITY DEFINER and check is_staff() themselves.

-- ── Same-person test ────────────────────────────────────────────────────────
-- Survives how the sheet is really written: "US-15655 Shellie Blum",
-- "Ruben Montoya  POWERCARE: 6539891", "Client: Linda Mclaughlin", "José"/"Jose".
-- KEEP IN STEP with clientNameKey()/sameClientName() in
-- solarflow-dashboard/src/lib/clientNumbers.ts; both are tested on one case list.
create or replace function public.client_name_key(p text)
returns text
language plpgsql immutable
set search_path = ''
as $$
declare s text := upper(coalesce(p, ''));
begin
  s := translate(s, 'ÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇáàäâãéèëêíìïîóòöôõúùüûñç',
                    'AAAAAEEEEIIIIOOOOOUUUUNCAAAAAEEEEIIIIOOOOOUUUUNC');
  s := regexp_replace(s, '^\s*US[\s-]*[0-9]+\s*', '');
  s := regexp_replace(s, '^\s*CLIENT\s*:\s*', '');
  s := regexp_replace(s, '\s*(POWER\s*CARE|PWC|CASE\s*(#|NUMBER|NO)).*$', '');
  s := regexp_replace(s, '[^A-Z]+', ' ', 'g');
  return btrim(s);
end $$;

create or replace function public.same_client_name(a text, b text)
returns boolean
language sql immutable
set search_path = ''
as $$
  -- Identical text is the same person even when the key strips to nothing: a
  -- customer literally named "US-15015" keys to '' and must still match itself.
  with k as (select public.client_name_key(a) as x, public.client_name_key(b) as y,
                    upper(btrim(coalesce(a, ''))) as ra, upper(btrim(coalesce(b, ''))) as rb)
  select (ra <> '' and ra = rb)
      or (x <> '' and y <> '' and (
           x = y
        or (length(x) >= 5 and position(' ' || x || ' ' in ' ' || y || ' ') > 0)
        or (length(y) >= 5 and position(' ' || y || ' ' in ' ' || x || ' ') > 0)))
    from k;
$$;

-- ── Allocate the next number ────────────────────────────────────────────────
create or replace function public.claim_client_number(p_name text, p_source text default 'app')
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_next integer;
begin
  if not public.is_staff() then
    raise exception 'Only staff can claim a client number' using errcode = '42501';
  end if;
  if v_name = '' then
    raise exception 'A client name is required to claim a client number' using errcode = '22023';
  end if;

  -- One claim at a time, across every browser and device.
  perform pg_advisory_xact_lock(hashtext('public.client_numbers'));

  -- The lowest number from the registry's first (US-15015) that is in neither
  -- this table NOR on any customer record. Checking the customers too is the
  -- point: a number that reached a customer by any other route (the SolarEdge
  -- import, a typed number, a stale tab, pre-2026-09-11 code) can never be
  -- handed out again, even if nobody told this table. Holes left by a released
  -- claim are reused, which keeps the numbering consecutive.
  with used as (
    select number from public.client_numbers
    union
    select substring(upper(btrim(value->>'clientId')) from 4)::integer
      from public.app_data
     where key like 'customer:%'
       and upper(btrim(value->>'clientId')) ~ '^US-[0-9]{5}$'
  )
  select min(g) into v_next
    from generate_series(15015, (select coalesce(max(number), 15014) + 1 from used)) g
   where not exists (select 1 from used u where u.number = g);

  insert into public.client_numbers (number, name, source)
  values (v_next, v_name, coalesce(nullif(btrim(p_source), ''), 'app'));
  return 'US-' || v_next;
end $$;

-- ── Take a SPECIFIC number (typed, or already carried by a lead) ────────────
-- Returns {ok:true} or {ok:false, reason, holder_name, holder_customer_id}.
create or replace function public.reserve_client_number(
  p_client_id text, p_name text, p_customer_id text default null, p_source text default 'app')
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_cid  text := upper(btrim(coalesce(p_client_id, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_num  integer;
  v_row  public.client_numbers;
  v_key  text;
  v_hold text;
begin
  if not public.is_staff() then
    raise exception 'Only staff can reserve a client number' using errcode = '42501';
  end if;
  if v_cid !~ '^US-[0-9]{5}$' then
    return jsonb_build_object('ok', false, 'reason', 'format', 'client_id', v_cid);
  end if;
  v_num := substring(v_cid from 4)::integer;

  perform pg_advisory_xact_lock(hashtext('public.client_numbers'));

  -- Another customer record already carries it.
  select a.key, a.value->>'name' into v_key, v_hold
    from public.app_data a
   where a.key like 'customer:%'
     and upper(btrim(a.value->>'clientId')) = v_cid
     and (p_customer_id is null or a.key <> 'customer:' || p_customer_id)
   limit 1;
  if v_key is not null then
    return jsonb_build_object('ok', false, 'reason', 'customer', 'client_id', v_cid,
      'holder_name', coalesce(v_hold, ''), 'holder_customer_id', substring(v_key from 10));
  end if;

  select * into v_row from public.client_numbers where number = v_num;
  if found then
    if v_row.customer_id is not null and v_row.customer_id is distinct from p_customer_id then
      return jsonb_build_object('ok', false, 'reason', 'registry', 'client_id', v_cid,
        'holder_name', v_row.name, 'holder_customer_id', v_row.customer_id);
    end if;
    if v_row.customer_id is null and v_row.name <> '' and not public.same_client_name(v_row.name, v_name) then
      return jsonb_build_object('ok', false, 'reason', 'registry', 'client_id', v_cid,
        'holder_name', v_row.name, 'holder_customer_id', null);
    end if;
    update public.client_numbers
       set name = case when name = '' then v_name else name end
     where number = v_num;
    return jsonb_build_object('ok', true, 'client_id', v_cid);
  end if;

  -- Deliberately NOT bound to p_customer_id here: the caller's save can still be
  -- refused (by the sheet, or by the user). p_customer_id only excludes the
  -- customer from "someone else holds it". bind_client_number runs after the
  -- save lands; until then release_client_number can still take it back.
  insert into public.client_numbers (number, name, source)
  values (v_num, v_name, coalesce(nullif(btrim(p_source), ''), 'app'));
  return jsonb_build_object('ok', true, 'client_id', v_cid);
end $$;

-- ── Tie a claimed number to the customer that was created with it ───────────
create or replace function public.bind_client_number(p_client_id text, p_customer_id text)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'Only staff can bind a client number' using errcode = '42501';
  end if;
  update public.client_numbers
     set customer_id = p_customer_id
   where client_id = upper(btrim(p_client_id))
     and (customer_id is null or customer_id = p_customer_id);
  return found;
end $$;

-- ── Give back a claim that never reached a customer ─────────────────────────
-- Only an unbound claim made by the app, and only while it still holds exactly
-- the name it was claimed for. A seeded or hand-typed number is never released.
create or replace function public.release_client_number(p_client_id text, p_expect_name text)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'Only staff can release a client number' using errcode = '42501';
  end if;
  delete from public.client_numbers
   where client_id = upper(btrim(p_client_id))
     and customer_id is null
     and name = btrim(coalesce(p_expect_name, ''))
     and source in ('app', 'convert', 'create', 'edit');
  return found;
end $$;

-- ── Correct a fresh claim to its real owner ─────────────────────────────────
-- Used when the app finds that the number it was just given is already in use
-- (by a customer this table missed, or by a name typed into the sheet). The
-- number stays taken, under the right name, and the caller claims again.
create or replace function public.relabel_client_number(
  p_client_id text, p_expect_name text, p_name text, p_customer_id text, p_source text)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'Only staff can relabel a client number' using errcode = '42501';
  end if;
  update public.client_numbers
     set name = btrim(coalesce(p_name, '')),
         customer_id = p_customer_id,
         source = coalesce(nullif(btrim(p_source), ''), 'app')
   where client_id = upper(btrim(p_client_id))
     and customer_id is null
     and name = btrim(coalesce(p_expect_name, ''));
  return found;
end $$;

-- ── Nightly audit (service role only) ───────────────────────────────────────
-- p_sheet: [[ "US-15015", "Daniel Matos Residence" ], ...] read from the sheet.
-- Heals what is always safe to heal, and reports the rest:
--   tracked-from-customer  a customer carried a number this table never issued
--   imported-from-sheet    a name typed into the sheet by hand
--   bound                  an unbound claim tied to the customer carrying it
--   shared                 two customers carry one number            (report)
--   renamed                registry name updated to its customer's current name
--   mismatch-sheet         registry and sheet name different people   (report)
--   mismatch-job           an order's number disagrees with its customer's (report)
--   unmirrored             registry number blank in the sheet (caller writes it)
-- Customers are recorded BEFORE the sheet is imported: SolarOps is the system of
-- record, so where the two disagree the customer wins and the sheet is reported.
create or replace function public.client_number_audit(p_sheet jsonb default '[]'::jsonb)
returns table (kind text, client text, detail text)
language plpgsql security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('public.client_numbers'));

  return query
  with c as (
    select distinct on (upper(btrim(a.value->>'clientId')))
           upper(btrim(a.value->>'clientId')) as cid,
           substring(a.key from 10)           as cust,
           coalesce(a.value->>'name', '')     as nm
      from public.app_data a
     where a.key like 'customer:%'
       and upper(btrim(a.value->>'clientId')) ~ '^US-[0-9]{5}$'
     order by upper(btrim(a.value->>'clientId')), a.key
  ), ins as (
    insert into public.client_numbers as t (number, customer_id, name, source, created_by)
    select substring(c.cid from 4)::integer, c.cust, c.nm, 'audit-app', null
      from c
    on conflict (number) do nothing
    returning t.client_id as cl, t.name as nm
  )
  select 'tracked-from-customer'::text, ins.cl, ins.nm from ins;

  return query
  with s as (
    select upper(btrim(x->>0)) as cid, btrim(coalesce(x->>1, '')) as nm
      from jsonb_array_elements(coalesce(p_sheet, '[]'::jsonb)) x
  ), ins as (
    insert into public.client_numbers as t (number, name, source, created_by)
    select substring(s.cid from 4)::integer, s.nm, 'sheet-manual', null
      from s
     where s.cid ~ '^US-[0-9]{5}$' and s.nm <> ''
    on conflict (number) do nothing
    returning t.client_id as cl, t.name as nm
  )
  select 'imported-from-sheet'::text, ins.cl, ins.nm from ins;

  return query
  with c as (
    select distinct on (upper(btrim(a.value->>'clientId')))
           upper(btrim(a.value->>'clientId')) as cid, substring(a.key from 10) as cust
      from public.app_data a
     where a.key like 'customer:%'
       and upper(btrim(a.value->>'clientId')) ~ '^US-[0-9]{5}$'
     order by upper(btrim(a.value->>'clientId')), a.key
  ), upd as (
    update public.client_numbers t
       set customer_id = c.cust
      from c
     where t.client_id = c.cid and t.customer_id is null
    returning t.client_id as cl, c.cust as cust
  )
  select 'bound'::text, upd.cl, upd.cust from upd;

  return query
  select 'shared'::text, x.cid, string_agg(x.nm || ' [' || x.cust || ']', ' | ' order by x.cust)
    from (select upper(btrim(a.value->>'clientId')) as cid, substring(a.key from 10) as cust,
                 coalesce(a.value->>'name', '') as nm
            from public.app_data a
           where a.key like 'customer:%'
             and upper(btrim(a.value->>'clientId')) ~ '^US-[0-9]{5}$') x
   group by x.cid
  having count(*) > 1;

  -- A bound number belongs to its customer, so its registry name follows the
  -- customer's (a lead converted as "image.jpeg" and renamed later). Healed,
  -- not reported: a rename is not a numbering problem.
  return query
  with upd as (
    update public.client_numbers t
       set name = coalesce(a.value->>'name', '')
      from public.app_data a
     where a.key = 'customer:' || t.customer_id
       and coalesce(a.value->>'name', '') <> ''
       and t.name is distinct from coalesce(a.value->>'name', '')
    returning t.client_id as cl, t.name as nm
  )
  select 'renamed'::text, upd.cl, upd.nm from upd;

  return query
  with s as (
    select upper(btrim(x->>0)) as cid, btrim(coalesce(x->>1, '')) as nm
      from jsonb_array_elements(coalesce(p_sheet, '[]'::jsonb)) x
  )
  select 'mismatch-sheet'::text, t.client_id, 'registry: ' || t.name || ' / sheet: ' || s.nm
    from public.client_numbers t join s on s.cid = t.client_id
   where s.nm <> '' and t.name <> '' and not public.same_client_name(t.name, s.nm);

  -- A service order whose number disagrees with its own customer's. Seen
  -- 2026-09-11 on three orders: a direct repair changed the job but did not
  -- stamp fieldTimes, so the first stale tab re-pushed the old number. Report
  -- only: the fix is a per-field job write, which belongs to a person.
  return query
  select 'mismatch-job'::text, upper(btrim(j.value->>'clientId')),
         coalesce(j.value->>'clientName', j.key) || ' order is on ' || upper(btrim(j.value->>'clientId'))
           || ' but its customer is ' || upper(btrim(c.value->>'clientId'))
    from public.app_data j
    join public.app_data c on c.key = 'customer:' || (j.value->>'customerId')
   where j.key like 'job:%'
     and upper(btrim(coalesce(c.value->>'clientId', ''))) ~ '^US-[0-9]{5}$'
     and upper(btrim(coalesce(j.value->>'clientId', ''))) ~ '^US-[0-9]{5}$'
     and upper(btrim(j.value->>'clientId')) <> upper(btrim(c.value->>'clientId'));

  return query
  with s as (
    select upper(btrim(x->>0)) as cid, btrim(coalesce(x->>1, '')) as nm
      from jsonb_array_elements(coalesce(p_sheet, '[]'::jsonb)) x
  )
  select 'unmirrored'::text, t.client_id, t.name
    from public.client_numbers t
    left join s on s.cid = t.client_id
   where t.name <> '' and coalesce(s.nm, '') = ''
     and t.number >= 15015
     and jsonb_array_length(coalesce(p_sheet, '[]'::jsonb)) > 0;
end $$;

-- ── Grants ──────────────────────────────────────────────────────────────────
revoke execute on function public.claim_client_number(text, text)                     from public, anon;
revoke execute on function public.reserve_client_number(text, text, text, text)        from public, anon;
revoke execute on function public.bind_client_number(text, text)                       from public, anon;
revoke execute on function public.release_client_number(text, text)                    from public, anon;
revoke execute on function public.relabel_client_number(text, text, text, text, text)  from public, anon;
revoke execute on function public.client_number_audit(jsonb)                           from public, anon, authenticated;
grant  execute on function public.claim_client_number(text, text)                     to authenticated;
grant  execute on function public.reserve_client_number(text, text, text, text)        to authenticated;
grant  execute on function public.bind_client_number(text, text)                       to authenticated;
grant  execute on function public.release_client_number(text, text)                    to authenticated;
grant  execute on function public.relabel_client_number(text, text, text, text, text)  to authenticated;
grant  execute on function public.client_number_audit(jsonb)                           to service_role;

-- ── One-time seed: every number a customer already carries ──────────────────
-- Where two customers share a number, the earliest created is recorded; the
-- audit reports the pair. Names the sheet holds that no customer has are
-- imported by the first audit run (it needs the sheet, which SQL cannot read).
insert into public.client_numbers (number, customer_id, name, source, created_at, created_by)
select distinct on (s.num) s.num, s.cust, s.nm, 'seed-app', coalesce(s.made, now()), null
  from (
    select substring(upper(btrim(value->>'clientId')) from 4)::integer as num,
           substring(key from 10)                                     as cust,
           coalesce(value->>'name', '')                               as nm,
           case when value->>'createdAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
                then (value->>'createdAt')::timestamptz end           as made
      from public.app_data
     where key like 'customer:%'
       and upper(btrim(value->>'clientId')) ~ '^US-[0-9]{5}$'
  ) s
 order by s.num, s.made nulls last, s.cust
on conflict (number) do nothing;
