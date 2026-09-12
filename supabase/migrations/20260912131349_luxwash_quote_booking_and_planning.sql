-- Use the actual agreed duration for quoted work and for changes to existing appointments.
create or replace function private.available_window(p_start timestamptz,p_duration integer,p_buffer integer,p_postcode text,p_ignore uuid default null) returns boolean language plpgsql set search_path='' as $$
declare cfg jsonb; finish timestamptz; localday date; v_local_time time; localend time; opened boolean;
begin
if p_duration is null or p_duration not between 15 and 1440 or p_buffer is null or p_buffer not between 0 and 240 then return false; end if;
select value into cfg from public.settings where key='planning';
if cfg is null or (cfg->>'max_per_day')::int is null or (cfg->>'lead_hours')::int is null or (cfg->>'horizon_days')::int is null then return false; end if;
if p_start is null or p_postcode is null or p_postcode !~ '^[1-9][0-9]{3}$' then return false; end if;
if not coalesce((cfg->>'all_postcodes')::boolean,false) and not coalesce(cfg->'allowed_postcodes' ? p_postcode,false) then return false; end if;
if p_start<now()+make_interval(hours=>(cfg->>'lead_hours')::int) or p_start>now()+make_interval(days=>(cfg->>'horizon_days')::int) then return false; end if;
finish:=p_start+make_interval(mins=>p_duration+p_buffer);
localday:=(p_start at time zone 'Europe/Brussels')::date; v_local_time:=(p_start at time zone 'Europe/Brussels')::time; localend:=(finish at time zone 'Europe/Brussels')::time;
if coalesce((cfg->>'open_24_7')::boolean,false) then opened:=true;
else
if (finish at time zone 'Europe/Brussels')::date<>localday then return false; end if;
select exists(select 1 from public.availability where kind='open' and starts_at<=p_start and ends_at>=finish) or exists(select 1 from jsonb_array_elements(cfg->'opening_hours') h where (h->>'weekday')::int=extract(isodow from localday)::int and v_local_time>=(h->>'start')::time and localend<=(h->>'end')::time) into opened;
end if;
if not opened then return false; end if;
if exists(select 1 from public.availability where kind='blocked' and starts_at<finish and ends_at>p_start) then return false; end if;
if exists(select 1 from public.appointments where status in ('scheduled','confirmed','pending','requested') and id is distinct from p_ignore and starts_at<finish and occupied_until>p_start) then return false; end if;
if (select count(*) from public.appointments where status in ('scheduled','confirmed','pending','requested') and id is distinct from p_ignore and (starts_at at time zone 'Europe/Brussels')::date=localday)>=(cfg->>'max_per_day')::int then return false; end if;
return true;
end $$;

revoke all on function private.available_window(timestamptz,integer,integer,text,uuid) from public,anon,authenticated;
create or replace function private.available(p_service uuid,p_start timestamptz,p_postcode text,p_ignore uuid default null) returns boolean language plpgsql set search_path='' as $$
declare s public.services;
begin
 select * into s from public.services where id=p_service and active;
 if not found or s.duration_minutes is null or s.price_mode='quote' then return false; end if;
 return private.available_window(p_start,s.duration_minutes,s.buffer_minutes,p_postcode,p_ignore);
end $$;

do $fix$
declare old text; updated text;
begin
 old:=pg_get_functiondef('private.luxwash_dispatch_v1(text,jsonb)'::regprocedure);
 updated:=replace(old,'private.available(a.catalog_service_id,st,a.postcode,a.id)','private.available_window(st,(extract(epoch from (a.ends_at-a.starts_at))/60)::int,a.buffer_minutes,a.postcode,a.id)');
 if updated=old then raise exception 'Expected appointment change implementation not found'; end if;
 execute updated;
end $fix$;

