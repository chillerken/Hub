-- Read-only production code snapshot, 2026-10-12. TEST FIXTURE ONLY.
-- No customer data/secrets. net.http_post below captures SQL rows and never sends.
CREATE TABLE public.workflow_actions (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"organization_id" uuid NOT NULL,
"lead_id" uuid,
"action_type" text NOT NULL,
"channel" text DEFAULT 'internal'::text NOT NULL,
"status" text DEFAULT 'pending'::text NOT NULL,
"priority" text DEFAULT 'normal'::text NOT NULL,
"idempotency_key" text NOT NULL,
"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
"scheduled_at" timestamp with time zone DEFAULT now() NOT NULL,
"attempts" integer DEFAULT 0 NOT NULL,
"provider" text,
"provider_reference" text,
"last_error" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"completed_at" timestamp with time zone,
"locked_at" timestamp with time zone,
"locked_by" text,
"max_attempts" integer DEFAULT 5 NOT NULL
);
ALTER TABLE public.workflow_actions ADD CONSTRAINT "workflow_actions_idempotency_key_key" UNIQUE (idempotency_key);
ALTER TABLE public.workflow_actions ADD CONSTRAINT "workflow_actions_pkey" PRIMARY KEY (id);
CREATE TABLE public.tenant_activation_events (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"organization_id" uuid NOT NULL,
"event_type" text NOT NULL,
"source_entity_type" text,
"source_entity_id" uuid,
"happened_at" timestamp with time zone DEFAULT now() NOT NULL,
"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.tenant_activation_events ADD CONSTRAINT "tenant_activation_events_event_type_check" CHECK ((event_type = ANY (ARRAY['first_public_conversation'::text, 'first_lead'::text, 'first_qualified_lead'::text, 'first_handoff'::text, 'first_appointment_request'::text, 'first_confirmed_appointment'::text, 'first_completed_appointment'::text, 'first_customer_payment'::text])));
ALTER TABLE public.tenant_activation_events ADD CONSTRAINT "tenant_activation_events_organization_id_event_type_key" UNIQUE (organization_id, event_type);
ALTER TABLE public.tenant_activation_events ADD CONSTRAINT "tenant_activation_events_pkey" PRIMARY KEY (id);

ALTER TABLE public.leads ADD COLUMN source text NOT NULL DEFAULT 'manual', ADD COLUMN score integer NOT NULL DEFAULT 0, ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(), ADD COLUMN contact_consent_at timestamptz, ADD COLUMN marketing_consent_at timestamptz, ADD COLUMN won_at timestamptz, ADD COLUMN lost_at timestamptz, ADD COLUMN outcome_reason text, ADD COLUMN lost_reason_code text, ADD COLUMN name text DEFAULT '', ADD COLUMN email text, ADD COLUMN phone text, ADD COLUMN summary text DEFAULT '', ADD COLUMN qualification jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.appointments ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(), ADD COLUMN timezone text DEFAULT 'Europe/Brussels', ADD COLUMN requested_text text, ADD COLUMN location text, ADD COLUMN provider text, ADD COLUMN provider_booking_id text;
ALTER TABLE public.customer_payments ADD COLUMN payment_url text, ADD COLUMN paid_at timestamptz;
CREATE TABLE public.organizations(id uuid PRIMARY KEY,plan text DEFAULT 'trial',subscription_status text DEFAULT 'trialing',trial_ends_at timestamptz,is_internal boolean DEFAULT false);
CREATE TABLE public.business_profiles(organization_id uuid PRIMARY KEY,automation_enabled boolean DEFAULT false,review_delay_hours int DEFAULT 24,retention_delay_days int DEFAULT 30);
CREATE TABLE public.sales_sequences(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,lead_id uuid,status text,updated_at timestamptz DEFAULT now());
CREATE TABLE public.sales_sequence_steps(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,lead_id uuid,status text,updated_at timestamptz DEFAULT now());
CREATE TABLE public.conversations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,lead_id uuid,created_at timestamptz DEFAULT now());
CREATE SCHEMA private;
CREATE SCHEMA vault;
CREATE TABLE vault.decrypted_secrets(name text,decrypted_secret text);
CREATE SCHEMA net;
CREATE TABLE net.fixture_requests(id bigint GENERATED ALWAYS AS IDENTITY,url text,body jsonb,headers jsonb);
CREATE FUNCTION net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds int) RETURNS bigint LANGUAGE sql AS $stub$
 INSERT INTO net.fixture_requests(url,body,headers) VALUES(url,body,headers) RETURNING id;
