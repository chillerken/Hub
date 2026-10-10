\set ON_ERROR_STOP on

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;

CREATE TABLE public.luxwash_ai_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  priority smallint NOT NULL DEFAULT 5,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  scheduled_for timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  error_message text,
  result jsonb
);

\ir ../migrations/20261010_guard_approval_required_ai_tasks.sql

DO $$
DECLARE result jsonb;
BEGIN
  INSERT INTO public.luxwash_ai_tasks(task_type,payload,priority) VALUES
    ('WARM_LEAD_FOLLOWUP','{"requires_approval":true}',95),
    ('CALENDAR_CRM_RECONCILIATION','{}',70),
    ('WHATSAPP_PRICE_REQUEST','{"requires_approval":true}',50),
    ('WHATSAPP_COMPLAINT','{"manual_review_only":true}',40),
    ('WHATSAPP_BOOKING_REQUEST','{"auto_execute":false}',30),
    ('WHATSAPP_FLEET_CARE','{}',20),
    ('WHATSAPP_PRICE_REQUEST','{}',10);
  -- Real classification can process just one explicitly safe type.
  SELECT public.luxwash_process_next_ai_task() INTO result;
  IF result->>'processed' <> 'true' OR result->>'task_type' <> 'WHATSAPP_FLEET_CARE' THEN
    RAISE EXCEPTION 'Expected one safe classification, got %', result;
  END IF;
  SELECT public.luxwash_process_next_ai_task() INTO result;
  IF result->>'processed' <> 'true' OR result->>'task_type' <> 'WHATSAPP_PRICE_REQUEST' THEN
    RAISE EXCEPTION 'Expected second safe classification, got %', result;
  END IF;
  SELECT public.luxwash_process_next_ai_task() INTO result;
  IF result->>'processed' <> 'false' THEN
    RAISE EXCEPTION 'Must not process approval or unsupported tasks, got %', result;
  END IF;
  IF (SELECT count(*) FROM public.luxwash_ai_tasks WHERE status='completed') <> 2 THEN
    RAISE EXCEPTION 'Incorrect completed count';
  END IF;
  IF (SELECT count(*) FROM public.luxwash_ai_tasks WHERE status='pending') <> 5 THEN
    RAISE EXCEPTION 'Pending approval tasks changed incorrectly';
  END IF;
  IF has_function_privilege('anon','public.luxwash_process_next_ai_task()','EXECUTE') OR
     has_function_privilege('authenticated','public.luxwash_process_next_ai_task()','EXECUTE') THEN
    RAISE EXCEPTION 'Public roles must not execute privileged task function';
  END IF;
  RAISE NOTICE 'PASS: only safe, due, non-approval classification tasks completed';
END $$;
