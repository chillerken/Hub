-- Schema-only snapshot of Reception AI production database.

-- Generated from PostgreSQL catalogs. NO production rows, user records, or secret values are included.

-- Rebuilds the public/private application schemas; Supabase-managed auth/storage schemas come from Supabase Local.

create schema if not exists private;

create schema if not exists promo_omega_private;

create schema if not exists promo_omega;

create schema if not exists extensions;

create extension if not exists "pg_cron" with schema "pg_catalog";

create extension if not exists "pg_net" with schema "public";

create extension if not exists "pg_stat_statements" with schema "extensions";

create extension if not exists "pgcrypto" with schema "extensions";

create extension if not exists "supabase_vault" with schema "vault";

create extension if not exists "unaccent" with schema "extensions";

create extension if not exists "uuid-ossp" with schema "extensions";

set search_path = public, private, extensions, vault, promo_omega_private;

-- Compatibility stub: production signup trigger optionally checks the separate Omega signup router.

create or replace function promo_omega_private.route_signup(uuid, text, jsonb) returns boolean language sql security definer set search_path = '' as $$ select false $$;

-- Sequences must exist before table defaults that call nextval().

create sequence if not exists public."audit_events_id_seq";

create sequence if not exists public."jarvis_agent_events_id_seq";

create sequence if not exists public."widget_rate_limits_id_seq";

-- Create all tables before adding foreign keys and check constraints.

create table if not exists "private"."billing_checkout_refs" (
  "token_hash" text not null,
  "organization_id" uuid not null,
  "user_id" uuid not null,
  "plan" text not null,
  "expires_at" timestamp with time zone not null,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null
);

