-- Additive LuxWash flow layer. Existing records/providers remain intact.
alter table public.quotes drop constraint quotes_status_check;
alter table public.quotes add constraint quotes_status_check check(status in ('draft','approved','sent','viewed','accepted','declined','expired'));
alter table public.review_requests drop constraint review_requests_status_check;
alter table public.review_requests add constraint review_requests_status_check check(status in ('not_sent','sent','opened','reviewed','followup_needed','skipped'));
alter table public.events add column if not exists dedupe_key text;
alter table public.events add column if not exists payload jsonb not null default '{}';
alter table public.events add column if not exists customer_id uuid references public.customers(id);
create unique index if not exists events_dedupe_key on public.events(dedupe_key) where dedupe_key is not null;
alter table public.followups add column if not exists dedupe_key text;
create unique index if not exists followups_dedupe_key on public.followups(dedupe_key) where dedupe_key is not null;
alter table public.quotes add column if not exists accept_token_hash text;
alter table public.quotes add column if not exists expires_at timestamptz;
alter table public.quotes add column if not exists viewed_at timestamptz;
alter table public.quotes add column if not exists accepted_at timestamptz;
alter table public.quotes add column if not exists declined_at timestamptz;
alter table public.social_posts add column if not exists content_hash text;
create unique index if not exists social_posts_provider on public.social_posts(platform,provider_id) where provider_id is not null;
create unique index if not exists social_posts_content_hash on public.social_posts(platform,content_hash) where content_hash is not null;
create table if not exists private.flow_runtime_state(key text primary key,value jsonb not null,updated_at timestamptz not null default now());
revoke all on private.flow_runtime_state from public,anon,authenticated;
create table if not exists private.review_delivery_locks(customer_id uuid primary key references public.customers(id),job_id uuid not null references public.automation_jobs(id),created_at timestamptz not null default now());
revoke all on private.review_delivery_locks from public,anon,authenticated;
insert into public.settings(key,value) values('flow',jsonb_build_object(
'acknowledgements',true,'automatic_followups',false,'first_followup_hours',48,
'second_followup_hours',120,'quote_valid_days',14,'auto_followup_note','Uitgeschakeld tot inkomende antwoorden aantoonbaar worden verwerkt.'
)) on conflict(key) do nothing;

create or replace function private.flow_event(kind text,entity uuid,cid uuid,data jsonb,dedupe text)
returns void language plpgsql set search_path='' as $$
begin
 insert into public.events(id,type,customer_id,status,payload,dedupe_key)
 values(gen_random_uuid(),kind,cid,'recorded',jsonb_build_object('entity_id',entity)||coalesce(data,'{}'),dedupe)
 on conflict(dedupe_key) where dedupe_key is not null do nothing;
end $$;
revoke all on function private.flow_event(text,uuid,uuid,jsonb,text) from public,anon,authenticated;

create or replace function private.flow_capture() returns trigger language plpgsql set search_path='' as $$
declare cid uuid; label text; key text;
begin
 if tg_op='UPDATE' and (to_jsonb(old)->'status') is not distinct from (to_jsonb(new)->'status') and (to_jsonb(old)->'starts_at') is not distinct from (to_jsonb(new)->'starts_at') then return new;end if;
 if tg_table_name='customers' then cid:=new.id;else cid:=(to_jsonb(new)->>'customer_id')::uuid;end if;
 if tg_table_name='customers' then label:='customer.created';
 elsif tg_table_name='leads' then label:=case when tg_op='INSERT' then 'lead.created' else 'lead.updated' end;
 elsif tg_table_name='appointments' then label:=case when tg_op='INSERT' then 'booking.created' when new.status='completed' then 'booking.completed' when new.status='cancelled' then 'booking.cancelled' when new.status='confirmed' then 'booking.confirmed' else 'booking.updated' end;
 elsif tg_table_name='quotes' then label:=case when tg_op='INSERT' then 'quote.created' else 'quote.'||new.status end;
 elsif tg_table_name='payments' then label:=case when new.status='paid' then 'payment.received' else 'payment.updated' end;
 elsif tg_table_name='reviews' then label:='review.recorded';
 else return new;
 end if;
 key:=tg_table_name||':'||new.id||':'||txid_current()::text||':'||label;
 perform private.flow_event(label,new.id,cid,jsonb_build_object('table',tg_table_name,'status',coalesce(to_jsonb(new)->>'status','')),key);
 if tg_table_name='leads' and tg_op='INSERT' and (to_jsonb(new)->>'status')='new' then
  update public.leads set follow_up_at=coalesce(follow_up_at,now()+interval '48 hours'),next_action='Aanvraag beoordelen en beantwoorden' where id=new.id;
 end if;
 return new;
