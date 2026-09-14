-- Additive quota guard. Existing records, queues and provider settings are preserved.
create table private.email_budget_reservations (
 job_id uuid primary key references public.automation_jobs(id) on delete cascade,
 created_at timestamptz not null default now()
);
alter table private.email_budget_reservations enable row level security;
revoke all on private.email_budget_reservations from public, anon, authenticated;
create index email_budget_created on private.email_budget_reservations(created_at);

alter function private.luxwash_dispatch(text,jsonb) rename to luxwash_dispatch_before_free_budget;
create function private.luxwash_dispatch(action text,p jsonb) returns jsonb language plpgsql set search_path='' as $$
declare jid uuid; daily integer; monthly integer;
begin
 if action='email_budget' then
  jid:=(p->>'id')::uuid;
  if not exists(select 1 from public.automation_jobs where id=jid) then raise exception 'Verzendtaak ontbreekt';end if;
  -- Serialize reservations across workers. A retry retains its original reservation.
  perform pg_advisory_xact_lock(832114,901);
  if exists(select 1 from private.email_budget_reservations where job_id=jid) then return jsonb_build_object('allowed',true,'reused',true);end if;
  with usage as (
   select created_at from private.email_budget_reservations where created_at>=now()-interval '31 days'
   union all
   select e.created_at from public.emails e
   where e.created_at>=now()-interval '31 days'
    and (e.direction='inbound' or e.status in ('sent','delivered','bounced','complained'))
    and not exists(select 1 from private.email_budget_reservations b join public.automation_jobs j on j.id=b.job_id where j.provider_id=e.provider_id and e.provider_id is not null)
  ) select count(*) filter(where created_at>=now()-interval '24 hours'),count(*) into daily,monthly from usage;
  if daily>=90 or monthly>=2700 then return jsonb_build_object('allowed',false,'daily',daily,'monthly',monthly,'daily_limit',90,'monthly_limit',2700);end if;
  insert into private.email_budget_reservations(job_id) values(jid);
  return jsonb_build_object('allowed',true,'daily',daily+1,'monthly',monthly+1,'daily_limit',90,'monthly_limit',2700);
 end if;
 return private.luxwash_dispatch_before_free_budget(action,p);
end $$;
revoke all on function private.luxwash_dispatch(text,jsonb) from public,anon,authenticated;
