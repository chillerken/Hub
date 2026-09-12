alter function private.luxwash_dispatch(text,jsonb) rename to luxwash_dispatch_v2;
create or replace function private.luxwash_dispatch(action text,p jsonb) returns jsonb
language plpgsql set search_path='' as $$
#variable_conflict use_column
declare r jsonb; m public.messages; q public.quotes; it jsonb; s public.services; amount integer; qid uuid;
begin
 if action='session' then
  r:=private.luxwash_dispatch_v2(action,p);
  return r||jsonb_build_object('customer_id',(select customer_id from public.conversations where id=(r->>'id')::uuid));
 end if;
 if action='intake' then
  r:=private.luxwash_dispatch_v2(action,p);
  insert into public.messages(customer_id,channel,direction,content,provider_id)
   select customer_id,'website','inbound',service||E'\n'||message,'intake:'||id from public.leads where id=(r->>'id')::uuid
   on conflict(provider_id) do nothing;
  return r;
 end if;
 if action='message_get' then select to_jsonb(x) into r from public.messages x where id=(p->>'id')::uuid; return r; end if;
 if action='message_classified' then
  update public.messages set intent=p->>'intent',priority=p->>'priority' where id=(p->>'id')::uuid returning * into m;
  if m.id is not null and coalesce((p->>'handoff')::boolean,false) and not exists(select 1 from public.followups where summary=p->>'summary' and customer_id is not distinct from m.customer_id and created_at>now()-interval '1 hour') then
   perform private.luxwash_dispatch_v2('handoff',jsonb_build_object('customer_id',m.customer_id,'summary',p->>'summary','priority',p->>'priority'));
  end if;
  insert into public.ai_actions(customer_id,source,action,reason,result,status) values(m.customer_id,'inbox','classify','Onderwerp en prioriteit',jsonb_build_object('message_id',m.id,'intent',p->>'intent'),'success');
  return '{"ok":true}';
 end if;
 if action='quote_draft' then
  if not exists(select 1 from public.customers where id=(p->>'customer_id')::uuid and status='active') then raise exception 'Klant niet gevonden'; end if;
  insert into public.quotes(customer_id,title,notes) values((p->>'customer_id')::uuid,p->>'title',p->>'notes') returning id into qid;
  for it in select * from jsonb_array_elements(p->'items') loop
   select * into s from public.services where id=(it->>'service_id')::uuid and active;
   select amount_cents into amount from public.service_prices where service_id=s.id and category='standard';
   if s.id is null or amount is null then raise exception 'Geen geconfigureerde prijs voor offerteregel';end if;
   if (it->>'quantity')::numeric<=0 or (it->>'quantity')::numeric>1000 then raise exception 'Ongeldig aantal';end if;
   insert into public.quote_items(quote_id,description,quantity,unit_cents) values(qid,s.name,(it->>'quantity')::numeric,amount);
  end loop;
  update public.quotes set total_cents=coalesce((select sum(round(quantity*unit_cents))::int from public.quote_items where quote_id=qid),0) where id=qid returning to_jsonb(quotes.*) into r;
  insert into public.ai_actions(customer_id,source,action,reason,result,status) values((p->>'customer_id')::uuid,'admin','draftQuote','Menselijke goedkeuring vereist',jsonb_build_object('quote_id',qid),'draft');
  return r;
 end if;
 if action='quote_approve' then
  if (select total_cents from public.quotes where id=(p->>'id')::uuid)<=0 and not exists(select 1 from public.quote_items where quote_id=(p->>'id')::uuid and unit_cents>0) then raise exception 'Vul eerst een controleerbare offerteprijs in';end if;
 end if;
 if action='analytics' then
  return jsonb_build_object(
   'revenue_cents',(select coalesce(sum(amount_cents),0) from public.payments where status='paid'),
   'average_order_cents',(select coalesce(round(avg(price_cents)),0) from public.appointments where status='completed'),
   'completed',(select count(*) from public.appointments where status='completed'),
   'repeat_customers',(select count(*) from (select customer_id from public.appointments where status='completed' and customer_id is not null group by customer_id having count(*)>1) x),
   'served_customers',(select count(distinct customer_id) from public.appointments where status='completed'),
   'calls',(select count(*) from public.phone_calls),
   'phone_booked_calls',(select count(distinct phone_call_id) from public.call_actions where name='createAppointment' and result->>'ok'='true'),
   'website_leads',(select count(*) from public.leads where source='website'),
   'website_booked_leads',(select count(distinct l.id) from public.leads l join public.appointments a on a.lead_id=l.id where l.source='website' and a.status<>'cancelled'),
   'monthly_revenue',(select coalesce(jsonb_agg(x order by x.month_key),'[]') from (select to_char(created_at at time zone 'Europe/Brussels','YYYY-MM') as month_key,sum(amount_cents) cents from public.payments where status='paid' and created_at>now()-interval '12 months' group by 1) x),
   'services',(select coalesce(jsonb_agg(x order by x.bookings desc),'[]') from (select s.name,count(*) bookings from public.appointments a join public.services s on s.id=a.catalog_service_id where a.status<>'cancelled' group by s.id,s.name) x)
  );
 end if;
 return private.luxwash_dispatch_v2(action,p);
end $$;
revoke all on function private.luxwash_dispatch(text,jsonb) from public,anon,authenticated;
create or replace function private.message_context() returns trigger language plpgsql set search_path='' as $$
begin
 if new.customer_id is not null and new.conversation_id is not null then
  update public.conversations set customer_id=new.customer_id where id=new.conversation_id;
  update public.messages set customer_id=new.customer_id where conversation_id=new.conversation_id and customer_id is null;
 end if;
 if new.direction='inbound' and new.intent is null then
  insert into public.automation_jobs(customer_id,kind,dedupe_key,payload) values(new.customer_id,'classify','classify:'||new.id,jsonb_build_object('message_id',new.id)) on conflict(dedupe_key) do nothing;
 end if;
 return new;
end $$;
create trigger message_context after insert on public.messages for each row execute function private.message_context();
