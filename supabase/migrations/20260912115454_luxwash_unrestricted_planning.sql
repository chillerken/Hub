-- Optional nationwide and continuous opening; existing restrictions remain the default.
create or replace function private.available(p_service uuid,p_start timestamptz,p_postcode text,p_ignore uuid default null) returns boolean language plpgsql set search_path='' as $$
declare s public.services; cfg jsonb; finish timestamptz; localday date; v_local_time time; localend time; opened boolean;
begin
select * into s from public.services where id=p_service and active; if not found or s.duration_minutes is null or s.price_mode='quote' then return false; end if;
select value into cfg from public.settings where key='planning';
if p_start is null or p_postcode is null or p_postcode !~ '^[1-9][0-9]{3}$' then return false; end if;
if not coalesce((cfg->>'all_postcodes')::boolean,false) and not coalesce(cfg->'allowed_postcodes' ? p_postcode,false) then return false; end if;
if p_start<now()+make_interval(hours=>(cfg->>'lead_hours')::int) or p_start>now()+make_interval(days=>(cfg->>'horizon_days')::int) then return false; end if;
finish:=p_start+make_interval(mins=>s.duration_minutes+s.buffer_minutes);
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
