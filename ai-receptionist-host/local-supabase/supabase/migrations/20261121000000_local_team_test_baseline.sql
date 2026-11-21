-- Minimal, disposable schema for local team-management integration tests.
-- This is NOT a production schema dump and contains no production records.
-- Supabase Local provides auth.users and the anon/authenticated/service_role roles.

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  status text not null default 'active' check (status in ('onboarding','active','suspended')),
  plan text not null default 'trial',
  subscription_status text not null default 'trialing',
  trial_ends_at timestamptz default (now() + interval '14 days'),
  is_internal boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','admin','agent','viewer')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint memberships_org_user_unique unique (organization_id,user_id),
  constraint memberships_org_user_id_unique unique (organization_id,user_id)
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  entity_type text,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.audit_events enable row level security;

revoke all on public.organizations, public.memberships, public.audit_events from anon, authenticated;
grant all on public.organizations, public.memberships, public.audit_events to service_role;
