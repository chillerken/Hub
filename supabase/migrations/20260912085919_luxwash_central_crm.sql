-- Additive migration. Existing leads, appointments, events and games are preserved.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create extension if not exists btree_gist with schema extensions;
create table public.customers(id uuid primary key default gen_random_uuid(), name text not null, email text, phone text, status text not null default 'active', marketing_consent boolean not null default false, consent_at timestamptz, privacy_version text not null default '2026-09-12', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index customers_email on public.customers(lower(email));
create index customers_phone on public.customers(phone);
create table public.customer_addresses(id uuid primary key default gen_random_uuid(),customer_id uuid not null references public.customers on delete cascade,address text not null,postcode text not null,city text,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.vehicles(id uuid primary key default gen_random_uuid(),customer_id uuid not null references public.customers on delete cascade,category text not null,make text,model text,registration text,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.services(id uuid primary key default gen_random_uuid(),name text not null,description text not null default '',duration_minutes integer not null check(duration_minutes between 15 and 1440),buffer_minutes integer not null default 30 check(buffer_minutes between 0 and 240),price_mode text not null default 'estimate' check(price_mode in ('fixed','estimate','quote')),active boolean not null default true,preparation text not null default '',source_url text,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.service_prices(id uuid primary key default gen_random_uuid(),service_id uuid not null references public.services on delete cascade,category text not null default 'standard',amount_cents integer not null check(amount_cents>=0),currency text not null default 'EUR' check(currency='EUR'),unit text not null default 'beurt',created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(service_id,category));
create table public.service_packages(id uuid primary key default gen_random_uuid(),name text not null,description text,service_ids uuid[] not null default '{}',active boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.employees(id uuid primary key default gen_random_uuid(),name text not null,active boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.users(id uuid primary key references auth.users on delete cascade,name text,role text not null default 'staff' check(role in ('owner','admin','staff')),active boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.settings(id uuid primary key default gen_random_uuid(),key text not null unique,value jsonb not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
insert into public.settings(key,value) values ('business','{"name":"LuxWash","phone":"053 896 400","email":"info@luxwash.online","website":"https://www.luxwash.online","review_url":"https://g.page/r/CXBPu3C_EVS4EBM/review","timezone":"Europe/Brussels","area":"Aalst, Lede, Erpe-Mere en omgeving"}'),('planning','{"max_per_day":4,"lead_hours":12,"horizon_days":90,"allowed_postcodes":[],"opening_hours":[],"reminder_hours":24,"repeat_weeks":6}'),('ai','{"name":"Lina","greeting":"Goedendag, u spreekt met Lina, de digitale assistente van LuxWash. Waarmee kan ik u helpen?","tone":"Vriendelijk, rustig, natuurlijk Belgisch-Nederlands"}'),('privacy','{"recording_enabled":false,"transcript_days":30,"message_days":90,"marketing_default":false,"notice_version":"2026-09-12"}');
create table public.availability(id uuid primary key default gen_random_uuid(),starts_at timestamptz not null,ends_at timestamptz not null,kind text not null check(kind in ('open','blocked')),reason text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),check(ends_at>starts_at));
alter table public.leads add column customer_id uuid references public.customers;
alter table public.appointments add column customer_id uuid references public.customers,add column catalog_service_id uuid references public.services,add column address text,add column postcode text,add column vehicle text,add column price_cents integer check(price_cents>=0),add column price_mode text,add column buffer_minutes integer not null default 0,add column revision integer not null default 1,add column idempotency_key text unique,add column manage_token_hash text,add column source text not null default 'legacy';
-- Unknown legacy end times must block time conservatively until owner reviews.
update public.appointments set ends_at=starts_at+interval '4 hours' where ends_at is null;
alter table public.appointments add constraint valid_interval check(ends_at>starts_at);
alter table public.appointments add column occupied_until timestamptz;
update public.appointments set occupied_until=ends_at;
create or replace function private.appointment_range() returns trigger language plpgsql set search_path='' as $$ begin new.occupied_until:=new.ends_at+make_interval(mins=>new.buffer_minutes); return new; end $$;
create trigger appointment_range before insert or update on public.appointments for each row execute function private.appointment_range();
alter table public.appointments add constraint no_overlapping_bookings exclude using gist (tstzrange(starts_at,occupied_until,'[)') with &&) where (status in ('scheduled','confirmed','pending','requested'));
create table public.bookings(id uuid primary key default gen_random_uuid(),appointment_id uuid not null unique references public.appointments on delete cascade,customer_id uuid not null references public.customers,source text not null,status text not null default 'confirmed',created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.phone_calls(id uuid primary key default gen_random_uuid(),provider_call_id text not null unique,customer_id uuid references public.customers on delete set null,phone text,direction text not null default 'incoming',status text not null default 'ringing',started_at timestamptz not null default now(),ended_at timestamptz,summary text,intent text,sentiment text,escalated boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.call_transcripts(id uuid primary key default gen_random_uuid(),phone_call_id uuid not null references public.phone_calls on delete cascade,event_id text not null unique,role text not null,content text not null,expires_at timestamptz not null default now()+interval '30 days',created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.call_actions(id uuid primary key default gen_random_uuid(),phone_call_id uuid not null references public.phone_calls on delete cascade,tool_call_id text not null unique,name text not null,result jsonb,status text not null default 'processing',created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.conversations(id uuid primary key default gen_random_uuid(),token_hash text unique not null,customer_id uuid references public.customers on delete set null,source text not null default 'website',created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.messages(id uuid primary key default gen_random_uuid(),conversation_id uuid references public.conversations on delete cascade,customer_id uuid references public.customers on delete set null,channel text not null default 'website',direction text not null,content text not null,intent text,priority text not null default 'normal',status text not null default 'received',provider_id text unique,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.emails(id uuid primary key default gen_random_uuid(),customer_id uuid references public.customers on delete set null,subject text not null,body text not null,direction text not null,recipient text,sender text,provider_id text unique,status text not null default 'draft',created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.followups(id uuid primary key default gen_random_uuid(),customer_id uuid references public.customers on delete set null,phone_call_id uuid references public.phone_calls on delete set null,appointment_id uuid references public.appointments on delete set null,summary text not null,priority text not null default 'normal' check(priority in ('low','normal','high','urgent')),status text not null default 'open',due_at timestamptz not null default now(),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.reviews(id uuid primary key default gen_random_uuid(),customer_id uuid references public.customers on delete set null,rating integer check(rating between 1 and 5),content text,source text not null default 'customer',provider_id text unique,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.review_requests(id uuid primary key default gen_random_uuid(),customer_id uuid references public.customers on delete set null,appointment_id uuid unique references public.appointments on delete cascade,status text not null default 'not_sent' check(status in ('not_sent','sent','opened','reviewed','followup_needed')),sent_at timestamptz,opened_at timestamptz,reminders integer not null default 0 check(reminders between 0 and 1),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.repeat_booking_suggestions(id uuid primary key default gen_random_uuid(),customer_id uuid references public.customers on delete cascade,appointment_id uuid unique references public.appointments on delete cascade,due_at timestamptz not null,reason text not null,status text not null default 'pending',created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.quotes(id uuid primary key default gen_random_uuid(),customer_id uuid references public.customers on delete set null,status text not null default 'draft' check(status in ('draft','approved','sent','accepted','declined')),title text not null,notes text,total_cents integer not null default 0 check(total_cents>=0),approved_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.quote_items(id uuid primary key default gen_random_uuid(),quote_id uuid not null references public.quotes on delete cascade,description text not null,quantity numeric not null check(quantity>0),unit_cents integer not null check(unit_cents>=0),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.payments(id uuid primary key default gen_random_uuid(),customer_id uuid references public.customers on delete set null,appointment_id uuid references public.appointments,amount_cents integer not null check(amount_cents>=0),currency text not null default 'EUR',status text not null default 'pending',provider text not null default 'manual',provider_id text unique,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.invoices(id uuid primary key default gen_random_uuid(),customer_id uuid references public.customers on delete set null,number text unique,amount_cents integer not null check(amount_cents>=0),status text not null default 'draft',due_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.promotions(id uuid primary key default gen_random_uuid(),code text unique not null,description text not null,discount_percent integer not null check(discount_percent between 0 and 100),starts_at timestamptz not null,ends_at timestamptz not null,active boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),check(ends_at>starts_at));
create table public.customer_notes(id uuid primary key default gen_random_uuid(),customer_id uuid not null references public.customers on delete cascade,content text not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.ai_actions(id uuid primary key default gen_random_uuid(),customer_id uuid references public.customers on delete set null,source text not null,action text not null,reason text,result jsonb,status text not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.automation_jobs(id uuid primary key default gen_random_uuid(),customer_id uuid references public.customers on delete set null,appointment_id uuid references public.appointments on delete cascade,kind text not null,status text not null default 'queued' check(status in ('queued','processing','sent','completed','skipped','dead','cancelled')),dedupe_key text not null unique,payload jsonb not null default '{}',scheduled_at timestamptz not null default now(),attempts integer not null default 0,locked_until timestamptz,lease_token uuid,provider_id text,last_error text,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create index jobs_due on public.automation_jobs(status,scheduled_at);
create table public.notifications(id uuid primary key default gen_random_uuid(),title text not null,body text not null,status text not null default 'unread',priority text not null default 'normal',created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.audit_logs(id uuid primary key default gen_random_uuid(),actor text not null,action text not null,entity text not null,entity_id uuid,detail jsonb not null default '{}',created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table private.request_limits(key text primary key,hits integer not null,reset_at timestamptz not null);
create table private.webhook_events(id text primary key,provider text not null,status text not null default 'processing',lease_until timestamptz not null default now()+interval '60 seconds',created_at timestamptz not null default now());
-- Explicit grants + owner membership. Clients cannot mutate core records directly.
do $$ declare t text; begin foreach t in array array['customers','customer_addresses','vehicles','services','service_prices','service_packages','employees','users','settings','availability','bookings','phone_calls','call_transcripts','call_actions','conversations','messages','emails','followups','reviews','review_requests','repeat_booking_suggestions','quotes','quote_items','payments','invoices','promotions','customer_notes','ai_actions','automation_jobs','notifications','audit_logs'] loop
execute format('alter table public.%I enable row level security',t);
execute format('revoke all on public.%I from anon,authenticated',t);
execute format('grant all on public.%I to service_role',t);
execute format('grant select on public.%I to authenticated',t);
if t='users' then execute 'create policy own_membership on public.users for select to authenticated using(id=(select auth.uid()))';
else execute format('create policy staff_read on public.%I for select to authenticated using(exists(select 1 from public.users u where u.id=(select auth.uid()) and u.active))',t); end if;
end loop; end $$;
-- Add a supporting index for every new FK.
do $$ declare r record; begin for r in select c.conrelid::regclass tab,a.attname col from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey) where c.contype='f' and c.connamespace='public'::regnamespace loop execute format('create index if not exists %I on %s(%I)',replace(r.tab::text,'.','_')||'_'||r.col||'_fk',r.tab,r.col); end loop; end $$;
create or replace function private.audit_change() returns trigger language plpgsql set search_path='' as $$ begin
if TG_OP='UPDATE' then new.updated_at:=now(); end if;
insert into public.audit_logs(actor,action,entity,entity_id,detail) values(coalesce(current_setting('luxwash.actor',true),'server'),TG_OP,TG_TABLE_NAME,coalesce(new.id,old.id),jsonb_build_object('fields',case when TG_OP='DELETE' then '[]'::jsonb else (select jsonb_agg(k) from jsonb_object_keys(to_jsonb(new)) k) end));
return coalesce(new,old); end $$;
do $$ declare t text; begin foreach t in array array['customers','services','service_prices','settings','availability','appointments','quotes','payments','followups','users'] loop execute format('create trigger audit_change before insert or update or delete on public.%I for each row execute function private.audit_change()',t); end loop; end $$;
-- Backfill CRM from existing leads; retain original IDs and all historical references.
insert into public.customers(id,name,email,phone,marketing_consent,created_at) select id,name,nullif(email,''),nullif(phone,''),false,created_at from public.leads;
update public.leads set customer_id=id;
update public.appointments a set customer_id=l.customer_id from public.leads l where a.lead_id=l.id;
create or replace function private.available(p_service uuid,p_start timestamptz,p_postcode text,p_ignore uuid default null) returns boolean language plpgsql set search_path='' as $$
declare s public.services; cfg jsonb; finish timestamptz; localday date; v_local_time time; localend time; opened boolean;
begin
select * into s from public.services where id=p_service and active; if not found then return false; end if;
select value into cfg from public.settings where key='planning';
if not (cfg->'allowed_postcodes' ? p_postcode) then return false; end if;
if p_start<now()+make_interval(hours=>(cfg->>'lead_hours')::int) or p_start>now()+make_interval(days=>(cfg->>'horizon_days')::int) then return false; end if;
finish:=p_start+make_interval(mins=>s.duration_minutes+s.buffer_minutes);
localday:=(p_start at time zone 'Europe/Brussels')::date; v_local_time:=(p_start at time zone 'Europe/Brussels')::time; localend:=(finish at time zone 'Europe/Brussels')::time;
if (finish at time zone 'Europe/Brussels')::date<>localday then return false; end if;
select exists(select 1 from public.availability where kind='open' and starts_at<=p_start and ends_at>=finish) or exists(select 1 from jsonb_array_elements(cfg->'opening_hours') h where (h->>'weekday')::int=extract(isodow from localday)::int and v_local_time>=(h->>'start')::time and localend<=(h->>'end')::time) into opened;
if not opened then return false; end if;
if exists(select 1 from public.availability where kind='blocked' and starts_at<finish and ends_at>p_start) then return false; end if;
if exists(select 1 from public.appointments where status in ('scheduled','confirmed','pending','requested') and id is distinct from p_ignore and starts_at<finish and occupied_until>p_start) then return false; end if;
if (select count(*) from public.appointments where status in ('scheduled','confirmed','pending','requested') and id is distinct from p_ignore and (starts_at at time zone 'Europe/Brussels')::date=localday)>=(cfg->>'max_per_day')::int then return false; end if;
return true;
end $$;
create or replace function private.enqueue_appointment(a public.appointments) returns void language plpgsql set search_path='' as $$
declare cfg jsonb; begin
select value into cfg from public.settings where key='planning';
insert into public.automation_jobs(customer_id,appointment_id,kind,dedupe_key,scheduled_at) values
(a.customer_id,a.id,case when a.status='requested' then 'request_received' else 'confirmation' end,a.id||':confirmation:'||a.revision,now()),
(a.customer_id,a.id,'reminder',a.id||':reminder:'||a.revision,a.starts_at-make_interval(hours=>(cfg->>'reminder_hours')::int)) on conflict(dedupe_key) do nothing;
end $$;
create or replace function private.luxwash_dispatch(action text,p jsonb) returns jsonb language plpgsql set search_path='' as $$
declare result jsonb; cfg jsonb; c public.customers; a public.appointments; s public.services; job public.automation_jobs; cid uuid; lid uuid; rid uuid; price integer; st timestamptz; t text; cols text; updates text; allowed text[]; vkey text; rowdata jsonb; vlease uuid; opened boolean;
begin
case action
when 'health' then return jsonb_build_object('ok',true,'schema','luxwash-central-1');
when 'settings' then select jsonb_object_agg(key,value) into result from public.settings; return result;
when 'catalog' then select coalesce(jsonb_agg(to_jsonb(x)),'[]') into result from (select s.*,coalesce((select jsonb_agg(to_jsonb(p)) from public.service_prices p where p.service_id=s.id),'[]') prices from public.services s where s.active order by s.name) x; return result;
when 'price' then null;
when 'noop' then return '{}'::jsonb;
else null;
end case;
if action='price' then
select * into s from public.services where id=(p->>'service_id')::uuid and active;
if not found then raise exception 'unknown_service'; end if;
select amount_cents into price from public.service_prices where service_id=s.id and category=coalesce(p->>'category','standard');
return jsonb_build_object('service',s.name,'amount_cents',price,'price_mode',s.price_mode,'currency','EUR','unit',(select unit from public.service_prices where service_id=s.id and category=coalesce(p->>'category','standard')),'requires_quote',s.price_mode='quote' or price is null);
end if;
if action='slots' then
select coalesce(jsonb_agg(x),'[]') into result from (select ts starts_at,ts+make_interval(mins=>s.duration_minutes) ends_at from public.services s cross join generate_series((p->>'from')::timestamptz,least((p->>'to')::timestamptz,(p->>'from')::timestamptz+interval '14 days'),interval '30 minutes') ts where s.id=(p->>'service_id')::uuid and private.available(s.id,ts,p->>'postcode',nullif(p->>'ignore','')::uuid) order by ts limit 40) x; return result;
end if;
if action='customer_find' then
select coalesce(jsonb_agg(to_jsonb(x)),'[]') into result from(select * from public.customers where status='active' and ((nullif(p->>'phone','') is not null and phone=p->>'phone') or (nullif(p->>'email','') is not null and lower(email)=lower(p->>'email'))) limit 5) x; return result;
end if;
if action in ('customer_create','book') then
perform pg_advisory_xact_lock(hashtextextended('luxwash-customers',0));
-- Reuse only an unambiguous exact match; never overwrite a profile based on claimed identity.
select * into c from public.customers where status='active' and lower(name)=lower(p->>'name') and ((nullif(p->>'email','') is not null and lower(email)=lower(p->>'email')) or (nullif(p->>'phone','') is not null and phone=p->>'phone')) order by created_at limit 1;
if c.id is null then insert into public.customers(name,email,phone,marketing_consent,consent_at) values(p->>'name',nullif(lower(p->>'email'),''),nullif(p->>'phone',''),coalesce((p->>'marketing_consent')::boolean,false),case when (p->>'marketing_consent')::boolean then now() end) returning * into c; end if;
if action='customer_create' then return to_jsonb(c); end if;
end if;
if action='book' then
perform pg_advisory_xact_lock(hashtextextended('luxwash-bookings',0));
select * into a from public.appointments where idempotency_key=p->>'idempotency_key';
if a.id is not null then return jsonb_build_object('appointment',to_jsonb(a),'replayed',true); end if;
select * into s from public.services where id=(p->>'service_id')::uuid and active;
if not found then raise exception 'unknown_service'; end if;
st:=(p->>'starts_at')::timestamptz;
if not private.available(s.id,st,p->>'postcode') then raise exception 'slot_unavailable' using errcode='23P01'; end if;
select amount_cents into price from public.service_prices where service_id=s.id and category=coalesce(p->>'category','standard');
if price is null or s.price_mode='quote' then raise exception 'quote_required'; end if;
insert into public.customer_addresses(customer_id,address,postcode) values(c.id,p->>'address',p->>'postcode');
if nullif(p->>'vehicle','') is not null then insert into public.vehicles(customer_id,category,model) values(c.id,coalesce(p->>'category','standard'),p->>'vehicle'); end if;
insert into public.leads(id,customer_id,name,email,phone,service,message,source,status,next_action) values(gen_random_uuid(),c.id,c.name,coalesce(c.email,''),coalesce(c.phone,''),s.name,coalesce(p->>'notes',''),p->>'source','won','Afspraak') returning id into lid;
insert into public.appointments(id,lead_id,customer_id,catalog_service_id,service_id,starts_at,ends_at,status,address,postcode,vehicle,price_cents,price_mode,buffer_minutes,idempotency_key,manage_token_hash,source,notes)
values(gen_random_uuid(),lid,c.id,s.id,s.id::text,st,st+make_interval(mins=>s.duration_minutes),case when s.price_mode='fixed' then 'confirmed' else 'requested' end,p->>'address',p->>'postcode',p->>'vehicle',price,s.price_mode,s.buffer_minutes,p->>'idempotency_key',p->>'manage_token_hash',p->>'source',coalesce(p->>'notes','')) returning * into a;
insert into public.bookings(appointment_id,customer_id,source,status) values(a.id,c.id,a.source,a.status);
perform private.enqueue_appointment(a);
insert into public.ai_actions(customer_id,source,action,reason,result,status) values(c.id,a.source,'createAppointment','Klant kiest beschikbaar tijdslot',jsonb_build_object('appointment_id',a.id),a.status);
return jsonb_build_object('appointment',to_jsonb(a),'replayed',false);
end if;
if action='manage_get' then
select to_jsonb(x)-'manage_token_hash' into result from public.appointments x where id=(p->>'id')::uuid and manage_token_hash=p->>'token_hash';
if result is null then raise exception 'not_authorized' using errcode='42501'; end if; return result;
end if;
if action='appointment_change' then
perform pg_advisory_xact_lock(hashtextextended('luxwash-bookings',0));
select * into a from public.appointments where id=(p->>'id')::uuid for update;
if a.id is null then raise exception 'not_found'; end if;
if not coalesce((p->>'admin')::boolean,false) and a.manage_token_hash is distinct from p->>'token_hash' then raise exception 'not_authorized' using errcode='42501'; end if;
if a.status='cancelled' and p->>'status'='cancelled' then return to_jsonb(a)-'manage_token_hash'; end if;
if a.status in ('cancelled','completed') then raise exception 'invalid_transition'; end if;
if p ? 'starts_at' then
st:=(p->>'starts_at')::timestamptz;
if not private.available(a.catalog_service_id,st,a.postcode,a.id) then raise exception 'slot_unavailable' using errcode='23P01'; end if;
a.ends_at:=st+(a.ends_at-a.starts_at); a.starts_at:=st;
end if;
if p ? 'status' then
if p->>'status' not in ('cancelled','confirmed','completed') then raise exception 'invalid_status'; end if;
if not coalesce((p->>'admin')::boolean,false) and p->>'status'<>'cancelled' then raise exception 'not_authorized' using errcode='42501'; end if;
a.status:=p->>'status';
end if;
update public.appointments set starts_at=a.starts_at,ends_at=a.ends_at,status=a.status,revision=revision+1,completed_at=case when a.status='completed' then now() else completed_at end where id=a.id returning * into a;
update public.bookings set status=a.status,updated_at=now() where appointment_id=a.id;
update public.automation_jobs set status='cancelled' where appointment_id=a.id and status='queued' and kind in ('confirmation','reminder','request_received');
if a.status in ('confirmed','scheduled','requested') then perform private.enqueue_appointment(a);
elsif a.status='completed' then
select value into cfg from public.settings where key='planning';
insert into public.review_requests(customer_id,appointment_id) values(a.customer_id,a.id) on conflict do nothing;
insert into public.automation_jobs(customer_id,appointment_id,kind,dedupe_key,scheduled_at) values(a.customer_id,a.id,'aftercare',a.id||':aftercare',now()+interval '24 hours') on conflict do nothing;
insert into public.repeat_booking_suggestions(customer_id,appointment_id,due_at,reason) values(a.customer_id,a.id,now()+make_interval(weeks=>(cfg->>'repeat_weeks')::int),'Ingesteld onderhoudsinterval; aanpassen op basis van klantgeschiedenis') on conflict do nothing;
insert into public.automation_jobs(customer_id,appointment_id,kind,dedupe_key,scheduled_at) values(a.customer_id,a.id,'repeat',a.id||':repeat',now()+make_interval(weeks=>(cfg->>'repeat_weeks')::int)) on conflict do nothing;
else insert into public.automation_jobs(customer_id,appointment_id,kind,dedupe_key) values(a.customer_id,a.id,'cancellation',a.id||':cancelled') on conflict do nothing; end if;
return to_jsonb(a)-'manage_token_hash';
end if;
if action='handoff' then
insert into public.followups(customer_id,phone_call_id,summary,priority) values(nullif(p->>'customer_id','')::uuid,nullif(p->>'phone_call_id','')::uuid,p->>'summary',coalesce(p->>'priority','normal')) returning id into rid;
insert into public.notifications(title,body,priority) values('Terugbellen',p->>'summary',coalesce(p->>'priority','normal'));
return jsonb_build_object('ok',true,'id',rid);
end if;
if action='session' then
insert into public.conversations(token_hash,source) values(p->>'token_hash',coalesce(p->>'source','website')) on conflict(token_hash) do update set updated_at=now() returning id into cid;
select jsonb_build_object('id',cid,'messages',coalesce(jsonb_agg(x order by x.created_at),'[]')) into result from (select direction,content,created_at from public.messages where conversation_id=cid order by created_at desc limit 24) x; return result;
end if;
if action='message' then insert into public.messages(conversation_id,customer_id,channel,direction,content,intent,priority,provider_id) values(nullif(p->>'conversation_id','')::uuid,nullif(p->>'customer_id','')::uuid,coalesce(p->>'channel','website'),p->>'direction',p->>'content',p->>'intent',coalesce(p->>'priority','normal'),p->>'provider_id') on conflict(provider_id) do nothing returning id into rid; return jsonb_build_object('id',rid); end if;
if action='rate' then
insert into private.request_limits(key,hits,reset_at) values(p->>'key',1,now()+make_interval(secs=>(p->>'seconds')::int)) on conflict(key) do update set hits=case when request_limits.reset_at<now() then 1 else request_limits.hits+1 end,reset_at=case when request_limits.reset_at<now() then excluded.reset_at else request_limits.reset_at end returning hits<=(p->>'limit')::int into opened; return jsonb_build_object('allowed',opened);
end if;
if action='claim_jobs' then
with due as (select id from public.automation_jobs where (status='queued' and scheduled_at<=now()) or (status='processing' and locked_until<now()) order by scheduled_at limit 20 for update skip locked), claimed as (update public.automation_jobs j set status='processing',attempts=attempts+1,locked_until=now()+interval '3 minutes',lease_token=gen_random_uuid(),updated_at=now() from due where j.id=due.id returning j.*) select coalesce(jsonb_agg(to_jsonb(claimed)),'[]') into result from claimed; return result;
end if;
if action='finish_job' then
update public.automation_jobs set status=p->>'status',provider_id=p->>'provider_id',last_error=p->>'error',locked_until=null,updated_at=now(),scheduled_at=now()+make_interval(secs=>least(3600,power(2,attempts)::int*30)) where id=(p->>'id')::uuid and status='processing' and lease_token=(p->>'lease_token')::uuid returning * into job;
if job.id is null then raise exception 'lease_lost'; end if;
if job.status='dead' then insert into public.notifications(title,body,priority) values('Bericht vraagt aandacht',coalesce(job.last_error,'Verzending mislukt'),'high'); end if;
if job.status='sent' and job.kind='aftercare' then update public.review_requests set status='sent',sent_at=now() where appointment_id=job.appointment_id; end if;
return to_jsonb(job);
end if;
if action='job_context' then select jsonb_build_object('job',to_jsonb(j),'appointment',to_jsonb(a)-'manage_token_hash','customer',to_jsonb(c),'service',to_jsonb(s)) into result from public.automation_jobs j left join public.appointments a on a.id=j.appointment_id left join public.customers c on c.id=j.customer_id left join public.services s on s.id=a.catalog_service_id where j.id=(p->>'id')::uuid; return result; end if;
if action='call_start' then
insert into public.phone_calls(provider_call_id,phone) values(p->>'provider_call_id',p->>'phone') on conflict(provider_call_id) do nothing;
select to_jsonb(x) into result from public.phone_calls x where provider_call_id=p->>'provider_call_id'; return result;
end if;
if action='call_update' then update public.phone_calls set status=coalesce(p->>'status',status),summary=coalesce(p->>'summary',summary),intent=coalesce(p->>'intent',intent),sentiment=coalesce(p->>'sentiment',sentiment),customer_id=coalesce(nullif(p->>'customer_id','')::uuid,customer_id),escalated=coalesce((p->>'escalated')::boolean,escalated),ended_at=case when p->>'status' in ('completed','failed') then now() else ended_at end,updated_at=now() where provider_call_id=p->>'provider_call_id' returning to_jsonb(phone_calls.*) into result; return result; end if;
if action='transcript' then insert into public.call_transcripts(phone_call_id,event_id,role,content) select id,p->>'event_id',p->>'role',p->>'content' from public.phone_calls where provider_call_id=p->>'provider_call_id' on conflict(event_id) do nothing; return '{"ok":true}'; end if;
if action='tool_claim' then
insert into public.call_actions(phone_call_id,tool_call_id,name) select id,p->>'tool_call_id',p->>'name' from public.phone_calls where provider_call_id=p->>'provider_call_id' on conflict(tool_call_id) do nothing returning id into rid;
select jsonb_build_object('claimed',rid is not null,'action',to_jsonb(x)) into result from public.call_actions x where tool_call_id=p->>'tool_call_id'; return result;
end if;
if action='tool_finish' then update public.call_actions set result=p->'result',status='completed',updated_at=now() where tool_call_id=p->>'tool_call_id'; return '{"ok":true}'; end if;
if action='webhook_claim' then
insert into private.webhook_events(id,provider) values(p->>'id',p->>'provider') on conflict(id) do update set lease_until=now()+interval '60 seconds' where webhook_events.status='processing' and webhook_events.lease_until<now() returning id into vkey; return jsonb_build_object('claimed',vkey is not null);
end if;
if action='webhook_finish' then update private.webhook_events set status='completed' where id=p->>'id'; return '{"ok":true}'; end if;
if action='member' then select to_jsonb(x) into result from public.users x where id=(p->>'id')::uuid and active; return result; end if;
if action='retention' then
 delete from public.call_transcripts where expires_at<now();
 delete from public.messages where created_at<now()-interval '90 days';
 delete from public.conversations where updated_at<now()-interval '90 days';
 delete from private.request_limits where reset_at<now()-interval '1 day';
 delete from private.webhook_events where created_at<now()-interval '30 days';
 return '{"ok":true}';
end if;
if action='list' then
 t:=p->>'table'; allowed:=array['customers','customer_addresses','vehicles','services','service_prices','service_packages','employees','users','settings','availability','leads','appointments','bookings','phone_calls','call_transcripts','call_actions','messages','emails','followups','reviews','review_requests','repeat_booking_suggestions','quotes','quote_items','payments','invoices','promotions','customer_notes','ai_actions','automation_jobs','notifications','audit_logs'];
 if not t=any(allowed) then raise exception 'invalid_table'; end if;
 execute format('select coalesce(jsonb_agg(to_jsonb(x)-''manage_token_hash''),''[]'') from(select * from public.%I order by created_at desc limit 500) x',t) into result; return result;
end if;
if action='save' then
 t:=p->>'table'; rowdata:=p->'data';
 -- Table and column allowlists are enforced at both API and database boundaries.
 allowed:=case t
 when 'services' then array['name','description','duration_minutes','buffer_minutes','price_mode','active','preparation','source_url']
 when 'service_prices' then array['service_id','category','amount_cents','unit']
 when 'availability' then array['starts_at','ends_at','kind','reason']
 when 'customer_notes' then array['customer_id','content']
 when 'vehicles' then array['customer_id','category','make','model','registration']
 when 'customer_addresses' then array['customer_id','address','postcode','city']
 when 'customers' then array['name','email','phone','marketing_consent','status']
 when 'quotes' then array['customer_id','title','notes','total_cents','status','approved_at']
 when 'quote_items' then array['quote_id','description','quantity','unit_cents']
 when 'payments' then array['customer_id','appointment_id','amount_cents','status','provider','provider_id']
 when 'invoices' then array['customer_id','number','amount_cents','status','due_at']
 when 'promotions' then array['code','description','discount_percent','starts_at','ends_at','active']
 when 'followups' then array['customer_id','summary','priority','status','due_at']
 when 'employees' then array['name','active']
 when 'users' then array['name','role','active']
 when 'notifications' then array['status']
 when 'reviews' then array['customer_id','rating','content','source','provider_id']
 when 'review_requests' then array['status']
 when 'emails' then array['customer_id','subject','body','direction','recipient','sender','provider_id','status']
 when 'ai_actions' then array['customer_id','source','action','reason','result','status']
 else null end;
 if allowed is null or exists(select 1 from jsonb_object_keys(rowdata) k where not k=any(allowed)) then raise exception 'invalid_fields'; end if;
 select string_agg(format('%I',k),','),string_agg(format('%I=x.%I',k,k),',') into cols,updates from jsonb_object_keys(rowdata) k;
 if nullif(p->>'id','') is null then
 execute format('insert into public.%I(%s) select %s from jsonb_populate_record(null::public.%I,$1) x returning to_jsonb(%I.*)',t,cols,cols,t,t) into result using rowdata;
 else execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$1) x where t.id=$2 returning to_jsonb(t.*)',t,updates,t) into result using rowdata,(p->>'id')::uuid; end if;
 return result;
end if;
if action='setting_save' then update public.settings set value=p->'value' where key=p->>'key' returning to_jsonb(settings.*) into result; return result; end if;
if action='export_customer' then
cid:=(p->>'id')::uuid; select to_jsonb(x) into result from public.customers x where id=cid;
result:=jsonb_build_object('customer',result);
foreach t in array array['customer_addresses','vehicles','customer_notes','leads','appointments','bookings','messages','emails','phone_calls','followups','quotes','payments','invoices','reviews','review_requests','repeat_booking_suggestions'] loop execute format('select coalesce(jsonb_agg(to_jsonb(x)-''manage_token_hash''),''[]'') from public.%I x where customer_id=$1',t) into rowdata using cid;result:=result||jsonb_build_object(t,rowdata); end loop;
select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rowdata from public.call_transcripts x join public.phone_calls c on c.id=x.phone_call_id where c.customer_id=cid; return result||jsonb_build_object('transcripts',rowdata);
end if;
if action='erase_customer' then
cid:=(p->>'id')::uuid;
if exists(select 1 from public.appointments where customer_id=cid and status in ('requested','confirmed','scheduled','pending')) then raise exception 'active_appointments_require_review'; end if;
update public.customers set name='Verwijderde klant',email=null,phone=null,status='erased',marketing_consent=false where id=cid;
update public.leads set name='Verwijderde klant',email='',phone='',message='',metadata='{}',opted_out=true where customer_id=cid;
update public.appointments set address=null,postcode=null,vehicle=null,notes='',manage_token_hash=null where customer_id=cid;
delete from public.messages where customer_id=cid;
delete from public.emails where customer_id=cid;
delete from public.call_transcripts where phone_call_id in(select id from public.phone_calls where customer_id=cid);
update public.phone_calls set phone=null,summary=null where customer_id=cid;
delete from public.customer_addresses where customer_id=cid; delete from public.vehicles where customer_id=cid; delete from public.customer_notes where customer_id=cid;
update public.automation_jobs set status='cancelled',payload='{}' where customer_id=cid and status in ('queued','processing');
return '{"ok":true,"financial_records":"retained_for_owner_retention_review"}';
end if;
raise exception 'unknown_action';
end $$;
-- Single guarded server RPC reuses the existing app secret; no credential migration.
create or replace function public.luxwash_rpc(p_secret text,p_action text,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$ begin
perform public.ai_business_rpc(p_secret,'health','{}');
return private.luxwash_dispatch(p_action,p_payload);
end $$;
revoke all on function public.luxwash_rpc(text,text,jsonb) from public;
grant execute on function public.luxwash_rpc(text,text,jsonb) to anon,authenticated,service_role;
revoke all on all functions in schema private from public,anon,authenticated;

-- Imported from existing LuxWash catalog. Estimates until owner enables fixed pricing.
insert into public.services(id,name,duration_minutes,buffer_minutes,price_mode,source_url) values('22dacf73-3fc9-4cfa-ab75-5cd7b4657414','Interior Refresh (Sedan)',60,30,'estimate','https://www.luxwash.online/prijzen');
insert into public.service_prices(service_id,amount_cents) values('22dacf73-3fc9-4cfa-ab75-5cd7b4657414',5500);
insert into public.services(id,name,duration_minutes,buffer_minutes,price_mode,source_url) values('49077f6d-a24b-4f76-836a-6f843b525377','Interior Refresh (Kleine bestelwagen)',60,30,'estimate','https://www.luxwash.online/prijzen');
insert into public.service_prices(service_id,amount_cents) values('49077f6d-a24b-4f76-836a-6f843b525377',7500);
insert into public.services(id,name,duration_minutes,buffer_minutes,price_mode,source_url) values('4cc1501c-e7d0-4311-98f2-41ec0542f06b','Premium Mobile Detail (Break/SUV)',150,30,'estimate','https://www.luxwash.online/prijzen');
insert into public.service_prices(service_id,amount_cents) values('4cc1501c-e7d0-4311-98f2-41ec0542f06b',14500);
insert into public.services(id,name,duration_minutes,buffer_minutes,price_mode,source_url) values('8b161d1f-1101-479f-974b-8df6fb7d3c53','Clean & Shine (Kleine bestelwagen)',60,30,'estimate','https://www.luxwash.online/prijzen');
insert into public.service_prices(service_id,amount_cents) values('8b161d1f-1101-479f-974b-8df6fb7d3c53',6500);
insert into public.services(id,name,duration_minutes,buffer_minutes,price_mode,source_url) values('9e72da22-f58e-487a-bc7c-616e0432464d','Full Detail Light (Kleine bestelwagen)',120,30,'estimate','https://www.luxwash.online/prijzen');
insert into public.service_prices(service_id,amount_cents) values('9e72da22-f58e-487a-bc7c-616e0432464d',11000);
insert into public.services(id,name,duration_minutes,buffer_minutes,price_mode,source_url) values('a061c6c3-c3a6-4a3f-929e-eb309567cb5a','Full Detail Light (Break/SUV)',120,30,'estimate','https://www.luxwash.online/prijzen');
insert into public.service_prices(service_id,amount_cents) values('a061c6c3-c3a6-4a3f-929e-eb309567cb5a',10000);
insert into public.services(id,name,duration_minutes,buffer_minutes,price_mode,source_url) values('b4774d75-caaf-41ff-9a6f-771407684b59','Interior Refresh (Break/SUV)',60,30,'estimate','https://www.luxwash.online/prijzen');
insert into public.service_prices(service_id,amount_cents) values('b4774d75-caaf-41ff-9a6f-771407684b59',6500);
insert into public.services(id,name,duration_minutes,buffer_minutes,price_mode,source_url) values('d5ca0138-2257-48c7-9909-7d4e98fb12fb','Full Detail Light (Sedan)',120,30,'estimate','https://www.luxwash.online/prijzen');
insert into public.service_prices(service_id,amount_cents) values('d5ca0138-2257-48c7-9909-7d4e98fb12fb',9000);
insert into public.services(id,name,duration_minutes,buffer_minutes,price_mode,source_url) values('d7649e10-175c-429e-91d0-3be2cfce2717','Clean & Shine (Break/SUV)',60,30,'estimate','https://www.luxwash.online/prijzen');
insert into public.service_prices(service_id,amount_cents) values('d7649e10-175c-429e-91d0-3be2cfce2717',5500);
insert into public.services(id,name,duration_minutes,buffer_minutes,price_mode,source_url) values('e5cc6efe-f4fc-40dd-9d0a-4af3698213de','Premium Mobile Detail (Kleine bestelwagen)',150,30,'estimate','https://www.luxwash.online/prijzen');
insert into public.service_prices(service_id,amount_cents) values('e5cc6efe-f4fc-40dd-9d0a-4af3698213de',15500);
insert into public.services(id,name,duration_minutes,buffer_minutes,price_mode,source_url) values('f46c3eea-b2e9-4823-adcb-087a825d91e0','Clean & Shine (Sedan)',60,30,'estimate','https://www.luxwash.online/prijzen');
insert into public.service_prices(service_id,amount_cents) values('f46c3eea-b2e9-4823-adcb-087a825d91e0',4500);
insert into public.services(id,name,duration_minutes,buffer_minutes,price_mode,source_url) values('fda7e84b-0565-43b8-b41b-0f9b80629397','Premium Mobile Detail (Sedan)',150,30,'estimate','https://www.luxwash.online/prijzen');
insert into public.service_prices(service_id,amount_cents) values('fda7e84b-0565-43b8-b41b-0f9b80629397',13500);
