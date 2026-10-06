-- Enforce Reception AI commercial plan boundaries at workflow generation.
-- Production-verified on 2026-10-07.
-- Starter: receptionist/chat/CRM + owner notifications.
-- Pro/Business + active trial/internal demo: lead follow-up, review and retention workflows.

create or replace function public.enqueue_lead_lifecycle_actions()
returns trigger
language plpgsql
set search_path to ''
as $function$
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
