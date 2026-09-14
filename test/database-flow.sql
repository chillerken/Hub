BEGIN;

DO $test$
declare cid uuid; cid2 uuid; lid uuid; qid uuid; sid uuid; jid uuid; lease uuid:=gen_random_uuid(); r jsonb; n integer; token text:=repeat('a',64); apid uuid;
begin
 insert into public.customers(name,email,phone) values('FLOW TEST ONLY','flow-'||gen_random_uuid()||'@example.invalid','+32400000001') returning id into cid;
 select count(*) into n from public.events where customer_id=cid and type='customer.created';
 if n<>1 then raise exception 'customer event missing';end if;
 select email into token from public.customers where id=cid;
 r:=private.luxwash_dispatch('customer_create',jsonb_build_object('name','Different spelling','email',token));
 if (r->>'id')::uuid<>cid then raise exception 'customer not deduplicated';end if;
 token:=repeat('a',64);
 insert into public.leads(id,customer_id,name,email,phone,service,message,source)
 select gen_random_uuid(),id,name,email,coalesce(phone,''),'Test reiniging','Testaanvraag','website' from public.customers where id=cid returning id into lid;
 perform private.luxwash_dispatch('flow_schedule','{}');
 perform private.luxwash_dispatch('flow_schedule','{}');
 select count(*) into n from public.automation_jobs where customer_id=cid and kind='lead_ack';
 if n<>1 then raise exception 'ack not idempotent';end if;
 select id into jid from public.automation_jobs where customer_id=cid and kind='lead_ack';
 update public.automation_jobs set status='processing',lease_token=lease where id=jid;
 r:=private.luxwash_dispatch('flow_delivery_allowed',jsonb_build_object('id',jid,'lease_token',lease));
 if r->>'allowed'<>'true' then raise exception 'ack blocked';end if;
 insert into public.automation_jobs(customer_id,kind,dedupe_key) values(cid,'lead_followup','test-followup:'||lid);
 insert into public.messages(customer_id,channel,direction,content,intent) values(cid,'email','inbound','Bedankt, ik kom erop terug.','information');
 if exists(select 1 from public.automation_jobs where customer_id=cid and kind='lead_followup' and status='queued') then raise exception 'reply failed to cancel followup';end if;
 if (select last_inbound_at from public.leads where id=lid) is null then raise exception 'reply not linked';end if;
 insert into public.quotes(customer_id,title,notes,total_cents) values(cid,'TEST OFFERTE','Alleen teruggedraaide test',12500) returning id into qid;
 perform private.luxwash_dispatch('quote_approve',jsonb_build_object('id',qid));
 perform private.luxwash_dispatch('quote_publish',jsonb_build_object('id',qid,'token_hash',token));
 begin perform private.luxwash_dispatch('quote_public',jsonb_build_object('id',qid,'token_hash',repeat('b',64)));raise exception 'wrong token accepted';exception when insufficient_privilege then null;end;
 r:=private.luxwash_dispatch('quote_public',jsonb_build_object('id',qid,'token_hash',token));
 if r->>'status'<>'viewed' or r ? 'accept_token_hash' then raise exception 'public quote invalid';end if;
 perform private.luxwash_dispatch('quote_send',jsonb_build_object('id',qid,'accept_url','https://example.invalid/offerte#test'));
 r:=private.luxwash_dispatch('quote_decide',jsonb_build_object('id',qid,'token_hash',token,'decision','accepted','confirmed',true));
 perform private.luxwash_dispatch('quote_decide',jsonb_build_object('id',qid,'token_hash',token,'decision','accepted','confirmed',true));
 select count(*) into n from public.followups where dedupe_key='quote-decision:'||qid;
 if r->>'status'<>'accepted' or n<>1 then raise exception 'quote acceptance not idempotent';end if;
 begin perform private.luxwash_dispatch('quote_decide',jsonb_build_object('id',qid,'token_hash',token,'decision','declined','confirmed',true));raise exception 'conflicting decision accepted';exception when raise_exception then if sqlerrm='conflicting decision accepted' then raise;end if;end;
 update public.settings set value=value||'{"all_postcodes":true,"open_24_7":true,"lead_hours":0,"horizon_days":365}'::jsonb where key='planning';
 insert into public.services(name,description,duration_minutes,buffer_minutes,price_mode,active,preparation) values('FLOW TEST ONLY','Test',60,15,'fixed',true,'Test') returning id into sid;
 r:=private.luxwash_dispatch('quote_book',jsonb_build_object('quote_id',qid,'service_id',sid,'duration_minutes',60,'postcode','9340','starts_at',date_trunc('day',now()+interval '30 days')+interval '10 hours','address','Teststraat 1','idempotency_key','test-flow-'||gen_random_uuid(),'manage_token_hash',repeat('c',64),'confirmed_by_customer',true,'admin',true));
 apid:=(r->'appointment'->>'id')::uuid;
 if apid is null then raise exception 'accepted quote not bookable';end if;
 perform private.luxwash_dispatch('appointment_change',jsonb_build_object('id',apid,'status','completed','admin',true));
 select id into jid from public.automation_jobs where appointment_id=apid and kind='aftercare';
 update public.automation_jobs set status='processing',lease_token=lease where id=jid;
 insert into public.reviews(customer_id,rating,content,source) values(cid,5,'Synthetic rollback test','test');
 r:=private.luxwash_dispatch('flow_delivery_allowed',jsonb_build_object('id',jid,'lease_token',lease));
 if r->>'allowed'<>'false' then raise exception 'reviewer would be solicited again';end if;
 r:=private.luxwash_dispatch('social_save','{"platform":"facebook","post_type":"post","caption":"Rollback test only.","topic":"TEST"}');
 begin perform private.luxwash_dispatch('social_save','{"platform":"facebook","post_type":"post","caption":"Rollback test only.","topic":"TEST"}');raise exception 'duplicate social accepted';exception when raise_exception then if sqlerrm='duplicate social accepted' then raise;end if;end;
 r:=private.luxwash_dispatch('flow_overview','{}');
 if not (r ?& array['events','actions','sources','customers','flow_settings']) then raise exception 'overview incomplete';end if;
 r:=private.luxwash_dispatch('list','{"table":"quotes"}');
 if exists(select 1 from jsonb_array_elements(r) x where x ? 'accept_token_hash') then raise exception 'token hash exposed in list';end if;
end $test$;
SELECT 'PASS: customer reuse, events, acknowledgement dedupe, reply stop, quote authorization/acceptance/booking, review suppression, social dedupe, dashboard' AS result;

ROLLBACK;
