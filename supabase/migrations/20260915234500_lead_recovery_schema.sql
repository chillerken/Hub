-- LuxAI Lead Autopilot: additive, isolated SaaS schema. Existing LuxWash tables/functions are untouched.
create table if not exists public.leadrecovery_accounts(
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid unique references auth.users(id) on delete set null,
  email text not null unique check(email=lower(email)),
  business_name text not null default '',
  website text not null default '',
  booking_url text not null default '',
  review_url text not null default '',
  reply_email text not null default '',
  slug text not null unique,
  plan text not null default 'none' check(plan in ('none','core','growth')),
  billing_cycle text not null default 'monthly' check(billing_cycle in ('monthly','annual')),
  subscription_status text not null default 'pending' check(subscription_status in ('pending','incomplete','trialing','active','past_due','canceled','unpaid')),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  referral_code text not null unique,
  referrer_account_id uuid references public.leadrecovery_accounts(id) on delete set null,
  onboarding_complete boolean not null default false,
  failed_payments integer not null default 0,
  last_summary_at timestamptz,
  canceled_at timestamptz,
  winback_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists leadrecovery_accounts_status on public.leadrecovery_accounts(subscription_status,plan);

create table if not exists public.leadrecovery_leads(
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.leadrecovery_accounts(id) on delete cascade,
  name text not null,
  email text not null,
  phone text not null default '',
  service text not null default '',
  message text not null default '',
  source text not null default 'hosted_form',
  status text not null default 'new' check(status in ('new','engaged','converted','stopped')),
  follow_up_stage integer not null default 0 check(follow_up_stage between 0 and 2),
  delivery_failures integer not null default 0,
  next_follow_up_at timestamptz default now()+interval '2 hours',
  confirmation_sent_at timestamptz,
  engaged_at timestamptz,
  converted_at timestamptz,
  review_due_at timestamptz,
  review_sent_at timestamptz,
  stopped_at timestamptz,
  privacy_consent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists leadrecovery_leads_account_created on public.leadrecovery_leads(account_id,created_at desc);
create index if not exists leadrecovery_leads_due on public.leadrecovery_leads(status,next_follow_up_at) where next_follow_up_at is not null;

create table if not exists public.leadrecovery_messages(
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.leadrecovery_accounts(id) on delete cascade,
  lead_id uuid references public.leadrecovery_leads(id) on delete cascade,
  stage text not null,
  channel text not null default 'email',
  status text not null check(status in ('sent','failed','skipped')),
  provider_id text,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists leadrecovery_messages_lead on public.leadrecovery_messages(lead_id,created_at desc);

create table if not exists public.leadrecovery_support(
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.leadrecovery_accounts(id) on delete cascade,
  message text not null,
  status text not null default 'open' check(status in ('open','closed')),
  priority text not null default 'normal' check(priority in ('normal','high')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leadrecovery_events(
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.leadrecovery_accounts(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists leadrecovery_events_type_created on public.leadrecovery_events(type,created_at desc);

create table if not exists public.leadrecovery_referrals(
  id uuid primary key default gen_random_uuid(),
  referrer_account_id uuid not null references public.leadrecovery_accounts(id) on delete cascade,
  referred_account_id uuid not null unique references public.leadrecovery_accounts(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','qualified','rewarded')),
  reward_cents integer not null default 0,
  rewarded_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists private.leadrecovery_webhooks(
  id text primary key,
  provider text not null,
  status text not null default 'processing',
  lease_until timestamptz not null default now()+interval '60 seconds',
  created_at timestamptz not null default now()
);

-- No direct client access. The server reaches data only through the guarded RPC below.
do $$ declare t text; begin
  foreach t in array array['leadrecovery_accounts','leadrecovery_leads','leadrecovery_messages','leadrecovery_support','leadrecovery_events','leadrecovery_referrals'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon,authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end $$;
revoke all on table private.leadrecovery_webhooks from public,anon,authenticated;

create or replace function private.leadrecovery_touch() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=now(); return new; end $$;
do $$ begin
  if not exists(select 1 from pg_trigger where tgname='leadrecovery_accounts_touch') then create trigger leadrecovery_accounts_touch before update on public.leadrecovery_accounts for each row execute function private.leadrecovery_touch(); end if;
  if not exists(select 1 from pg_trigger where tgname='leadrecovery_leads_touch') then create trigger leadrecovery_leads_touch before update on public.leadrecovery_leads for each row execute function private.leadrecovery_touch(); end if;
  if not exists(select 1 from pg_trigger where tgname='leadrecovery_support_touch') then create trigger leadrecovery_support_touch before update on public.leadrecovery_support for each row execute function private.leadrecovery_touch(); end if;
end $$;
