-- Tenant-safe workflow router for Reception AI
-- Requires the existing organizations, memberships, leads, business_profiles and workflow_actions tables.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  new.updated_at=now();
  return new;
end;
$$;

create table if not exists public.tenant_integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel text not null check (channel in ('email','whatsapp','calendar','payment','webhook')),
  provider text not null,
  status text not null default 'needs_setup' check (status in ('needs_setup','active','degraded','disabled','error')),
  is_default boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  capabilities text[] not null default '{}'::text[],
  last_verified_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists tenant_integrations_default_channel_uidx
  on public.tenant_integrations(organization_id,channel)
  where is_default=true;
create index if not exists tenant_integrations_org_channel_idx
  on public.tenant_integrations(organization_id,channel,status);

alter table public.tenant_integrations enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='tenant_integrations' and policyname='tenant_integrations_select') then
    create policy tenant_integrations_select on public.tenant_integrations
      for select to authenticated using (is_org_member(organization_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='tenant_integrations' and policyname='tenant_integrations_insert') then
    create policy tenant_integrations_insert on public.tenant_integrations
      for insert to authenticated with check (is_org_member(organization_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='tenant_integrations' and policyname='tenant_integrations_update') then
    create policy tenant_integrations_update on public.tenant_integrations
      for update to authenticated
      using (is_org_member(organization_id))
      with check (is_org_member(organization_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='tenant_integrations' and policyname='tenant_integrations_delete') then
    create policy tenant_integrations_delete on public.tenant_integrations
      for delete to authenticated using (is_org_member(organization_id));
  end if;
end $$;

grant select,insert,update,delete on public.tenant_integrations to authenticated;

drop trigger if exists trg_tenant_integrations_touch on public.tenant_integrations;
create trigger trg_tenant_integrations_touch
before update on public.tenant_integrations
for each row execute function public.touch_updated_at();

create table if not exists private.integration_credentials (
  integration_id uuid primary key references public.tenant_integrations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  vault_secret_name text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
revoke all on private.integration_credentials from public,anon,authenticated;

create table if not exists public.workflow_action_attempts (
  id uuid primary key default gen_random_uuid(),
  workflow_action_id uuid not null references public.workflow_actions(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  attempt_no integer not null,
  provider text,
  outcome text not null check (outcome in ('completed','retry','blocked','failed')),
  http_status integer,
  provider_reference text,
  error_code text,
  error_message text,
  response_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists workflow_action_attempts_action_idx
  on public.workflow_action_attempts(workflow_action_id,attempt_no desc);
create index if not exists workflow_action_attempts_org_idx
  on public.workflow_action_attempts(organization_id,created_at desc);

alter table public.workflow_action_attempts enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='workflow_action_attempts' and policyname='workflow_attempts_select') then
    create policy workflow_attempts_select on public.workflow_action_attempts
      for select to authenticated using (is_org_member(organization_id));
  end if;
end $$;
grant select on public.workflow_action_attempts to authenticated;

alter table public.workflow_actions
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by text,
  add column if not exists max_attempts integer not null default 5;

create index if not exists workflow_actions_due_idx
  on public.workflow_actions(status,scheduled_at)
  where status='pending';

create or replace function public.claim_workflow_actions(p_worker_id text,p_batch_size integer default 10)
returns setof public.workflow_actions
language plpgsql
security invoker
set search_path=public
as $$
begin
  update public.workflow_actions
  set status='pending',locked_at=null,locked_by=null,
      last_error=coalesce(last_error,'') || case when coalesce(last_error,'')='' then '' else E'\n' end || 'Recovered stale processing lock'
  where status='processing' and locked_at < now()-interval '10 minutes';

  return query
  with candidates as (
    select id from public.workflow_actions
    where status='pending' and scheduled_at<=now() and attempts<max_attempts
    order by case priority when 'urgent' then 0 when 'high' then 1 else 2 end,scheduled_at,created_at
    for update skip locked
    limit greatest(1,least(coalesce(p_batch_size,10),50))
  )
  update public.workflow_actions w
  set status='processing',locked_at=now(),locked_by=left(coalesce(p_worker_id,'worker'),120),updated_at=now()
  from candidates c
  where w.id=c.id
  returning w.*;
end;
$$;
revoke all on function public.claim_workflow_actions(text,integer) from public,anon,authenticated;
grant execute on function public.claim_workflow_actions(text,integer) to service_role;

create or replace function public.finish_workflow_action(
  p_action_id uuid,p_outcome text,p_provider text default null,p_provider_reference text default null,
  p_http_status integer default null,p_error_code text default null,p_error_message text default null,
  p_response_meta jsonb default '{}'::jsonb,p_retry_after_seconds integer default null
)
returns public.workflow_actions
language plpgsql
security invoker
set search_path=public
as $$
declare
  v public.workflow_actions;
  v_attempt integer;
begin
  select * into v from public.workflow_actions where id=p_action_id for update;
  if not found then raise exception 'workflow action not found'; end if;
  v_attempt:=v.attempts+1;

  insert into public.workflow_action_attempts(
    workflow_action_id,organization_id,attempt_no,provider,outcome,http_status,
    provider_reference,error_code,error_message,response_meta
  ) values(
    v.id,v.organization_id,v_attempt,p_provider,p_outcome,p_http_status,
    p_provider_reference,p_error_code,left(p_error_message,2000),coalesce(p_response_meta,'{}'::jsonb)
  );

  if p_outcome='completed' then
    update public.workflow_actions set status='completed',attempts=v_attempt,provider=p_provider,
      provider_reference=p_provider_reference,last_error=null,completed_at=now(),locked_at=null,locked_by=null,updated_at=now()
    where id=v.id returning * into v;
  elsif p_outcome='blocked' then
    update public.workflow_actions set status='blocked',attempts=v_attempt,provider=p_provider,
      last_error=left(coalesce(p_error_message,p_error_code,'Blocked'),2000),locked_at=null,locked_by=null,updated_at=now()
    where id=v.id returning * into v;
  elsif p_outcome='retry' and v_attempt<v.max_attempts then
    update public.workflow_actions set status='pending',attempts=v_attempt,provider=p_provider,
      last_error=left(coalesce(p_error_message,p_error_code,'Retry scheduled'),2000),
      scheduled_at=now()+make_interval(secs=>greatest(30,coalesce(p_retry_after_seconds,300))),
      locked_at=null,locked_by=null,updated_at=now()
    where id=v.id returning * into v;
  else
    update public.workflow_actions set status='failed',attempts=v_attempt,provider=p_provider,
      last_error=left(coalesce(p_error_message,p_error_code,'Failed'),2000),locked_at=null,locked_by=null,updated_at=now()
    where id=v.id returning * into v;
  end if;
  return v;
end;
$$;
revoke all on function public.finish_workflow_action(uuid,text,text,text,integer,text,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.finish_workflow_action(uuid,text,text,text,integer,text,text,jsonb,integer) to service_role;

create or replace function public.validate_workflow_runner_token(p_token text)
returns boolean
language sql
security definer
set search_path=''
as $$
  select coalesce(exists(
    select 1 from vault.decrypted_secrets
    where name='reception_ai_workflow_runner_token' and decrypted_secret=p_token
  ),false);
$$;
revoke all on function public.validate_workflow_runner_token(text) from public,anon,authenticated;
grant execute on function public.validate_workflow_runner_token(text) to service_role;

create or replace function public.get_integration_credential(p_integration_id uuid,p_organization_id uuid)
returns text
language sql
security definer
set search_path=''
as $$
  select ds.decrypted_secret
  from private.integration_credentials c
  join vault.decrypted_secrets ds on ds.name=c.vault_secret_name
  where c.integration_id=p_integration_id and c.organization_id=p_organization_id
  limit 1;
$$;
revoke all on function public.get_integration_credential(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_integration_credential(uuid,uuid) to service_role;

create or replace function public.requeue_integration_actions()
returns trigger
language plpgsql
security invoker
set search_path=public
as $$
begin
  if new.status='active' and (tg_op='INSERT' or old.status is distinct from new.status) then
    update public.workflow_actions
    set status='pending',scheduled_at=now(),last_error=null,updated_at=now()
    where organization_id=new.organization_id
      and status='blocked'
      and (channel=new.channel or (channel='auto' and new.channel in ('email','whatsapp')))
      and (last_error ilike '%integration%' or last_error ilike '%provider%' or last_error ilike '%credential%');
  end if;
  return new;
end;
$$;
drop trigger if exists trg_requeue_integration_actions on public.tenant_integrations;
create trigger trg_requeue_integration_actions
after insert or update of status on public.tenant_integrations
for each row execute function public.requeue_integration_actions();

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Runtime provisioning is intentionally separate from migrations:
-- 1. store project URL, anon JWT and a random runner token in Supabase Vault;
-- 2. deploy functions/workflow-runner with verify_jwt=true;
-- 3. schedule pg_cron -> pg_net POST /functions/v1/workflow-runner every minute;
-- 4. store per-tenant provider credentials only in Vault + private.integration_credentials.
