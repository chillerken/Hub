create table if not exists public.user_org_context (
  user_id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null,
  updated_at timestamptz not null default now(),
  constraint user_org_context_membership_fk
    foreign key (organization_id,user_id)
    references public.memberships(organization_id,user_id)
    on delete cascade
);

create table if not exists public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin','agent','viewer')),
  invited_by uuid not null references auth.users(id),
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_invitations_email_nonempty check (length(trim(email)) between 3 and 320)
);

create index if not exists team_invitations_org_status_idx
  on public.team_invitations(organization_id,status,created_at desc);
create index if not exists team_invitations_email_idx
  on public.team_invitations(lower(email),status);
create unique index if not exists team_invitations_one_pending_per_email_org
  on public.team_invitations(organization_id,lower(email))
  where status='pending';

alter table public.user_org_context enable row level security;
alter table public.team_invitations enable row level security;

revoke all on public.user_org_context from anon, authenticated;
revoke all on public.team_invitations from anon, authenticated;
grant all on public.user_org_context to service_role;
grant all on public.team_invitations to service_role;

comment on table public.user_org_context is
  'Server-managed active organization context for users who belong to multiple organizations.';
comment on table public.team_invitations is
  'Server-managed, email-bound, single-use team invitations. Only service_role may access raw invitation records.';
