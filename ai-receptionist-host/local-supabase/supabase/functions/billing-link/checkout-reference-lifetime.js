// Short-lived, single-use tenant checkout reference policy.
// Stripe creates a Checkout Session when a Payment Link is opened;
// keep the reference valid longer than the typical 24-hour session.
// A durable payment reconciliation process is still required for late payments.
export const CHECKOUT_REFERENCE_TTL_MS = 72 * 60 * 60 * 1000;

export function checkoutReferenceExpiresAt(nowMs = Date.now()) {
  if (!Number.isFinite(nowMs)) throw new RangeError("Invalid checkout reference issue time");
  return new Date(nowMs + CHECKOUT_REFERENCE_TTL_MS).toISOString();
}
