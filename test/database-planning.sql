begin;
select set_config('luxwash.actor','qa:24-7-planning',true);
update public.settings set value=value||'{"all_postcodes":true,"open_24_7":true}'::jsonb where key='planning';
do $$
declare service uuid; t timestamptz; blocked uuid;
begin
select id into service from public.services where active and duration_minutes=60 and price_mode='estimate' order by name limit 1;
t:=(((now() at time zone 'Europe/Brussels')::date+10)+time '23:45') at time zone 'Europe/Brussels';
if not private.available(service,t,'1000') then raise exception '24/7 midnight booking rejected'; end if;
if not private.available(service,t+interval '1 day','9990') then raise exception 'National postcode rejected'; end if;
if private.available(service,t,'0000') or private.available(service,t,'ABCDE') then raise exception 'Invalid postcode accepted'; end if;
insert into public.availability(starts_at,ends_at,kind,reason) values(t+interval '30 minutes',t+interval '1 hour','blocked','transactional QA - rolled back') returning id into blocked;
if private.available(service,t,'9300') then raise exception 'Cross-midnight block ignored'; end if;
delete from public.availability where id=blocked;
update public.settings set value=value||'{"all_postcodes":false,"open_24_7":false,"allowed_postcodes":["9300"],"opening_hours":[]}'::jsonb where key='planning';
if private.available(service,t,'1000') or private.available(service,t,'9300') then raise exception 'Restricted mode not preserved'; end if;
end $$;
rollback;
