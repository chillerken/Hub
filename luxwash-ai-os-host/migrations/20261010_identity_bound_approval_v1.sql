-- LuxWash: identity-bound approvals, separate from legacy shared-password AI OS.
-- The public RPCs are SECURITY INVOKER only; privileged functions are private.
-- Real user ID comes solely from the validated Supabase Auth JWT via auth.uid().
-- Never marks lead tasks completed or dispatches external messages.

CREATE OR REPLACE FUNCTION private.luxwash_identity_guard_v1()
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $guard$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL
    OR COALESCE(auth.jwt()->>'role','') <> 'authenticated'
    OR COALESCE(auth.jwt()->>'is_anonymous','false') = 'true'
    OR NOT EXISTS(
      SELECT 1 FROM public.luxwash_app_members m
      WHERE m.user_id=v_actor AND m.active
        AND m.role IN ('owner','planner','marketing')
    )
  THEN
    RAISE EXCEPTION 'luxwash_authorized_identity_required'
      USING ERRCODE='42501';
  END IF;
  RETURN v_actor;
END
$guard$;

CREATE OR REPLACE FUNCTION private.luxwash_identity_review_queue_v1()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $queue$
DECLARE
  v_actor uuid;
  v_warm jsonb;
  v_summary jsonb;
BEGIN
  v_actor := private.luxwash_identity_guard_v1();

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'task_id',task_id,
    'lead_id',lead_id,
    'lead_name',lead_name,
    'company',company,
    'service',service,
    'review_reason',review_reason,
    'contact_basis',contact_basis,
    'action_approval_actors',action_approval_actors,
    'existing_sent_since_task',existing_sent_since_task,
    'possible_prospecting_messages',possible_prospecting_messages,
    'receipts_linked_to_exact_task',receipts_linked_to_exact_task,
    'actions_waiting_for_approval',actions_waiting_for_approval,
    'requires_human_review',requires_human_review
  ) ORDER BY task_created_at,task_id),'[]'::jsonb)
  INTO v_warm
  FROM (
    SELECT * FROM private.luxwash_warm_lead_review_v1
    ORDER BY task_created_at,task_id LIMIT 100
  ) x;

  SELECT COALESCE(jsonb_object_agg(review_reason,n),'{}'::jsonb)
  INTO v_summary FROM (
    SELECT review_reason,count(*) AS n
    FROM private.luxwash_overdue_followup_review_v1
    GROUP BY review_reason
  ) s;

  RETURN jsonb_build_object(
    'ok',true,
    'warm_leads',v_warm,
    'overdue_followups',v_summary,
    'authorization','identity_bound',
    'external_dispatch_enabled',false
  );
END
$queue$;

