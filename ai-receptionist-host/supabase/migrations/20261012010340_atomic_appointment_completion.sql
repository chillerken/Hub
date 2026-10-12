-- Review only. Apply solely to a disposable database until release approval.
-- Serialize payment writes with completion without preventing the existing
-- intentional creation of invoices after a completed appointment.
CREATE OR REPLACE FUNCTION public.lock_payment_appointment()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE
  old_id uuid;
  appt public.appointments%ROWTYPE;
BEGIN
  IF TG_OP='UPDATE' THEN old_id:=OLD.appointment_id; END IF;
  -- Stable ordering for re-linking; NO KEY UPDATE remains compatible with FK
  -- KEY SHARE locks but conflicts with completion and other payment writes.
  PERFORM a.id FROM public.appointments a
    WHERE a.id=NEW.appointment_id OR a.id=old_id
    ORDER BY a.id FOR NO KEY UPDATE;
  IF NEW.appointment_id IS NOT NULL THEN
    SELECT * INTO appt FROM public.appointments WHERE id=NEW.appointment_id;
    IF NOT FOUND OR appt.organization_id IS DISTINCT FROM NEW.organization_id
       OR appt.lead_id IS DISTINCT FROM NEW.lead_id THEN
      RAISE EXCEPTION 'payment_appointment_mismatch';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.lock_payment_appointment() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_lock_payment_appointment ON public.customer_payments;
CREATE TRIGGER trg_lock_payment_appointment
  BEFORE INSERT OR UPDATE ON public.customer_payments
  FOR EACH ROW EXECUTE FUNCTION public.lock_payment_appointment();

CREATE OR REPLACE FUNCTION public.complete_reception_appointment(
  p_organization_id uuid,p_appointment_id uuid,p_actor_user_id uuid,
  p_expected_updated_at timestamptz,p_expected_start_at timestamptz,
  p_expected_end_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE
  appt public.appointments%ROWTYPE;
  unpaid public.customer_payments%ROWTYPE;
  won_lead uuid;
BEGIN
  -- The post-lock payment lookup must see transactions that committed while
  -- waiting for the appointment lock. Fail closed for older snapshot levels.
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'unsupported_transaction_isolation';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.memberships
    WHERE organization_id=p_organization_id AND user_id=p_actor_user_id
      AND active AND role IN ('owner','admin')) THEN
    RAISE EXCEPTION 'operator_not_authorized';
  END IF;
  SELECT * INTO appt FROM public.appointments
    WHERE id=p_appointment_id AND organization_id=p_organization_id
    FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'appointment_not_found'; END IF;
  IF appt.status<>'confirmed'
     OR appt.updated_at IS DISTINCT FROM p_expected_updated_at
     OR appt.start_at IS DISTINCT FROM p_expected_start_at
     OR appt.end_at IS DISTINCT FROM p_expected_end_at THEN
    RAISE EXCEPTION 'appointment_changed';
  END IF;
  SELECT * INTO unpaid FROM public.customer_payments
    WHERE organization_id=p_organization_id AND appointment_id=p_appointment_id
      AND status<>'paid' ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok',false,'code','payment_required_before_completion',
      'payment_id',unpaid.id,'payment_status',unpaid.status);
  END IF;
  UPDATE public.appointments SET status='completed',completed_at=now(),updated_at=now()
    WHERE id=appt.id AND organization_id=p_organization_id RETURNING * INTO appt;
  -- Preserve live v5 behavior even when automation is disabled. Any trigger,
  -- lead or audit error rolls back this entire statement, including its queues.
  UPDATE public.leads SET status='won',updated_at=now()
    WHERE id=appt.lead_id AND organization_id=p_organization_id AND status<>'won'
    RETURNING id INTO won_lead;
  IF won_lead IS NOT NULL THEN
    INSERT INTO public.audit_events(organization_id,actor_user_id,event_type,entity_type,entity_id,payload)
    VALUES(p_organization_id,p_actor_user_id,'lead.won_from_completed_appointment','lead',appt.lead_id,
      jsonb_build_object('appointment_id',appt.id));
  END IF;
  INSERT INTO public.audit_events(organization_id,actor_user_id,event_type,entity_type,entity_id,payload)
  VALUES(p_organization_id,p_actor_user_id,'appointment.completed','appointment',appt.id,
    jsonb_build_object('completed_at',appt.completed_at));
  RETURN jsonb_build_object('ok',true,'appointment',to_jsonb(appt));
END;
$fn$;
REVOKE ALL ON FUNCTION public.complete_reception_appointment(uuid,uuid,uuid,timestamptz,timestamptz,timestamptz)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_reception_appointment(uuid,uuid,uuid,timestamptz,timestamptz,timestamptz)
  TO service_role;