create table if not exists "private"."integration_credentials" (
  "integration_id" uuid not null,
  "organization_id" uuid not null,
  "vault_secret_name" text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table if not exists "private"."oauth_states" (
  "state_hash" text not null,
  "organization_id" uuid not null,
  "user_id" uuid not null,
  "integration_id" uuid not null,
  "provider" text not null,
  "redirect_after" text not null,
  "expires_at" timestamp with time zone not null,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null
);

create table if not exists "public"."ai_usage_daily" (
  "organization_id" uuid not null,
  "usage_date" date default CURRENT_DATE not null,
  "request_count" integer default 0 not null,
  "updated_at" timestamp with time zone default now() not null
);

create table if not exists "public"."appointments" (
  "id" uuid default gen_random_uuid() not null,
  "organization_id" uuid not null,
  "lead_id" uuid not null,
  "status" text default 'requested'::text not null,
  "requested_text" text,
  "start_at" timestamp with time zone,
  "end_at" timestamp with time zone,
  "timezone" text default 'Europe/Brussels'::text not null,
  "provider" text,
  "provider_booking_id" text,
  "location" text,
  "notes" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "completed_at" timestamp with time zone
);

create table if not exists "public"."audit_events" (
  "id" bigint generated always as identity not null,
  "organization_id" uuid not null,
  "actor_user_id" uuid,
  "event_type" text not null,
  "entity_type" text default ''::text not null,
  "entity_id" uuid,
  "payload" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null
);

create table if not exists "public"."business_profiles" (
  "organization_id" uuid not null,
  "business_name" text not null,
  "description" text default ''::text not null,
  "services" jsonb default '[]'::jsonb not null,
  "opening_hours" jsonb default '{}'::jsonb not null,
  "qualification_questions" jsonb default '[]'::jsonb not null,
  "escalation_rules" jsonb default '{"urgent": true, "complaint": true, "human_request": true}'::jsonb not null,
  "receptionist_name" text default 'Ava'::text not null,
  "locale" text default 'nl-BE'::text not null,
  "updated_at" timestamp with time zone default now() not null,
  "widget_token" uuid default gen_random_uuid() not null,
  "widget_enabled" boolean default true not null,
  "widget_greeting" text default 'Hallo! Waarmee kan ik helpen?'::text not null,
  "widget_accent" text default '#e7b85b'::text not null,
  "notification_email" text,
  "lead_capture_mode" text default 'progressive'::text not null,
  "automation_enabled" boolean default false not null,
  "preferred_followup_channel" text default 'auto'::text not null,
  "review_delay_hours" integer default 24 not null,
  "retention_delay_days" integer default 30 not null,
  "widget_allowed_domains" text[] default '{}'::text[] not null,
  "custom_instructions" text default ''::text not null
);

create table if not exists "public"."commercial_learning_snapshots" (
  "id" uuid default gen_random_uuid() not null,
  "organization_id" uuid not null,
  "period_days" integer default 90 not null,
  "metrics" jsonb default '{}'::jsonb not null,
  "sales_learning" jsonb default '{}'::jsonb not null,
  "marketing_learning" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null
);

create table if not exists "public"."conversations" (
  "id" uuid default gen_random_uuid() not null,
  "organization_id" uuid not null,
  "lead_id" uuid,
  "channel" text default 'web'::text not null,
  "status" text default 'open'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table if not exists "public"."creator_hub_assets" (
  "id" uuid default gen_random_uuid() not null,
  "created_by" uuid not null,
  "organization_id" uuid,
  "asset_type" text not null,
  "title" text not null,
  "status" text default 'draft'::text not null,
  "payload" jsonb default '{}'::jsonb not null,
  "public_token" uuid default gen_random_uuid() not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table if not exists "public"."customer_payments" (
  "id" uuid default gen_random_uuid() not null,
  "organization_id" uuid not null,
  "lead_id" uuid not null,
  "appointment_id" uuid,
  "status" text default 'pending'::text not null,
  "amount_cents" integer,
  "currency" text default 'EUR'::text not null,
  "provider" text,
  "provider_payment_id" text,
  "payment_url" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "paid_at" timestamp with time zone
);

create table if not exists "public"."google_calendar_dispatch_queue" (
  "id" uuid default gen_random_uuid() not null,
  "organization_id" uuid not null,
  "workflow_action_id" uuid not null,
  "appointment_id" uuid not null,
  "operation" text not null,
  "calendar_id" text default 'primary'::text not null,
  "provider_event_id" text,
  "provider_event_url" text,
  "title" text,
  "description" text,
  "location" text,
  "start_at" timestamp with time zone,
  "end_at" timestamp with time zone,
  "timezone" text default 'Europe/Brussels'::text not null,
  "status" text default 'pending'::text not null,
  "attempts" integer default 0 not null,
  "max_attempts" integer default 3 not null,
  "last_error" text,
  "scheduled_at" timestamp with time zone default now() not null,
  "synced_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table if not exists "public"."handoffs" (
  "id" uuid default gen_random_uuid() not null,
  "organization_id" uuid not null,
  "lead_id" uuid,
  "conversation_id" uuid,
  "reason" text not null,
  "status" text default 'open'::text not null,
  "created_at" timestamp with time zone default now() not null
);

create table if not exists "public"."izap_dispatch_queue" (
  "id" uuid default gen_random_uuid() not null,
  "organization_id" uuid not null,
  "workflow_action_id" uuid not null,
  "lead_id" uuid,
  "business_id" uuid not null,
  "recipient_phone" text not null,
  "template_name" text not null,
  "template_language" text default 'nl'::text not null,
  "body_variables" jsonb default '[]'::jsonb not null,
  "status" text default 'pending'::text not null,
  "attempts" integer default 0 not null,
  "max_attempts" integer default 3 not null,
  "last_error" text,
  "provider_message_id" text,
  "scheduled_at" timestamp with time zone default now() not null,
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table if not exists "public"."jarvis_agent_events" (
  "id" bigint generated always as identity not null,
  "task_id" uuid not null,
  "organization_id" uuid not null,
  "owner_user_id" uuid not null,
  "actor_user_id" uuid,
  "old_status" text,
  "new_status" text not null,
  "logged_at" timestamp with time zone default now() not null
);

create table if not exists "public"."jarvis_agent_tasks" (
  "id" uuid default gen_random_uuid() not null,
  "organization_id" uuid not null,
  "owner_user_id" uuid not null,
  "client_request_id" uuid default gen_random_uuid() not null,
  "title" text not null,
  "objective" text not null,
  "kind" text not null,
  "status" text default 'pending_approval'::text not null,
  "scheduled_at" timestamp with time zone default now() not null,
  "approved_at" timestamp with time zone,
  "result_text" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "plan_progress" jsonb default '{}'::jsonb not null
);

create table if not exists "public"."lead_agent_configs" (
  "organization_id" uuid not null,
  "name" text default 'Lead Agent'::text not null,
  "target_audience" text default ''::text not null,
  "offer" text default ''::text not null,
  "qualification_criteria" text default ''::text not null,
  "preferred_channel" text default 'auto'::text not null,
  "min_score" integer default 60 not null,
  "follow_up_due_hours" integer default 24 not null,
  "instructions" text default ''::text not null,
  "active" boolean default false not null,
  "updated_by" uuid,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table if not exists "public"."leadflow_leads" (
  "id" uuid default gen_random_uuid() not null,
  "owner_id" uuid default auth.uid() not null,
  "name" text not null,
  "contact" text,
  "service" text not null,
  "type" text default 'Particulier'::text not null,
  "status" text default 'Nieuw'::text not null,
  "due" date,
  "notes" text,
  "created_at" timestamp with time zone default now() not null
);

create table if not exists "public"."leads" (
  "id" uuid default gen_random_uuid() not null,
  "organization_id" uuid not null,
  "name" text default ''::text not null,
  "email" text default ''::text,
  "phone" text default ''::text,
  "source" text default 'web'::text not null,
  "status" text default 'new'::text not null,
  "score" integer default 0 not null,
  "summary" text default ''::text not null,
  "qualification" jsonb default '{}'::jsonb not null,
  "dedupe_key" text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "last_contact_at" timestamp with time zone,
  "contact_consent_at" timestamp with time zone,
  "marketing_consent_at" timestamp with time zone,
  "marketing_campaign_id" uuid,
  "attributed_at" timestamp with time zone,
  "won_at" timestamp with time zone,
  "lost_at" timestamp with time zone,
  "outcome_reason" text,
  "outcome_notes" text,
  "lost_reason_code" text
);

create table if not exists "public"."marketing_agent_configs" (
  "organization_id" uuid not null,
  "name" text default 'Marketing Agent'::text not null,
  "active" boolean default false not null,
  "target_audience" text default ''::text not null,
  "positioning" text default ''::text not null,
  "channels" text[] default ARRAY['facebook'::text, 'instagram'::text] not null,
  "content_pillars" text[] default '{}'::text[] not null,
  "cadence_per_week" integer default 3 not null,
  "tone" text default 'menselijk, lokaal en betrouwbaar'::text not null,
  "call_to_action" text default 'Neem contact op voor meer informatie'::text not null,
  "instructions" text default ''::text not null,
  "save_drafts" boolean default true not null,
  "updated_by" uuid,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "auto_drafts" boolean default false not null,
  "last_run_at" timestamp with time zone,
  "brand_name" text default ''::text not null,
  "product_context" text default ''::text not null,
  "product_services" text[] default '{}'::text[] not null,
  "landing_url" text default ''::text not null
);

create table if not exists "public"."marketing_campaigns" (
  "id" uuid default gen_random_uuid() not null,
  "organization_id" uuid not null,
  "status" text default 'draft'::text not null,
  "objective" text default ''::text not null,
  "audience" text default ''::text not null,
  "channel" text default 'social'::text not null,
  "hook" text default ''::text not null,
  "content" text default ''::text not null,
  "cta" text default ''::text not null,
  "rationale" text default ''::text not null,
  "source_signals" jsonb default '{}'::jsonb not null,
  "created_by" uuid,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "scheduled_for" timestamp with time zone,
  "published_at" timestamp with time zone,
  "external_url" text,
  "tracking_code" uuid default gen_random_uuid() not null
);

create table if not exists "public"."memberships" (
  "id" uuid default gen_random_uuid() not null,
  "organization_id" uuid not null,
  "user_id" uuid not null,
  "role" text default 'owner'::text not null,
  "active" boolean default true not null,
  "created_at" timestamp with time zone default now() not null
);

create table if not exists "public"."messages" (
  "id" uuid default gen_random_uuid() not null,
  "organization_id" uuid not null,
  "conversation_id" uuid not null,
  "role" text not null,
  "content" text not null,
  "created_at" timestamp with time zone default now() not null
);

create table if not exists "public"."organizations" (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "status" text default 'onboarding'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "plan" text default 'trial'::text not null,
  "trial_ends_at" timestamp with time zone default (now() + '14 days'::interval) not null,
  "stripe_customer_id" text,
  "stripe_subscription_id" text,
  "subscription_status" text default 'trialing'::text not null,
  "is_internal" boolean default false not null
);

create table if not exists "public"."platform_admins" (
  "user_id" uuid not null,
  "created_at" timestamp with time zone default now() not null
);

create table if not exists "public"."reception_ai_plan_catalog" (
  "plan" text not null,
  "public_name" text not null,
  "monthly_cents" integer not null,
  "currency" text default 'EUR'::text not null,
  "payment_link_url" text not null,
  "stripe_payment_link_id" text not null,
  "daily_ai_limit" integer not null,
  "sort_order" integer not null,
  "summary" text not null,
  "features" jsonb default '[]'::jsonb not null,
  "active" boolean default true not null,
  "updated_at" timestamp with time zone default now() not null,
  "setup_cents" integer default 0 not null
);

create table if not exists "public"."sales_agent_configs" (
  "organization_id" uuid not null,
  "name" text default 'Sales Agent'::text not null,
  "active" boolean default false not null,
  "min_score" integer default 60 not null,
  "preferred_channel" text default 'auto'::text not null,
  "follow_up_due_hours" integer default 24 not null,
  "objective" text default ''::text not null,
  "offer" text default ''::text not null,
  "tone" text default 'menselijk, professioneel en compact'::text not null,
  "instructions" text default ''::text not null,
  "create_task_by_default" boolean default true not null,
  "updated_by" uuid,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "auto_triage" boolean default false not null,
  "last_run_at" timestamp with time zone,
  "brand_name" text default ''::text not null,
  "product_context" text default ''::text not null,
  "product_services" text[] default '{}'::text[] not null
);

create table if not exists "public"."sales_onboarding_invites" (
  "id" uuid default gen_random_uuid() not null,
  "token" uuid default gen_random_uuid() not null,
  "sales_organization_id" uuid not null,
  "lead_id" uuid not null,
  "requested_plan" text default 'pilot'::text not null,
  "status" text default 'pending'::text not null,
  "expires_at" timestamp with time zone default (now() + '7 days'::interval) not null,
  "claimed_organization_id" uuid,
  "claimed_at" timestamp with time zone,
  "converted_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table if not exists "public"."sales_opportunities" (
  "organization_id" uuid not null,
  "lead_id" uuid not null,
  "temperature" text default 'cold'::text not null,
  "stage" text default 'new'::text not null,
  "confidence" integer default 0 not null,
  "next_action" text default ''::text not null,
  "reason" text default ''::text not null,
  "channel" text default 'CRM'::text not null,
  "message" text default ''::text not null,
  "objection" text default ''::text not null,
  "missing_info" jsonb default '[]'::jsonb not null,
  "can_contact" boolean default false not null,
  "analyzed_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table if not exists "public"."sales_sequence_steps" (
  "id" uuid default gen_random_uuid() not null,
  "sequence_id" uuid not null,
  "organization_id" uuid not null,
  "lead_id" uuid not null,
  "step_no" integer not null,
  "due_at" timestamp with time zone not null,
  "channel" text default 'email'::text not null,
  "message" text default ''::text not null,
  "status" text default 'planned'::text not null,
  "requires_approval" boolean default true not null,
  "workflow_action_id" uuid,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table if not exists "public"."sales_sequences" (
  "id" uuid default gen_random_uuid() not null,
  "organization_id" uuid not null,
  "lead_id" uuid not null,
  "status" text default 'active'::text not null,
  "objective" text default ''::text not null,
  "current_step" integer default 1 not null,
  "created_by" uuid,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table if not exists "public"."stripe_events" (
  "id" text not null,
  "event_type" text not null,
  "processed_at" timestamp with time zone default now() not null,
  "status" text default 'processed'::text not null,
  "last_error" text,
  "attempts" integer default 1 not null,
  "updated_at" timestamp with time zone default now() not null
);

create table if not exists "public"."tasks" (
  "id" uuid default gen_random_uuid() not null,
  "organization_id" uuid not null,
  "lead_id" uuid,
  "title" text not null,
  "status" text default 'open'::text not null,
  "priority" text default 'normal'::text not null,
  "due_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null
);

create table if not exists "public"."team_invitations" (
  "id" uuid default gen_random_uuid() not null,
  "organization_id" uuid not null,
  "email" text not null,
  "role" text not null,
  "invited_by" uuid not null,
  "token_hash" text not null,
  "status" text default 'pending'::text not null,
  "expires_at" timestamp with time zone default (now() + '7 days'::interval) not null,
  "accepted_at" timestamp with time zone,
  "accepted_by" uuid,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table if not exists "public"."tenant_activation_events" (
  "id" uuid default gen_random_uuid() not null,
  "organization_id" uuid not null,
  "event_type" text not null,
  "source_entity_type" text,
  "source_entity_id" uuid,
  "happened_at" timestamp with time zone default now() not null,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null
);

create table if not exists "public"."tenant_integrations" (
  "id" uuid default gen_random_uuid() not null,
  "organization_id" uuid not null,
  "channel" text not null,
  "provider" text not null,
  "status" text default 'needs_setup'::text not null,
  "is_default" boolean default true not null,
  "config" jsonb default '{}'::jsonb not null,
  "capabilities" text[] default '{}'::text[] not null,
  "last_verified_at" timestamp with time zone,
  "last_error" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table if not exists "public"."user_org_context" (
  "user_id" uuid not null,
  "organization_id" uuid not null,
  "updated_at" timestamp with time zone default now() not null
);

create table if not exists "public"."widget_rate_limits" (
  "id" bigint generated always as identity not null,
  "organization_id" uuid not null,
  "client_hash" text not null,
  "created_at" timestamp with time zone default now() not null
);

create table if not exists "public"."workflow_action_attempts" (
  "id" uuid default gen_random_uuid() not null,
  "workflow_action_id" uuid not null,
  "organization_id" uuid not null,
  "attempt_no" integer not null,
  "provider" text,
  "outcome" text not null,
  "http_status" integer,
  "provider_reference" text,
  "error_code" text,
  "error_message" text,
  "response_meta" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null
);

create table if not exists "public"."workflow_actions" (
  "id" uuid default gen_random_uuid() not null,
  "organization_id" uuid not null,
  "lead_id" uuid,
  "action_type" text not null,
  "channel" text default 'internal'::text not null,
  "status" text default 'pending'::text not null,
  "priority" text default 'normal'::text not null,
  "idempotency_key" text not null,
  "payload" jsonb default '{}'::jsonb not null,
  "scheduled_at" timestamp with time zone default now() not null,
  "attempts" integer default 0 not null,
  "provider" text,
  "provider_reference" text,
  "last_error" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "completed_at" timestamp with time zone,
  "locked_at" timestamp with time zone,
  "locked_by" text,
  "max_attempts" integer default 5 not null
);

-- Add keys and constraints after all referenced tables exist.

alter table "private"."billing_checkout_refs" add constraint "billing_checkout_refs_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "private"."billing_checkout_refs" add constraint "billing_checkout_refs_pkey" PRIMARY KEY (token_hash);

alter table "private"."billing_checkout_refs" add constraint "billing_checkout_refs_plan_check" CHECK (plan = ANY (ARRAY['starter'::text, 'pro'::text, 'business'::text]));

alter table "private"."integration_credentials" add constraint "integration_credentials_integration_id_fkey" FOREIGN KEY (integration_id) REFERENCES tenant_integrations(id) ON DELETE CASCADE;

alter table "private"."integration_credentials" add constraint "integration_credentials_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "private"."integration_credentials" add constraint "integration_credentials_pkey" PRIMARY KEY (integration_id);

alter table "private"."integration_credentials" add constraint "integration_credentials_vault_secret_name_key" UNIQUE (vault_secret_name);

alter table "private"."oauth_states" add constraint "oauth_states_integration_id_fkey" FOREIGN KEY (integration_id) REFERENCES tenant_integrations(id) ON DELETE CASCADE;

alter table "private"."oauth_states" add constraint "oauth_states_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "private"."oauth_states" add constraint "oauth_states_pkey" PRIMARY KEY (state_hash);

alter table "private"."oauth_states" add constraint "oauth_states_provider_check" CHECK (provider = 'google_calendar'::text);

alter table "public"."ai_usage_daily" add constraint "ai_usage_daily_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."ai_usage_daily" add constraint "ai_usage_daily_pkey" PRIMARY KEY (organization_id, usage_date);

alter table "public"."ai_usage_daily" add constraint "ai_usage_daily_request_count_check" CHECK (request_count >= 0);

alter table "public"."appointments" add constraint "appointments_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

alter table "public"."appointments" add constraint "appointments_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."appointments" add constraint "appointments_pkey" PRIMARY KEY (id);

alter table "public"."audit_events" add constraint "audit_events_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table "public"."audit_events" add constraint "audit_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."audit_events" add constraint "audit_events_pkey" PRIMARY KEY (id);

alter table "public"."business_profiles" add constraint "business_profiles_lead_capture_mode_check" CHECK (lead_capture_mode = ANY (ARRAY['progressive'::text, 'upfront'::text]));

alter table "public"."business_profiles" add constraint "business_profiles_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."business_profiles" add constraint "business_profiles_pkey" PRIMARY KEY (organization_id);

alter table "public"."commercial_learning_snapshots" add constraint "commercial_learning_snapshots_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."commercial_learning_snapshots" add constraint "commercial_learning_snapshots_period_days_check" CHECK (period_days >= 7 AND period_days <= 3650);

alter table "public"."commercial_learning_snapshots" add constraint "commercial_learning_snapshots_pkey" PRIMARY KEY (id);

alter table "public"."conversations" add constraint "conversations_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL;

alter table "public"."conversations" add constraint "conversations_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."conversations" add constraint "conversations_pkey" PRIMARY KEY (id);

alter table "public"."conversations" add constraint "conversations_status_check" CHECK (status = ANY (ARRAY['open'::text, 'waiting'::text, 'handoff'::text, 'closed'::text]));

alter table "public"."creator_hub_assets" add constraint "creator_hub_assets_asset_type_check" CHECK (asset_type = ANY (ARRAY['website'::text, 'quote'::text, 'workflow'::text, 'receptionist'::text, 'lead_agent'::text]));

alter table "public"."creator_hub_assets" add constraint "creator_hub_assets_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table "public"."creator_hub_assets" add constraint "creator_hub_assets_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL;

alter table "public"."creator_hub_assets" add constraint "creator_hub_assets_pkey" PRIMARY KEY (id);

alter table "public"."creator_hub_assets" add constraint "creator_hub_assets_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'ready'::text, 'active'::text, 'live'::text, 'sent'::text, 'archived'::text]));

alter table "public"."creator_hub_assets" add constraint "creator_hub_assets_title_check" CHECK (char_length(title) >= 1 AND char_length(title) <= 160);

alter table "public"."customer_payments" add constraint "customer_payments_amount_positive" CHECK (amount_cents IS NULL OR amount_cents > 0);

alter table "public"."customer_payments" add constraint "customer_payments_appointment_id_fkey" FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL;

alter table "public"."customer_payments" add constraint "customer_payments_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

alter table "public"."customer_payments" add constraint "customer_payments_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."customer_payments" add constraint "customer_payments_pkey" PRIMARY KEY (id);

alter table "public"."google_calendar_dispatch_queue" add constraint "google_calendar_dispatch_queue_action_unique" UNIQUE (workflow_action_id);

alter table "public"."google_calendar_dispatch_queue" add constraint "google_calendar_dispatch_queue_appointment_id_fkey" FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE;

alter table "public"."google_calendar_dispatch_queue" add constraint "google_calendar_dispatch_queue_operation_check" CHECK (operation = ANY (ARRAY['create'::text, 'update'::text, 'delete'::text]));

alter table "public"."google_calendar_dispatch_queue" add constraint "google_calendar_dispatch_queue_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."google_calendar_dispatch_queue" add constraint "google_calendar_dispatch_queue_pkey" PRIMARY KEY (id);

alter table "public"."google_calendar_dispatch_queue" add constraint "google_calendar_dispatch_queue_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'synced'::text, 'failed'::text, 'manual_required'::text]));

alter table "public"."google_calendar_dispatch_queue" add constraint "google_calendar_dispatch_queue_times_check" CHECK (operation = 'delete'::text OR start_at IS NOT NULL AND end_at IS NOT NULL AND end_at > start_at);

alter table "public"."google_calendar_dispatch_queue" add constraint "google_calendar_dispatch_queue_workflow_action_id_fkey" FOREIGN KEY (workflow_action_id) REFERENCES workflow_actions(id) ON DELETE CASCADE;

alter table "public"."handoffs" add constraint "handoffs_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL;

alter table "public"."handoffs" add constraint "handoffs_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL;

alter table "public"."handoffs" add constraint "handoffs_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."handoffs" add constraint "handoffs_pkey" PRIMARY KEY (id);

alter table "public"."handoffs" add constraint "handoffs_status_check" CHECK (status = ANY (ARRAY['open'::text, 'accepted'::text, 'resolved'::text]));

alter table "public"."izap_dispatch_queue" add constraint "izap_dispatch_queue_action_unique" UNIQUE (workflow_action_id);

alter table "public"."izap_dispatch_queue" add constraint "izap_dispatch_queue_body_vars_array" CHECK (jsonb_typeof(body_variables) = 'array'::text);

alter table "public"."izap_dispatch_queue" add constraint "izap_dispatch_queue_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

alter table "public"."izap_dispatch_queue" add constraint "izap_dispatch_queue_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."izap_dispatch_queue" add constraint "izap_dispatch_queue_pkey" PRIMARY KEY (id);

alter table "public"."izap_dispatch_queue" add constraint "izap_dispatch_queue_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'sending'::text, 'sent'::text, 'failed'::text, 'manual_required'::text]));

alter table "public"."izap_dispatch_queue" add constraint "izap_dispatch_queue_workflow_action_id_fkey" FOREIGN KEY (workflow_action_id) REFERENCES workflow_actions(id) ON DELETE CASCADE;

alter table "public"."jarvis_agent_events" add constraint "jarvis_agent_events_pkey" PRIMARY KEY (id);

alter table "public"."jarvis_agent_events" add constraint "jarvis_agent_events_task_id_fkey" FOREIGN KEY (task_id) REFERENCES jarvis_agent_tasks(id) ON DELETE CASCADE;

alter table "public"."jarvis_agent_tasks" add constraint "jarvis_agent_approved_before_execution_v1" CHECK ((status <> ALL (ARRAY['queued'::text, 'needs_attention'::text, 'completed'::text])) OR approved_at IS NOT NULL);

alter table "public"."jarvis_agent_tasks" add constraint "jarvis_agent_plan_progress_safe_check" CHECK (jsonb_typeof(plan_progress) = 'object'::text AND pg_column_size(plan_progress) <= 1024);

alter table "public"."jarvis_agent_tasks" add constraint "jarvis_agent_tasks_kind_check" CHECK (kind = ANY (ARRAY['reminder'::text, 'draft'::text, 'plan'::text]));

alter table "public"."jarvis_agent_tasks" add constraint "jarvis_agent_tasks_objective_check" CHECK (char_length(objective) >= 3 AND char_length(objective) <= 1500);

alter table "public"."jarvis_agent_tasks" add constraint "jarvis_agent_tasks_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."jarvis_agent_tasks" add constraint "jarvis_agent_tasks_organization_id_owner_user_id_client_req_key" UNIQUE (organization_id, owner_user_id, client_request_id);

alter table "public"."jarvis_agent_tasks" add constraint "jarvis_agent_tasks_owner_user_id_fkey" FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table "public"."jarvis_agent_tasks" add constraint "jarvis_agent_tasks_pkey" PRIMARY KEY (id);

alter table "public"."jarvis_agent_tasks" add constraint "jarvis_agent_tasks_result_text_check" CHECK (char_length(result_text) <= 4000);

alter table "public"."jarvis_agent_tasks" add constraint "jarvis_agent_tasks_status_check" CHECK (status = ANY (ARRAY['pending_approval'::text, 'queued'::text, 'needs_attention'::text, 'completed'::text, 'cancelled'::text, 'failed'::text]));

alter table "public"."jarvis_agent_tasks" add constraint "jarvis_agent_tasks_title_check" CHECK (char_length(title) >= 3 AND char_length(title) <= 150);

alter table "public"."lead_agent_configs" add constraint "lead_agent_configs_follow_up_due_hours_check" CHECK (follow_up_due_hours >= 1 AND follow_up_due_hours <= 720);

alter table "public"."lead_agent_configs" add constraint "lead_agent_configs_min_score_check" CHECK (min_score >= 0 AND min_score <= 100);

alter table "public"."lead_agent_configs" add constraint "lead_agent_configs_name_check" CHECK (char_length(name) >= 1 AND char_length(name) <= 120);

alter table "public"."lead_agent_configs" add constraint "lead_agent_configs_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."lead_agent_configs" add constraint "lead_agent_configs_pkey" PRIMARY KEY (organization_id);

alter table "public"."lead_agent_configs" add constraint "lead_agent_configs_preferred_channel_check" CHECK (preferred_channel = ANY (ARRAY['auto'::text, 'email'::text, 'whatsapp'::text, 'linkedin'::text, 'phone'::text, 'multichannel'::text]));

alter table "public"."lead_agent_configs" add constraint "lead_agent_configs_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table "public"."leadflow_leads" add constraint "leadflow_leads_contact_check" CHECK (contact IS NULL OR char_length(contact) <= 140);

alter table "public"."leadflow_leads" add constraint "leadflow_leads_name_check" CHECK (char_length(name) >= 1 AND char_length(name) <= 100);

alter table "public"."leadflow_leads" add constraint "leadflow_leads_notes_check" CHECK (notes IS NULL OR char_length(notes) <= 500);

alter table "public"."leadflow_leads" add constraint "leadflow_leads_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table "public"."leadflow_leads" add constraint "leadflow_leads_pkey" PRIMARY KEY (id);

alter table "public"."leadflow_leads" add constraint "leadflow_leads_service_check" CHECK (char_length(service) >= 1 AND char_length(service) <= 120);

alter table "public"."leadflow_leads" add constraint "leadflow_leads_status_check" CHECK (status = ANY (ARRAY['Nieuw'::text, 'Opvolgen'::text, 'Offerte'::text, 'Gewonnen'::text, 'Verloren'::text]));

alter table "public"."leadflow_leads" add constraint "leadflow_leads_type_check" CHECK (type = ANY (ARRAY['Particulier'::text, 'Bedrijf'::text]));

alter table "public"."leads" add constraint "leads_lost_reason_code_check" CHECK (lost_reason_code IS NULL OR (lost_reason_code = ANY (ARRAY['price_budget'::text, 'no_response'::text, 'timing'::text, 'competitor'::text, 'no_fit'::text, 'availability'::text, 'not_interested'::text, 'invalid_duplicate'::text, 'other'::text])));

alter table "public"."leads" add constraint "leads_marketing_campaign_id_fkey" FOREIGN KEY (marketing_campaign_id) REFERENCES marketing_campaigns(id) ON DELETE SET NULL;

alter table "public"."leads" add constraint "leads_organization_id_dedupe_key_key" UNIQUE (organization_id, dedupe_key);

alter table "public"."leads" add constraint "leads_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."leads" add constraint "leads_pkey" PRIMARY KEY (id);

alter table "public"."leads" add constraint "leads_score_check" CHECK (score >= 0 AND score <= 100);

alter table "public"."leads" add constraint "leads_status_check" CHECK (status = ANY (ARRAY['new'::text, 'qualifying'::text, 'qualified'::text, 'follow_up'::text, 'handoff'::text, 'won'::text, 'lost'::text]));

alter table "public"."marketing_agent_configs" add constraint "marketing_agent_configs_cadence_per_week_check" CHECK (cadence_per_week >= 1 AND cadence_per_week <= 21);

alter table "public"."marketing_agent_configs" add constraint "marketing_agent_configs_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."marketing_agent_configs" add constraint "marketing_agent_configs_pkey" PRIMARY KEY (organization_id);

alter table "public"."marketing_agent_configs" add constraint "marketing_agent_configs_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table "public"."marketing_campaigns" add constraint "marketing_campaigns_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table "public"."marketing_campaigns" add constraint "marketing_campaigns_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."marketing_campaigns" add constraint "marketing_campaigns_pkey" PRIMARY KEY (id);

alter table "public"."marketing_campaigns" add constraint "marketing_campaigns_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'approved'::text, 'scheduled'::text, 'published'::text, 'archived'::text]));

alter table "public"."memberships" add constraint "memberships_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."memberships" add constraint "memberships_organization_id_user_id_key" UNIQUE (organization_id, user_id);

alter table "public"."memberships" add constraint "memberships_pkey" PRIMARY KEY (id);

alter table "public"."memberships" add constraint "memberships_role_check" CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'agent'::text, 'viewer'::text]));

alter table "public"."memberships" add constraint "memberships_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table "public"."messages" add constraint "messages_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

alter table "public"."messages" add constraint "messages_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."messages" add constraint "messages_pkey" PRIMARY KEY (id);

alter table "public"."messages" add constraint "messages_role_check" CHECK (role = ANY (ARRAY['customer'::text, 'assistant'::text, 'system'::text, 'human'::text]));

alter table "public"."organizations" add constraint "organizations_name_check" CHECK (char_length(name) >= 1 AND char_length(name) <= 120);

alter table "public"."organizations" add constraint "organizations_pkey" PRIMARY KEY (id);

alter table "public"."organizations" add constraint "organizations_plan_check" CHECK (plan = ANY (ARRAY['trial'::text, 'starter'::text, 'pro'::text, 'business'::text]));

alter table "public"."organizations" add constraint "organizations_status_check" CHECK (status = ANY (ARRAY['onboarding'::text, 'active'::text, 'suspended'::text]));

alter table "public"."platform_admins" add constraint "platform_admins_pkey" PRIMARY KEY (user_id);

alter table "public"."platform_admins" add constraint "platform_admins_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table "public"."reception_ai_plan_catalog" add constraint "reception_ai_plan_catalog_daily_ai_limit_check" CHECK (daily_ai_limit > 0);

alter table "public"."reception_ai_plan_catalog" add constraint "reception_ai_plan_catalog_features_array" CHECK (jsonb_typeof(features) = 'array'::text);

alter table "public"."reception_ai_plan_catalog" add constraint "reception_ai_plan_catalog_monthly_cents_check" CHECK (monthly_cents >= 0);

alter table "public"."reception_ai_plan_catalog" add constraint "reception_ai_plan_catalog_pkey" PRIMARY KEY (plan);

alter table "public"."reception_ai_plan_catalog" add constraint "reception_ai_plan_catalog_plan_check" CHECK (plan = ANY (ARRAY['starter'::text, 'pro'::text, 'business'::text]));

alter table "public"."reception_ai_plan_catalog" add constraint "reception_ai_plan_catalog_setup_cents_check" CHECK (setup_cents >= 0);

alter table "public"."sales_agent_configs" add constraint "sales_agent_configs_follow_up_due_hours_check" CHECK (follow_up_due_hours >= 1 AND follow_up_due_hours <= 720);

alter table "public"."sales_agent_configs" add constraint "sales_agent_configs_min_score_check" CHECK (min_score >= 0 AND min_score <= 100);

alter table "public"."sales_agent_configs" add constraint "sales_agent_configs_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."sales_agent_configs" add constraint "sales_agent_configs_pkey" PRIMARY KEY (organization_id);

alter table "public"."sales_agent_configs" add constraint "sales_agent_configs_preferred_channel_check" CHECK (preferred_channel = ANY (ARRAY['auto'::text, 'email'::text, 'whatsapp'::text, 'phone'::text, 'crm'::text]));

alter table "public"."sales_agent_configs" add constraint "sales_agent_configs_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table "public"."sales_onboarding_invites" add constraint "sales_onboarding_invites_claimed_organization_id_fkey" FOREIGN KEY (claimed_organization_id) REFERENCES organizations(id) ON DELETE SET NULL;

alter table "public"."sales_onboarding_invites" add constraint "sales_onboarding_invites_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

alter table "public"."sales_onboarding_invites" add constraint "sales_onboarding_invites_pkey" PRIMARY KEY (id);

alter table "public"."sales_onboarding_invites" add constraint "sales_onboarding_invites_requested_plan_check" CHECK (requested_plan = ANY (ARRAY['pilot'::text, 'starter'::text, 'pro'::text, 'business'::text]));

alter table "public"."sales_onboarding_invites" add constraint "sales_onboarding_invites_sales_organization_id_fkey" FOREIGN KEY (sales_organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."sales_onboarding_invites" add constraint "sales_onboarding_invites_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'claimed'::text, 'converted'::text, 'expired'::text, 'cancelled'::text]));

alter table "public"."sales_onboarding_invites" add constraint "sales_onboarding_invites_token_key" UNIQUE (token);

alter table "public"."sales_opportunities" add constraint "sales_opportunities_confidence_check" CHECK (confidence >= 0 AND confidence <= 100);

alter table "public"."sales_opportunities" add constraint "sales_opportunities_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

alter table "public"."sales_opportunities" add constraint "sales_opportunities_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."sales_opportunities" add constraint "sales_opportunities_pkey" PRIMARY KEY (organization_id, lead_id);

alter table "public"."sales_opportunities" add constraint "sales_opportunities_temperature_check" CHECK (temperature = ANY (ARRAY['cold'::text, 'warm'::text, 'hot'::text]));

alter table "public"."sales_sequence_steps" add constraint "sales_sequence_steps_channel_check" CHECK (channel = ANY (ARRAY['email'::text, 'whatsapp'::text]));

alter table "public"."sales_sequence_steps" add constraint "sales_sequence_steps_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

alter table "public"."sales_sequence_steps" add constraint "sales_sequence_steps_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."sales_sequence_steps" add constraint "sales_sequence_steps_pkey" PRIMARY KEY (id);

alter table "public"."sales_sequence_steps" add constraint "sales_sequence_steps_sequence_id_fkey" FOREIGN KEY (sequence_id) REFERENCES sales_sequences(id) ON DELETE CASCADE;

alter table "public"."sales_sequence_steps" add constraint "sales_sequence_steps_sequence_id_step_no_key" UNIQUE (sequence_id, step_no);

alter table "public"."sales_sequence_steps" add constraint "sales_sequence_steps_status_check" CHECK (status = ANY (ARRAY['planned'::text, 'approved'::text, 'queued'::text, 'completed'::text, 'skipped'::text, 'cancelled'::text]));

alter table "public"."sales_sequence_steps" add constraint "sales_sequence_steps_step_no_check" CHECK (step_no >= 1 AND step_no <= 20);

alter table "public"."sales_sequence_steps" add constraint "sales_sequence_steps_workflow_action_id_fkey" FOREIGN KEY (workflow_action_id) REFERENCES workflow_actions(id) ON DELETE SET NULL;

alter table "public"."sales_sequences" add constraint "sales_sequences_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table "public"."sales_sequences" add constraint "sales_sequences_current_step_check" CHECK (current_step >= 1 AND current_step <= 20);

alter table "public"."sales_sequences" add constraint "sales_sequences_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

alter table "public"."sales_sequences" add constraint "sales_sequences_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."sales_sequences" add constraint "sales_sequences_pkey" PRIMARY KEY (id);

alter table "public"."sales_sequences" add constraint "sales_sequences_status_check" CHECK (status = ANY (ARRAY['active'::text, 'paused'::text, 'completed'::text, 'cancelled'::text]));

alter table "public"."stripe_events" add constraint "stripe_events_pkey" PRIMARY KEY (id);

alter table "public"."stripe_events" add constraint "stripe_events_status_check" CHECK (status = ANY (ARRAY['processing'::text, 'processed'::text, 'failed'::text]));

alter table "public"."tasks" add constraint "tasks_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL;

alter table "public"."tasks" add constraint "tasks_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."tasks" add constraint "tasks_pkey" PRIMARY KEY (id);

alter table "public"."tasks" add constraint "tasks_priority_check" CHECK (priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text]));

alter table "public"."tasks" add constraint "tasks_status_check" CHECK (status = ANY (ARRAY['open'::text, 'done'::text, 'cancelled'::text]));

alter table "public"."team_invitations" add constraint "team_invitations_accepted_by_fkey" FOREIGN KEY (accepted_by) REFERENCES auth.users(id);

alter table "public"."team_invitations" add constraint "team_invitations_email_nonempty" CHECK (length(TRIM(BOTH FROM email)) >= 3 AND length(TRIM(BOTH FROM email)) <= 320);

alter table "public"."team_invitations" add constraint "team_invitations_invited_by_fkey" FOREIGN KEY (invited_by) REFERENCES auth.users(id);

alter table "public"."team_invitations" add constraint "team_invitations_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."team_invitations" add constraint "team_invitations_pkey" PRIMARY KEY (id);

alter table "public"."team_invitations" add constraint "team_invitations_role_check" CHECK (role = ANY (ARRAY['admin'::text, 'agent'::text, 'viewer'::text]));

alter table "public"."team_invitations" add constraint "team_invitations_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'revoked'::text, 'expired'::text]));

alter table "public"."team_invitations" add constraint "team_invitations_token_hash_key" UNIQUE (token_hash);

alter table "public"."tenant_activation_events" add constraint "tenant_activation_events_event_type_check" CHECK (event_type = ANY (ARRAY['first_public_conversation'::text, 'first_lead'::text, 'first_qualified_lead'::text, 'first_handoff'::text, 'first_appointment_request'::text, 'first_confirmed_appointment'::text, 'first_completed_appointment'::text, 'first_customer_payment'::text]));

alter table "public"."tenant_activation_events" add constraint "tenant_activation_events_organization_id_event_type_key" UNIQUE (organization_id, event_type);

alter table "public"."tenant_activation_events" add constraint "tenant_activation_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."tenant_activation_events" add constraint "tenant_activation_events_pkey" PRIMARY KEY (id);

alter table "public"."tenant_integrations" add constraint "tenant_integrations_channel_check" CHECK (channel = ANY (ARRAY['email'::text, 'whatsapp'::text, 'calendar'::text, 'payment'::text, 'webhook'::text]));

alter table "public"."tenant_integrations" add constraint "tenant_integrations_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."tenant_integrations" add constraint "tenant_integrations_pkey" PRIMARY KEY (id);

alter table "public"."tenant_integrations" add constraint "tenant_integrations_status_check" CHECK (status = ANY (ARRAY['needs_setup'::text, 'active'::text, 'degraded'::text, 'disabled'::text, 'error'::text]));

alter table "public"."user_org_context" add constraint "user_org_context_membership_fk" FOREIGN KEY (organization_id, user_id) REFERENCES memberships(organization_id, user_id) ON DELETE CASCADE;

alter table "public"."user_org_context" add constraint "user_org_context_pkey" PRIMARY KEY (user_id);

alter table "public"."user_org_context" add constraint "user_org_context_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table "public"."widget_rate_limits" add constraint "widget_rate_limits_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."widget_rate_limits" add constraint "widget_rate_limits_pkey" PRIMARY KEY (id);

alter table "public"."workflow_action_attempts" add constraint "workflow_action_attempts_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."workflow_action_attempts" add constraint "workflow_action_attempts_outcome_check" CHECK (outcome = ANY (ARRAY['completed'::text, 'retry'::text, 'blocked'::text, 'failed'::text]));

alter table "public"."workflow_action_attempts" add constraint "workflow_action_attempts_pkey" PRIMARY KEY (id);

alter table "public"."workflow_action_attempts" add constraint "workflow_action_attempts_workflow_action_id_fkey" FOREIGN KEY (workflow_action_id) REFERENCES workflow_actions(id) ON DELETE CASCADE;

alter table "public"."workflow_actions" add constraint "workflow_actions_idempotency_key_key" UNIQUE (idempotency_key);

alter table "public"."workflow_actions" add constraint "workflow_actions_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

alter table "public"."workflow_actions" add constraint "workflow_actions_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

alter table "public"."workflow_actions" add constraint "workflow_actions_pkey" PRIMARY KEY (id);

-- Non-constraint indexes.

CREATE INDEX billing_checkout_refs_expiry_idx ON private.billing_checkout_refs USING btree (expires_at);

CREATE INDEX billing_checkout_refs_org_idx ON private.billing_checkout_refs USING btree (organization_id, created_at DESC);

CREATE INDEX integration_credentials_org_idx ON private.integration_credentials USING btree (organization_id);

CREATE INDEX oauth_states_expires_idx ON private.oauth_states USING btree (expires_at);

CREATE INDEX oauth_states_integration_idx ON private.oauth_states USING btree (integration_id);

CREATE INDEX oauth_states_org_idx ON private.oauth_states USING btree (organization_id);

CREATE INDEX ai_usage_daily_usage_date_idx ON public.ai_usage_daily USING btree (usage_date);

CREATE INDEX appointments_lead_fk_idx ON public.appointments USING btree (lead_id);

CREATE INDEX appointments_org_status_idx ON public.appointments USING btree (organization_id, status, start_at);

CREATE UNIQUE INDEX appointments_provider_booking_uidx ON public.appointments USING btree (provider, provider_booking_id) WHERE (provider_booking_id IS NOT NULL);

CREATE INDEX audit_events_actor_user_idx ON public.audit_events USING btree (actor_user_id);

CREATE INDEX audit_org_created_idx ON public.audit_events USING btree (organization_id, created_at DESC);

CREATE UNIQUE INDEX business_profiles_widget_token_idx ON public.business_profiles USING btree (widget_token);

CREATE INDEX commercial_learning_org_created_idx ON public.commercial_learning_snapshots USING btree (organization_id, created_at DESC);

CREATE INDEX conversations_lead_fk_idx ON public.conversations USING btree (lead_id);

CREATE INDEX conversations_lead_idx ON public.conversations USING btree (organization_id, lead_id, created_at DESC);

CREATE INDEX conversations_org_created_idx ON public.conversations USING btree (organization_id, created_at DESC);

CREATE INDEX creator_hub_assets_created_by_idx ON public.creator_hub_assets USING btree (created_by, created_at DESC);

CREATE INDEX creator_hub_assets_org_idx ON public.creator_hub_assets USING btree (organization_id, created_at DESC);

CREATE INDEX customer_payments_appointment_fk_idx ON public.customer_payments USING btree (appointment_id);

CREATE INDEX customer_payments_lead_fk_idx ON public.customer_payments USING btree (lead_id);

CREATE INDEX customer_payments_org_status_idx ON public.customer_payments USING btree (organization_id, status, created_at DESC);

CREATE UNIQUE INDEX customer_payments_provider_uidx ON public.customer_payments USING btree (provider, provider_payment_id) WHERE (provider_payment_id IS NOT NULL);

CREATE INDEX google_calendar_dispatch_pending_idx ON public.google_calendar_dispatch_queue USING btree (status, scheduled_at) WHERE (status = 'pending'::text);

CREATE INDEX google_calendar_dispatch_queue_appointment_idx ON public.google_calendar_dispatch_queue USING btree (appointment_id);

CREATE INDEX google_calendar_dispatch_queue_organization_idx ON public.google_calendar_dispatch_queue USING btree (organization_id);

CREATE INDEX handoffs_conversation_fk_idx ON public.handoffs USING btree (conversation_id);

CREATE INDEX handoffs_lead_fk_idx ON public.handoffs USING btree (lead_id);

CREATE INDEX handoffs_org_fk_idx ON public.handoffs USING btree (organization_id);

CREATE INDEX izap_dispatch_queue_lead_idx ON public.izap_dispatch_queue USING btree (lead_id);

CREATE INDEX izap_dispatch_queue_organization_idx ON public.izap_dispatch_queue USING btree (organization_id);

CREATE INDEX izap_dispatch_queue_pending_idx ON public.izap_dispatch_queue USING btree (status, scheduled_at) WHERE (status = 'pending'::text);

CREATE INDEX jarvis_agent_events_task_idx ON public.jarvis_agent_events USING btree (task_id, logged_at DESC);

CREATE INDEX jarvis_agent_tasks_due_idx ON public.jarvis_agent_tasks USING btree (status, scheduled_at) WHERE ((status = 'queued'::text) AND (kind = 'reminder'::text));

CREATE INDEX jarvis_agent_tasks_owner_idx ON public.jarvis_agent_tasks USING btree (owner_user_id, created_at DESC);

CREATE INDEX lead_agent_configs_active_idx ON public.lead_agent_configs USING btree (active, organization_id);

CREATE INDEX lead_agent_configs_updated_by_idx ON public.lead_agent_configs USING btree (updated_by);

CREATE INDEX leadflow_leads_owner_due_idx ON public.leadflow_leads USING btree (owner_id, due);

CREATE INDEX leads_lost_reason_idx ON public.leads USING btree (organization_id, lost_reason_code, lost_at) WHERE (status = 'lost'::text);

CREATE INDEX leads_marketing_campaign_id_fk_idx ON public.leads USING btree (marketing_campaign_id);

CREATE INDEX leads_marketing_campaign_idx ON public.leads USING btree (organization_id, marketing_campaign_id) WHERE (marketing_campaign_id IS NOT NULL);

CREATE INDEX leads_org_created_idx ON public.leads USING btree (organization_id, created_at DESC);

CREATE INDEX leads_outcome_reason_idx ON public.leads USING btree (organization_id, status, outcome_reason) WHERE (outcome_reason IS NOT NULL);

CREATE INDEX leads_pipeline_idx ON public.leads USING btree (organization_id, status, updated_at DESC);

CREATE INDEX marketing_agent_configs_active_idx ON public.marketing_agent_configs USING btree (active, organization_id);

CREATE INDEX marketing_agent_configs_updated_by_idx ON public.marketing_agent_configs USING btree (updated_by);

CREATE INDEX marketing_campaigns_created_by_idx ON public.marketing_campaigns USING btree (created_by);

CREATE INDEX marketing_campaigns_org_created_idx ON public.marketing_campaigns USING btree (organization_id, created_at DESC);

CREATE INDEX marketing_campaigns_org_status_idx ON public.marketing_campaigns USING btree (organization_id, status, updated_at DESC);

CREATE INDEX marketing_campaigns_schedule_idx ON public.marketing_campaigns USING btree (organization_id, status, scheduled_for);

CREATE UNIQUE INDEX marketing_campaigns_tracking_code_uidx ON public.marketing_campaigns USING btree (tracking_code);

CREATE INDEX memberships_user_fk_idx ON public.memberships USING btree (user_id);

CREATE INDEX messages_conversation_idx ON public.messages USING btree (conversation_id, created_at);

CREATE INDEX messages_org_fk_idx ON public.messages USING btree (organization_id);

CREATE INDEX sales_agent_configs_active_idx ON public.sales_agent_configs USING btree (active, organization_id);

CREATE INDEX sales_agent_configs_updated_by_idx ON public.sales_agent_configs USING btree (updated_by);

CREATE INDEX sales_onboarding_invites_claimed_org_idx ON public.sales_onboarding_invites USING btree (claimed_organization_id) WHERE (claimed_organization_id IS NOT NULL);

CREATE INDEX sales_onboarding_invites_lead_id_fk_idx ON public.sales_onboarding_invites USING btree (lead_id);

CREATE INDEX sales_onboarding_invites_lead_idx ON public.sales_onboarding_invites USING btree (sales_organization_id, lead_id, created_at DESC);

CREATE INDEX sales_opportunities_lead_id_idx ON public.sales_opportunities USING btree (lead_id);

CREATE INDEX sales_opportunities_priority_idx ON public.sales_opportunities USING btree (organization_id, temperature, confidence DESC, updated_at DESC);

CREATE INDEX sales_sequence_steps_due_idx ON public.sales_sequence_steps USING btree (organization_id, status, due_at);

CREATE INDEX sales_sequence_steps_lead_id_fk_idx ON public.sales_sequence_steps USING btree (lead_id);

CREATE INDEX sales_sequence_steps_workflow_action_id_fk_idx ON public.sales_sequence_steps USING btree (workflow_action_id);

CREATE INDEX sales_sequences_created_by_fk_idx ON public.sales_sequences USING btree (created_by);

CREATE INDEX sales_sequences_lead_id_fk_idx ON public.sales_sequences USING btree (lead_id);

CREATE INDEX sales_sequences_org_status_idx ON public.sales_sequences USING btree (organization_id, status, updated_at DESC);

CREATE INDEX stripe_events_processed_idx ON public.stripe_events USING btree (processed_at DESC);

CREATE INDEX tasks_lead_fk_idx ON public.tasks USING btree (lead_id);

CREATE INDEX tasks_org_status_idx ON public.tasks USING btree (organization_id, status);

CREATE INDEX team_invitations_email_idx ON public.team_invitations USING btree (lower(email), status);

CREATE UNIQUE INDEX team_invitations_one_pending_per_email_org ON public.team_invitations USING btree (organization_id, lower(email)) WHERE (status = 'pending'::text);

CREATE INDEX team_invitations_org_status_idx ON public.team_invitations USING btree (organization_id, status, created_at DESC);

CREATE INDEX tenant_activation_events_org_time_idx ON public.tenant_activation_events USING btree (organization_id, happened_at);

CREATE UNIQUE INDEX tenant_integrations_default_channel_uidx ON public.tenant_integrations USING btree (organization_id, channel) WHERE (is_default = true);

CREATE INDEX tenant_integrations_org_channel_idx ON public.tenant_integrations USING btree (organization_id, channel, status);

CREATE INDEX widget_rate_limits_lookup_idx ON public.widget_rate_limits USING btree (organization_id, client_hash, created_at DESC);

CREATE INDEX workflow_action_attempts_action_idx ON public.workflow_action_attempts USING btree (workflow_action_id, attempt_no DESC);

CREATE INDEX workflow_action_attempts_org_idx ON public.workflow_action_attempts USING btree (organization_id, created_at DESC);

CREATE INDEX workflow_actions_due_idx ON public.workflow_actions USING btree (status, scheduled_at) WHERE (status = 'pending'::text);

CREATE INDEX workflow_actions_lead_idx ON public.workflow_actions USING btree (lead_id, created_at DESC);

CREATE INDEX workflow_actions_org_status_idx ON public.workflow_actions USING btree (organization_id, status, scheduled_at);

-- Restore row-level security before granting application access.

alter table "private"."billing_checkout_refs" enable row level security;

alter table "private"."integration_credentials" enable row level security;

alter table "private"."oauth_states" enable row level security;

alter table "public"."ai_usage_daily" enable row level security;

alter table "public"."appointments" enable row level security;

alter table "public"."audit_events" enable row level security;

alter table "public"."business_profiles" enable row level security;

alter table "public"."commercial_learning_snapshots" enable row level security;

alter table "public"."conversations" enable row level security;

alter table "public"."creator_hub_assets" enable row level security;

alter table "public"."customer_payments" enable row level security;

alter table "public"."google_calendar_dispatch_queue" enable row level security;

alter table "public"."handoffs" enable row level security;

alter table "public"."izap_dispatch_queue" enable row level security;

alter table "public"."jarvis_agent_events" enable row level security;

alter table "public"."jarvis_agent_tasks" enable row level security;

alter table "public"."lead_agent_configs" enable row level security;

alter table "public"."leadflow_leads" enable row level security;

alter table "public"."leads" enable row level security;

alter table "public"."marketing_agent_configs" enable row level security;

alter table "public"."marketing_campaigns" enable row level security;

alter table "public"."memberships" enable row level security;

alter table "public"."messages" enable row level security;

alter table "public"."organizations" enable row level security;

alter table "public"."platform_admins" enable row level security;

alter table "public"."reception_ai_plan_catalog" enable row level security;

alter table "public"."sales_agent_configs" enable row level security;

alter table "public"."sales_onboarding_invites" enable row level security;

alter table "public"."sales_opportunities" enable row level security;

alter table "public"."sales_sequence_steps" enable row level security;

alter table "public"."sales_sequences" enable row level security;

alter table "public"."stripe_events" enable row level security;

alter table "public"."tasks" enable row level security;

alter table "public"."team_invitations" enable row level security;

alter table "public"."tenant_activation_events" enable row level security;

alter table "public"."tenant_integrations" enable row level security;

alter table "public"."user_org_context" enable row level security;

alter table "public"."widget_rate_limits" enable row level security;

alter table "public"."workflow_action_attempts" enable row level security;

alter table "public"."workflow_actions" enable row level security;

create policy "ai_usage_daily_no_direct_access" on "public"."ai_usage_daily" as PERMISSIVE for ALL to "authenticated", "anon" using (false) with check (false);

create policy "appointments_select" on "public"."appointments" as PERMISSIVE for SELECT to "authenticated" using (is_org_member(organization_id));

create policy "audit_select" on "public"."audit_events" as PERMISSIVE for SELECT to "authenticated" using (is_org_member(organization_id));

create policy "profile_select" on "public"."business_profiles" as PERMISSIVE for SELECT to "authenticated" using (is_org_member(organization_id));

create policy "profile_update" on "public"."business_profiles" as PERMISSIVE for UPDATE to "authenticated" using (is_org_admin(organization_id)) with check (is_org_admin(organization_id));

create policy "commercial_learning_no_direct_access" on "public"."commercial_learning_snapshots" as PERMISSIVE for ALL to "authenticated", "anon" using (false) with check (false);

create policy "conv_select" on "public"."conversations" as PERMISSIVE for SELECT to "authenticated" using (is_org_member(organization_id));

create policy "creator_hub_assets_no_direct_access" on "public"."creator_hub_assets" as PERMISSIVE for ALL to "authenticated", "anon" using (false) with check (false);

create policy "customer_payments_select" on "public"."customer_payments" as PERMISSIVE for SELECT to "authenticated" using (is_org_member(organization_id));

create policy "server_only_deny_users" on "public"."google_calendar_dispatch_queue" as PERMISSIVE for ALL to "authenticated", "anon" using (false) with check (false);

create policy "handoffs_select" on "public"."handoffs" as PERMISSIVE for SELECT to "authenticated" using (is_org_member(organization_id));

create policy "handoffs_update" on "public"."handoffs" as PERMISSIVE for UPDATE to "authenticated" using (is_org_operator(organization_id)) with check (is_org_operator(organization_id));

create policy "server_only_deny_users" on "public"."izap_dispatch_queue" as PERMISSIVE for ALL to "authenticated", "anon" using (false) with check (false);

create policy "jarvis_agent_events_read" on "public"."jarvis_agent_events" as PERMISSIVE for SELECT to "authenticated" using (((owner_user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM memberships m
  WHERE ((m.organization_id = jarvis_agent_events.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND m.active AND (m.role = ANY (ARRAY['owner'::text, 'admin'::text])))))));

create policy "jarvis_agent_tasks_owner_insert" on "public"."jarvis_agent_tasks" as PERMISSIVE for INSERT to "authenticated" with check (((owner_user_id = ( SELECT auth.uid() AS uid)) AND (status = 'pending_approval'::text) AND (approved_at IS NULL) AND (result_text IS NULL) AND (EXISTS ( SELECT 1
   FROM memberships m
  WHERE ((m.organization_id = jarvis_agent_tasks.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND m.active AND (m.role = ANY (ARRAY['owner'::text, 'admin'::text])))))));

create policy "jarvis_agent_tasks_owner_select" on "public"."jarvis_agent_tasks" as PERMISSIVE for SELECT to "authenticated" using (((owner_user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM memberships m
  WHERE ((m.organization_id = jarvis_agent_tasks.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND m.active AND (m.role = ANY (ARRAY['owner'::text, 'admin'::text])))))));

create policy "jarvis_agent_tasks_owner_update" on "public"."jarvis_agent_tasks" as PERMISSIVE for UPDATE to "authenticated" using (((owner_user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM memberships m
  WHERE ((m.organization_id = jarvis_agent_tasks.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND m.active AND (m.role = ANY (ARRAY['owner'::text, 'admin'::text]))))))) with check (((owner_user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM memberships m
  WHERE ((m.organization_id = jarvis_agent_tasks.organization_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND m.active AND (m.role = ANY (ARRAY['owner'::text, 'admin'::text])))))));

create policy "lead_agent_configs_no_direct_access" on "public"."lead_agent_configs" as PERMISSIVE for ALL to "authenticated", "anon" using (false) with check (false);

create policy "leadflow_leads_delete_own" on "public"."leadflow_leads" as PERMISSIVE for DELETE to "authenticated" using ((( SELECT auth.uid() AS uid) = owner_id));

create policy "leadflow_leads_insert_own" on "public"."leadflow_leads" as PERMISSIVE for INSERT to "authenticated" with check ((( SELECT auth.uid() AS uid) = owner_id));

create policy "leadflow_leads_read_own" on "public"."leadflow_leads" as PERMISSIVE for SELECT to "authenticated" using ((( SELECT auth.uid() AS uid) = owner_id));

create policy "leadflow_leads_update_own" on "public"."leadflow_leads" as PERMISSIVE for UPDATE to "authenticated" using ((( SELECT auth.uid() AS uid) = owner_id)) with check ((( SELECT auth.uid() AS uid) = owner_id));

create policy "leads_select" on "public"."leads" as PERMISSIVE for SELECT to "authenticated" using (is_org_member(organization_id));

create policy "leads_update" on "public"."leads" as PERMISSIVE for UPDATE to "authenticated" using (is_org_operator(organization_id)) with check (is_org_operator(organization_id));

create policy "marketing_agent_configs_no_direct_access" on "public"."marketing_agent_configs" as PERMISSIVE for ALL to "authenticated", "anon" using (false) with check (false);

create policy "marketing_campaigns_no_direct_access" on "public"."marketing_campaigns" as PERMISSIVE for ALL to "authenticated", "anon" using (false) with check (false);

create policy "membership_select" on "public"."memberships" as PERMISSIVE for SELECT to "authenticated" using ((user_id = ( SELECT auth.uid() AS uid)));

create policy "messages_select" on "public"."messages" as PERMISSIVE for SELECT to "authenticated" using (is_org_member(organization_id));

create policy "org_select" on "public"."organizations" as PERMISSIVE for SELECT to "authenticated" using (is_org_member(id));

create policy "platform_admin_self_select" on "public"."platform_admins" as PERMISSIVE for SELECT to "authenticated" using ((user_id = ( SELECT auth.uid() AS uid)));

create policy "reception_ai_plan_catalog_no_direct_access" on "public"."reception_ai_plan_catalog" as PERMISSIVE for ALL to "authenticated", "anon" using (false) with check (false);

create policy "sales_agent_configs_no_direct_access" on "public"."sales_agent_configs" as PERMISSIVE for ALL to "authenticated", "anon" using (false) with check (false);

create policy "sales_onboarding_invites_no_direct_access" on "public"."sales_onboarding_invites" as PERMISSIVE for ALL to "authenticated", "anon" using (false) with check (false);

create policy "sales_opportunities_no_direct_access" on "public"."sales_opportunities" as PERMISSIVE for ALL to "authenticated", "anon" using (false) with check (false);

create policy "sales_sequence_steps_no_direct_access" on "public"."sales_sequence_steps" as PERMISSIVE for ALL to "authenticated", "anon" using (false) with check (false);

create policy "sales_sequences_no_direct_access" on "public"."sales_sequences" as PERMISSIVE for ALL to "authenticated", "anon" using (false) with check (false);

create policy "stripe_events_no_client_access" on "public"."stripe_events" as PERMISSIVE for ALL to "authenticated", "anon" using (false) with check (false);

create policy "tasks_select" on "public"."tasks" as PERMISSIVE for SELECT to "authenticated" using (is_org_member(organization_id));

create policy "tasks_update" on "public"."tasks" as PERMISSIVE for UPDATE to "authenticated" using (is_org_operator(organization_id)) with check (is_org_operator(organization_id));

create policy "tenant_activation_events_no_direct_access" on "public"."tenant_activation_events" as PERMISSIVE for ALL to "authenticated", "anon" using (false) with check (false);

create policy "tenant_integrations_select" on "public"."tenant_integrations" as PERMISSIVE for SELECT to "authenticated" using (is_org_member(organization_id));

create policy "widget_rate_limits_no_client_access" on "public"."widget_rate_limits" as PERMISSIVE for ALL to "authenticated", "anon" using (false) with check (false);

create policy "workflow_attempts_select" on "public"."workflow_action_attempts" as PERMISSIVE for SELECT to "authenticated" using (is_org_member(organization_id));

create policy "workflow_actions_select" on "public"."workflow_actions" as PERMISSIVE for SELECT to "authenticated" using (is_org_member(organization_id));

-- Restore functions; defer body checks because functions reference other functions created in this snapshot.

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
  v_name text;
  v_onboarding_token uuid;
  v_invite record;
  v_now timestamptz := now();
begin

  -- Omega routing requires a private, email-bound, one-use server ticket.
  if promo_omega_private.route_signup(new.id,new.email,new.raw_user_meta_data) then
    return new;
  end if;
  v_name := left(coalesce(nullif(trim(new.raw_user_meta_data->>'business_name'),''),'Mijn bedrijf'),120);

  begin
    v_onboarding_token := nullif(trim(new.raw_user_meta_data->>'onboarding_token'),'')::uuid;
  exception when others then
    v_onboarding_token := null;
  end;

  -- Initialise the record even for ordinary signups without an invitation.
  select i.*,l.email,l.phone,l.name,l.qualification into v_invite
  from public.sales_onboarding_invites i
  join public.leads l on l.id=i.lead_id and l.organization_id=i.sales_organization_id
  where false;

  if v_onboarding_token is not null then
    select i.*,l.email,l.phone,l.name,l.qualification
    into v_invite
    from public.sales_onboarding_invites i
    join public.leads l on l.id=i.lead_id and l.organization_id=i.sales_organization_id
    where i.token=v_onboarding_token
      and new.email_confirmed_at is not null
      and nullif(lower(trim(l.email)),'')=lower(trim(new.email))
      and i.status='pending'
      and i.expires_at>v_now
    for update;

    if found and coalesce(v_invite.qualification->>'company','')<>'' then
      v_name := left(v_invite.qualification->>'company',120);
    end if;
  end if;

  insert into public.organizations(name,status)
  values(v_name,'onboarding')
  returning id into v_org;

  insert into public.memberships(organization_id,user_id,role,active)
  values(v_org,new.id,'owner',true);

  insert into public.business_profiles(
    organization_id,business_name,qualification_questions,notification_email
  )
  values(
    v_org,
    v_name,
    '["Waarmee kunnen we u precies helpen?","Wanneer wilt u dit laten uitvoeren?","Hoe mogen we u het best bereiken?"]'::jsonb,
    nullif(lower(trim(new.email)),'')
  );

  insert into public.audit_events(
    organization_id,actor_user_id,event_type,entity_type,entity_id,payload
  )
  values(
    v_org,new.id,'organization.created','organization',v_org,
    jsonb_build_object(
      'source',case when v_onboarding_token is not null and v_invite.id is not null then 'reception_ai_sales_onboarding' else 'auth_signup' end
    )
  );

  if v_onboarding_token is not null and v_invite.id is not null then
    update public.sales_onboarding_invites
    set status='claimed',
        claimed_organization_id=v_org,
        claimed_at=v_now,
        updated_at=v_now
    where id=v_invite.id;

    update public.leads
    set status='follow_up',
        score=greatest(score,95),
        qualification=coalesce(qualification,'{}'::jsonb) || jsonb_build_object(
          'funnel_stage','onboarding_started',
          'requested_plan',v_invite.requested_plan,
          'onboarding_invite_id',v_invite.id,
          'tenant_organization_id',v_org
        ),
        updated_at=v_now
    where id=v_invite.lead_id
      and organization_id=v_invite.sales_organization_id
      and status not in ('won','lost');

    insert into public.sales_opportunities(
      organization_id,lead_id,temperature,stage,confidence,next_action,reason,channel,message,objection,missing_info,can_contact,analyzed_at,updated_at
    )
    values(
      v_invite.sales_organization_id,v_invite.lead_id,'hot','onboarding',98,
      'Onboarding begeleiden en controleren of bedrijfsprofiel, widget en integraties correct worden ingesteld.',
      'De prospect heeft vanuit de Reception AI-verkoopflow zelf een bedrijfsaccount aangemaakt.',
      case when coalesce(v_invite.phone,'')<>'' then 'telefoon' else 'e-mail' end,
      '',
      '',
      '[]'::jsonb,
      true,
      v_now,v_now
    )
    on conflict (organization_id,lead_id) do update set
      temperature='hot',
      stage='onboarding',
      confidence=greatest(public.sales_opportunities.confidence,98),
      next_action=excluded.next_action,
      reason=excluded.reason,
      channel=excluded.channel,
      can_contact=true,
      analyzed_at=v_now,
      updated_at=v_now;

    if not exists(
      select 1 from public.tasks
      where organization_id=v_invite.sales_organization_id
        and lead_id=v_invite.lead_id
        and status='open'
        and title='Sales Agent: Reception AI onboarding begeleiden'
    ) then
      insert into public.tasks(organization_id,lead_id,title,status,priority,due_at)
      values(
        v_invite.sales_organization_id,
        v_invite.lead_id,
        'Sales Agent: Reception AI onboarding begeleiden',
        'open','high',v_now+interval '24 hours'
      );
    end if;

    insert into public.audit_events(
      organization_id,actor_user_id,event_type,entity_type,entity_id,payload
    )
    values(
      v_invite.sales_organization_id,null,'sales_onboarding.started','lead',v_invite.lead_id,
      jsonb_build_object(
        'invite_id',v_invite.id,
        'requested_plan',v_invite.requested_plan,
        'claimed_organization_id',v_org
      )
    );
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.reception_ai_sync_central_v2()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_key text;
  v_conversation_id uuid;
  v_appointment record;
  v_intent text;
  v_message text;
  v_payload jsonb;
begin
  select decrypted_secret
    into v_key
    from vault.decrypted_secrets
   where name = 'luxwash_reception_bridge_key_v2'
   limit 1;

  if coalesce(v_key,'') = '' then
    raise warning 'Reception AI central sync skipped: Vault key unavailable';
    return new;
  end if;

  select c.id
    into v_conversation_id
    from public.conversations c
   where c.lead_id = new.id
     and c.organization_id = new.organization_id
   order by c.created_at desc
   limit 1;

  select a.id, a.start_at, a.end_at, a.timezone, a.requested_text, a.status
    into v_appointment
    from public.appointments a
   where a.lead_id = new.id
     and a.organization_id = new.organization_id
     and a.status in ('requested','proposed','confirmed')
   order by a.created_at desc
   limit 1;

  v_intent := coalesce(new.qualification->>'intent','general');
  v_message := coalesce(nullif(new.summary,''),'Reception AI lead sync');

  v_payload := jsonb_build_object(
    'external_lead_id', new.id,
    'external_conversation_id', v_conversation_id,
    'name', case when new.name = 'Websitebezoeker' then null else new.name end,
    'email', new.email,
    'phone', new.phone,
    'message', v_message,
    'score', new.score,
    'status', new.status,
    'intent', v_intent,
    'contact_consent', new.contact_consent_at is not null,
    'external_appointment_id', v_appointment.id,
    'appointment_start_at', v_appointment.start_at,
    'appointment_end_at', v_appointment.end_at,
    'appointment_timezone', v_appointment.timezone,
    'appointment_requested_text', v_appointment.requested_text
  );

  perform net.http_post(
    url := 'https://nahwlhptgdkwhjcfkhkt.supabase.co/functions/v1/luxwash-site-api/reception-sync',
    body := v_payload,
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-reception-bridge-key',v_key
    ),
    timeout_milliseconds := 5000
  );

  return new;
exception
  when others then
    raise warning 'Reception AI central sync failed: %', sqlerrm;
    return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.refresh_onboarding_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.business_name is not null and length(trim(new.business_name)) > 0
     and new.description is not null and length(trim(new.description)) > 0
     and jsonb_typeof(coalesce(new.services,'[]'::jsonb)) = 'array'
     and jsonb_array_length(coalesce(new.services,'[]'::jsonb)) > 0
     and jsonb_typeof(coalesce(new.qualification_questions,'[]'::jsonb)) = 'array'
     and jsonb_array_length(coalesce(new.qualification_questions,'[]'::jsonb)) > 0
     and coalesce(new.widget_enabled,false) = true then
    update public.organizations
       set status = 'active',
           updated_at = now()
     where id = new.organization_id
       and status = 'onboarding';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.seed_default_integrations()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.tenant_integrations(
    organization_id,channel,provider,status,is_default,config,capabilities
  )
  values
    (new.id,'email','resend','needs_setup',true,'{}'::jsonb,
      array['notify_owner','lead_follow_up','appointment_confirmation','payment_link_send','review_request','retention_follow_up']),
    (new.id,'whatsapp','meta_whatsapp','needs_setup',true,'{}'::jsonb,
      array['lead_follow_up','appointment_confirmation','payment_link_send','review_request','retention_follow_up']),
    (new.id,'calendar','google_calendar','needs_setup',true,'{}'::jsonb,
      array['calendar_request','calendar_cancel']),
    (new.id,'payment','stripe','needs_setup',true,'{}'::jsonb,
      array['payment_request','payment_received'])
  on conflict do nothing;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.apply_billing_checkout_ref(p_token_hash text, p_plan text, p_subscription_status text, p_customer_id text, p_subscription_id text)
 RETURNS TABLE(organization_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r private.billing_checkout_refs%rowtype; o public.organizations%rowtype;
begin
 if p_plan not in ('starter','pro','business') or p_subscription_status not in ('active','trialing','past_due','incomplete')
    or coalesce(p_customer_id,'')='' or coalesce(p_subscription_id,'')='' then return; end if;
 select * into r from private.billing_checkout_refs where token_hash=p_token_hash and plan=p_plan for update;
 if not found then return; end if;
 select * into o from public.organizations where id=r.organization_id for update;
 if not found then raise exception 'Billing reference organization missing'; end if;
 if r.used_at is not null then
   if o.stripe_customer_id=p_customer_id and o.stripe_subscription_id=p_subscription_id then
     return query select r.organization_id;
   end if;
   return;
 end if;
 if r.expires_at<=now() then return; end if;
 update public.organizations set plan=p_plan,subscription_status=p_subscription_status,
   stripe_customer_id=p_customer_id,stripe_subscription_id=p_subscription_id,updated_at=now()
 where id=r.organization_id;
 update private.billing_checkout_refs set used_at=now() where token_hash=p_token_hash;
 return query select r.organization_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.capture_appointment_activation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_source text;
begin
  select l.source into v_source
  from public.leads l
  where l.id=new.lead_id and l.organization_id=new.organization_id;

  if v_source is distinct from 'public_widget' then
    return new;
  end if;

  perform public.record_tenant_activation_event(
    new.organization_id,'first_appointment_request','appointment',new.id,new.created_at,
    jsonb_build_object('status',new.status,'lead_source',v_source)
  );

  if new.status in ('confirmed','completed') then
    perform public.record_tenant_activation_event(
      new.organization_id,'first_confirmed_appointment','appointment',new.id,coalesce(new.updated_at,new.created_at),
      jsonb_build_object('status',new.status,'lead_source',v_source)
    );
  end if;

  if new.status='completed' then
    perform public.record_tenant_activation_event(
      new.organization_id,'first_completed_appointment','appointment',new.id,coalesce(new.completed_at,new.updated_at,new.created_at),
      jsonb_build_object('status',new.status,'lead_source',v_source)
    );
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.capture_conversation_activation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_source text;
begin
  select l.source into v_source
  from public.leads l
  where l.id=new.lead_id and l.organization_id=new.organization_id;

  if v_source='public_widget' and coalesce(new.channel,'') in ('web_chat','widget','web') then
    perform public.record_tenant_activation_event(
      new.organization_id,'first_public_conversation','conversation',new.id,new.created_at,
      jsonb_build_object('channel',new.channel,'lead_source',v_source)
    );
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.capture_handoff_activation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_source text;
begin
  select l.source into v_source
  from public.leads l
  where l.id=new.lead_id and l.organization_id=new.organization_id;

  if v_source='public_widget' then
    perform public.record_tenant_activation_event(
      new.organization_id,'first_handoff','handoff',new.id,new.created_at,
      jsonb_build_object('reason',left(coalesce(new.reason,''),200),'lead_source',v_source)
    );
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.capture_lead_activation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.source is distinct from 'public_widget' then
    return new;
  end if;

  perform public.record_tenant_activation_event(
    new.organization_id,'first_lead','lead',new.id,new.created_at,
    jsonb_build_object('source',new.source,'score',new.score)
  );

  if coalesce(new.score,0)>=60 or new.status in ('qualified','follow_up','handoff','won') then
    perform public.record_tenant_activation_event(
      new.organization_id,'first_qualified_lead','lead',new.id,coalesce(new.updated_at,new.created_at),
      jsonb_build_object('source',new.source,'score',new.score,'status',new.status)
    );
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.capture_payment_activation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_source text;
begin
  select l.source into v_source
  from public.leads l
  where l.id=new.lead_id and l.organization_id=new.organization_id;

  if new.status='paid' and v_source='public_widget' then
    perform public.record_tenant_activation_event(
      new.organization_id,'first_customer_payment','customer_payment',new.id,coalesce(new.paid_at,new.updated_at,new.created_at),
      jsonb_build_object('amount_cents',new.amount_cents,'currency',new.currency,'lead_source',v_source)
    );
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.claim_workflow_actions(p_worker_id text, p_batch_size integer DEFAULT 10)
 RETURNS SETOF workflow_actions
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  update public.workflow_actions
  set status='pending',
      locked_at=null,
      locked_by=null,
      last_error=coalesce(last_error,'') || case when coalesce(last_error,'')='' then '' else E'\n' end || 'Recovered stale processing lock'
  where status='processing'
    and locked_at < now() - interval '10 minutes';

  return query
  with candidates as (
    select id
    from public.workflow_actions
    where status='pending'
      and scheduled_at <= now()
      and attempts < max_attempts
    order by
      case priority when 'urgent' then 0 when 'high' then 1 else 2 end,
      scheduled_at,
      created_at
    for update skip locked
    limit greatest(1,least(coalesce(p_batch_size,10),50))
  )
  update public.workflow_actions w
  set status='processing',
      locked_at=now(),
      locked_by=left(coalesce(p_worker_id,'worker'),120),
      updated_at=now()
  from candidates c
  where w.id=c.id
  returning w.*;
end;
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_widget_rate_limits()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$begin delete from public.widget_rate_limits where created_at < now()-interval '24 hours'; return new; end$function$;

CREATE OR REPLACE FUNCTION public.close_sales_followup_on_lead_outcome()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_sequence_status text;
  v_step_status text;
begin
  if new.status not in ('won','lost') or old.status is not distinct from new.status then
    return new;
  end if;

  v_sequence_status := case when new.status='won' then 'completed' else 'cancelled' end;
  v_step_status := case when new.status='won' then 'skipped' else 'cancelled' end;

  update public.sales_sequences
  set status=v_sequence_status,updated_at=now()
  where organization_id=new.organization_id
    and lead_id=new.id
    and status in ('active','paused');

  update public.sales_sequence_steps
  set status=v_step_status,updated_at=now()
  where organization_id=new.organization_id
    and lead_id=new.id
    and status in ('planned','approved');

  update public.workflow_actions
  set status='cancelled',
      last_error=case when new.status='won'
        then 'Cancelled because lead converted'
        else 'Cancelled because lead was marked lost'
      end,
      locked_at=null,
      locked_by=null,
      updated_at=now()
  where organization_id=new.organization_id
    and lead_id=new.id
    and action_type='lead_follow_up'
    and payload ? 'sales_sequence_id'
    and status in ('pending','retry','blocked');

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.compute_commercial_learning(p_organization_id uuid, p_period_days integer DEFAULT 90)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_days integer := greatest(7,least(coalesce(p_period_days,90),3650));
  v_since timestamptz := now()-(greatest(7,least(coalesce(p_period_days,90),3650))||' days')::interval;
  v_leads integer := 0;
  v_contacted integer := 0;
  v_appointments integer := 0;
  v_won integer := 0;
  v_revenue bigint := 0;
  v_sales_channels jsonb := '[]'::jsonb;
  v_campaigns jsonb := '[]'::jsonb;
  v_sources jsonb := '[]'::jsonb;
  v_best_sales jsonb := '{}'::jsonb;
  v_best_campaign jsonb := '{}'::jsonb;
begin
  select count(*) into v_leads
  from public.leads l
  where l.organization_id=p_organization_id
    and l.created_at>=v_since;

  select count(distinct w.lead_id) into v_contacted
  from public.workflow_actions w
  where w.organization_id=p_organization_id
    and w.action_type='lead_follow_up'
    and w.status='completed'
    and coalesce(w.completed_at,w.updated_at)>=v_since
    and w.lead_id is not null;

  select count(distinct a.lead_id) into v_appointments
  from public.appointments a
  where a.organization_id=p_organization_id
    and a.created_at>=v_since;

  select count(*) into v_won
  from public.leads l
  where l.organization_id=p_organization_id
    and l.status='won'
    and coalesce(l.won_at,l.updated_at)>=v_since;

  select coalesce(sum(cp.amount_cents),0)::bigint into v_revenue
  from public.customer_payments cp
  where cp.organization_id=p_organization_id
    and cp.status='paid'
    and coalesce(cp.paid_at,cp.updated_at)>=v_since;

  with outbound as (
    select w.channel,w.lead_id,min(coalesce(w.completed_at,w.updated_at)) as first_contact_at
    from public.workflow_actions w
    where w.organization_id=p_organization_id
      and w.action_type='lead_follow_up'
      and w.status='completed'
      and coalesce(w.completed_at,w.updated_at)>=v_since
      and w.lead_id is not null
    group by w.channel,w.lead_id
  ),
  paid as (
    select cp.lead_id,sum(cp.amount_cents)::bigint as revenue_cents
    from public.customer_payments cp
    where cp.organization_id=p_organization_id and cp.status='paid'
    group by cp.lead_id
  ),
  agg as (
    select o.channel,
           count(*)::int as contacted_leads,
           count(*) filter(where l.status='won')::int as won_leads,
           coalesce(sum(p.revenue_cents),0)::bigint as revenue_cents
    from outbound o
    join public.leads l on l.id=o.lead_id and l.organization_id=p_organization_id
    left join paid p on p.lead_id=o.lead_id
    group by o.channel
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'channel',channel,
    'contacted_leads',contacted_leads,
    'won_leads',won_leads,
    'win_rate',case when contacted_leads>0 then round((won_leads::numeric/contacted_leads)*100,1) else 0 end,
    'revenue_cents',revenue_cents
  ) order by revenue_cents desc,won_leads desc),'[]'::jsonb)
  into v_sales_channels
  from agg;

  with campaign_base as (
    select mc.id,mc.tracking_code,mc.channel,mc.objective,mc.status,mc.published_at,mc.created_at
    from public.marketing_campaigns mc
    where mc.organization_id=p_organization_id
      and mc.created_at>=v_since
  ),
  lead_stats as (
    select l.marketing_campaign_id,
           count(*)::int as leads,
           count(*) filter(where l.status='won')::int as won_leads
    from public.leads l
    where l.organization_id=p_organization_id
      and l.marketing_campaign_id is not null
      and l.created_at>=v_since
    group by l.marketing_campaign_id
  ),
  appointment_stats as (
    select l.marketing_campaign_id,count(distinct a.lead_id)::int as appointments
    from public.appointments a
    join public.leads l on l.id=a.lead_id and l.organization_id=p_organization_id
    where a.organization_id=p_organization_id
      and l.marketing_campaign_id is not null
      and a.created_at>=v_since
    group by l.marketing_campaign_id
  ),
  revenue_stats as (
    select l.marketing_campaign_id,coalesce(sum(cp.amount_cents),0)::bigint as revenue_cents
    from public.customer_payments cp
    join public.leads l on l.id=cp.lead_id and l.organization_id=p_organization_id
    where cp.organization_id=p_organization_id
      and cp.status='paid'
      and l.marketing_campaign_id is not null
      and coalesce(cp.paid_at,cp.updated_at)>=v_since
    group by l.marketing_campaign_id
  ),
  rows as (
    select cb.*,
           coalesce(ls.leads,0) as leads,
           coalesce(ap.appointments,0) as appointments,
           coalesce(ls.won_leads,0) as won_leads,
           coalesce(rs.revenue_cents,0) as revenue_cents
    from campaign_base cb
    left join lead_stats ls on ls.marketing_campaign_id=cb.id
    left join appointment_stats ap on ap.marketing_campaign_id=cb.id
    left join revenue_stats rs on rs.marketing_campaign_id=cb.id
    order by coalesce(rs.revenue_cents,0) desc,coalesce(ls.won_leads,0) desc,coalesce(ls.leads,0) desc,cb.created_at desc
    limit 30
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'campaign_id',id,
    'tracking_code',tracking_code,
    'channel',channel,
    'objective',objective,
    'status',status,
    'leads',leads,
    'appointments',appointments,
    'won_leads',won_leads,
    'lead_to_win_rate',case when leads>0 then round((won_leads::numeric/leads)*100,1) else 0 end,
    'revenue_cents',revenue_cents,
    'published_at',published_at
  )),'[]'::jsonb)
  into v_campaigns
  from rows;

  with src as (
    select l.source,
           count(*)::int as leads,
           count(*) filter(where l.status='won')::int as won_leads
    from public.leads l
    where l.organization_id=p_organization_id
      and l.created_at>=v_since
    group by l.source
    order by count(*) filter(where l.status='won') desc,count(*) desc
    limit 20
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'source',source,
    'leads',leads,
    'won_leads',won_leads,
    'win_rate',case when leads>0 then round((won_leads::numeric/leads)*100,1) else 0 end
  )),'[]'::jsonb)
  into v_sources
  from src;

  select coalesce(elem,'{}'::jsonb) into v_best_sales
  from jsonb_array_elements(v_sales_channels) elem
  order by coalesce((elem->>'revenue_cents')::bigint,0) desc,
           coalesce((elem->>'won_leads')::int,0) desc
  limit 1;

  select coalesce(elem,'{}'::jsonb) into v_best_campaign
  from jsonb_array_elements(v_campaigns) elem
  order by coalesce((elem->>'revenue_cents')::bigint,0) desc,
           coalesce((elem->>'won_leads')::int,0) desc,
           coalesce((elem->>'leads')::int,0) desc
  limit 1;

  return jsonb_build_object(
    'period_days',v_days,
    'generated_at',now(),
    'funnel',jsonb_build_object(
      'leads',v_leads,
      'contacted',v_contacted,
      'appointments',v_appointments,
      'won',v_won,
      'revenue_cents',v_revenue,
      'lead_to_contact_rate',case when v_leads>0 then round((v_contacted::numeric/v_leads)*100,1) else 0 end,
      'lead_to_appointment_rate',case when v_leads>0 then round((v_appointments::numeric/v_leads)*100,1) else 0 end,
      'lead_to_win_rate',case when v_leads>0 then round((v_won::numeric/v_leads)*100,1) else 0 end,
      'revenue_per_lead_cents',case when v_leads>0 then round(v_revenue::numeric/v_leads) else 0 end
    ),
    'sales_channels',v_sales_channels,
    'campaigns',v_campaigns,
    'sources',v_sources,
    'sales_learning',jsonb_build_object(
      'best_channel',v_best_sales,
      'message',case
        when v_contacted=0 then 'Nog onvoldoende verzonden Sales-opvolging om een winnend kanaal te bepalen.'
        when coalesce((v_best_sales->>'won_leads')::int,0)=0 then 'Er is opvolgdata, maar nog geen gewonnen lead om een winnend kanaal te bewijzen.'
        else 'Geef bij vergelijkbare leads voorkeur aan kanalen die aantoonbaar gewonnen leads of omzet opleveren.'
      end
    ),
    'marketing_learning',jsonb_build_object(
      'best_campaign',v_best_campaign,
      'message',case
        when not exists(select 1 from public.leads l where l.organization_id=p_organization_id and l.marketing_campaign_id is not null) then
          'Nog geen campagne-attributie. Gebruik ?rai_campaign=<tracking_code> in campagnelinks.'
        when coalesce((v_best_campaign->>'leads')::int,0)=0 then
          'Campagnes zijn aanwezig, maar er zijn nog geen toegeschreven leads.'
        else
          'Gebruik campagneconversie en omzet als prioriteit voor toekomstige contentkeuzes.'
      end
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.compute_commercial_optimizer(p_organization_id uuid, p_period_days integer DEFAULT 90)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_result jsonb;
  v_days integer := greatest(7,least(coalesce(p_period_days,90),3650));
  v_since timestamptz := now()-(greatest(7,least(coalesce(p_period_days,90),3650))||' days')::interval;
  v_lost_reasons jsonb := '[]'::jsonb;
  v_top_code text := '';
  v_top_label text := '';
  v_top_count integer := 0;
  v_total_lost integer := 0;
  v_top_share numeric := 0;
  v_recs jsonb := '[]'::jsonb;
  v_action text := '';
  v_other_count integer := 0;
begin
  v_result := public.compute_commercial_optimizer_base(p_organization_id,v_days);

  select count(*)::int into v_total_lost
  from public.leads l
  where l.organization_id=p_organization_id
    and l.status='lost'
    and coalesce(l.lost_at,l.updated_at)>=v_since;

  with base as (
    select
      coalesce(l.lost_reason_code,'other') as code,
      case coalesce(l.lost_reason_code,'other')
        when 'price_budget' then 'Prijs / budget'
        when 'no_response' then 'Geen reactie / niet bereikbaar'
        when 'timing' then 'Timing / later'
        when 'competitor' then 'Concurrent gekozen'
        when 'no_fit' then 'Geen goede match'
        when 'availability' then 'Beschikbaarheid / planning'
        when 'not_interested' then 'Geen interesse meer'
        when 'invalid_duplicate' then 'Ongeldige / dubbele lead'
        else 'Andere reden'
      end as label,
      l.score,
      l.source
    from public.leads l
    where l.organization_id=p_organization_id
      and l.status='lost'
      and coalesce(l.lost_at,l.updated_at)>=v_since
  ),
  agg as (
    select
      code,
      label,
      count(*)::int as lost_leads,
      round(avg(score)::numeric,1) as avg_score
    from base
    group by code,label
  ),
  top_sources as (
    select distinct on (code)
      code,
      source as top_source,
      count(*) over(partition by code,source)::int as source_count
    from base
    order by code,count(*) over(partition by code,source) desc,source
  ),
  rows as (
    select
      a.code,
      a.label,
      a.lost_leads,
      a.avg_score,
      coalesce(ts.top_source,'onbekend') as top_source,
      coalesce(ts.source_count,0) as top_source_count,
      case when v_total_lost>0 then round((a.lost_leads::numeric/v_total_lost)*100,1) else 0 end as share_pct
    from agg a
    left join top_sources ts on ts.code=a.code
    order by a.lost_leads desc,a.label asc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'code',code,
    'label',label,
    'lost_leads',lost_leads,
    'share_pct',share_pct,
    'avg_score',avg_score,
    'top_source',top_source,
    'top_source_count',top_source_count
  )),'[]'::jsonb)
  into v_lost_reasons
  from rows;

  select
    coalesce(elem->>'code',''),
    coalesce(elem->>'label',''),
    coalesce((elem->>'lost_leads')::int,0),
    coalesce((elem->>'share_pct')::numeric,0)
  into v_top_code,v_top_label,v_top_count,v_top_share
  from jsonb_array_elements(v_lost_reasons) elem
  order by coalesce((elem->>'lost_leads')::int,0) desc
  limit 1;

  select coalesce((elem->>'lost_leads')::int,0)
  into v_other_count
  from jsonb_array_elements(v_lost_reasons) elem
  where elem->>'code'='other'
  limit 1;
  v_other_count:=coalesce(v_other_count,0);

  v_recs := coalesce(v_result->'optimizer_recommendations','[]'::jsonb);

  if v_total_lost>=3 and v_top_count>=2 then
    v_action := case v_top_code
      when 'price_budget' then 'Verbeter value framing en kwalificeer budget eerder. Test eerst propositie en pakketstructuur voordat u korting gebruikt.'
      when 'no_response' then 'Test snellere eerste opvolging, een beter contactmoment en het best presterende kanaal. Controleer ook of contactgegevens vroeg genoeg worden verzameld.'
      when 'timing' then 'Plaats deze leads in een latere nurture-opvolging in plaats van ze definitief te laten vallen.'
      when 'competitor' then 'Leg in notities vast welke concurrent won en vergelijk propositie, snelheid en bewijsvoering om uw onderscheid scherper te maken.'
      when 'no_fit' then 'Verscherp targeting en kwalificatie zodat Sales minder tijd besteedt aan leads die niet bij het aanbod passen.'
      when 'availability' then 'Bied alternatieve tijdstippen of capaciteit eerder aan en meet of agenda-beschikbaarheid omzet kost.'
      when 'not_interested' then 'Vergelijk de eerste klantvraag met uw boodschap en CTA. Test een relevantere propositie voor dit segment.'
      when 'invalid_duplicate' then 'Verbeter bronfiltering, deduplicatie en leadvalidatie zodat Sales geen tijd verliest aan onbruikbare instroom.'
      else 'Gebruik bij nieuwe verloren leads een specifieke categorie en voeg een korte notitie toe zodat de oorzaak beter leerbaar wordt.'
    end;

    v_recs := jsonb_build_array(jsonb_build_object(
      'priority',case when v_top_share>=40 then 'high' else 'normal' end,
      'area','loss_analysis',
      'title','Pak de grootste verliesreden aan',
      'reason',v_top_count||' van '||v_total_lost||' verloren leads ('||v_top_share||'%) vallen onder: '||v_top_label||'.',
      'action',v_action
    )) || v_recs;
  end if;

  if v_total_lost>=3 and v_other_count::numeric/greatest(v_total_lost,1)>=0.35 then
    v_recs := jsonb_build_array(jsonb_build_object(
      'priority','normal',
      'area','data_quality',
      'title','Maak verliesredenen specifieker',
      'reason',v_other_count||' van '||v_total_lost||' verloren leads staan als Andere reden.',
      'action','Kies voortaan de meest specifieke verliescategorie en noteer kort wat er precies gebeurde.'
    )) || v_recs;
  end if;

  return v_result || jsonb_build_object(
    'lost_reasons',v_lost_reasons,
    'loss_summary',jsonb_build_object(
      'total_lost',v_total_lost,
      'top_reason_code',v_top_code,
      'top_reason_label',v_top_label,
      'top_reason_count',v_top_count,
      'top_reason_share_pct',v_top_share,
      'other_count',v_other_count
    ),
    'optimizer_recommendations',v_recs
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.compute_commercial_optimizer_base(p_organization_id uuid, p_period_days integer DEFAULT 90)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_base jsonb;
  v_days integer := greatest(7,least(coalesce(p_period_days,90),3650));
  v_since timestamptz := now()-(greatest(7,least(coalesce(p_period_days,90),3650))||' days')::interval;
  v_requested integer := 0;
  v_confirmed integer := 0;
  v_completed integer := 0;
  v_published_campaigns integer := 0;
  v_attributed_leads integer := 0;
  v_sequence_count integer := 0;
  v_sequence_won integer := 0;
  v_sources jsonb := '[]'::jsonb;
  v_sequence_perf jsonb := '[]'::jsonb;
  v_recommendations jsonb := '[]'::jsonb;
  v_leads integer := 0;
  v_contacted integer := 0;
  v_won integer := 0;
  v_best_sales jsonb := '{}'::jsonb;
  v_best_campaign jsonb := '{}'::jsonb;
begin
  v_base := public.compute_commercial_learning(p_organization_id,v_days);
  v_leads := coalesce((v_base#>>'{funnel,leads}')::integer,0);
  v_contacted := coalesce((v_base#>>'{funnel,contacted}')::integer,0);
  v_won := coalesce((v_base#>>'{funnel,won}')::integer,0);
  v_best_sales := coalesce(v_base->'sales_learning'->'best_channel','{}'::jsonb);
  v_best_campaign := coalesce(v_base->'marketing_learning'->'best_campaign','{}'::jsonb);

  select
    count(distinct a.lead_id) filter(where a.status in ('requested','proposed','confirmed','completed'))::int,
    count(distinct a.lead_id) filter(where a.status in ('confirmed','completed'))::int,
    count(distinct a.lead_id) filter(where a.status='completed')::int
  into v_requested,v_confirmed,v_completed
  from public.appointments a
  where a.organization_id=p_organization_id
    and a.created_at>=v_since;

  select count(*)::int into v_published_campaigns
  from public.marketing_campaigns mc
  where mc.organization_id=p_organization_id
    and mc.status='published'
    and coalesce(mc.published_at,mc.updated_at)>=v_since;

  select count(*)::int into v_attributed_leads
  from public.leads l
  where l.organization_id=p_organization_id
    and l.marketing_campaign_id is not null
    and l.created_at>=v_since;

  select
    count(*)::int,
    count(*) filter(where l.status='won')::int
  into v_sequence_count,v_sequence_won
  from public.sales_sequences s
  join public.leads l on l.id=s.lead_id and l.organization_id=p_organization_id
  where s.organization_id=p_organization_id
    and s.created_at>=v_since;

  with paid as (
    select cp.lead_id,sum(cp.amount_cents)::bigint as revenue_cents
    from public.customer_payments cp
    where cp.organization_id=p_organization_id and cp.status='paid'
    group by cp.lead_id
  ),
  ap as (
    select a.lead_id,
           bool_or(a.status in ('confirmed','completed')) as has_appointment
    from public.appointments a
    where a.organization_id=p_organization_id
    group by a.lead_id
  ),
  src as (
    select
      l.source,
      count(*)::int as leads,
      count(*) filter(where coalesce(ap.has_appointment,false))::int as appointments,
      count(*) filter(where l.status='won')::int as won_leads,
      coalesce(sum(p.revenue_cents),0)::bigint as revenue_cents
    from public.leads l
    left join ap on ap.lead_id=l.id
    left join paid p on p.lead_id=l.id
    where l.organization_id=p_organization_id
      and l.created_at>=v_since
    group by l.source
    order by revenue_cents desc,won_leads desc,leads desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'source',source,
    'leads',leads,
    'appointments',appointments,
    'won_leads',won_leads,
    'win_rate',case when leads>0 then round((won_leads::numeric/leads)*100,1) else 0 end,
    'revenue_cents',revenue_cents
  )),'[]'::jsonb)
  into v_sources
  from src;

  with first_step as (
    select distinct on (s.id)
      s.id as sequence_id,
      s.lead_id,
      st.channel
    from public.sales_sequences s
    join public.sales_sequence_steps st on st.sequence_id=s.id
    where s.organization_id=p_organization_id
      and s.created_at>=v_since
    order by s.id,st.step_no asc
  ),
  paid as (
    select cp.lead_id,sum(cp.amount_cents)::bigint as revenue_cents
    from public.customer_payments cp
    where cp.organization_id=p_organization_id and cp.status='paid'
    group by cp.lead_id
  ),
  seq as (
    select
      fs.channel,
      count(*)::int as sequences,
      count(*) filter(where l.status='won')::int as won_leads,
      coalesce(sum(p.revenue_cents),0)::bigint as revenue_cents
    from first_step fs
    join public.leads l on l.id=fs.lead_id and l.organization_id=p_organization_id
    left join paid p on p.lead_id=fs.lead_id
    group by fs.channel
    order by revenue_cents desc,won_leads desc,sequences desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'channel',channel,
    'sequences',sequences,
    'won_leads',won_leads,
    'win_rate',case when sequences>0 then round((won_leads::numeric/sequences)*100,1) else 0 end,
    'revenue_cents',revenue_cents
  )),'[]'::jsonb)
  into v_sequence_perf
  from seq;

  if v_leads>=5 and coalesce((v_base#>>'{funnel,lead_to_contact_rate}')::numeric,0)<40 then
    v_recommendations := v_recommendations || jsonb_build_array(jsonb_build_object(
      'priority','high','area','lead_capture',
      'title','Verhoog bereikbare leads',
      'reason','Minder dan 40% van de leads kreeg een geregistreerde opvolging.',
      'action','Maak contactgegevens en contacttoestemming eerder onderdeel van de kwalificatieflow.'
    ));
  end if;

  if v_contacted>=5 and v_confirmed::numeric/greatest(v_contacted,1)<0.30 then
    v_recommendations := v_recommendations || jsonb_build_array(jsonb_build_object(
      'priority','high','area','sales',
      'title','Verbeter de stap van contact naar afspraak',
      'reason','Minder dan 30% van de gecontacteerde leads resulteerde in een bevestigde afspraak.',
      'action','Test directere afspraak-CTA’s en kortere opvolgberichten bij warme leads.'
    ));
  end if;

  if v_confirmed>=5 and v_won::numeric/greatest(v_confirmed,1)<0.30 then
    v_recommendations := v_recommendations || jsonb_build_array(jsonb_build_object(
      'priority','normal','area','qualification',
      'title','Controleer kwalificatie en aanbod',
      'reason','Minder dan 30% van de bevestigde afspraken eindigde als gewonnen lead.',
      'action','Vergelijk gewonnen en verloren leads en verscherp kwalificatiecriteria voordat Sales opvolgt.'
    ));
  end if;

  if v_published_campaigns>0 and v_attributed_leads=0 then
    v_recommendations := v_recommendations || jsonb_build_array(jsonb_build_object(
      'priority','high','area','marketing',
      'title','Activeer campagne-attributie',
      'reason','Er zijn gepubliceerde campagnes maar nog geen toegeschreven leads.',
      'action','Gebruik de ?rai_campaign= trackingcode in elke campagnelink naar een pagina met de Reception AI-widget.'
    ));
  end if;

  if coalesce((v_best_sales->>'won_leads')::int,0)>=2 then
    v_recommendations := v_recommendations || jsonb_build_array(jsonb_build_object(
      'priority','normal','area','sales',
      'title','Gebruik het bewezen verkoopkanaal vaker',
      'reason','Het kanaal '||coalesce(v_best_sales->>'channel','')||' heeft meerdere gewonnen leads opgeleverd.',
      'action','Geef dit kanaal voorkeur bij vergelijkbare leads wanneer toestemming en contactgegevens beschikbaar zijn.'
    ));
  end if;

  if coalesce((v_best_campaign->>'leads')::int,0)>=3
     and coalesce((v_best_campaign->>'won_leads')::int,0)>=1 then
    v_recommendations := v_recommendations || jsonb_build_array(jsonb_build_object(
      'priority','normal','area','marketing',
      'title','Bouw voort op de best converterende campagne',
      'reason','Een campagne heeft zowel meerdere leads als minimaal één gewonnen klant opgeleverd.',
      'action','Gebruik dezelfde propositie, doelgroep of contenthoek als basis voor de volgende marketingdrafts.'
    ));
  end if;

  if jsonb_array_length(v_recommendations)=0 then
    v_recommendations := jsonb_build_array(jsonb_build_object(
      'priority','info','area','learning',
      'title','Verzamel meer echte conversiedata',
      'reason','Er is nog onvoldoende volume om betrouwbare optimalisaties te adviseren.',
      'action','Blijf leads, afspraken, wins, betalingen en campagnelinks registreren. Reception AI herberekent de aanbevelingen automatisch.'
    ));
  end if;

  return v_base || jsonb_build_object(
    'appointment_stages',jsonb_build_object(
      'requested',v_requested,
      'confirmed',v_confirmed,
      'completed',v_completed,
      'contact_to_confirmed_rate',case when v_contacted>0 then round((v_confirmed::numeric/v_contacted)*100,1) else 0 end,
      'confirmed_to_win_rate',case when v_confirmed>0 then round((v_won::numeric/v_confirmed)*100,1) else 0 end
    ),
    'source_performance',v_sources,
    'sequence_performance',v_sequence_perf,
    'tracking',jsonb_build_object(
      'published_campaigns',v_published_campaigns,
      'attributed_leads',v_attributed_leads,
      'attribution_rate',case when v_leads>0 then round((v_attributed_leads::numeric/v_leads)*100,1) else 0 end
    ),
    'optimizer_recommendations',v_recommendations
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.compute_customer_success_health(p_organization_id uuid, p_period_days integer DEFAULT 14)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_days integer := greatest(7,least(coalesce(p_period_days,14),90));
  v_since timestamptz := now()-(greatest(7,least(coalesce(p_period_days,14),90))||' days')::interval;
  v_org public.organizations%rowtype;
  v_profile public.business_profiles%rowtype;
  v_paid_since timestamptz := null;
  v_recent_conversations integer := 0;
  v_recent_leads integer := 0;
  v_recent_warm integer := 0;
  v_outbound boolean := false;
  v_widget boolean := false;
  v_automation boolean := false;
  v_payment_ok boolean := false;
  v_age_days numeric := 0;
  v_score integer := 0;
  v_status text := 'unknown';
  v_risks jsonb := '[]'::jsonb;
  v_next_action text := '';
begin
  select * into v_org from public.organizations where id=p_organization_id;
  if not found then return jsonb_build_object('ok',false,'error','organization_not_found'); end if;

  select * into v_profile from public.business_profiles where organization_id=p_organization_id;

  select max(i.converted_at) into v_paid_since
  from public.sales_onboarding_invites i
  where i.claimed_organization_id=p_organization_id and i.status='converted';

  if v_paid_since is null and v_org.subscription_status='active' then
    v_paid_since := coalesce(v_org.updated_at,v_org.created_at);
  end if;

  if v_paid_since is null and v_org.subscription_status<>'active' then
    return jsonb_build_object(
      'ok',true,
      'period_days',v_days,
      'status','not_paid',
      'score',0,
      'plan',v_org.plan,
      'subscription_status',v_org.subscription_status,
      'paid_since',null,
      'customer_age_days',0,
      'risks','[]'::jsonb,
      'next_action','Customer Success monitoring start zodra een betaald abonnement actief is.'
    );
  end if;

  if v_paid_since is not null then
    v_age_days := greatest(0,extract(epoch from (now()-v_paid_since))/86400.0);
  end if;

  select count(*)::int into v_recent_conversations
  from public.conversations c
  where c.organization_id=p_organization_id
    and c.created_at>=v_since
    and coalesce(c.channel,'') in ('web','web_chat','widget');

  select count(*)::int,
         count(*) filter(where l.score>=60)::int
  into v_recent_leads,v_recent_warm
  from public.leads l
  where l.organization_id=p_organization_id and l.created_at>=v_since;

  select coalesce(bool_or(
    ti.status='active'
    and ti.channel in ('email','whatsapp')
    and 'lead_follow_up'=any(ti.capabilities)
  ),false)
  into v_outbound
  from public.tenant_integrations ti
  where ti.organization_id=p_organization_id and ti.is_default=true;

  v_widget := coalesce(v_profile.widget_enabled,false);
  v_automation := coalesce(v_profile.automation_enabled,false);
  v_payment_ok := v_org.subscription_status='active';

  v_score :=
      (case when v_payment_ok then 25 else 0 end)
    + (case when v_widget then 20 else 0 end)
    + (case when v_automation then 15 else 0 end)
    + (case when v_outbound then 15 else 0 end)
    + (case when v_recent_conversations>0 then 15 else 0 end)
    + (case when v_recent_leads>0 then 10 else 0 end);

  if v_org.subscription_status in ('past_due','unpaid','canceled','incomplete_expired') then
    v_score := least(v_score,35);
    v_risks := v_risks || jsonb_build_array('payment_risk');
  end if;
  if not v_widget then v_risks := v_risks || jsonb_build_array('widget_off'); end if;
  if not v_automation then v_risks := v_risks || jsonb_build_array('automation_off'); end if;
  if not v_outbound then v_risks := v_risks || jsonb_build_array('no_followup_channel'); end if;
  if v_age_days>=7 and v_recent_conversations=0 then v_risks := v_risks || jsonb_build_array('no_recent_usage'); end if;
  if v_age_days>=14 and v_recent_leads=0 then v_risks := v_risks || jsonb_build_array('no_recent_leads'); end if;

  v_status := case
    when v_org.subscription_status in ('past_due','unpaid','canceled','incomplete_expired') then 'critical'
    when v_age_days<7 and v_recent_conversations=0 then 'launching'
    when v_score>=80 then 'healthy'
    when v_score>=55 then 'attention'
    else 'critical'
  end;

  v_next_action := case
    when v_org.subscription_status in ('past_due','unpaid','canceled','incomplete_expired') then 'Controleer betaling en neem persoonlijk contact op voordat toegang of service wordt beperkt.'
    when not v_widget then 'Controleer of de websitewidget correct actief en geplaatst is.'
    when not v_outbound then 'Koppel een e-mail- of WhatsApp-kanaal zodat warme leads opgevolgd kunnen worden.'
    when not v_automation then 'Activeer de automatische workflow als dit past bij de afgesproken inrichting.'
    when v_age_days>=7 and v_recent_conversations=0 then 'Controleer widgetplaatsing en websiteverkeer; de klant heeft recent geen echte gesprekken.'
    when v_age_days>=14 and v_recent_leads=0 then 'Bespreek optimalisatie van vragen, CTA en leadkwalificatie; er zijn recent geen leads gemeten.'
    else 'Blijf gebruik en resultaat volgen; er is geen directe klantgezondheidsactie nodig.'
  end;

  return jsonb_build_object(
    'ok',true,'period_days',v_days,'status',v_status,'score',least(100,greatest(0,v_score)),
    'plan',v_org.plan,'subscription_status',v_org.subscription_status,'paid_since',v_paid_since,
    'customer_age_days',round(v_age_days,1),'widget_active',v_widget,'automation_active',v_automation,
    'followup_channel_ready',v_outbound,'recent_conversations',v_recent_conversations,
    'recent_leads',v_recent_leads,'recent_warm_leads',v_recent_warm,
    'risks',v_risks,'next_action',v_next_action
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.compute_lead_capture_metrics(p_organization_id uuid, p_period_days integer DEFAULT 90)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_days integer := greatest(7,least(coalesce(p_period_days,90),3650));
  v_since timestamptz := now()-(greatest(7,least(coalesce(p_period_days,90),3650))||' days')::interval;
  v_leads integer := 0;
  v_with_contact integer := 0;
  v_with_consent integer := 0;
  v_reachable integer := 0;
  v_high_intent integer := 0;
  v_high_intent_reachable integer := 0;
  v_capture_events integer := 0;
begin
  select
    count(*)::int,
    count(*) filter(where coalesce(nullif(trim(l.email),''),nullif(trim(l.phone),'')) is not null)::int,
    count(*) filter(where l.contact_consent_at is not null)::int,
    count(*) filter(
      where coalesce(nullif(trim(l.email),''),nullif(trim(l.phone),'')) is not null
        and l.contact_consent_at is not null
    )::int,
    count(*) filter(
      where coalesce(l.qualification->>'intent','') in ('appointment','human_handoff','urgent_handoff')
    )::int,
    count(*) filter(
      where coalesce(l.qualification->>'intent','') in ('appointment','human_handoff','urgent_handoff')
        and coalesce(nullif(trim(l.email),''),nullif(trim(l.phone),'')) is not null
        and l.contact_consent_at is not null
    )::int
  into v_leads,v_with_contact,v_with_consent,v_reachable,v_high_intent,v_high_intent_reachable
  from public.leads l
  where l.organization_id=p_organization_id
    and l.created_at>=v_since;

  select count(*)::int into v_capture_events
  from public.audit_events a
  where a.organization_id=p_organization_id
    and a.event_type='lead.contact_capture_completed'
    and a.created_at>=v_since;

  return jsonb_build_object(
    'period_days',v_days,
    'leads',v_leads,
    'with_contact',v_with_contact,
    'with_consent',v_with_consent,
    'reachable',v_reachable,
    'reachable_rate',case when v_leads>0 then round((v_reachable::numeric/v_leads)*100,1) else 0 end,
    'high_intent',v_high_intent,
    'high_intent_reachable',v_high_intent_reachable,
    'high_intent_reachable_rate',case when v_high_intent>0 then round((v_high_intent_reachable::numeric/v_high_intent)*100,1) else 0 end,
    'adaptive_capture_completed',v_capture_events
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.compute_pilot_value_metrics(p_organization_id uuid, p_period_days integer DEFAULT 14)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_days integer := greatest(1,least(coalesce(p_period_days,14),90));
  v_since timestamptz := now()-(greatest(1,least(coalesce(p_period_days,14),90))||' days')::interval;
  v_conversations integer := 0;
  v_messages integer := 0;
  v_visitor_messages integer := 0;
  v_leads integer := 0;
  v_warm integer := 0;
  v_reachable integer := 0;
  v_handoffs integer := 0;
  v_appointments integer := 0;
  v_score integer := 0;
  v_ready boolean := false;
  v_signal text := '';
begin
  select count(*)::int into v_conversations
  from public.conversations c
  where c.organization_id=p_organization_id
    and c.created_at>=v_since
    and coalesce(c.channel,'') in ('web','web_chat','widget');

  select
    count(*)::int,
    count(*) filter(where m.role in ('user','customer','visitor'))::int
  into v_messages,v_visitor_messages
  from public.messages m
  where m.organization_id=p_organization_id
    and m.created_at>=v_since;

  select
    count(*)::int,
    count(*) filter(where l.score>=60 and l.status not in ('won','lost'))::int,
    count(*) filter(
      where l.score>=60
        and l.status not in ('won','lost')
        and coalesce(nullif(trim(l.email),''),nullif(trim(l.phone),'')) is not null
        and l.contact_consent_at is not null
    )::int
  into v_leads,v_warm,v_reachable
  from public.leads l
  where l.organization_id=p_organization_id
    and l.created_at>=v_since;

  select count(*)::int into v_handoffs
  from public.handoffs h
  where h.organization_id=p_organization_id
    and h.created_at>=v_since;

  select count(*)::int into v_appointments
  from public.appointments a
  where a.organization_id=p_organization_id
    and a.created_at>=v_since
    and a.status in ('requested','proposed','confirmed','completed');

  v_score :=
      least(v_conversations,5)*5
    + least(v_visitor_messages,10)*2
    + least(v_warm,3)*10
    + least(v_reachable,2)*10
    + least(v_handoffs,2)*5
    + least(v_appointments,2)*10;

  v_score := least(v_score,100);
  v_ready := v_conversations>=3 and (v_warm>=1 or v_reachable>=1 or v_appointments>=1) and v_score>=50;

  v_signal := case
    when v_ready and v_appointments>0 then 'Reception AI heeft echte gesprekken én afspraakintentie opgeleverd.'
    when v_ready and v_reachable>0 then 'Reception AI heeft echte gesprekken én direct opvolgbare warme leads opgeleverd.'
    when v_ready and v_warm>0 then 'Reception AI heeft echte gesprekken én warme leads opgeleverd.'
    when v_conversations=0 then 'Nog geen echte websitegesprekken gemeten.'
    when v_conversations<3 then 'Er zijn gesprekken, maar nog te weinig volume om pilotwaarde betrouwbaar te beoordelen.'
    when v_warm=0 and v_appointments=0 then 'Er is gesprekvolume, maar nog geen duidelijke commerciële intentie gemeten.'
    else 'De pilot verzamelt waardevolle gebruiksdata; nog iets meer bewijs nodig voor een sterke conversiecase.'
  end;

  return jsonb_build_object(
    'period_days',v_days,
    'score',v_score,
    'conversion_ready',v_ready,
    'signal',v_signal,
    'public_conversations',v_conversations,
    'messages',v_messages,
    'visitor_messages',v_visitor_messages,
    'leads',v_leads,
    'warm_leads',v_warm,
    'reachable_warm_leads',v_reachable,
    'handoffs',v_handoffs,
    'appointments',v_appointments
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.compute_saas_sales_funnel(p_organization_id uuid, p_period_days integer DEFAULT 90)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_days integer := greatest(7,least(coalesce(p_period_days,90),3650));
  v_since timestamptz := now()-(greatest(7,least(coalesce(p_period_days,90),3650))||' days')::interval;
  v_demo integer := 0;
  v_pending integer := 0;
  v_claimed integer := 0;
  v_core_ready integer := 0;
  v_usage_started integer := 0;
  v_value_event integer := 0;
  v_value_proven integer := 0;
  v_conversion_ready integer := 0;
  v_converted integer := 0;
begin
  select
    count(distinct i.lead_id)::int,
    count(distinct i.lead_id) filter(where i.status='pending')::int,
    count(distinct i.lead_id) filter(where i.status in ('claimed','converted'))::int,
    count(distinct i.lead_id) filter(where i.status='converted')::int
  into v_demo,v_pending,v_claimed,v_converted
  from public.sales_onboarding_invites i
  where i.sales_organization_id=p_organization_id
    and i.created_at>=v_since;

  select count(*)::int into v_core_ready
  from public.sales_onboarding_invites i
  cross join lateral public.compute_tenant_onboarding_progress(i.claimed_organization_id) p
  where i.sales_organization_id=p_organization_id
    and i.created_at>=v_since
    and i.claimed_organization_id is not null
    and i.status in ('claimed','converted')
    and coalesce((p->>'core_ready')::boolean,false);

  with claimed as (
    select distinct i.claimed_organization_id
    from public.sales_onboarding_invites i
    where i.sales_organization_id=p_organization_id
      and i.created_at>=v_since
      and i.claimed_organization_id is not null
      and i.status in ('claimed','converted')
  ),
  event_flags as (
    select
      c.claimed_organization_id,
      bool_or(e.event_type='first_public_conversation') as usage_started,
      count(distinct e.event_type) filter(where e.event_type in (
        'first_qualified_lead','first_handoff','first_appointment_request','first_customer_payment'
      ))::int as value_events
    from claimed c
    left join public.tenant_activation_events e
      on e.organization_id=c.claimed_organization_id
    group by c.claimed_organization_id
  )
  select
    count(*) filter(where usage_started)::int,
    count(*) filter(where value_events>=1)::int,
    count(*) filter(where value_events>=2)::int
  into v_usage_started,v_value_event,v_value_proven
  from event_flags;

  select count(distinct o.lead_id)::int into v_conversion_ready
  from public.sales_opportunities o
  join public.sales_onboarding_invites i
    on i.sales_organization_id=o.organization_id
   and i.lead_id=o.lead_id
  where o.organization_id=p_organization_id
    and i.created_at>=v_since
    and o.stage in ('conversion_ready','value_proven','won');

  return jsonb_build_object(
    'period_days',v_days,
    'demo_requests',v_demo,
    'awaiting_onboarding',v_pending,
    'onboarding_started',v_claimed,
    'core_ready',v_core_ready,
    'usage_started',v_usage_started,
    'value_event',v_value_event,
    'value_proven',v_value_proven,
    'conversion_ready',v_conversion_ready,
    'converted_paid',v_converted,
    'demo_to_onboarding_rate',case when v_demo>0 then round((v_claimed::numeric/v_demo)*100,1) else 0 end,
    'onboarding_to_core_ready_rate',case when v_claimed>0 then round((v_core_ready::numeric/v_claimed)*100,1) else 0 end,
    'core_ready_to_usage_rate',case when v_core_ready>0 then round((v_usage_started::numeric/v_core_ready)*100,1) else 0 end,
    'usage_to_value_rate',case when v_usage_started>0 then round((v_value_event::numeric/v_usage_started)*100,1) else 0 end,
    'value_to_conversion_ready_rate',case when v_value_event>0 then round((v_conversion_ready::numeric/v_value_event)*100,1) else 0 end,
    'conversion_ready_to_paid_rate',case when v_conversion_ready>0 then round((v_converted::numeric/v_conversion_ready)*100,1) else 0 end,
    'value_proven_to_paid_rate',case when v_value_proven>0 then round((v_converted::numeric/v_value_proven)*100,1) else 0 end,
    'onboarding_to_paid_rate',case when v_claimed>0 then round((v_converted::numeric/v_claimed)*100,1) else 0 end,
    'demo_to_paid_rate',case when v_demo>0 then round((v_converted::numeric/v_demo)*100,1) else 0 end
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.compute_tenant_onboarding_progress(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org public.organizations%rowtype;
  v_profile public.business_profiles%rowtype;
  v_conversations integer := 0;
  v_public_conversations integer := 0;
  v_email_ready boolean := false;
  v_whatsapp_ready boolean := false;
  v_calendar_ready boolean := false;
  v_payment_ready boolean := false;
  v_profile_ready boolean := false;
  v_tested boolean := false;
  v_widget boolean := false;
  v_notify boolean := false;
  v_automation boolean := false;
  v_outbound boolean := false;
  v_completed integer := 0;
  v_total integer := 6;
  v_progress numeric := 0;
  v_core_ready boolean := false;
  v_next_key text := '';
  v_next_label text := '';
  v_next_href text := '';
begin
  select * into v_org
  from public.organizations
  where id=p_organization_id;

  if not found then
    return jsonb_build_object('ok',false,'error','organization_not_found');
  end if;

  select * into v_profile
  from public.business_profiles
  where organization_id=p_organization_id;

  select count(*)::int into v_conversations
  from public.conversations
  where organization_id=p_organization_id;

  select count(*)::int into v_public_conversations
  from public.conversations
  where organization_id=p_organization_id
    and coalesce(channel,'') in ('web','web_chat','widget');

  select
    coalesce(bool_or(status='active' and channel='email' and 'lead_follow_up'=any(capabilities)),false),
    coalesce(bool_or(status='active' and channel='whatsapp' and 'lead_follow_up'=any(capabilities)),false),
    coalesce(bool_or(status='active' and channel='calendar'),false),
    coalesce(bool_or(status='active' and channel='payment' and coalesce(config->>'stripe_mode','')='live'),false)
  into v_email_ready,v_whatsapp_ready,v_calendar_ready,v_payment_ready
  from public.tenant_integrations
  where organization_id=p_organization_id
    and is_default=true;

  v_profile_ready :=
    coalesce(nullif(trim(v_profile.business_name),''),'')<>''
    and coalesce(length(trim(v_profile.description)),0)>=10
    and jsonb_array_length(coalesce(v_profile.services,'[]'::jsonb))>0;

  v_tested := v_conversations>0;
  v_widget := coalesce(v_profile.widget_enabled,false);
  v_notify := coalesce(nullif(trim(v_profile.notification_email),''),'')<>'';
  v_automation := coalesce(v_profile.automation_enabled,false);
  v_outbound := v_email_ready or v_whatsapp_ready;

  v_completed :=
    (case when v_profile_ready then 1 else 0 end)+
    (case when v_tested then 1 else 0 end)+
    (case when v_widget then 1 else 0 end)+
    (case when v_notify then 1 else 0 end)+
    (case when v_automation then 1 else 0 end)+
    (case when v_outbound then 1 else 0 end);

  v_progress := round((v_completed::numeric/v_total)*100,0);
  v_core_ready := v_completed=v_total;

  if not v_profile_ready then
    v_next_key:='profile';
    v_next_label:='Vul bedrijfsinformatie en diensten in';
    v_next_href:='?view=settings';
  elsif not v_tested then
    v_next_key:='test_receptionist';
    v_next_label:='Test de receptionist met een echte klantvraag';
    v_next_href:='?view=receptionist';
  elsif not v_widget then
    v_next_key:='enable_widget';
    v_next_label:='Activeer en plaats de websitewidget';
    v_next_href:='?view=receptionist';
  elsif not v_notify then
    v_next_key:='notification_email';
    v_next_label:='Stel het notificatie-e-mailadres in';
    v_next_href:='?view=settings';
  elsif not v_outbound then
    v_next_key:='followup_channel';
    v_next_label:='Koppel e-mail of WhatsApp voor opvolging';
    v_next_href:='?view=integrations';
  elsif not v_automation then
    v_next_key:='automation';
    v_next_label:='Activeer de automatische workflow';
    v_next_href:='?view=settings';
  else
    v_next_key:='ready';
    v_next_label:='Onboarding voltooid';
    v_next_href:='?view=overview';
  end if;

  return jsonb_build_object(
    'ok',true,
    'organization_id',p_organization_id,
    'organization_status',v_org.status,
    'plan',v_org.plan,
    'subscription_status',v_org.subscription_status,
    'trial_ends_at',v_org.trial_ends_at,
    'progress_percent',v_progress,
    'completed_steps',v_completed,
    'total_steps',v_total,
    'core_ready',v_core_ready,
    'steps',jsonb_build_array(
      jsonb_build_object('key','profile','label','Bedrijfsprofiel','done',v_profile_ready,'href','?view=settings'),
      jsonb_build_object('key','test_receptionist','label','Receptionist getest','done',v_tested,'href','?view=receptionist'),
      jsonb_build_object('key','enable_widget','label','Widget actief','done',v_widget,'href','?view=receptionist'),
      jsonb_build_object('key','notification_email','label','Notificatieadres ingesteld','done',v_notify,'href','?view=settings'),
      jsonb_build_object('key','followup_channel','label','Opvolgkanaal gekoppeld','done',v_outbound,'href','?view=integrations'),
      jsonb_build_object('key','automation','label','Automatische workflow actief','done',v_automation,'href','?view=settings')
    ),
    'optional',jsonb_build_object(
      'calendar_connected',v_calendar_ready,
      'payment_live',v_payment_ready,
      'public_conversations',v_public_conversations
    ),
    'next_action',jsonb_build_object(
      'key',v_next_key,
      'label',v_next_label,
      'href',v_next_href
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.compute_trial_activation_metrics(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_events jsonb := '{}'::jsonb;
  v_score integer := 0;
  v_value_count integer := 0;
  v_stage text := 'not_started';
  v_first_value_at timestamptz := null;
  v_public boolean := false;
  v_qualified boolean := false;
  v_handoff boolean := false;
  v_appt boolean := false;
  v_confirmed boolean := false;
  v_payment boolean := false;
begin
  select coalesce(jsonb_object_agg(event_type,jsonb_build_object(
    'happened_at',happened_at,
    'source_entity_type',source_entity_type,
    'source_entity_id',source_entity_id,
    'metadata',metadata
  )),'{}'::jsonb)
  into v_events
  from public.tenant_activation_events
  where organization_id=p_organization_id;

  v_public := v_events ? 'first_public_conversation';
  v_qualified := v_events ? 'first_qualified_lead';
  v_handoff := v_events ? 'first_handoff';
  v_appt := v_events ? 'first_appointment_request';
  v_confirmed := v_events ? 'first_confirmed_appointment';
  v_payment := v_events ? 'first_customer_payment';

  v_score :=
    (case when v_public then 15 else 0 end)+
    (case when v_qualified then 35 else 0 end)+
    (case when v_handoff then 20 else 0 end)+
    (case when v_appt then 20 else 0 end)+
    (case when v_confirmed then 5 else 0 end)+
    (case when v_payment then 5 else 0 end);

  v_value_count :=
    (case when v_qualified then 1 else 0 end)+
    (case when v_handoff then 1 else 0 end)+
    (case when v_appt then 1 else 0 end)+
    (case when v_payment then 1 else 0 end);

  select min(happened_at) into v_first_value_at
  from public.tenant_activation_events
  where organization_id=p_organization_id
    and event_type in ('first_qualified_lead','first_handoff','first_appointment_request','first_customer_payment');

  v_stage := case
    when v_value_count>=2 then 'value_proven'
    when v_value_count=1 then 'value_event'
    when v_public then 'usage_started'
    else 'not_started'
  end;

  return jsonb_build_object(
    'score',least(v_score,100),
    'stage',v_stage,
    'value_event_count',v_value_count,
    'value_realized',v_value_count>0,
    'first_value_at',v_first_value_at,
    'events',v_events,
    'milestones',jsonb_build_array(
      jsonb_build_object('key','first_public_conversation','label','Eerste echte websitegesprek','done',v_public,'points',15),
      jsonb_build_object('key','first_qualified_lead','label','Eerste gekwalificeerde lead','done',v_qualified,'points',35),
      jsonb_build_object('key','first_handoff','label','Eerste menselijke handoff','done',v_handoff,'points',20),
      jsonb_build_object('key','first_appointment_request','label','Eerste afspraakaanvraag','done',v_appt,'points',20),
      jsonb_build_object('key','first_confirmed_appointment','label','Eerste bevestigde afspraak','done',v_confirmed,'points',5),
      jsonb_build_object('key','first_customer_payment','label','Eerste klantbetaling','done',v_payment,'points',5)
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.compute_trial_value_report(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org record;
  v_since timestamptz;
  v_activation jsonb;
  v_public_conversations integer := 0;
  v_qualified_leads integer := 0;
  v_handoffs integer := 0;
  v_appointment_requests integer := 0;
  v_confirmed_appointments integer := 0;
  v_paid_customer_payments integer := 0;
  v_customer_revenue bigint := 0;
  v_days_elapsed integer := 0;
  v_days_remaining integer := 0;
  v_requested_plan text := 'pilot';
begin
  select id,created_at,trial_ends_at,plan,subscription_status
  into v_org
  from public.organizations
  where id=p_organization_id;

  if not found then
    return jsonb_build_object('ok',false,'error','organization_not_found');
  end if;

  select coalesce(i.claimed_at,i.created_at),coalesce(i.requested_plan,'pilot')
  into v_since,v_requested_plan
  from public.sales_onboarding_invites i
  where i.claimed_organization_id=p_organization_id
  order by i.created_at desc
  limit 1;

  v_since := coalesce(v_since,v_org.created_at,now());

  select count(*)::int into v_public_conversations
  from public.conversations c
  where c.organization_id=p_organization_id
    and c.created_at>=v_since
    and coalesce(c.channel,'') in ('web','web_chat','widget');

  select count(*)::int into v_qualified_leads
  from public.leads l
  where l.organization_id=p_organization_id
    and l.created_at>=v_since
    and (coalesce(l.score,0)>=60 or l.status in ('qualified','follow_up','handoff','won'));

  select count(*)::int into v_handoffs
  from public.handoffs h
  where h.organization_id=p_organization_id
    and h.created_at>=v_since;

  select
    count(*)::int,
    count(*) filter(where a.status in ('confirmed','completed'))::int
  into v_appointment_requests,v_confirmed_appointments
  from public.appointments a
  where a.organization_id=p_organization_id
    and a.created_at>=v_since;

  select
    count(*)::int,
    coalesce(sum(p.amount_cents),0)::bigint
  into v_paid_customer_payments,v_customer_revenue
  from public.customer_payments p
  where p.organization_id=p_organization_id
    and p.status='paid'
    and coalesce(p.paid_at,p.updated_at,p.created_at)>=v_since;

  v_days_elapsed := greatest(0,floor(extract(epoch from (now()-v_since))/86400)::int);
  v_days_remaining := case
    when v_org.trial_ends_at is null then 0
    else greatest(0,ceil(extract(epoch from (v_org.trial_ends_at-now()))/86400)::int)
  end;

  v_activation := public.compute_trial_activation_metrics(p_organization_id);

  return jsonb_build_object(
    'ok',true,
    'since',v_since,
    'days_elapsed',v_days_elapsed,
    'days_remaining',v_days_remaining,
    'requested_plan',v_requested_plan,
    'activation',v_activation,
    'usage',jsonb_build_object(
      'public_conversations',v_public_conversations,
      'qualified_leads',v_qualified_leads,
      'handoffs',v_handoffs,
      'appointment_requests',v_appointment_requests,
      'confirmed_appointments',v_confirmed_appointments,
      'paid_customer_payments',v_paid_customer_payments,
      'customer_revenue_cents',v_customer_revenue
    ),
    'summary',case coalesce(v_activation->>'stage','not_started')
      when 'value_proven' then 'Reception AI heeft tijdens deze pilot meerdere echte waarde-events geregistreerd.'
      when 'value_event' then 'Reception AI heeft tijdens deze pilot een eerste echt waarde-event geregistreerd.'
      when 'usage_started' then 'Reception AI wordt met echte bezoekers gebruikt; de volgende stap is meetbare klantwaarde realiseren.'
      else 'De pilot is klaar om met echte bezoekers te worden gebruikt.'
    end
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.consume_ai_daily_quota(p_organization_id uuid, p_limit integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_count integer;
begin
  if p_organization_id is null or p_limit is null or p_limit <= 0 then
    return false;
  end if;

  insert into public.ai_usage_daily(
    organization_id,usage_date,request_count,updated_at
  )
  values(
    p_organization_id,current_date,1,now()
  )
  on conflict(organization_id,usage_date) do update
    set request_count=public.ai_usage_daily.request_count+1,
        updated_at=now()
    where public.ai_usage_daily.request_count < p_limit
  returning request_count into v_count;

  return v_count is not null and v_count <= p_limit;
end;
$function$;

CREATE OR REPLACE FUNCTION public.consume_billing_checkout_ref(p_token_hash text, p_plan text)
 RETURNS TABLE(organization_id uuid, user_id uuid, plan text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  return query
  update private.billing_checkout_refs r
  set used_at=now()
  where r.token_hash=p_token_hash
    and r.plan=p_plan
    and r.used_at is null
    and r.expires_at>now()
  returning r.organization_id,r.user_id,r.plan;
end;
$function$;

CREATE OR REPLACE FUNCTION public.consume_oauth_state(p_state_hash text)
 RETURNS TABLE(organization_id uuid, user_id uuid, integration_id uuid, provider text, redirect_after text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  return query
  update private.oauth_states s
  set used_at=now()
  where s.state_hash=p_state_hash
    and s.used_at is null
    and s.expires_at>now()
  returning s.organization_id,s.user_id,s.integration_id,s.provider,s.redirect_after;
end;
$function$;

CREATE OR REPLACE FUNCTION public.convert_lead_when_payment_paid()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_prior_status text;
begin
  if new.status='paid' and old.status is distinct from 'paid' then
    select status into v_prior_status
    from public.leads
    where id=new.lead_id
      and organization_id=new.organization_id;

    update public.leads
    set status='won',updated_at=now()
    where id=new.lead_id
      and organization_id=new.organization_id
      and status is distinct from 'won';

    if found then
      insert into public.audit_events(
        organization_id,actor_user_id,event_type,entity_type,entity_id,payload
      ) values(
        new.organization_id,null,'lead.won_from_payment','lead',new.lead_id,
        jsonb_build_object(
          'payment_id',new.id,
          'amount_cents',new.amount_cents,
          'currency',new.currency,
          'prior_status',v_prior_status
        )
      );
    end if;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_billing_checkout_ref(p_token_hash text, p_organization_id uuid, p_user_id uuid, p_plan text, p_expires_at timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_plan not in ('starter','pro','business') then
    raise exception 'invalid plan';
  end if;
  if p_expires_at <= now() or p_expires_at > now()+interval '72 hours' then
    raise exception 'invalid billing reference expiry';
  end if;
  if not exists (
    select 1 from public.memberships
    where organization_id=p_organization_id
      and user_id=p_user_id
      and active=true
      and role in ('owner','admin')
  ) then
    raise exception 'owner or admin membership required';
  end if;

  delete from private.billing_checkout_refs
  where expires_at < now()-interval '1 day'
     or used_at < now()-interval '1 day';

  insert into private.billing_checkout_refs(
    token_hash,organization_id,user_id,plan,expires_at
  )
  values(
    p_token_hash,p_organization_id,p_user_id,p_plan,p_expires_at
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_oauth_state(p_state_hash text, p_organization_id uuid, p_user_id uuid, p_integration_id uuid, p_provider text, p_redirect_after text, p_expires_at timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_provider <> 'google_calendar' then
    raise exception 'unsupported oauth provider';
  end if;

  if p_expires_at <= now() or p_expires_at > now()+interval '20 minutes' then
    raise exception 'invalid oauth state expiry';
  end if;

  if not exists (
    select 1
    from public.tenant_integrations
    where id=p_integration_id
      and organization_id=p_organization_id
      and channel='calendar'
      and provider='google_calendar'
  ) then
    raise exception 'calendar integration not found';
  end if;

  delete from private.oauth_states
  where expires_at < now()-interval '1 hour'
     or used_at < now()-interval '1 hour';

  insert into private.oauth_states(
    state_hash,organization_id,user_id,integration_id,provider,redirect_after,expires_at
  )
  values(
    p_state_hash,p_organization_id,p_user_id,p_integration_id,p_provider,p_redirect_after,p_expires_at
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.enqueue_appointment_lifecycle_actions()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  enabled boolean := false;
  timing_changed boolean := false;
begin
  select coalesce(automation_enabled,false)
    into enabled
  from public.business_profiles
  where organization_id=new.organization_id;

  if not enabled then return new; end if;

  timing_changed := (
    tg_op='INSERT'
    or old.start_at is distinct from new.start_at
    or old.end_at is distinct from new.end_at
    or old.location is distinct from new.location
  );

  -- Do NOT enqueue Calendar merely because an appointment request exists.
  -- Calendar work starts only after both concrete timestamps are known.
  if new.start_at is not null and new.end_at is not null and timing_changed then
    insert into public.workflow_actions(
      organization_id,lead_id,action_type,channel,status,priority,idempotency_key,payload
    )
    values(
      new.organization_id,new.lead_id,'calendar_request','calendar','pending','high',
      'appointment:'||new.id::text||':calendar_request',
      jsonb_build_object(
        'appointment_id',new.id,'requested_text',new.requested_text,
        'start_at',new.start_at,'end_at',new.end_at,'location',new.location
      )
    )
    on conflict(idempotency_key) do update
      set status=case
            when public.workflow_actions.status='processing' then public.workflow_actions.status
            else 'pending'
          end,
          attempts=case when public.workflow_actions.status='processing' then public.workflow_actions.attempts else 0 end,
          scheduled_at=case when public.workflow_actions.status='processing' then public.workflow_actions.scheduled_at else now() end,
          last_error=case when public.workflow_actions.status='processing' then public.workflow_actions.last_error else null end,
          completed_at=case when public.workflow_actions.status='processing' then public.workflow_actions.completed_at else null end,
          payload=excluded.payload,
          updated_at=now();

    if new.status='confirmed' and tg_op='UPDATE' then
      insert into public.workflow_actions(
        organization_id,lead_id,action_type,channel,status,priority,idempotency_key,payload
      )
      values(
        new.organization_id,new.lead_id,'appointment_confirmation','auto','pending','high',
        'appointment:'||new.id::text||':confirmation',
        jsonb_build_object(
          'appointment_id',new.id,'start_at',new.start_at,'end_at',new.end_at,
          'location',new.location,'rescheduled',true
        )
      )
      on conflict(idempotency_key) do update
        set status=case
              when public.workflow_actions.status='processing' then public.workflow_actions.status
              else 'pending'
            end,
            attempts=case when public.workflow_actions.status='processing' then public.workflow_actions.attempts else 0 end,
            scheduled_at=case when public.workflow_actions.status='processing' then public.workflow_actions.scheduled_at else now() end,
            last_error=case when public.workflow_actions.status='processing' then public.workflow_actions.last_error else null end,
            completed_at=case when public.workflow_actions.status='processing' then public.workflow_actions.completed_at else null end,
            payload=excluded.payload,
            updated_at=now();
    end if;
  end if;

  if new.status='confirmed' and (tg_op='INSERT' or old.status is distinct from new.status) then
    insert into public.workflow_actions(
      organization_id,lead_id,action_type,channel,status,priority,idempotency_key,payload
    )
    values(
      new.organization_id,new.lead_id,'appointment_confirmation','auto','pending','high',
      'appointment:'||new.id::text||':confirmation',
      jsonb_build_object(
        'appointment_id',new.id,'start_at',new.start_at,'end_at',new.end_at,
        'location',new.location,'rescheduled',false
      )
    )
    on conflict(idempotency_key) do update
      set status=case
            when public.workflow_actions.status='processing' then public.workflow_actions.status
            else 'pending'
          end,
          attempts=case when public.workflow_actions.status='processing' then public.workflow_actions.attempts else 0 end,
          scheduled_at=case when public.workflow_actions.status='processing' then public.workflow_actions.scheduled_at else now() end,
          last_error=case when public.workflow_actions.status='processing' then public.workflow_actions.last_error else null end,
          completed_at=case when public.workflow_actions.status='processing' then public.workflow_actions.completed_at else null end,
          payload=excluded.payload,
          updated_at=now();
  end if;

  if new.status='cancelled'
     and (tg_op='INSERT' or old.status is distinct from new.status)
     and new.provider='google_calendar'
     and new.provider_booking_id is not null then
    insert into public.workflow_actions(
      organization_id,lead_id,action_type,channel,status,priority,idempotency_key,payload
    )
    values(
      new.organization_id,new.lead_id,'calendar_cancel','calendar','pending','high',
      'appointment:'||new.id::text||':calendar_cancel',
      jsonb_build_object('appointment_id',new.id,'provider_booking_id',new.provider_booking_id)
    )
    on conflict(idempotency_key) do nothing;
  end if;

  if new.status='completed' and (tg_op='INSERT' or old.status is distinct from new.status) then
    update public.leads
    set status='won',updated_at=now()
    where id=new.lead_id and organization_id=new.organization_id
      and status not in ('won','lost');
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.enqueue_lead_lifecycle_actions()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  enabled boolean := false;
  review_delay integer := 24;
  retention_delay integer := 30;
  status_changed boolean := false;
  contact_consent_added boolean := false;
  marketing_consent_added boolean := false;
  org_plan text := 'trial';
  org_subscription_status text := 'trialing';
  org_trial_ends_at timestamptz;
  org_is_internal boolean := false;
  pro_access boolean := false;
begin
  select
    coalesce(bp.automation_enabled,false),
    coalesce(bp.review_delay_hours,24),
    coalesce(bp.retention_delay_days,30),
    coalesce(o.plan,'trial'),
    coalesce(o.subscription_status,'trialing'),
    o.trial_ends_at,
    coalesce(o.is_internal,false)
  into
    enabled,
    review_delay,
    retention_delay,
    org_plan,
    org_subscription_status,
    org_trial_ends_at,
    org_is_internal
  from public.business_profiles bp
  join public.organizations o on o.id=bp.organization_id
  where bp.organization_id=new.organization_id;

  if not enabled then
    return new;
  end if;

  pro_access := (
    org_is_internal
    or (org_plan='trial' and org_trial_ends_at is not null and org_trial_ends_at>pg_catalog.now())
    or (
      org_plan in ('pro','business')
      and org_subscription_status in ('active','trialing')
    )
  );

  status_changed := tg_op='INSERT' or old.status is distinct from new.status;
  contact_consent_added := tg_op='INSERT'
    or (old.contact_consent_at is null and new.contact_consent_at is not null);
  marketing_consent_added := tg_op='INSERT'
    or (old.marketing_consent_at is null and new.marketing_consent_at is not null);

  if new.status='qualified' then
    if pro_access
       and new.contact_consent_at is not null
       and (status_changed or contact_consent_added) then
      insert into public.workflow_actions(
        organization_id,lead_id,action_type,channel,status,priority,idempotency_key,payload
      )
      values(
        new.organization_id,new.id,'lead_follow_up','auto','pending','high',
        'lead:'||new.id::text||':qualified_followup',
        pg_catalog.jsonb_build_object('reason','qualified','lead_score',new.score)
      )
      on conflict(idempotency_key) do nothing;
    end if;

    if status_changed then
      insert into public.workflow_actions(
        organization_id,lead_id,action_type,channel,status,priority,idempotency_key,payload
      )
      values(
        new.organization_id,new.id,'notify_owner','email','pending','high',
        'lead:'||new.id::text||':qualified_notify',
        pg_catalog.jsonb_build_object('reason','qualified','lead_score',new.score)
      )
      on conflict(idempotency_key) do nothing;
    end if;
  end if;

  if new.status='handoff' and status_changed then
    insert into public.workflow_actions(
      organization_id,lead_id,action_type,channel,status,priority,idempotency_key,payload
    )
    values(
      new.organization_id,new.id,'notify_owner','email','pending','urgent',
      'lead:'||new.id::text||':handoff_notify',
      pg_catalog.jsonb_build_object('reason','handoff','lead_score',new.score)
    )
    on conflict(idempotency_key) do nothing;
  end if;

  if new.status='won' and pro_access then
    if new.contact_consent_at is not null
       and (status_changed or contact_consent_added) then
      insert into public.workflow_actions(
        organization_id,lead_id,action_type,channel,status,priority,idempotency_key,payload,scheduled_at
      )
      values(
        new.organization_id,new.id,'review_request','auto','pending','normal',
        'lead:'||new.id::text||':review_request',
        pg_catalog.jsonb_build_object('reason','won'),
        pg_catalog.now()+pg_catalog.make_interval(hours=>review_delay)
      )
      on conflict(idempotency_key) do nothing;
    end if;

    if new.marketing_consent_at is not null
       and (status_changed or marketing_consent_added) then
      insert into public.workflow_actions(
        organization_id,lead_id,action_type,channel,status,priority,idempotency_key,payload,scheduled_at
      )
      values(
        new.organization_id,new.id,'retention_follow_up','auto','pending','normal',
        'lead:'||new.id::text||':retention_followup',
        pg_catalog.jsonb_build_object('reason','won'),
        pg_catalog.now()+pg_catalog.make_interval(days=>retention_delay)
      )
      on conflict(idempotency_key) do nothing;
    end if;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.enqueue_payment_lifecycle_actions()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  enabled boolean := false;
begin
  select coalesce(automation_enabled,false)
    into enabled
  from public.business_profiles
  where organization_id=new.organization_id;

  if not enabled then return new; end if;

  if new.status='pending'
     and new.amount_cents is not null
     and new.amount_cents > 0
     and new.payment_url is null
     and (
       tg_op='INSERT'
       or old.status is distinct from new.status
       or old.amount_cents is distinct from new.amount_cents
     ) then
    insert into public.workflow_actions(
      organization_id,lead_id,action_type,channel,status,priority,idempotency_key,payload
    )
    values(
      new.organization_id,new.lead_id,'payment_request','payment','pending','high',
      'payment:'||new.id::text||':request',
      jsonb_build_object(
        'payment_id',new.id,
        'appointment_id',new.appointment_id,
        'amount_cents',new.amount_cents,
        'currency',new.currency
      )
    )
    on conflict(idempotency_key) do nothing;
  end if;

  if new.payment_url is not null
     and (tg_op='INSERT' or old.payment_url is distinct from new.payment_url) then
    insert into public.workflow_actions(
      organization_id,lead_id,action_type,channel,status,priority,idempotency_key,payload
    )
    values(
      new.organization_id,new.lead_id,'payment_link_send','auto','pending','high',
      'payment:'||new.id::text||':link_send',
      jsonb_build_object(
        'payment_id',new.id,
        'appointment_id',new.appointment_id,
        'payment_url',new.payment_url,
        'amount_cents',new.amount_cents,
        'currency',new.currency
      )
    )
    on conflict(idempotency_key) do nothing;
  end if;

  if new.status='paid'
     and (tg_op='INSERT' or old.status is distinct from new.status) then
    insert into public.workflow_actions(
      organization_id,lead_id,action_type,channel,status,priority,idempotency_key,payload
    )
    values(
      new.organization_id,new.lead_id,'payment_received','internal','pending','high',
      'payment:'||new.id::text||':received',
      jsonb_build_object(
        'payment_id',new.id,
        'appointment_id',new.appointment_id,
        'amount_cents',new.amount_cents,
        'currency',new.currency
      )
    )
    on conflict(idempotency_key) do nothing;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.export_my_account()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
select jsonb_build_object(
 'user_id', auth.uid(),
 'organizations', coalesce((select jsonb_agg(to_jsonb(o)) from public.organizations o join public.memberships m on m.organization_id=o.id where m.user_id=auth.uid() and m.active), '[]'::jsonb),
 'memberships', coalesce((select jsonb_agg(to_jsonb(m)) from public.memberships m where m.user_id=auth.uid()), '[]'::jsonb),
 'profiles', coalesce((select jsonb_agg(to_jsonb(p)) from public.business_profiles p join public.memberships m on m.organization_id=p.organization_id where m.user_id=auth.uid() and m.active), '[]'::jsonb),
 'leads', coalesce((select jsonb_agg(to_jsonb(l)) from public.leads l join public.memberships m on m.organization_id=l.organization_id where m.user_id=auth.uid() and m.active), '[]'::jsonb),
 'conversations', coalesce((select jsonb_agg(to_jsonb(c)) from public.conversations c join public.memberships m on m.organization_id=c.organization_id where m.user_id=auth.uid() and m.active), '[]'::jsonb),
 'messages', coalesce((select jsonb_agg(to_jsonb(msg)) from public.messages msg join public.memberships m on m.organization_id=msg.organization_id where m.user_id=auth.uid() and m.active), '[]'::jsonb),
 'tasks', coalesce((select jsonb_agg(to_jsonb(t)) from public.tasks t join public.memberships m on m.organization_id=t.organization_id where m.user_id=auth.uid() and m.active), '[]'::jsonb),
 'handoffs', coalesce((select jsonb_agg(to_jsonb(h)) from public.handoffs h join public.memberships m on m.organization_id=h.organization_id where m.user_id=auth.uid() and m.active), '[]'::jsonb),
 'audit_events', coalesce((select jsonb_agg(to_jsonb(a)) from public.audit_events a join public.memberships m on m.organization_id=a.organization_id where m.user_id=auth.uid() and m.active), '[]'::jsonb)
);
$function$;

CREATE OR REPLACE FUNCTION public.finish_workflow_action(p_action_id uuid, p_outcome text, p_provider text DEFAULT NULL::text, p_provider_reference text DEFAULT NULL::text, p_http_status integer DEFAULT NULL::integer, p_error_code text DEFAULT NULL::text, p_error_message text DEFAULT NULL::text, p_response_meta jsonb DEFAULT '{}'::jsonb, p_retry_after_seconds integer DEFAULT NULL::integer)
 RETURNS workflow_actions
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v public.workflow_actions;
  v_attempt integer;
begin
  select * into v
  from public.workflow_actions
  where id=p_action_id
  for update;

  if not found then
    raise exception 'workflow action not found';
  end if;

  v_attempt := v.attempts + 1;

  insert into public.workflow_action_attempts(
    workflow_action_id,organization_id,attempt_no,provider,outcome,http_status,
    provider_reference,error_code,error_message,response_meta
  )
  values(
    v.id,v.organization_id,v_attempt,p_provider,p_outcome,p_http_status,
    p_provider_reference,p_error_code,left(p_error_message,2000),coalesce(p_response_meta,'{}'::jsonb)
  );

  if p_outcome='completed' then
    update public.workflow_actions
    set status='completed',attempts=v_attempt,provider=p_provider,
        provider_reference=p_provider_reference,last_error=null,
        completed_at=now(),locked_at=null,locked_by=null,updated_at=now()
    where id=v.id returning * into v;
  elsif p_outcome='blocked' then
    update public.workflow_actions
    set status='blocked',attempts=v_attempt,provider=p_provider,
        last_error=left(coalesce(p_error_message,p_error_code,'Blocked'),2000),
        locked_at=null,locked_by=null,updated_at=now()
    where id=v.id returning * into v;
  elsif p_outcome='retry' and v_attempt < v.max_attempts then
    update public.workflow_actions
    set status='pending',attempts=v_attempt,provider=p_provider,
        last_error=left(coalesce(p_error_message,p_error_code,'Retry scheduled'),2000),
        scheduled_at=now()+make_interval(secs=>greatest(30,coalesce(p_retry_after_seconds,300))),
        locked_at=null,locked_by=null,updated_at=now()
    where id=v.id returning * into v;
  else
    update public.workflow_actions
    set status='failed',attempts=v_attempt,provider=p_provider,
        last_error=left(coalesce(p_error_message,p_error_code,'Failed'),2000),
        locked_at=null,locked_by=null,updated_at=now()
    where id=v.id returning * into v;
  end if;

  return v;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_integration_credential(p_integration_id uuid, p_organization_id uuid)
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select ds.decrypted_secret
  from private.integration_credentials c
  join vault.decrypted_secrets ds on ds.name=c.vault_secret_name
  where c.integration_id=p_integration_id
    and c.organization_id=p_organization_id
  limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.get_platform_secret(p_name text)
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select decrypted_secret
  from vault.decrypted_secrets
  where name=p_name
    and p_name in (
      'reception_ai_google_client_id',
      'reception_ai_google_client_secret',
      'reception_ai_app_url'
    )
  limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.is_org_admin(org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select exists(
    select 1
    from public.memberships m
    where m.organization_id=org_id
      and m.user_id=(select auth.uid())
      and m.active=true
      and m.role in ('owner','admin')
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_org_member(org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.memberships m where m.organization_id=org_id and m.user_id=(select auth.uid()) and m.active=true)
$function$;

CREATE OR REPLACE FUNCTION public.is_org_operator(org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.memberships m
    where m.organization_id = org_id
      and m.user_id = (select auth.uid())
      and m.active = true
      and m.role in ('owner','admin','agent')
  );
$function$;

CREATE OR REPLACE FUNCTION public.mark_customer_payment_paid(p_organization_id uuid, p_payment_id uuid, p_provider_payment_id text, p_paid_at timestamp with time zone)
 RETURNS customer_payments
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v public.customer_payments;
begin
  select * into v
  from public.customer_payments
  where id=p_payment_id and organization_id=p_organization_id
  for update;

  if not found then
    raise exception 'payment not found';
  end if;

  if v.status='paid' then
    return v;
  end if;

  update public.customer_payments
  set status='paid',
      provider='stripe',
      provider_payment_id=coalesce(p_provider_payment_id,provider_payment_id),
      paid_at=coalesce(p_paid_at,now()),
      updated_at=now()
  where id=p_payment_id and organization_id=p_organization_id
  returning * into v;

  return v;
end;
$function$;

CREATE OR REPLACE FUNCTION public.normalize_lost_reason()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.status='lost' then
    if new.lost_reason_code is null then
      new.lost_reason_code := case
        when lower(coalesce(new.outcome_reason,'')) ~ '(prijs|budget|te duur|kost)' then 'price_budget'
        when lower(coalesce(new.outcome_reason,'')) ~ '(geen reactie|geen antwoord|antwoord niet|no response|niet bereikbaar)' then 'no_response'
        when lower(coalesce(new.outcome_reason,'')) ~ '(timing|later|niet nu|uitgesteld|wachten)' then 'timing'
        when lower(coalesce(new.outcome_reason,'')) ~ '(concurrent|ander bedrijf|andere leverancier)' then 'competitor'
        when lower(coalesce(new.outcome_reason,'')) ~ '(geen match|past niet|niet geschikt|buiten scope|geen fit)' then 'no_fit'
        when lower(coalesce(new.outcome_reason,'')) ~ '(beschikbaar|beschikbaarheid|planning|agenda|geen plaats)' then 'availability'
        when lower(coalesce(new.outcome_reason,'')) ~ '(geen interesse|niet geïnteresseerd|afgehaakt|wil niet)' then 'not_interested'
        when lower(coalesce(new.outcome_reason,'')) ~ '(dubbel|duplicate|spam|test|ongeldig)' then 'invalid_duplicate'
        else 'other'
      end;
    end if;
  else
    new.lost_reason_code := null;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_tenant_activation_event(p_organization_id uuid, p_event_type text, p_source_entity_type text DEFAULT NULL::text, p_source_entity_id uuid DEFAULT NULL::uuid, p_happened_at timestamp with time zone DEFAULT now(), p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_event_type not in (
    'first_public_conversation',
    'first_lead',
    'first_qualified_lead',
    'first_handoff',
    'first_appointment_request',
    'first_confirmed_appointment',
    'first_completed_appointment',
    'first_customer_payment'
  ) then
    raise exception 'invalid_activation_event';
  end if;

  insert into public.tenant_activation_events(
    organization_id,event_type,source_entity_type,source_entity_id,happened_at,metadata
  )
  values(
    p_organization_id,p_event_type,p_source_entity_type,p_source_entity_id,
    coalesce(p_happened_at,now()),coalesce(p_metadata,'{}'::jsonb)
  )
  on conflict (organization_id,event_type) do nothing;
end;
$function$;

CREATE OR REPLACE FUNCTION public.remove_integration_credential(p_integration_id uuid, p_organization_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_name text;
begin
  select vault_secret_name into v_name
  from private.integration_credentials
  where integration_id=p_integration_id and organization_id=p_organization_id;

  if v_name is not null then
    delete from vault.secrets where name=v_name;
    delete from private.integration_credentials
    where integration_id=p_integration_id and organization_id=p_organization_id;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.requeue_integration_actions()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.status='active' and (tg_op='INSERT' or old.status is distinct from new.status) then
    update public.workflow_actions
    set status='pending',scheduled_at=now(),last_error=null,updated_at=now()
    where organization_id=new.organization_id
      and status='blocked'
      and (
        channel=new.channel
        or (channel='auto' and new.channel in ('email','whatsapp'))
      )
      and (
        last_error ilike '%integration%'
        or last_error ilike '%provider%'
        or last_error ilike '%credential%'
        or last_error ilike '%authorization%'
        or last_error ilike '%oauth%'
      );
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_integration_credential(p_integration_id uuid, p_organization_id uuid, p_secret text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_name text;
  v_id uuid;
begin
  if p_secret is null or length(trim(p_secret)) < 8 then
    raise exception 'credential too short';
  end if;

  if not exists (
    select 1
    from public.tenant_integrations
    where id=p_integration_id and organization_id=p_organization_id
  ) then
    raise exception 'integration not found for organization';
  end if;

  select vault_secret_name into v_name
  from private.integration_credentials
  where integration_id=p_integration_id and organization_id=p_organization_id;

  if v_name is null then
    v_name := 'reception_ai_int_' || replace(p_integration_id::text,'-','');
    select vault.create_secret(
      p_secret,
      v_name,
      'Tenant provider credential for integration ' || p_integration_id::text
    ) into v_id;

    insert into private.integration_credentials(integration_id,organization_id,vault_secret_name)
    values(p_integration_id,p_organization_id,v_name);
  else
    select id into v_id from vault.decrypted_secrets where name=v_name limit 1;
    if v_id is null then
      perform vault.create_secret(
        p_secret,
        v_name,
        'Tenant provider credential for integration ' || p_integration_id::text
      );
    else
      perform vault.update_secret(
        v_id,
        p_secret,
        v_name,
        'Tenant provider credential for integration ' || p_integration_id::text
      );
    end if;

    update private.integration_credentials
    set updated_at=now()
    where integration_id=p_integration_id and organization_id=p_organization_id;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_platform_secret(p_name text, p_value text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
begin
  if p_name not in (
    'reception_ai_google_client_id',
    'reception_ai_google_client_secret',
    'reception_ai_app_url'
  ) then
    raise exception 'platform secret name not allowed';
  end if;

  if p_value is null or btrim(p_value) = '' then
    raise exception 'platform secret value required';
  end if;

  select id into v_id
  from vault.secrets
  where name = p_name
  limit 1;

  if v_id is null then
    perform vault.create_secret(p_value, p_name, 'Reception AI platform configuration');
  else
    perform vault.update_secret(v_id, p_value, p_name, 'Reception AI platform configuration');
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.stamp_lead_outcome()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.status='won' and old.status is distinct from 'won' then
    new.won_at=coalesce(new.won_at,now());
    new.lost_at=null;
  elsif new.status='lost' and old.status is distinct from 'lost' then
    new.lost_at=coalesce(new.lost_at,now());
    new.won_at=null;
  elsif new.status not in ('won','lost') and old.status is distinct from new.status then
    new.won_at=null;
    new.lost_at=null;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.validate_workflow_runner_token(p_token text)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(
    exists(
      select 1
      from vault.decrypted_secrets
      where name='reception_ai_workflow_runner_token'
        and decrypted_secret=p_token
    ),false
  );
$function$;

reset check_function_bodies;

-- Restore triggers after trigger functions exist.

CREATE TRIGGER trg_appointment_lifecycle_actions AFTER INSERT OR UPDATE OF status, start_at, end_at, location ON appointments FOR EACH ROW EXECUTE FUNCTION enqueue_appointment_lifecycle_actions();

CREATE TRIGGER trg_appointments_touch BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER trg_capture_appointment_activation_insert AFTER INSERT ON appointments FOR EACH ROW EXECUTE FUNCTION capture_appointment_activation();

CREATE TRIGGER trg_capture_appointment_activation_update AFTER UPDATE OF status ON appointments FOR EACH ROW WHEN (new.status IS DISTINCT FROM old.status AND (new.status = ANY (ARRAY['confirmed'::text, 'completed'::text]))) EXECUTE FUNCTION capture_appointment_activation();

CREATE TRIGGER trg_refresh_onboarding_status AFTER INSERT OR UPDATE ON business_profiles FOR EACH ROW EXECUTE FUNCTION private.refresh_onboarding_status();

CREATE TRIGGER trg_capture_conversation_activation AFTER INSERT ON conversations FOR EACH ROW EXECUTE FUNCTION capture_conversation_activation();

CREATE TRIGGER trg_capture_payment_activation_insert AFTER INSERT ON customer_payments FOR EACH ROW WHEN (new.status = 'paid'::text) EXECUTE FUNCTION capture_payment_activation();

CREATE TRIGGER trg_capture_payment_activation_update AFTER UPDATE OF status ON customer_payments FOR EACH ROW WHEN (new.status = 'paid'::text AND old.status IS DISTINCT FROM 'paid'::text) EXECUTE FUNCTION capture_payment_activation();

CREATE TRIGGER trg_convert_lead_when_payment_paid AFTER UPDATE OF status ON customer_payments FOR EACH ROW EXECUTE FUNCTION convert_lead_when_payment_paid();

CREATE TRIGGER trg_customer_payments_touch BEFORE UPDATE ON customer_payments FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER trg_payment_lifecycle_actions AFTER INSERT OR UPDATE OF status, amount_cents, payment_url ON customer_payments FOR EACH ROW EXECUTE FUNCTION enqueue_payment_lifecycle_actions();

CREATE TRIGGER trg_capture_handoff_activation AFTER INSERT ON handoffs FOR EACH ROW EXECUTE FUNCTION capture_handoff_activation();

CREATE TRIGGER jarvis_agent_audit AFTER INSERT OR UPDATE ON jarvis_agent_tasks FOR EACH ROW EXECUTE FUNCTION jarvis_private.log_task_transition();

CREATE TRIGGER trg_capture_lead_activation_insert AFTER INSERT ON leads FOR EACH ROW EXECUTE FUNCTION capture_lead_activation();

CREATE TRIGGER trg_capture_lead_activation_update AFTER UPDATE OF score, status ON leads FOR EACH ROW WHEN (new.score IS DISTINCT FROM old.score AND new.score >= 60 OR new.status IS DISTINCT FROM old.status AND (new.status = ANY (ARRAY['qualified'::text, 'follow_up'::text, 'handoff'::text, 'won'::text]))) EXECUTE FUNCTION capture_lead_activation();

CREATE TRIGGER trg_close_sales_followup_on_lead_outcome AFTER UPDATE OF status ON leads FOR EACH ROW EXECUTE FUNCTION close_sales_followup_on_lead_outcome();

CREATE TRIGGER trg_lead_lifecycle_actions AFTER INSERT OR UPDATE OF status, contact_consent_at, marketing_consent_at ON leads FOR EACH ROW EXECUTE FUNCTION enqueue_lead_lifecycle_actions();

CREATE TRIGGER trg_normalize_lost_reason BEFORE INSERT OR UPDATE OF status, outcome_reason, lost_reason_code ON leads FOR EACH ROW EXECUTE FUNCTION normalize_lost_reason();

CREATE TRIGGER trg_reception_ai_central_sync_v2 AFTER UPDATE OF name, email, phone, status, score, summary, qualification, contact_consent_at ON leads FOR EACH ROW EXECUTE FUNCTION private.reception_ai_sync_central_v2();

CREATE TRIGGER trg_stamp_lead_outcome BEFORE UPDATE OF status ON leads FOR EACH ROW EXECUTE FUNCTION stamp_lead_outcome();

CREATE TRIGGER trg_seed_default_integrations AFTER INSERT ON organizations FOR EACH ROW EXECUTE FUNCTION private.seed_default_integrations();

CREATE TRIGGER trg_requeue_integration_actions AFTER INSERT OR UPDATE OF status ON tenant_integrations FOR EACH ROW EXECUTE FUNCTION requeue_integration_actions();

CREATE TRIGGER trg_tenant_integrations_touch BEFORE UPDATE ON tenant_integrations FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER trg_cleanup_widget_rate_limits AFTER INSERT ON widget_rate_limits FOR EACH STATEMENT EXECUTE FUNCTION cleanup_widget_rate_limits();

CREATE TRIGGER trg_workflow_actions_touch BEFORE UPDATE ON workflow_actions FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Sequence ownership.

alter sequence public."audit_events_id_seq" owned by public."audit_events".id;

alter sequence public."jarvis_agent_events_id_seq" owned by public."jarvis_agent_events".id;

alter sequence public."widget_rate_limits_id_seq" owned by public."widget_rate_limits".id;

-- Table privileges from the production schema ACL (no data or credentials).

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "private"."billing_checkout_refs" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "private"."integration_credentials" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "private"."oauth_states" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."ai_usage_daily" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."ai_usage_daily" to "service_role";

grant SELECT on table "public"."appointments" to "authenticated";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."appointments" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."appointments" to "service_role";

grant SELECT on table "public"."audit_events" to "authenticated";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."audit_events" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."audit_events" to "service_role";

grant SELECT, UPDATE on table "public"."business_profiles" to "authenticated";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."business_profiles" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."business_profiles" to "service_role";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."commercial_learning_snapshots" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."commercial_learning_snapshots" to "service_role";

grant SELECT on table "public"."conversations" to "authenticated";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."conversations" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."conversations" to "service_role";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."creator_hub_assets" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."creator_hub_assets" to "service_role";

grant SELECT on table "public"."customer_payments" to "authenticated";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."customer_payments" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."customer_payments" to "service_role";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."google_calendar_dispatch_queue" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."google_calendar_dispatch_queue" to "service_role";

grant SELECT, UPDATE on table "public"."handoffs" to "authenticated";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."handoffs" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."handoffs" to "service_role";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."izap_dispatch_queue" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."izap_dispatch_queue" to "service_role";

grant SELECT on table "public"."jarvis_agent_events" to "authenticated";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."jarvis_agent_events" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."jarvis_agent_events" to "service_role";

grant INSERT, SELECT on table "public"."jarvis_agent_tasks" to "authenticated";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."jarvis_agent_tasks" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."jarvis_agent_tasks" to "service_role";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."lead_agent_configs" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."lead_agent_configs" to "service_role";

grant DELETE, INSERT, SELECT, UPDATE on table "public"."leadflow_leads" to "authenticated";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."leadflow_leads" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."leadflow_leads" to "service_role";

grant SELECT, UPDATE on table "public"."leads" to "authenticated";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."leads" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."leads" to "service_role";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."marketing_agent_configs" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."marketing_agent_configs" to "service_role";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."marketing_campaigns" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."marketing_campaigns" to "service_role";

grant SELECT on table "public"."memberships" to "authenticated";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."memberships" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."memberships" to "service_role";

grant SELECT on table "public"."messages" to "authenticated";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."messages" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."messages" to "service_role";

grant SELECT on table "public"."organizations" to "authenticated";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."organizations" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."organizations" to "service_role";

grant SELECT on table "public"."platform_admins" to "authenticated";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."platform_admins" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."platform_admins" to "service_role";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."reception_ai_plan_catalog" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."reception_ai_plan_catalog" to "service_role";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."sales_agent_configs" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."sales_agent_configs" to "service_role";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."sales_onboarding_invites" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."sales_onboarding_invites" to "service_role";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."sales_opportunities" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."sales_opportunities" to "service_role";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."sales_sequence_steps" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."sales_sequence_steps" to "service_role";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."sales_sequences" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."sales_sequences" to "service_role";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."stripe_events" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."stripe_events" to "service_role";

grant SELECT, UPDATE on table "public"."tasks" to "authenticated";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."tasks" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."tasks" to "service_role";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."team_invitations" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."team_invitations" to "service_role";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."tenant_activation_events" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."tenant_activation_events" to "service_role";

grant SELECT on table "public"."tenant_integrations" to "authenticated";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."tenant_integrations" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."tenant_integrations" to "service_role";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."user_org_context" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."user_org_context" to "service_role";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."widget_rate_limits" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."widget_rate_limits" to "service_role";

grant SELECT on table "public"."workflow_action_attempts" to "authenticated";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."workflow_action_attempts" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."workflow_action_attempts" to "service_role";

grant SELECT on table "public"."workflow_actions" to "authenticated";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."workflow_actions" to "postgres";

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table "public"."workflow_actions" to "service_role";

grant usage on schema public to anon, authenticated, service_role;

grant usage on schema private to service_role;

grant usage, select on all sequences in schema public to anon, authenticated, service_role;

-- Local only: no external production credentials are copied.
