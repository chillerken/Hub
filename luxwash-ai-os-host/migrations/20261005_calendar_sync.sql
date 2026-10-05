-- LuxWash AI OS — Google Calendar sync layer
-- Production-applied: 2026-10-05
-- Project: nahwlhptgdkwhjcfkhkt

create table if not exists public.luxwash_calendar_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  revision integer not null,
  action text not null check (action in ('create','update','cancel')),
  provider text not null default 'google_calendar',
  provider_booking_id text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending','processing','synced','error','conflict','superseded')),
  attempts integer not null default 0,
  last_error text,
  provider_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz,
  unique(appointment_id,revision,action)
);

create index if not exists luxwash_calendar_sync_jobs_pending_idx
  on public.luxwash_calendar_sync_jobs(status,created_at)
  where status in ('pending','error');

alter table public.luxwash_calendar_sync_jobs enable row level security;
revoke all on table public.luxwash_calendar_sync_jobs from public,anon,authenticated;
grant all on table public.luxwash_calendar_sync_jobs to service_role;

create or replace function private.luxwash_enqueue_calendar_sync()
returns trigger
language plpgsql
security definer
set search_path='public','private','pg_catalog'
as $$
declare
  v_action text;
  v_customer public.customers%rowtype;
  v_title text;
  v_payload jsonb;
begin
  if tg_op='UPDATE' then
    if new.status is not distinct from old.status
       and new.starts_at is not distinct from old.starts_at
       and new.ends_at is not distinct from old.ends_at
       and new.address is not distinct from old.address
       and new.postcode is not distinct from old.postcode
       and new.vehicle is not distinct from old.vehicle
       and new.notes is not distinct from old.notes
       and new.service_id is not distinct from old.service_id
       and new.price_cents is not distinct from old.price_cents then
      return new;
    end if;
  end if;

  if new.status='cancelled' and coalesce(new.provider_booking_id,'')<>'' then
    v_action:='cancel';
  elsif coalesce(new.provider_booking_id,'')<>'' then
    if new.status='completed'
       and tg_op='UPDATE'
       and new.starts_at is not distinct from old.starts_at
       and new.ends_at is not distinct from old.ends_at
       and new.address is not distinct from old.address
       and new.postcode is not distinct from old.postcode
       and new.vehicle is not distinct from old.vehicle
       and new.notes is not distinct from old.notes
       and new.service_id is not distinct from old.service_id
       and new.price_cents is not distinct from old.price_cents then
      return new;
    end if;
    v_action:='update';
  elsif new.status in ('confirmed','scheduled') then
    v_action:='create';
  else
    return new;
  end if;

  select * into v_customer from public.customers where id=new.customer_id;
  v_title := 'LuxWash — ' || coalesce(nullif(v_customer.name,''),'Klant') || ' — ' ||
             coalesce(nullif(new.service_id,''),'Afspraak');

  v_payload:=jsonb_build_object(
    'appointment_id',new.id,
    'customer_id',new.customer_id,
    'customer_name',v_customer.name,
    'customer_email',v_customer.email,
    'customer_phone',v_customer.phone,
    'title',v_title,
    'start_time',new.starts_at,
    'end_time',new.ends_at,
    'timezone','Europe/Brussels',
    'location',trim(concat_ws(' ',nullif(new.address,''),nullif(new.postcode,''))),
    'description',trim(concat_ws(E'\n',
      nullif(new.notes,''),
      case when nullif(new.vehicle,'') is not null then 'Voertuig/object: '||new.vehicle end,
      case when new.price_cents is not null then 'Prijs: € '||to_char(new.price_cents/100.0,'FM999999990D00') end,
      'LuxWash CRM appointment: '||new.id::text
    ))
  );

  update public.luxwash_calendar_sync_jobs
     set status='superseded',updated_at=now()
   where appointment_id=new.id
     and status in ('pending','error')
     and revision < new.revision;

  insert into public.luxwash_calendar_sync_jobs(
    appointment_id,revision,action,provider_booking_id,payload,status
  )
  values(new.id,new.revision,v_action,new.provider_booking_id,v_payload,'pending')
  on conflict(appointment_id,revision,action) do update
    set provider_booking_id=excluded.provider_booking_id,
        payload=excluded.payload,
        status=case
          when luxwash_calendar_sync_jobs.status='synced' then 'synced'
          else 'pending'
        end,
        last_error=null,
        updated_at=now();

  return new;
end $$;

drop trigger if exists luxwash_calendar_sync_enqueue on public.appointments;
create trigger luxwash_calendar_sync_enqueue
after insert or update of status,starts_at,ends_at,address,postcode,vehicle,notes,service_id,price_cents
on public.appointments
for each row execute function private.luxwash_enqueue_calendar_sync();

create or replace function public.luxwash_calendar_sync_mark(
  p_job_id uuid,
  p_status text,
  p_provider_booking_id text default null,
  p_provider_url text default null,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_catalog'
as $$
declare v public.luxwash_calendar_sync_jobs%rowtype;
begin
  if p_status not in ('processing','synced','error','conflict','superseded') then
    raise exception 'invalid_status';
  end if;

  update public.luxwash_calendar_sync_jobs
     set status=p_status,
         attempts=case when p_status='processing' then attempts+1 else attempts end,
         provider_booking_id=coalesce(nullif(p_provider_booking_id,''),provider_booking_id),
         provider_url=coalesce(nullif(p_provider_url,''),provider_url),
         last_error=case when p_status in ('error','conflict') then left(coalesce(p_error,'unknown_error'),1000) else null end,
         processed_at=case when p_status='synced' then now() else processed_at end,
         updated_at=now()
   where id=p_job_id
   returning * into v;

  if not found then raise exception 'job_not_found'; end if;

  if p_status='synced'
     and coalesce(nullif(p_provider_booking_id,''),v.provider_booking_id) is not null then
    update public.appointments
       set provider='google_calendar',
           provider_booking_id=coalesce(nullif(p_provider_booking_id,''),v.provider_booking_id),
           updated_at=now()
     where id=v.appointment_id
       and (
         provider is distinct from 'google_calendar'
         or provider_booking_id is distinct from coalesce(nullif(p_provider_booking_id,''),v.provider_booking_id)
       );
  end if;

  return to_jsonb(v);
end $$;

revoke all on function public.luxwash_calendar_sync_mark(uuid,text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.luxwash_calendar_sync_mark(uuid,text,text,text,text)
  to service_role;

create or replace function public.luxwash_calendar_sync_retry(p_appointment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_catalog'
as $$
declare v public.luxwash_calendar_sync_jobs%rowtype;
begin
  select * into v
  from public.luxwash_calendar_sync_jobs
  where appointment_id=p_appointment_id
    and status in ('error','conflict')
  order by revision desc,created_at desc
  limit 1
  for update;

  if not found then raise exception 'no_retryable_sync_job'; end if;

  update public.luxwash_calendar_sync_jobs
  set status='pending',attempts=0,last_error=null,updated_at=now()
  where id=v.id
  returning * into v;

  insert into public.audit_logs(actor,action,entity,entity_id,detail)
  values(
    'luxwash_ai_os','calendar_sync.retry','appointment',p_appointment_id,
    jsonb_build_object('job_id',v.id)
  );

  return to_jsonb(v);
end $$;

revoke all on function public.luxwash_calendar_sync_retry(uuid)
  from public,anon,authenticated;
grant execute on function public.luxwash_calendar_sync_retry(uuid)
  to service_role;