alter table public.appointments add column quote_id uuid references public.quotes;
create unique index appointments_quote_id on public.appointments(quote_id) where quote_id is not null;
alter function private.luxwash_dispatch(text,jsonb) rename to luxwash_dispatch_before_quotes;
create function private.luxwash_dispatch(action text,p jsonb) returns jsonb language plpgsql set search_path='' as $$
#variable_conflict use_column
declare q public.quotes; s public.services; c public.customers; a public.appointments; st timestamptz; duration integer; lid uuid; result jsonb; qid uuid;
begin
 if action='save' and p->>'table' in ('quotes','quote_items') then
  if p->>'table'='quotes' then
   if p->'data' ?| array['status','approved_at'] then raise exception 'Gebruik de afzonderlijke offertegoedkeuring'; end if;
   qid:=nullif(p->>'id','')::uuid;
  else
   if nullif(p->>'id','') is not null then
    select quote_id into qid from public.quote_items where id=(p->>'id')::uuid;
    if p->'data' ? 'quote_id' and qid is distinct from (p->'data'->>'quote_id')::uuid then raise exception 'Een offerteregel kan niet naar een andere offerte worden verplaatst'; end if;
   else qid:=(p->'data'->>'quote_id')::uuid;
   end if;
  end if;
  select * into q from public.quotes where id=qid for update;
  if q.id is not null and q.status<>'draft' then raise exception 'Goedgekeurde offertes zijn vergrendeld. Maak een nieuw concept voor wijzigingen.'; end if;
 end if;
 if action='retry_job' and exists(select 1 from public.automation_jobs where id=(p->>'id')::uuid and kind='classify' and status='dead') then
  update public.automation_jobs set status='queued',attempts=0,first_attempt_at=null,scheduled_at=now(),last_error=null where id=(p->>'id')::uuid and kind='classify' and status='dead';
  return '{"ok":true}';
 end if;
 if action in ('quote_book','quote_slots') then
  if not coalesce((p->>'admin')::boolean,false) then raise exception 'not_authorized' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('luxwash-bookings',0));
  select * into q from public.quotes where id=(p->>'quote_id')::uuid for update;
  if not found then raise exception 'Offerte niet gevonden'; end if;
  if action='quote_book' then
   select * into a from public.appointments where quote_id=q.id;
   if found then
    if a.idempotency_key is distinct from p->>'idempotency_key' then raise exception 'Deze offerte heeft al een afspraak. Beheer de bestaande afspraak in de agenda.'; end if;
    return jsonb_build_object('appointment',to_jsonb(a)-'manage_token_hash','replayed',true);
   end if;
  end if;
  if q.status not in ('approved','sent') or q.approved_at is null or q.total_cents<=0 then raise exception 'Keur eerst een offerte met een definitieve prijs goed'; end if;
  select * into c from public.customers where id=q.customer_id and status='active';
  if not found then raise exception 'Actieve klant ontbreekt'; end if;
  select * into s from public.services where id=(p->>'service_id')::uuid and active;
  if not found then raise exception 'unknown_service'; end if;
  duration:=(p->>'duration_minutes')::integer;
  if duration is null or duration not between 15 and 1440 then raise exception 'Vul een duur tussen 15 en 1440 minuten in'; end if;
  if action='quote_slots' then
   select coalesce(jsonb_agg(x),'[]') into result from (
    select ts starts_at,ts+make_interval(mins=>duration) ends_at
    from generate_series((p->>'from')::timestamptz,least((p->>'to')::timestamptz,(p->>'from')::timestamptz+interval '14 days'),interval '30 minutes') ts
    where private.available_window(ts,duration,s.buffer_minutes,p->>'postcode') order by ts limit 40
   ) x;
   return result;
  end if;
  if not coalesce((p->>'confirmed_by_customer')::boolean,false) then raise exception 'Bevestig eerst het akkoord van de klant'; end if;
  if coalesce(length(p->>'idempotency_key'),0) not between 16 and 120 or coalesce(p->>'manage_token_hash','') !~ '^[a-f0-9]{64}$' then raise exception 'Ongeldige boekingsreferentie'; end if;
  if coalesce(length(trim(p->>'address')),0) not between 5 and 300 then raise exception 'Adres ontbreekt'; end if;
  st:=(p->>'starts_at')::timestamptz;
  if not private.available_window(st,duration,s.buffer_minutes,p->>'postcode') then raise exception 'slot_unavailable' using errcode='23P01'; end if;
  insert into public.customer_addresses(customer_id,address,postcode) values(c.id,p->>'address',p->>'postcode');
  insert into public.leads(id,customer_id,name,email,phone,service,message,source,status,next_action,metadata)
   values(gen_random_uuid(),c.id,c.name,coalesce(c.email,''),coalesce(c.phone,''),s.name,coalesce(p->>'notes',''),'admin','won','Afspraak',jsonb_build_object('quote_id',q.id)) returning id into lid;
  insert into public.appointments(id,lead_id,customer_id,catalog_service_id,service_id,starts_at,ends_at,status,address,postcode,vehicle,price_cents,price_mode,buffer_minutes,idempotency_key,manage_token_hash,source,notes,quote_id)
   values(gen_random_uuid(),lid,c.id,s.id,s.id::text,st,st+make_interval(mins=>duration),'confirmed',p->>'address',p->>'postcode',coalesce(p->>'vehicle',''),q.total_cents,'fixed',s.buffer_minutes,p->>'idempotency_key',p->>'manage_token_hash','admin',coalesce(p->>'notes',''),q.id) returning * into a;
  insert into public.bookings(appointment_id,customer_id,source,status) values(a.id,c.id,'admin',a.status);
  update public.quotes set status='accepted' where id=q.id;
  perform private.enqueue_appointment(a);
  insert into public.ai_actions(customer_id,source,action,reason,result,status) values(c.id,'admin','createAppointment','Goedgekeurde offerte en klantakkoord',jsonb_build_object('appointment_id',a.id,'quote_id',q.id),a.status);
  return jsonb_build_object('appointment',to_jsonb(a)-'manage_token_hash','replayed',false);
 end if;
 return private.luxwash_dispatch_before_quotes(action,p);
end $$;
revoke all on function private.luxwash_dispatch(text,jsonb) from public,anon,authenticated;

-- A queued quote email must not change an accepted quote back to sent.
do $fix$
declare old text;
begin
 old:=pg_get_functiondef('private.luxwash_dispatch_v2(text,jsonb)'::regprocedure);
 execute replace(old,'where id=(j.payload->>''quote_id'')::uuid;','where id=(j.payload->>''quote_id'')::uuid and status=''approved'';');
end $fix$;