$stub$;
GRANT SELECT ON public.organizations,public.business_profiles TO service_role;
GRANT SELECT,INSERT,UPDATE ON public.workflow_actions TO service_role;
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
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
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
$function$
;
CREATE TRIGGER trg_appointment_lifecycle_actions AFTER INSERT OR UPDATE OF status, start_at, end_at, location ON public.appointments FOR EACH ROW EXECUTE FUNCTION enqueue_appointment_lifecycle_actions();
CREATE TRIGGER trg_appointments_touch BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_capture_appointment_activation_insert AFTER INSERT ON public.appointments FOR EACH ROW EXECUTE FUNCTION capture_appointment_activation();
CREATE TRIGGER trg_capture_appointment_activation_update AFTER UPDATE OF status ON public.appointments FOR EACH ROW WHEN (((new.status IS DISTINCT FROM old.status) AND (new.status = ANY (ARRAY['confirmed'::text, 'completed'::text])))) EXECUTE FUNCTION capture_appointment_activation();
CREATE TRIGGER trg_capture_payment_activation_insert AFTER INSERT ON public.customer_payments FOR EACH ROW WHEN ((new.status = 'paid'::text)) EXECUTE FUNCTION capture_payment_activation();
CREATE TRIGGER trg_capture_payment_activation_update AFTER UPDATE OF status ON public.customer_payments FOR EACH ROW WHEN (((new.status = 'paid'::text) AND (old.status IS DISTINCT FROM 'paid'::text))) EXECUTE FUNCTION capture_payment_activation();
CREATE TRIGGER trg_convert_lead_when_payment_paid AFTER UPDATE OF status ON public.customer_payments FOR EACH ROW EXECUTE FUNCTION convert_lead_when_payment_paid();
CREATE TRIGGER trg_customer_payments_touch BEFORE UPDATE ON public.customer_payments FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_payment_lifecycle_actions AFTER INSERT OR UPDATE OF status, amount_cents, payment_url ON public.customer_payments FOR EACH ROW EXECUTE FUNCTION enqueue_payment_lifecycle_actions();
CREATE TRIGGER trg_capture_lead_activation_insert AFTER INSERT ON public.leads FOR EACH ROW EXECUTE FUNCTION capture_lead_activation();
CREATE TRIGGER trg_capture_lead_activation_update AFTER UPDATE OF score, status ON public.leads FOR EACH ROW WHEN ((((new.score IS DISTINCT FROM old.score) AND (new.score >= 60)) OR ((new.status IS DISTINCT FROM old.status) AND (new.status = ANY (ARRAY['qualified'::text, 'follow_up'::text, 'handoff'::text, 'won'::text]))))) EXECUTE FUNCTION capture_lead_activation();
CREATE TRIGGER trg_close_sales_followup_on_lead_outcome AFTER UPDATE OF status ON public.leads FOR EACH ROW EXECUTE FUNCTION close_sales_followup_on_lead_outcome();
CREATE TRIGGER trg_lead_lifecycle_actions AFTER INSERT OR UPDATE OF status, contact_consent_at, marketing_consent_at ON public.leads FOR EACH ROW EXECUTE FUNCTION enqueue_lead_lifecycle_actions();
CREATE TRIGGER trg_normalize_lost_reason BEFORE INSERT OR UPDATE OF status, outcome_reason, lost_reason_code ON public.leads FOR EACH ROW EXECUTE FUNCTION normalize_lost_reason();
CREATE TRIGGER trg_reception_ai_central_sync_v2 AFTER UPDATE OF name, email, phone, status, score, summary, qualification, contact_consent_at ON public.leads FOR EACH ROW EXECUTE FUNCTION private.reception_ai_sync_central_v2();
CREATE TRIGGER trg_stamp_lead_outcome BEFORE UPDATE OF status ON public.leads FOR EACH ROW EXECUTE FUNCTION stamp_lead_outcome();
