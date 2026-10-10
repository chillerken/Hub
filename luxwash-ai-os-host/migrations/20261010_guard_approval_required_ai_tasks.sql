-- LuxWash production hotfix (non-sending). Changes task classification only.
-- This function must NEVER consume tasks requiring human approval or a
-- verified provider delivery receipt. Does not write to external providers.
-- Rollback: reapply the exact prior function definition from Git history.

CREATE OR REPLACE FUNCTION public.luxwash_process_next_ai_task()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  t record;
  v_result jsonb;
begin
  select *
    into t
  from public.luxwash_ai_tasks
  where status = 'pending'
    -- Only currently supported internal WhatsApp classification types.
    -- Warm-lead follow-ups, reconciliations and other unknown work are
    -- NOT completed as a side effect of classification.
    and task_type in (
      'WHATSAPP_BOOKING_REQUEST',
      'WHATSAPP_PRICE_REQUEST',
      'WHATSAPP_COMPLAINT',
      'WHATSAPP_CHANGE_OR_CANCEL',
      'WHATSAPP_FLEET_CARE'
    )
    and (scheduled_for is null or scheduled_for <= now())
    and coalesce((payload->>'requires_approval')::boolean, false) = false
    and coalesce((payload->>'manual_review_only')::boolean, false) = false
    and coalesce((payload->>'auto_execute')::boolean, true) = true
  order by priority asc, scheduled_for nulls first, created_at asc
  for update skip locked
  limit 1;

  if not found then
    return jsonb_build_object('ok', true, 'processed', false, 'reason', 'no_executable_pending_tasks');
  end if;

  update public.luxwash_ai_tasks
  set status = 'processing', updated_at = now()
  where id = t.id;

  if t.task_type = 'WHATSAPP_BOOKING_REQUEST' then
    v_result := jsonb_build_object('action','booking_request','next_step','human_confirmation_or_calendar_validation_required');
  elsif t.task_type = 'WHATSAPP_PRICE_REQUEST' then
    v_result := jsonb_build_object('action','price_request','next_step','fetch_current_luxwash_prices');
  elsif t.task_type = 'WHATSAPP_COMPLAINT' then
    v_result := jsonb_build_object('action','human_handoff','next_step','manual_follow_up_required');
  elsif t.task_type = 'WHATSAPP_CHANGE_OR_CANCEL' then
    v_result := jsonb_build_object('action','appointment_change','next_step','appointment_validation_required');
  elsif t.task_type = 'WHATSAPP_FLEET_CARE' then
    v_result := jsonb_build_object('action','fleet_care','next_step','b2b_follow_up');
  end if;

  -- 'completed' here means internal classification, NOT customer contact.
  update public.luxwash_ai_tasks
  set status = 'completed', result = v_result, completed_at = now(), updated_at = now()
  where id = t.id;

  return jsonb_build_object('ok', true, 'processed', true, 'task_id', t.id,
                            'task_type', t.task_type, 'result', v_result);
exception
  when others then
    if t.id is not null then
      update public.luxwash_ai_tasks
      set status = 'failed', error_message = sqlerrm, updated_at = now()
      where id = t.id;
    end if;
    return jsonb_build_object('ok', false, 'processed', true, 'error', sqlerrm);
end;
$function$;

-- Fail closed even if a fresh DB has default PUBLIC EXECUTE grants.
REVOKE ALL ON FUNCTION public.luxwash_process_next_ai_task() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.luxwash_process_next_ai_task() TO service_role;
