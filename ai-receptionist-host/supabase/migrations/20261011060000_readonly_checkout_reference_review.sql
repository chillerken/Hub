-- Operator REVIEW ONLY: read one hashed checkout reference from the private schema.
-- This function does not activate subscriptions, update status or change payments.
-- Callable by server-side service_role only; never by anon/authenticated.
CREATE OR REPLACE FUNCTION public.lookup_billing_checkout_reference_for_review(p_token_hash text)
RETURNS TABLE(
  token_hash text,
  organization_id uuid,
  plan text,
  expires_at timestamptz,
  used_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT r.token_hash, r.organization_id, r.plan, r.expires_at, r.used_at
  FROM private.billing_checkout_refs AS r
  WHERE p_token_hash ~ '^[0-9a-f]{64}$'
    AND r.token_hash = p_token_hash
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.lookup_billing_checkout_reference_for_review(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_billing_checkout_reference_for_review(text)
  TO service_role;
