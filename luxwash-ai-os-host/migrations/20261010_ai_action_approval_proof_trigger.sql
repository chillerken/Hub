-- Fail-closed approval provenance for FUTURE LuxWash AI action transitions.
-- Does not rewrite or validate historic completed actions.
-- An approval-mode action can only transition into approved/completed if it
-- carries both an approver identity and an approval timestamp.
-- No customer communication or billing actions are performed by this trigger.

CREATE OR REPLACE FUNCTION private.luxwash_require_ai_action_approval_proof()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $approval_guard$
DECLARE
  v_status_transition boolean;
BEGIN
  IF NEW.execution_mode IS DISTINCT FROM 'approval' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_status_transition := true;
  ELSE
    v_status_transition := OLD.status IS DISTINCT FROM NEW.status;
  END IF;

  IF v_status_transition AND NEW.status IN ('approved', 'completed')
     AND (NEW.approved_at IS NULL OR NEW.approved_by IS NULL) THEN
    RAISE EXCEPTION 'luxwash_ai_action_approval_proof_required'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$approval_guard$;

REVOKE ALL ON FUNCTION private.luxwash_require_ai_action_approval_proof()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.luxwash_require_ai_action_approval_proof()
  TO service_role;

DROP TRIGGER IF EXISTS luxwash_ai_action_approval_proof_guard
  ON public.lux_ai_os_actions;

CREATE TRIGGER luxwash_ai_action_approval_proof_guard
BEFORE INSERT OR UPDATE ON public.lux_ai_os_actions
FOR EACH ROW
EXECUTE FUNCTION private.luxwash_require_ai_action_approval_proof();
