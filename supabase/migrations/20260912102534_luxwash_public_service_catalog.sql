-- Prices already published on the existing LuxWash site. Unknown durations remain unknown.
alter table public.services alter column duration_minutes drop not null;
do $$ begin
 execute replace(pg_get_functiondef('private.available(uuid,timestamptz,text,uuid)'::regprocedure),
 'if not found then return false; end if;',
 'if not found or s.duration_minutes is null or s.price_mode=''quote'' then return false; end if;');
end $$;
do $$ declare row record; sid uuid; begin
for row in select * from (values
 ('Opritreiniging',400,'m²'),('Terrasreiniging',450,'m²'),('Combi oprit + terras',395,'m²'),
 ('Anti-mos nabehandeling',150,'m²'),('Tuinmeubelen reinigen',4500,'beurt'),
 ('1-zit zetel',4000,'beurt'),('2-zit zetel',6000,'beurt'),('3-zit zetel',9000,'beurt'),('Hoekzetel',12000,'beurt'),('Eetkamerstoel',1500,'stuk'),
 ('Eenmalige zakelijke opdracht',null,'opdracht'),('Periodieke zakelijke reiniging',null,'opdracht')
) as source(name,cents,unit) loop
 insert into public.services(name,description,duration_minutes,price_mode,source_url)
 values(row.name,'Vanafprijs; definitieve omvang, duur en prijs na beoordeling van locatie, materiaal en vervuiling.',null,'quote','https://www.luxwash.online/boeken') returning id into sid;
 if row.cents is not null then insert into public.service_prices(service_id,amount_cents,unit) values(sid,row.cents,row.unit); end if;
end loop;
end $$;
-- Keep aggregate call conversion accurate after personal tool results expire.
alter table public.phone_calls add column booking_made boolean not null default false;
update public.phone_calls c set booking_made=true where exists(select 1 from public.call_actions a where a.phone_call_id=c.id and a.name='createAppointment' and a.result->>'ok'='true');
create or replace function private.call_conversion() returns trigger language plpgsql set search_path='' as $$
begin
 if new.name='createAppointment' and new.result->>'ok'='true' then update public.phone_calls set booking_made=true where id=new.phone_call_id;end if;
 return new;
end $$;
create trigger call_conversion after update of result on public.call_actions for each row execute function private.call_conversion();
do $$ begin
 execute replace(pg_get_functiondef('private.luxwash_dispatch(text,jsonb)'::regprocedure),
 'select count(distinct phone_call_id) from public.call_actions where name=''createAppointment'' and result->>''ok''=''true''',
 'select count(*) from public.phone_calls where booking_made');
end $$;