end $$;
revoke all on function private.flow_capture() from public,anon,authenticated;
create trigger flow_customer after insert on public.customers for each row execute function private.flow_capture();
create trigger flow_lead_new after insert on public.leads for each row execute function private.flow_capture();
create trigger flow_lead_status after update of status on public.leads for each row when(old.status is distinct from new.status) execute function private.flow_capture();
create trigger flow_appointment after insert or update of status,starts_at on public.appointments for each row execute function private.flow_capture();
create trigger flow_quote after insert or update of status on public.quotes for each row execute function private.flow_capture();
create trigger flow_payment after insert or update of status on public.payments for each row execute function private.flow_capture();
create trigger flow_review after insert on public.reviews for each row execute function private.flow_capture();

-- Any recorded inbound reply cancels pending automatic follow-ups, independent of AI.
create or replace function private.flow_inbound() returns trigger language plpgsql set search_path='' as $$
begin
 if new.direction='inbound' and new.customer_id is not null then
  update public.leads set last_inbound_at=new.created_at,follow_up_at=null,next_action='Antwoord ontvangen; persoonlijk beoordelen'
   where customer_id=new.customer_id and status not in ('won','lost','closed','completed','cancelled','not_interested');
  update public.automation_jobs set status='cancelled',updated_at=now()
   where customer_id=new.customer_id and kind in ('lead_followup','quote_followup','repeat') and status='queued';
  perform private.flow_event('customer.replied',new.id,new.customer_id,jsonb_build_object('channel',new.channel),'reply:'||new.id);
 end if;
 return new;
end $$;
revoke all on function private.flow_inbound() from public,anon,authenticated;
create trigger flow_inbound after insert on public.messages for each row execute function private.flow_inbound();

