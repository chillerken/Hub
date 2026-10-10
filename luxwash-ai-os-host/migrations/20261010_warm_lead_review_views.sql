-- LuxWash operational review queues. Read-only, private, fail-closed.
-- NO external provider calls, messages, action completions or historical task updates.
-- All rows still require an explicit human review; existing sent messages
-- correlated by lead_id are NOT proof that this task was delivered.

CREATE OR REPLACE VIEW private.luxwash_warm_lead_review_v1
WITH (security_invoker = true)
AS
SELECT
  t.id AS task_id,
  t.lead_id,
  t.created_at AS task_created_at,
  t.scheduled_for,
  l.name AS lead_name,
  l.company,
  l.service,
  l.source AS lead_source,
  COALESCE(l.opted_out, false) AS opted_out,
  COALESCE(l.is_test, false) AS is_test,
  NULLIF(btrim(COALESCE(l.consent_basis, '')), '') AS contact_basis,
  (NULLIF(btrim(COALESCE(l.email, '')), '') IS NOT NULL) AS has_email,
  (NULLIF(btrim(COALESCE(l.phone, '')), '') IS NOT NULL) AS has_phone,
  COALESCE(a.action_count, 0) AS ai_action_count,
  COALESCE(a.completed_count, 0) AS ai_action_completed_count,
  COALESCE(a.approval_timestamp_count, 0) AS action_approval_timestamps,
  COALESCE(a.approval_actor_count, 0) AS action_approval_actors,
  COALESCE(a.awaiting_approval_count, 0) AS actions_waiting_for_approval,
  COALESCE(d.draft_count, 0) AS existing_drafts,
  COALESCE(d.possible_sent_count, 0) AS existing_sent_for_lead,
  COALESCE(d.sent_since_task, 0) AS existing_sent_since_task,
  COALESCE(d.luxscout_sent_since_task, 0) AS possible_prospecting_messages,
  COALESCE(d.task_linked_receipts, 0) AS receipts_linked_to_exact_task,
  true AS requires_human_review,
  CASE
    WHEN l.id IS NULL THEN 'missing_lead_record'
    WHEN COALESCE(l.is_test, false) THEN 'test_lead_no_dispatch'
    WHEN COALESCE(l.opted_out, false) THEN 'opted_out_no_dispatch'
    WHEN NULLIF(btrim(COALESCE(l.consent_basis, '')), '') IS NULL THEN 'missing_contact_basis'
    WHEN l.consent_basis = 'public_business_data_unverified' THEN 'unverified_contact_basis'
    WHEN COALESCE(a.approval_actor_count, 0) = 0 THEN 'approval_actor_not_recorded'
    WHEN COALESCE(d.possible_sent_count, 0) > 0 AND
         COALESCE(d.task_linked_receipts, 0) = 0 THEN 'possible_prior_send_needs_reconciliation'
    ELSE 'manual_dispatch_review'
  END AS review_reason
FROM public.luxwash_ai_tasks t
LEFT JOIN public.leads l ON l.id = t.lead_id
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) AS action_count,
    COUNT(*) FILTER (WHERE a.status = 'completed') AS completed_count,
    COUNT(*) FILTER (WHERE a.approved_at IS NOT NULL) AS approval_timestamp_count,
    COUNT(*) FILTER (WHERE a.approved_at IS NOT NULL AND a.approved_by IS NOT NULL) AS approval_actor_count,
    COUNT(*) FILTER (WHERE a.status = 'awaiting_approval') AS awaiting_approval_count
  FROM public.lux_ai_os_actions a
  WHERE a.entity_type = 'lead'
    AND a.entity_id = t.lead_id::text
    AND a.capability_code = 'personalized_messages'
) a ON true
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) FILTER (WHERE d.status = 'draft') AS draft_count,
    COUNT(*) FILTER (
      WHERE d.status = 'sent' AND COALESCE(d.is_test, false) = false
        AND NULLIF(btrim(COALESCE(d.provider_id, '')), '') IS NOT NULL
        AND d.sent_at IS NOT NULL
    ) AS possible_sent_count,
    COUNT(*) FILTER (
      WHERE d.status = 'sent' AND COALESCE(d.is_test, false) = false
        AND NULLIF(btrim(COALESCE(d.provider_id, '')), '') IS NOT NULL
        AND d.sent_at >= t.created_at
    ) AS sent_since_task,
    COUNT(*) FILTER (
      WHERE d.status = 'sent' AND COALESCE(d.is_test, false) = false
        AND d.generated_by = 'luxscout'
        AND NULLIF(btrim(COALESCE(d.provider_id, '')), '') IS NOT NULL
        AND d.sent_at >= t.created_at
    ) AS luxscout_sent_since_task,
    COUNT(*) FILTER (
      WHERE d.status = 'sent' AND COALESCE(d.is_test, false) = false
        AND d.metadata->>'task_id' = t.id::text
        AND NULLIF(btrim(COALESCE(d.provider_id, '')), '') IS NOT NULL
        AND d.sent_at IS NOT NULL
    ) AS task_linked_receipts
  FROM public.sales_message_drafts d
  WHERE d.lead_id = t.lead_id
) d ON true
WHERE t.task_type = 'WARM_LEAD_FOLLOWUP' AND t.status = 'pending';

REVOKE ALL ON private.luxwash_warm_lead_review_v1 FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
GRANT SELECT ON private.luxwash_warm_lead_review_v1 TO service_role;

CREATE OR REPLACE VIEW private.luxwash_overdue_followup_review_v1
WITH (security_invoker = true)
AS
SELECT
  f.id AS followup_id,
  f.customer_id,
  f.appointment_id,
  f.phone_call_id,
  f.summary,
  f.priority,
  f.due_at,
  f.dedupe_key,
  CASE
    WHEN f.customer_id IS NULL THEN 'unlinked_customer_requires_review'
    WHEN NULLIF(btrim(COALESCE(f.dedupe_key, '')), '') IS NULL THEN 'missing_dedupe_key'
    ELSE 'manual_followup_review'
  END AS review_reason,
  true AS requires_human_review
FROM public.followups f
WHERE f.status = 'open' AND f.due_at < now();

REVOKE ALL ON private.luxwash_overdue_followup_review_v1 FROM PUBLIC, anon, authenticated;
GRANT SELECT ON private.luxwash_overdue_followup_review_v1 TO service_role;
