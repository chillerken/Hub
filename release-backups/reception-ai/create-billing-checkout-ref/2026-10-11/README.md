# Rollback snapshot — create_billing_checkout_ref (2026-10-11)

- Project: `ndecxbsrxspkuxjsbndq`
- Function: `public.create_billing_checkout_ref(text,uuid,uuid,text,timestamptz)`
- Before PR #33: maximum expiry **4 hours**
- Owner: `postgres`
- Security definer: `true`
- Function config: `["search_path=\"\""]`
- Actual Postgres ACL: `{postgres=X/postgres,service_role=X/postgres}`
- `anon` can EXECUTE: `false`
- `authenticated` can EXECUTE: `false`
- `service_role` can EXECUTE: `true`

**Warning:** Do not restore this 4-hour RPC while `billing-link` still generates 72-hour checkout references (v7). A coordinated rollback requires restoring a compatible `billing-link` version or fixing the forward incompatibility.

Deploying the rollback SQL creates no Stripe payments or messages but changes production DDL, so obtain separate consent. Validate the body, owner, security definer, search path and ACL after rollback.
