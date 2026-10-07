-- Restrict internal billing checkout RPCs to trusted server-side callers only.
-- These functions back Reception AI SaaS checkout and must not be callable
-- through the public Data API by anon or authenticated users.
-- create_billing_checkout_ref needs definer privileges to write to the private checkout-ref table;
-- external roles are explicitly revoked below.

alter function public.create_billing_checkout_ref(text,uuid,uuid,text,timestamptz)
  security definer;

revoke execute on function public.create_billing_checkout_ref(text,uuid,uuid,text,timestamptz)
  from public, anon, authenticated;

revoke execute on function public.consume_billing_checkout_ref(text,text)
  from public, anon, authenticated;

grant execute on function public.create_billing_checkout_ref(text,uuid,uuid,text,timestamptz)
  to service_role;

grant execute on function public.consume_billing_checkout_ref(text,text)
  to service_role;
