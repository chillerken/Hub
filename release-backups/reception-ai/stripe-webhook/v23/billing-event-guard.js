// Pure guards for signed Stripe webhook event ordering.
// A late invoice/payment or subscription event must not reactivate a terminal subscription.
export const INVOICE_UPDATABLE_STATUSES = Object.freeze([
  "active", "trialing", "past_due", "incomplete", "unpaid"
]);

const TERMINAL_STATUSES = new Set(["canceled", "incomplete_expired"]);

export function shouldApplySubscriptionStatus(currentStatus, incomingStatus, sameSubscription) {
  const current = String(currentStatus || "").toLowerCase();
  const incoming = String(incomingStatus || "").toLowerCase();
  if (sameSubscription && TERMINAL_STATUSES.has(current) && !TERMINAL_STATUSES.has(incoming)) {
    return false;
  }
  return true;
}