alter function private.luxwash_dispatch(text,jsonb) rename to luxwash_dispatch_before_flow;
create function private.luxwash_dispatch(action text,p jsonb) returns jsonb language plpgsql set search_path='' as $$
#variable_conflict use_column
declare r jsonb; q public.quotes; c public.customers; l public.leads; j public.automation_jobs; a public.appointments; cfg jsonb; eid uuid; token text; cnt integer; tbl text;
begin
 -- Reuse an unambiguous contact without overwriting stored identity or granting access.
 if action in ('customer_create','book','intake') then
  perform pg_advisory_xact_lock(hashtextextended('luxwash-customers',0));
  token:=nullif(lower(trim(p->>'email')),'');
  tbl:=regexp_replace(coalesce(p->>'phone',''),'[\s().-]','','g');
  if left(tbl,2)='00' then tbl:='+'||substr(tbl,3);elsif left(tbl,1)='0' then tbl:='+32'||substr(tbl,2);end if;
  select count(*) into cnt from public.customers where status='active' and ((token is not null and lower(email)=token) or (tbl<>'' and phone=tbl));
  if cnt>1 then raise exception 'Deze contactgegevens vragen persoonlijke controle. Bel LuxWash.';end if;
  p:=p||jsonb_build_object('email',coalesce(token,''))||case when tbl<>'' then jsonb_build_object('phone',tbl) else '{}'::jsonb end;
  if cnt=1 then
   select * into c from public.customers where status='active' and ((token is not null and lower(email)=token) or (tbl<>'' and phone=tbl)) limit 1;
   if (token is not null and nullif(c.email,'') is not null and lower(c.email)<>token) or (tbl<>'' and nullif(c.phone,'') is not null and c.phone<>tbl) then
    raise exception 'Deze contactgegevens vragen persoonlijke controle. Bel LuxWash.';
   end if;
   p:=p||jsonb_build_object('name',c.name);
  end if;
 end if;
 if action='flow_overview' then
  return jsonb_build_object(
   'checked_at',now(),
   'counts',jsonb_build_object('customers',(select count(*) from public.customers where status='active'),'new_leads',(select count(*) from public.leads where status='new'),'open_quotes',(select count(*) from public.quotes where status in ('approved','sent','viewed') and (expires_at is null or expires_at>now())),'failed_jobs',(select count(*) from public.automation_jobs where status='dead')),
   'actions',coalesce((select jsonb_agg(x order by x.due_at) from (
    select 'lead:'||id as id,'Nieuwe aanvraag zonder antwoord' as title,'leads' as target,created_at+interval '24 hours' as due_at,'normal' as priority from public.leads where status='new' and last_outbound_at is null
    union all select 'quote:'||id,'Offerte wacht op antwoord','quotes',coalesce(expires_at,created_at+interval '14 days'),'normal' from public.quotes where status in ('sent','viewed') and accepted_at is null
    union all select 'job:'||id,'Automatisering vraagt controle','automation_jobs',scheduled_at,'high' from public.automation_jobs where status='dead'
    union all select 'followup:'||id,summary,'followups',coalesce(due_at,created_at),'high' from public.followups where status='open'
    union all select 'unpaid:'||a1.id,'Uitgevoerde opdracht nog niet volledig betaald','payments',a1.completed_at,'normal' from public.appointments a1 where a1.status='completed' and coalesce(a1.price_cents,0)>coalesce((select sum(case when status='paid' then amount_cents when status='refunded' then -amount_cents else 0 end) from public.payments where appointment_id=a1.id),0)
    union all select 'social:'||id,'Social post niet gepubliceerd','social',scheduled_at,'normal' from public.social_posts where status='failed' or (status='scheduled' and scheduled_at<now()-interval '1 hour')
   ) x),'[]'),
   'events',coalesce((select jsonb_agg(x) from (select id,type,status,created_at,payload from public.events where dedupe_key is not null order by created_at desc limit 50) x),'[]'),
   'sources',coalesce((select jsonb_agg(x) from (select source,count(*) as leads,count(*) filter(where exists(select 1 from public.appointments a1 where a1.lead_id=l1.id and a1.status<>'cancelled')) as bookings from public.leads l1 group by source order by count(*) desc) x),'[]'),
   'customers',coalesce((select jsonb_agg(x) from (select c1.id,c1.name,(select count(*) from public.appointments where customer_id=c1.id and status='completed') as completed_bookings,(select coalesce(sum(case when status='paid' then amount_cents when status='refunded' then -amount_cents else 0 end),0) from public.payments where customer_id=c1.id) as lifetime_value_cents from public.customers c1 where status='active' order by created_at desc limit 100) x),'[]'),
   'reviews',jsonb_build_object('requests',(select count(distinct customer_id) from public.review_requests where sent_at is not null),'reviewed_customers',(select count(distinct customer_id) from public.reviews)),
   'metricool',(select value from public.settings where key='metricool_observation'),
   'worker',(select value||jsonb_build_object('checked_at',updated_at) from private.flow_runtime_state where key='worker'),
   'flow_settings',(select value from public.settings where key='flow'));
 end if;

 if action='lead_update' then
  select * into l from public.leads where id=(p->>'id')::uuid for update;
  if not found then raise exception 'Aanvraag niet gevonden';end if;
  if p->>'status' not in ('new','contacted','quote','waiting','scheduled','confirmed','completed','paid','review_requested','closed','repeat_due','won','lost','not_interested') then raise exception 'Ongeldige aanvraagstatus';end if;
  update public.leads set status=p->>'status',next_action=left(coalesce(p->>'next_action',next_action),500),
    follow_up_at=case when p ? 'follow_up_at' then nullif(p->>'follow_up_at','')::timestamptz else follow_up_at end,
    opted_out=coalesce((p->>'opted_out')::boolean,opted_out),last_contact_at=case when coalesce((p->>'contacted')::boolean,false) then now() else last_contact_at end,
    last_outbound_at=case when coalesce((p->>'contacted')::boolean,false) then now() else last_outbound_at end,updated_at=now()
   where id=l.id returning to_jsonb(public.leads.*) into r;
  if coalesce((p->>'opted_out')::boolean,false) or p->>'status' in ('not_interested','lost','closed') then
   update public.automation_jobs set status='cancelled' where customer_id=l.customer_id and kind in ('lead_followup','quote_followup','repeat') and status='queued';
   if p->>'opted_out'='true' then
    update public.customers set marketing_consent=false where id=l.customer_id;
    if not exists(select 1 from public.suppression_list where (nullif(l.email,'') is not null and lower(email)=lower(l.email)) or (nullif(l.phone,'') is not null and phone=l.phone)) then
     insert into public.suppression_list(email,phone,reason,source) values(nullif(l.email,''),nullif(l.phone,''),'opt_out','crm');
    end if;
   end if;
  end if;
  return r;
 end if;

 if action in ('quote_book','quote_slots') and exists(select 1 from public.quotes where id=(p->>'quote_id')::uuid and expires_at<=now() and status<>'accepted') then
  raise exception 'Offerte is vervallen. Maak een nieuw concept.';
 end if;
 if action='quote_publish' then
  select * into q from public.quotes where id=(p->>'id')::uuid for update;
  if not found or q.status not in ('approved','sent','viewed') then raise exception 'Keur de offerte eerst goed';end if;
  if coalesce(p->>'token_hash','') !~ '^[a-f0-9]{64}$' then raise exception 'Ongeldige offertelink';end if;
  select value into cfg from public.settings where key='flow';
  update public.quotes set accept_token_hash=p->>'token_hash',expires_at=coalesce(expires_at,now()+make_interval(days=>coalesce((cfg->>'quote_valid_days')::int,14))) where id=q.id returning * into q;
  if q.expires_at<=now() then raise exception 'Deze offertelink is vervallen';end if;
  return jsonb_build_object('id',q.id,'expires_at',q.expires_at);
 end if;
 if action in ('quote_public','quote_decide') then
  select * into q from public.quotes where id=(p->>'id')::uuid for update;
  if q.id is null or q.accept_token_hash is null or q.accept_token_hash is distinct from p->>'token_hash' then raise exception 'Offertelink ongeldig' using errcode='42501';end if;
  if action='quote_decide' then
   if p->>'decision' not in ('accepted','declined') or p->>'confirmed' is distinct from 'true' then raise exception 'Bevestig uw keuze';end if;
   if q.status in ('accepted','declined') then
    if q.status<>p->>'decision' then raise exception 'Offerte is al beantwoord. Neem contact op met LuxWash.';end if;
   else
    if q.expires_at is null or q.expires_at<=now() or q.status not in ('approved','sent','viewed') then raise exception 'Offerte niet meer geldig';end if;
    update public.quotes set status=p->>'decision',accepted_at=case when p->>'decision'='accepted' then now() end,declined_at=case when p->>'decision'='declined' then now() end,updated_at=now() where id=q.id returning * into q;
    update public.automation_jobs set status='cancelled' where payload->>'quote_id'=q.id::text and kind='quote_followup' and status='queued';
    insert into public.followups(customer_id,summary,priority,due_at,dedupe_key)
     values(q.customer_id,case when q.status='accepted' then 'Offerte geaccepteerd: spreek datum en duur af en plan de opdracht.' else 'Offerte geweigerd: geen automatische opvolging meer.' end,'normal',now(),'quote-decision:'||q.id)
     on conflict(dedupe_key) where dedupe_key is not null do nothing;
   end if;
  elsif q.status in ('approved','sent','viewed') and q.expires_at>now() then
   update public.quotes set viewed_at=coalesce(viewed_at,now()),status='viewed' where id=q.id returning * into q;
  end if;
  select * into c from public.customers where id=q.customer_id;
  return jsonb_build_object('id',q.id,'title',q.title,'notes',q.notes,'total_cents',q.total_cents,'status',case when q.expires_at<=now() and q.status not in ('accepted','declined') then 'expired' else q.status end,'expires_at',q.expires_at,'customer',jsonb_build_object('name',c.name),'items',coalesce((select jsonb_agg(jsonb_build_object('description',description,'quantity',quantity,'unit_cents',unit_cents)) from public.quote_items where quote_id=q.id),'[]'),'business',(select value from public.settings where key='business'));
 end if;

 if action='quote_send' then
  select * into q from public.quotes where id=(p->>'id')::uuid for update;
  if q.id is null or q.status not in ('approved','sent','viewed') then raise exception 'Keur de offerte eerst goed';end if;
  if q.expires_at is not null and q.expires_at<=now() then raise exception 'Offerte is vervallen';end if;
  select * into c from public.customers where id=q.customer_id and status='active';
  if nullif(c.email,'') is null then raise exception 'E-mailadres ontbreekt';end if;
  token:='Dag '||c.name||E',\n\n'||coalesce(q.notes,'')||E'\n\nTotaal: €'||(q.total_cents/100.0)::text;
  if q.accept_token_hash is not null and nullif(p->>'accept_url','') is not null then
   token:=token||E'\n\nBekijk en beantwoord de offerte: '||(p->>'accept_url')||E'\nGeldig tot: '||to_char(q.expires_at at time zone 'Europe/Brussels','DD-MM-YYYY HH24:MI');
  else token:=token||E'\nReageer op deze e-mail om de offerte te bespreken.';end if;
  insert into public.automation_jobs(customer_id,kind,dedupe_key,payload)
   values(c.id,'email','quote:'||q.id,jsonb_build_object('quote_id',q.id,'subject',q.title||' — LuxWash','text',token))
   on conflict(dedupe_key) do update set payload=case when public.automation_jobs.status='queued' and public.automation_jobs.attempts=0 then excluded.payload else public.automation_jobs.payload end
   returning id into eid;
  return jsonb_build_object('queued',true,'job_id',eid);
 end if;

 if action='social_save' then
  if p->>'platform' not in ('facebook','instagram','tiktok','youtube','google_business') or p->>'post_type' not in ('post','reel','poll','short','story') then raise exception 'Ongeldig sociaal kanaal of formaat';end if;
  if length(trim(coalesce(p->>'caption','')))=0 or length(p->>'caption')>5000 then raise exception 'Vul een tekst in';end if;
  token:=md5(lower(regexp_replace(trim(p->>'caption'),'\s+',' ','g')));
  insert into public.social_posts(platform,post_type,caption,status,content_hash,metadata)
   values(p->>'platform',p->>'post_type',p->>'caption','draft',token,jsonb_build_object('topic',left(p->>'topic',200),'media_prompt',left(p->>'media_prompt',2000),'origin','dashboard'))
   on conflict(platform,content_hash) where content_hash is not null do nothing returning id into eid;
  if eid is null then raise exception 'Deze tekst bestaat al voor dit kanaal';end if;
  return jsonb_build_object('id',eid,'status','draft');
 end if;
 if action='social_list' then select coalesce(jsonb_agg(x),'[]') into r from(select * from public.social_posts order by created_at desc limit 100)x;return r;end if;

 if action='flow_heartbeat' then
  insert into private.flow_runtime_state(key,value) values('worker',jsonb_build_object('processed',coalesce((p->>'processed')::int,0),'status','cycle_completed'))
  on conflict(key) do update set value=excluded.value,updated_at=now();
  return '{"ok":true}';
 end if;
 if action='flow_schedule' then
  perform pg_advisory_xact_lock(hashtextextended('luxwash-flow-scheduler',0));
  select value into cfg from public.settings where key='flow';
  -- Only new explicitly captured events are eligible, never historical bulk mail.
  if coalesce((cfg->>'acknowledgements')::boolean,false) then
   insert into public.automation_jobs(customer_id,kind,dedupe_key,payload)
    select l1.customer_id,'lead_ack','lead-ack:'||l1.id,jsonb_build_object('lead_id',l1.id,'service',l1.service)
    from public.leads l1 join public.customers c1 on c1.id=l1.customer_id
    where l1.source='website' and l1.status='new' and nullif(c1.email,'') is not null
     and l1.created_at>now()-interval '24 hours' and exists(select 1 from public.events e1 where e1.type='lead.created' and e1.payload->>'entity_id'=l1.id::text)
    on conflict(dedupe_key) do nothing;
  end if;
  -- Until inbound processing is proven, reminders remain owner tasks, not outbound mail.
  insert into public.followups(customer_id,summary,priority,due_at,dedupe_key)
   select customer_id,'Aanvraag wacht op antwoord. Controleer eerst of de klant al reageerde.','normal',follow_up_at,'lead-due:'||id||':'||follow_up_at::text
   from public.leads where follow_up_at<=now() and not opted_out and status in ('new','contacted','quote','waiting') and last_inbound_at is null
   on conflict(dedupe_key) where dedupe_key is not null do nothing;
  update public.quotes set status='expired',updated_at=now() where expires_at<=now() and status in ('approved','sent','viewed');
  -- Do not ask an existing reviewer again.
  update public.automation_jobs j1 set status='cancelled' where kind='aftercare' and status='queued' and exists(select 1 from public.reviews where customer_id=j1.customer_id);
  update public.review_requests rr set status='skipped' where sent_at is null and exists(select 1 from public.reviews where customer_id=rr.customer_id);
  return jsonb_build_object('ok',true);
 end if;
 if action='flow_delivery_allowed' then
  select * into j from public.automation_jobs where id=(p->>'id')::uuid;
  if not found or j.status<>'processing' or j.lease_token is distinct from nullif(p->>'lease_token','')::uuid then return '{"allowed":false}';end if;
  select * into c from public.customers where id=j.customer_id;
  if c.id is null or c.status<>'active' then return '{"allowed":false}';end if;
  if j.kind in ('repeat','aftercare','lead_followup','quote_followup') and exists(select 1 from public.suppression_list where (nullif(c.email,'') is not null and lower(email)=lower(c.email)) or (nullif(c.phone,'') is not null and phone=c.phone)) then return '{"allowed":false}';end if;
  if j.kind='aftercare' and (exists(select 1 from public.reviews where customer_id=c.id) or exists(select 1 from public.review_requests where customer_id=c.id and sent_at is not null)) then return '{"allowed":false}';end if;
  if j.kind='aftercare' then
   insert into private.review_delivery_locks(customer_id,job_id) values(c.id,j.id) on conflict(customer_id) do nothing;
   if not exists(select 1 from private.review_delivery_locks where customer_id=c.id and job_id=j.id) then return '{"allowed":false}';end if;
  end if;
  if j.kind='repeat' and (not c.marketing_consent or exists(select 1 from public.messages where customer_id=c.id and direction='inbound' and created_at>j.created_at) or exists(select 1 from public.appointments where customer_id=c.id and created_at>j.created_at and status<>'cancelled')) then return '{"allowed":false}';end if;
  if j.kind in ('lead_followup','quote_followup') then return '{"allowed":false}';end if;
  return '{"allowed":true}';
 end if;
 if action='finish_job' then
  r:=private.luxwash_dispatch_before_flow(action,p);
  select * into j from public.automation_jobs where id=(p->>'id')::uuid;
  if j.status='sent' then
   perform private.flow_event(case when j.kind='aftercare' then 'review.requested' else 'message.sent' end,j.id,j.customer_id,jsonb_build_object('kind',j.kind),'sent:'||j.id);
  end if;
  return r;
 end if;

 if action='export_customer' then
  r:=private.luxwash_dispatch_before_flow(action,p);
  select coalesce(jsonb_agg(x-'accept_token_hash'),'[]') into cfg from jsonb_array_elements(coalesce(r->'quotes','[]')) x;
  return r||jsonb_build_object('quotes',cfg);
 end if;
 if action='erase_customer' then
  r:=private.luxwash_dispatch_before_flow(action,p);
  update public.quotes set accept_token_hash=null where customer_id=(p->>'id')::uuid;
  return r;
 end if;

 if action='list' and p->>'table'='quotes' then
  r:=private.luxwash_dispatch_before_flow(action,p);
  select coalesce(jsonb_agg(x-'accept_token_hash'),'[]') into r from jsonb_array_elements(r) x;return r;
 end if;
 return private.luxwash_dispatch_before_flow(action,p);
end $$;
revoke all on function private.luxwash_dispatch(text,jsonb) from public,anon,authenticated;

-- Permit accepted/viewed quotations to use the existing atomic booking operation.
do $upgrade$
declare original text; revised text;
begin
 original:=pg_get_functiondef('private.luxwash_dispatch_before_intake_details(text,jsonb)'::regprocedure);
 revised:=replace(original,'q.status not in (''approved'',''sent'')','q.status not in (''approved'',''sent'',''viewed'',''accepted'')');
 if revised=original then raise exception 'Expected quote booking status guard not found';end if;
 execute revised;
end $upgrade$;
