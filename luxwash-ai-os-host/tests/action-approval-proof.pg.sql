\set ON_ERROR_STOP on
-- Disposable isolated PostgreSQL 17 test; no live LuxWash or customer data.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA private;
CREATE TABLE public.lux_ai_os_actions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_mode text NOT NULL,
  status text NOT NULL,
  approved_at timestamptz,
  approved_by uuid,
  updated_at timestamptz DEFAULT now()
);

-- Existing historical anomaly is intentionally left in place.
INSERT INTO public.lux_ai_os_actions(execution_mode,status)
VALUES('approval','completed');

\ir ../migrations/20261010_ai_action_approval_proof_trigger.sql

DO $$
DECLARE
  v_id uuid;
  v_rejected boolean;
BEGIN
  -- No retroactive rewriting: changing an unrelated field on a legacy row is allowed.
  UPDATE public.lux_ai_os_actions SET updated_at=now()
  WHERE execution_mode='approval' AND status='completed' AND approved_by IS NULL;

  INSERT INTO public.lux_ai_os_actions(execution_mode,status)
  VALUES('approval','awaiting_approval') RETURNING id INTO v_id;

  v_rejected:=false;
  BEGIN
    UPDATE public.lux_ai_os_actions SET status='completed',approved_at=now() WHERE id=v_id;
  EXCEPTION WHEN check_violation THEN v_rejected:=true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Unattributed completion was allowed'; END IF;

  v_rejected:=false;
  BEGIN
    UPDATE public.lux_ai_os_actions SET status='approved',
       approved_by='00000000-0000-4000-8000-000000000011'
    WHERE id=v_id;
  EXCEPTION WHEN check_violation THEN v_rejected:=true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Missing approval timestamp was allowed'; END IF;

  UPDATE public.lux_ai_os_actions SET status='approved',approved_at=now(),
    approved_by='00000000-0000-4000-8000-000000000011' WHERE id=v_id;
  UPDATE public.lux_ai_os_actions SET status='completed' WHERE id=v_id;

  v_rejected:=false;
  BEGIN
    INSERT INTO public.lux_ai_os_actions(execution_mode,status)
    VALUES('approval','completed');
  EXCEPTION WHEN check_violation THEN v_rejected:=true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Direct completed insertion was allowed'; END IF;

  INSERT INTO public.lux_ai_os_actions(execution_mode,status)
  VALUES('auto','completed');

  IF (SELECT count(*) FROM public.lux_ai_os_actions WHERE status='completed')<>3 THEN
    RAISE EXCEPTION 'Unexpected rows modified';
  END IF;
  RAISE NOTICE 'PASS: missing-actor transitions blocked; historical records and auto mode preserved';
END $$;
