-- Extends the existing disposable PostgreSQL schema with the minimal columns
-- used by the real public-chat, operations-admin and workflow-runner handlers.
-- No production database or credential is referenced.
\set ON_ERROR_STOP on
alter table public.business_profiles
  add column business_name text,add column receptionist_name text,
  add column widget_token text unique, add column widget_enabled boolean default true,
  add column widget_allowed_domains jsonb default '[]',add column locale text default 'nl-BE',
  add column services jsonb default '[]', add column notification_email text,
  add column preferred_followup_channel text;
alter table public.leads
  add column name text,add column email text,add column phone text,
  add column source text,add column score integer default 20,add column summary text,
  add column dedupe_key text,add column contact_consent_at timestamptz,
  add column marketing_consent_at timestamptz,add column last_contact_at timestamptz,
  add column qualification jsonb default '{}',add column created_at timestamptz default now();
alter table public.leads alter column id set default gen_random_uuid();
alter table public.appointments
  add column timezone text, add column created_at timestamptz default now();
alter table public.appointments alter column id set default gen_random_uuid();
alter table public.workflow_actions
  add column provider text,add column provider_reference text,
  add column error_code text,add column http_status integer,
  add column response_meta jsonb,add column locked_at timestamptz,
  add column locked_by text;
create table public.organizations (
  id uuid primary key,plan text,trial_ends_at timestamptz,
  subscription_status text,status text,is_internal boolean default false
);
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,user_id uuid,role text,active boolean
);
create table public.widget_rate_limits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,client_hash text,created_at timestamptz default now()
);
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,lead_id uuid,channel text,status text,
  created_at timestamptz default now()
);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,conversation_id uuid,role text,content text,
  created_at timestamptz default now()
);
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,lead_id uuid,title text,status text,priority text,
  created_at timestamptz default now()
);
create table public.handoffs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,lead_id uuid,conversation_id uuid,reason text,status text,
  created_at timestamptz default now()
);
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,actor_user_id uuid,event_type text,entity_type text,
  entity_id text,payload jsonb default '{}',
  created_at timestamptz default now()
);
create table public.tenant_integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,channel text,provider text,status text,
  is_default boolean,capabilities jsonb default '[]',
  config jsonb default '{}'
);
create trigger trg_appointment_lifecycle_actions
after insert or update of status,start_at,end_at,location on public.appointments
for each row execute function public.enqueue_appointment_lifecycle_actions();

create table public.reception_ai_plan_catalog (plan text primary key, active boolean, daily_ai_limit integer);
insert into public.reception_ai_plan_catalog(plan,active,daily_ai_limit) values ('business',true,500);
