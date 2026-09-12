alter table public.automation_jobs add column first_attempt_at timestamptz;
update public.automation_jobs set first_attempt_at=updated_at where attempts>0;
create unique index leads_intake_key on public.leads((metadata->>'intake_key')) where metadata ? 'intake_key';
create or replace function private.luxwash_dispatch(action text,p jsonb) returns jsonb language plpgsql set search_path='' as $$
declare r jsonb; c public.customers; q public.quotes; e public.emails; j public.automation_jobs; a public.appointments; rid uuid; begin

if action='intake' then
perform pg_advisory_xact_lock(hashtextextended('intake:'||(p->>'idempotency_key'),0));
select id into rid from public.leads where metadata->>'intake_key'=p->>'idempotency_key';
if rid is not null then return jsonb_build_object('id',rid,'status','received');end if;
r:=private.luxwash_dispatch_v1('customer_create',p);
insert into public.leads(id,customer_id,name,email,phone,service,message,source,metadata)
values(gen_random_uuid(),(r->>'id')::uuid,p->>'name',coalesce(p->>'email',''),coalesce(p->>'phone',''),coalesce(p->>'service',''),coalesce(p->>'message',''),'website',jsonb_build_object('intake_key',p->>'idempotency_key')) returning id into rid;
perform private.luxwash_dispatch_v1('handoff',jsonb_build_object('customer_id',r->>'id','summary','Aanvraag: '||coalesce(p->>'service','')||' — '||coalesce(p->>'message',''),'priority','normal'));
return jsonb_build_object('id',rid,'status','received');
end if;
if action='claim_jobs' then
with due as (select id from public.automation_jobs where (status='queued' and scheduled_at<=now()) or (status='processing' and locked_until<now()) order by scheduled_at limit 20 for update skip locked),
claimed as (update public.automation_jobs x set status='processing',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()),locked_until=now()+interval '15 minutes',lease_token=gen_random_uuid(),updated_at=now() from due where x.id=due.id returning x.*)
select coalesce(jsonb_agg(to_jsonb(claimed)),'[]') into r from claimed;return r;
end if;

if action='quote_approve' then
select * into q from public.quotes where id=(p->>'id')::uuid for update;
if not found then raise exception 'Offerte niet gevonden'; end if;
if q.status<>'draft' then raise exception 'Offerte is geen concept'; end if;
if exists(select 1 from public.quote_items where quote_id=q.id) then select sum(round(quantity*unit_cents))::integer into q.total_cents from public.quote_items where quote_id=q.id; end if;
update public.quotes set status='approved',approved_at=now(),total_cents=q.total_cents where id=q.id returning * into q;
return to_jsonb(q);
end if;
if action='quote_send' then
select * into q from public.quotes where id=(p->>'id')::uuid for update;
if q.status not in ('approved','sent') then raise exception 'Keur de conceptofferte eerst goed'; end if;
select * into c from public.customers where id=q.customer_id;
if c.email is null then raise exception 'E-mailadres ontbreekt'; end if;
insert into public.automation_jobs(customer_id,kind,dedupe_key,payload) values(c.id,'email','quote:'||q.id,jsonb_build_object('quote_id',q.id,'subject',q.title||' — LuxWash','text','Dag '||c.name||E',\n\n'||coalesce(q.notes,'')||E'\n\nTotaal: €'||(q.total_cents/100.0)::text||E'\nReageer op deze e-mail om de offerte te bespreken.')) on conflict(dedupe_key) do update set dedupe_key=excluded.dedupe_key returning id into rid;
return jsonb_build_object('queued',true,'job_id',rid);
end if;
if action='email_send' then
select * into e from public.emails where id=(p->>'id')::uuid for update;
if e.direction<>'outbound' or e.status<>'draft' then raise exception 'Alleen een concept kan verstuurd worden'; end if;
select * into c from public.customers where id=e.customer_id;
if c.email is null or lower(c.email)<>lower(e.recipient) then raise exception 'Ontvanger moet overeenkomen met het gekozen klantprofiel'; end if;
insert into public.automation_jobs(customer_id,kind,dedupe_key,payload) values(c.id,'email','email:'||e.id,jsonb_build_object('email_id',e.id,'subject',e.subject,'text',e.body)) on conflict(dedupe_key) do update set dedupe_key=excluded.dedupe_key returning id into rid;
return jsonb_build_object('queued',true,'job_id',rid);
end if;
if action='inbound_email' then
select * into c from public.customers where lower(email)=lower(p->>'sender') and status='active' order by created_at limit 1;
insert into public.emails(customer_id,subject,body,direction,recipient,sender,provider_id,status) values(c.id,p->>'subject',p->>'body','inbound',p->>'recipient',p->>'sender',p->>'provider_id','received') on conflict(provider_id) do nothing returning id into rid;
if rid is not null then
insert into public.messages(customer_id,channel,direction,content,intent,priority,provider_id) values(c.id,'email','inbound',(p->>'subject')||E'\n'||(p->>'body'),p->>'intent',coalesce(p->>'priority','normal'),p->>'provider_id');
if p->>'intent' in ('complaint','quote','change','cancel') then perform private.luxwash_dispatch_v1('handoff',jsonb_build_object('customer_id',c.id,'summary','E-mail vraagt opvolging: '||(p->>'subject'),'priority',coalesce(p->>'priority','normal')));end if;
end if;return jsonb_build_object('ok',true,'id',rid);
end if;
if action='delivery_status' then
update public.emails set status=p->>'status' where provider_id=p->>'provider_id';return '{"ok":true}';
end if;
if action='finish_job' then
r:=private.luxwash_dispatch_v1(action,p);
if p->>'status'='sent' then
select * into j from public.automation_jobs where id=(p->>'id')::uuid;
if j.payload ? 'quote_id' then update public.quotes set status='sent' where id=(j.payload->>'quote_id')::uuid;end if;
if j.payload ? 'email_id' then update public.emails set status='sent' where id=(j.payload->>'email_id')::uuid;end if;
end if;return r;
end if;
if action='retry_job' then
update public.automation_jobs set status='queued',attempts=0,scheduled_at=now(),last_error=null where id=(p->>'id')::uuid and status='dead' and coalesce(provider_id,'')='' and (first_attempt_at is null or first_attempt_at>now()-interval '23 hours') returning id into rid;
if rid is null then raise exception 'Controleer de bezorging bij de mailprovider voordat opnieuw verzonden wordt';end if;
return jsonb_build_object('ok',true);
end if;
if action='confirmation_status' then
perform private.luxwash_dispatch_v1('manage_get',p);
select coalesce(jsonb_agg(jsonb_build_object('kind',kind,'status',status)),'[]') into r from public.automation_jobs where appointment_id=(p->>'id')::uuid and kind in ('confirmation','request_received');return r;
end if;
if action='stripe_payment' then
select * into a from public.appointments where id=(p->>'appointment_id')::uuid;
if a.id is null or a.price_cents<>(p->>'amount_cents')::int or p->>'currency'<>'eur' then raise exception 'Payment does not match appointment';end if;
insert into public.payments(customer_id,appointment_id,amount_cents,currency,status,provider,provider_id) values(a.customer_id,a.id,a.price_cents,'EUR','paid','stripe',p->>'provider_id') on conflict(provider_id) do nothing;
return '{"ok":true}';
end if;
return private.luxwash_dispatch_v1(action,p);
end $$;