CREATE OR REPLACE FUNCTION private.luxwash_identity_review_decide_v1(
  p_action_id uuid,p_decision text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $decide$
DECLARE
  v_actor uuid;
  v_action public.lux_ai_os_actions%rowtype;
  v_lead public.leads%rowtype;
  v_task_count int;
  v_prior_sent int;
BEGIN
  v_actor := private.luxwash_identity_guard_v1();
  IF p_action_id IS NULL OR p_decision NOT IN ('approve','reject') THEN
    RAISE EXCEPTION 'invalid_review_decision' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_action FROM public.lux_ai_os_actions
  WHERE id=p_action_id FOR UPDATE;
  IF NOT FOUND OR v_action.status <> 'awaiting_approval'
     OR v_action.execution_mode <> 'approval'
     OR v_action.entity_type <> 'lead'
     OR v_action.capability_code <> 'personalized_messages' THEN
    RAISE EXCEPTION 'action_not_pending_identity_review'
      USING ERRCODE='23514';
  END IF;

  -- Confirm a real linked warm-lead queue item, not just any action ID.
  IF v_action.entity_id !~* '^[0-9a-f-]{36}$' THEN
    RAISE EXCEPTION 'invalid_lead_reference' USING ERRCODE='23514';
  END IF;
  SELECT count(*) INTO v_task_count
  FROM public.luxwash_ai_tasks t
  WHERE t.lead_id=v_action.entity_id::uuid
    AND t.task_type='WARM_LEAD_FOLLOWUP'
    AND t.status='pending';
  IF v_task_count=0 THEN
    RAISE EXCEPTION 'warm_lead_task_not_pending'
      USING ERRCODE='23514';
  END IF;

  IF p_decision='reject' THEN
    UPDATE public.lux_ai_os_actions SET status='rejected',
      approved_at=now(), approved_by=v_actor, updated_at=now(),
      output=jsonb_build_object('review','rejected_by_authenticated_actor',
                                'external_dispatch_authorized',false)
    WHERE id=p_action_id;
    RETURN jsonb_build_object('ok',true,'action_status','rejected',
                              'external_dispatch',false);
  END IF;

  SELECT * INTO v_lead FROM public.leads
  WHERE id=v_action.entity_id::uuid FOR UPDATE;
  IF NOT FOUND OR v_lead.opted_out OR v_lead.is_test
     OR coalesce((v_lead.metadata->>'executive_no_contact')::boolean,false)
  THEN
    RAISE EXCEPTION 'lead_not_contactable' USING ERRCODE='23514';
  END IF;
  -- The only currently verified contact basis in this live warm-lead queue
  -- is B2B legitimate interest. Other cases must be separately reviewed.
  IF v_lead.consent_basis <> 'legitimate_interest_b2b' THEN
    RAISE EXCEPTION 'contact_basis_review_required' USING ERRCODE='23514';
  END IF;
  IF nullif(btrim(v_lead.email),'') IS NULL
     AND nullif(btrim(v_lead.phone),'') IS NULL THEN
    RAISE EXCEPTION 'lead_missing_contact_method' USING ERRCODE='23514';
  END IF;
  SELECT count(*) INTO v_prior_sent
  FROM public.sales_message_drafts d
  WHERE d.lead_id=v_lead.id
    AND d.status='sent'
    AND coalesce(d.is_test,false)=false
    AND d.sent_at >= now()-interval '30 days';
  IF v_prior_sent>0 THEN
    RAISE EXCEPTION 'prior_send_requires_reconciliation'
      USING ERRCODE='23514';
  END IF;

  -- Approval is ONLY a decision. Do NOT create/send a draft, change the
  -- warm-lead task status, or silently mark delivery completed.
  UPDATE public.lux_ai_os_actions SET status='approved',
    approved_at=now(),approved_by=v_actor,updated_at=now(),
    output=jsonb_build_object('review','identity_verified',
                              'external_dispatch_authorized',false,
                              'requires_provider_receipt',true)
  WHERE id=p_action_id;
  RETURN jsonb_build_object('ok',true,'action_status','approved',
                            'external_dispatch',false);
END
$decide$;

-- Invoker wrappers are the only PostgREST-exposed entry points.
CREATE OR REPLACE FUNCTION public.luxwash_identity_review_queue_v1()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $public_queue$
  SELECT private.luxwash_identity_review_queue_v1();
$public_queue$;

CREATE OR REPLACE FUNCTION public.luxwash_identity_review_decide_v1(
 p_action_id uuid,p_decision text
)
RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $public_decide$
  SELECT private.luxwash_identity_review_decide_v1(p_action_id,p_decision);
$public_decide$;

REVOKE ALL ON FUNCTION private.luxwash_identity_guard_v1() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.luxwash_identity_review_queue_v1() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.luxwash_identity_review_decide_v1(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.luxwash_identity_review_queue_v1() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.luxwash_identity_review_decide_v1(uuid,text) FROM PUBLIC,anon,authenticated,service_role;

GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.luxwash_identity_guard_v1() TO authenticated;
GRANT EXECUTE ON FUNCTION private.luxwash_identity_review_queue_v1() TO authenticated;
GRANT EXECUTE ON FUNCTION private.luxwash_identity_review_decide_v1(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.luxwash_identity_review_queue_v1() TO authenticated;
GRANT EXECUTE ON FUNCTION public.luxwash_identity_review_decide_v1(uuid,text) TO authenticated;
