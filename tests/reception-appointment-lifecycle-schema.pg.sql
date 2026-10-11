-- Disposable PostgreSQL 16 test schema, never applied to Supabase.
\set ON_ERROR_STOP on
create table public.business_profiles(
  organization_id uuid primary key,
  automation_enabled boolean not null default false
);
create table public.leads(
  id uuid primary key,
  organization_id uuid not null,
  status text not null default 'qualifying',
  updated_at timestamptz not null default now()
);
create table public.appointments(
  id uuid primary key,
  organization_id uuid not null,
  lead_id uuid not null,
  status text not null,
  requested_text text,
  start_at timestamptz,
  end_at timestamptz,
  location text,
  provider text,
  provider_booking_id text,
  updated_at timestamptz not null default now()
);
create table public.workflow_actions(
  id bigserial primary key,
  organization_id uuid not null,
  lead_id uuid,
  action_type text not null,
  channel text not null,
  status text not null,
  priority text not null,
  idempotency_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  scheduled_at timestamptz not null default now(),
  last_error text,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);
create function public.assert_test(condition boolean, label text) returns void
language plpgsql as $$
begin
  if condition is distinct from true then
    raise exception 'TEST FAILED: %', label;
  end if;
  raise notice 'PASS: %', label;
end;
$$;
