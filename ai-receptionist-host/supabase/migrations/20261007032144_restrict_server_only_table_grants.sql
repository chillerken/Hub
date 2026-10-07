-- Restrict server-only tables to service_role and keep only self-read on platform_admins.

revoke all on table public.commercial_learning_snapshots from anon, authenticated;
revoke all on table public.marketing_campaigns from anon, authenticated;
revoke all on table public.sales_sequence_steps from anon, authenticated;
revoke all on table public.sales_sequences from anon, authenticated;
revoke all on table public.tenant_activation_events from anon, authenticated;

revoke all on table public.platform_admins from anon, authenticated;
grant select on table public.platform_admins to authenticated;
