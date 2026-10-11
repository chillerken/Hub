// Vendored exact read-only assessment from stripe-webhook (PR #34).
// Keep in sync; verified by CI source-equivalence test.
// Read-only evidence assessment for Reception AI's paid Checkout incident handling.
// The CALLER must independently retrieve session data from Stripe's authenticated API
// and tenant/ref data from an authorized server-side Supabase query. Never run writes
// directly from the output of this module. It does not grant approval to activate.
const VALID_PLANS = new Set(["starter", "pro", "business"]);

const verdict = (status, reason) =>
  Object.freeze({ status, reason, can_auto_activate: false, needs_operator_approval: status !== "already_active" });

function asText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export async function sha256Reference(raw) {
  const text = asText(raw);
  if (!/^[a-f0-9]{64}$/i.test(text)) return null;
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * All inputs are supposed to be obtained through trusted, authenticated APIs.
 * No side effects; no service keys; no Stripe secret; no raw reference in output.
 */
export async function assessPaidCheckout({ session, catalog, reference, organization, expectedLivemode, nowMs = Date.now() } = {}) {
  if (typeof expectedLivemode !== "boolean" || !Number.isFinite(nowMs))
    return verdict("blocked", "invalid_assessment_configuration");
  if (!session || typeof session !== "object" || session.livemode !== expectedLivemode)
    return verdict("blocked", "stripe_environment_mismatch");
  if (session.mode !== "subscription" || session.status !== "complete" || session.payment_status !== "paid")
    return verdict("blocked", "no_completed_paid_subscription_checkout");

  const plan = asText(session.metadata?.plan).toLowerCase();
  const app = asText(session.metadata?.app).toLowerCase();
  if (!["reception_ai", "mijn_ai_business"].includes(app) || !VALID_PLANS.has(plan))
    return verdict("blocked", "unrecognized_app_or_plan");

  if (!catalog || catalog.active !== true || asText(catalog.plan) !== plan ||
      !asText(catalog.stripe_payment_link_id) ||
      asText(catalog.stripe_payment_link_id) !== asText(session.payment_link))
    return verdict("blocked", "untrusted_payment_link_or_plan");

  const customer = asText(session.customer);
  const subscription = asText(session.subscription);
  if (!customer.startsWith("cus_") || !subscription.startsWith("sub_"))
    return verdict("blocked", "missing_stripe_customer_or_subscription");

  const digest = await sha256Reference(session.client_reference_id);
  if (!digest) return verdict("needs_operator_reconciliation", "legacy_or_missing_checkout_reference");
  if (!reference || asText(reference.token_hash).toLowerCase() !== digest)
    return verdict("needs_operator_reconciliation", "reference_not_found_or_mismatched");

  if (asText(reference.plan) !== plan)
    return verdict("blocked", "reference_plan_mismatch");
  if (!organization || asText(reference.organization_id) !== asText(organization.id) ||
      organization.is_internal === true)
    return verdict("blocked", "untrusted_or_internal_organization");

  if (organization.stripe_customer_id && asText(organization.stripe_customer_id) !== customer)
    return verdict("blocked", "existing_customer_conflict");
  if (organization.stripe_subscription_id && asText(organization.stripe_subscription_id) !== subscription)
    return verdict("blocked", "existing_subscription_conflict");

  if (reference.used_at) {
    if (asText(organization.stripe_customer_id) === customer &&
        asText(organization.stripe_subscription_id) === subscription &&
        asText(organization.subscription_status).toLowerCase() === "active")
      return verdict("already_active", "matching_subscription_already_active");
    return verdict("blocked", "used_reference_requires_manual_investigation");
  }

  const expiry = Date.parse(asText(reference.expires_at));
  if (!Number.isFinite(expiry))
    return verdict("blocked", "invalid_reference_expiry");
  if (expiry <= nowMs)
    return verdict("needs_operator_reconciliation", "expired_verified_reference");

  // The signed Stripe event and the normal RPC remain the only authorized
  // automatic write path. Even this verdict is NOT permission to modify a tenant.
  return verdict("ready_for_authorized_replay", "matching_paid_checkout_and_valid_reference");
}
