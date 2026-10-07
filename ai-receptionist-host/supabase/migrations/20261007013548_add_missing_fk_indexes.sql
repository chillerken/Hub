-- Add covering indexes for foreign-key columns flagged by Supabase advisors.

create index if not exists leads_marketing_campaign_id_fk_idx
  on public.leads(marketing_campaign_id);

create index if not exists sales_onboarding_invites_lead_id_fk_idx
  on public.sales_onboarding_invites(lead_id);

create index if not exists sales_sequence_steps_lead_id_fk_idx
  on public.sales_sequence_steps(lead_id);

create index if not exists sales_sequence_steps_workflow_action_id_fk_idx
  on public.sales_sequence_steps(workflow_action_id);

create index if not exists sales_sequences_created_by_fk_idx
  on public.sales_sequences(created_by);

create index if not exists sales_sequences_lead_id_fk_idx
  on public.sales_sequences(lead_id);
