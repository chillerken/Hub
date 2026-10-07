-- Harden internal sales tables against direct Data API access.
-- Public Edge Functions use service_role; browser roles have no direct table privileges.

revoke all on table public.sales_onboarding_invites from anon, authenticated;
revoke all on table public.sales_opportunities from anon, authenticated;

grant all on table public.sales_onboarding_invites to service_role;
grant all on table public.sales_opportunities to service_role;
