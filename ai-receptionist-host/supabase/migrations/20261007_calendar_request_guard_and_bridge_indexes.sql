-- Reception AI calendar-request guard + bridge queue indexes.
-- Mirrors production project ndecxbsrxspkuxjsbndq after /fixall verification on 2026-10-07.
-- Idempotent: safe to replay.

create index if not exists google_calendar_dispatch_queue_organization_idx
  on public.google_calendar_dispatch_queue(organization_id);

create index if not exists google_calendar_dispatch_queue_appointment_idx
  on public.google_calendar_dispatch_queue(appointment_id);

create index if not exists izap_dispatch_queue_organization_idx
  on public.izap_dispatch_queue(organization_id);

create index if not exists izap_dispatch_queue_lead_idx
  on public.izap_dispatch_queue(lead_id);

create or replace function public.enqueue_appointment_lifecycle_actions()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
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

  -- Do not enqueue Calendar merely because an appointment request exists.
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
