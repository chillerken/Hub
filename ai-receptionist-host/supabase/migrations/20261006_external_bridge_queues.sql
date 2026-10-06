-- Reception AI external bridge queues.
-- Applied to Supabase project ndecxbsrxspkuxjsbndq on 2026-10-06.

create table if not exists public.izap_dispatch_queue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_action_id uuid not null references public.workflow_actions(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  business_id uuid not null,
  recipient_phone text not null,
  template_name text not null,
  template_language text not null default 'nl',
  body_variables jsonb not null default '[]'::jsonb,
  status text not null default 'pending',
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  last_error text,
  provider_message_id text,
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint izap_dispatch_queue_action_unique unique(workflow_action_id),
  constraint izap_dispatch_queue_status_check check (status in ('pending','sending','sent','failed','manual_required')),
  constraint izap_dispatch_queue_body_vars_array check (jsonb_typeof(body_variables)='array')
);

create index if not exists izap_dispatch_queue_pending_idx
  on public.izap_dispatch_queue(status,scheduled_at)
  where status='pending';

alter table public.izap_dispatch_queue enable row level security;
revoke all on public.izap_dispatch_queue from anon, authenticated;
grant all on public.izap_dispatch_queue to service_role;

comment on table public.izap_dispatch_queue is
  'Server-only handoff queue from Reception AI workflow actions to the authenticated iZap connector dispatcher.';

create table if not exists public.google_calendar_dispatch_queue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_action_id uuid not null references public.workflow_actions(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  operation text not null,
  calendar_id text not null default 'primary',
  provider_event_id text,
  provider_event_url text,
  title text,
  description text,
  location text,
  start_at timestamptz,
  end_at timestamptz,
  timezone text not null default 'Europe/Brussels',
  status text not null default 'pending',
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  last_error text,
  scheduled_at timestamptz not null default now(),
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint google_calendar_dispatch_queue_action_unique unique(workflow_action_id),
  constraint google_calendar_dispatch_queue_operation_check check (operation in ('create','update','delete')),
  constraint google_calendar_dispatch_queue_status_check check (status in ('pending','processing','synced','failed','manual_required')),
  constraint google_calendar_dispatch_queue_times_check check (
    operation='delete' or (start_at is not null and end_at is not null and end_at > start_at)
  )
);

create index if not exists google_calendar_dispatch_pending_idx
  on public.google_calendar_dispatch_queue(status,scheduled_at)
  where status='pending';

alter table public.google_calendar_dispatch_queue enable row level security;
revoke all on public.google_calendar_dispatch_queue from anon, authenticated;
grant all on public.google_calendar_dispatch_queue to service_role;

comment on table public.google_calendar_dispatch_queue is
  'Server-only handoff queue from Reception AI workflow actions to authenticated Google Calendar connector execution.';
