// These identifiers were cross-checked against the linked Stripe Luxdesign
// account (livemode) and its active payment-link line items on 2026-10-10.
// Fail closed if a payment is for any other SaaS product, amount or link.
export const CREATOR_BETA_PRODUCT_ID = "prod_VN3yN8r2Y15Pwy";
export const CREATOR_BETA_PAYMENT_LINK_ID = "plink_1UMJqZKMkGczYQpSPUHgo6Ij";
export const CREATOR_BETA_PRICE_ID = "price_1UMJqUKMkGczYQpSgO7EtJcr";
export const CREATOR_BETA_AMOUNT_CENTS = 1900;
export const CREATOR_BETA_CURRENCY = "eur";

const SUPPORTED_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
]);

export function assessCreatorBetaPayment(event) {
  if (!event || typeof event !== "object" || !SUPPORTED_EVENTS.has(event.type)) {
    return { eligible: false, reason: "unrelated_event" };
  }
  if (event.livemode !== true) return { eligible: false, reason: "not_live" };
  const session = event.data?.object;
  if (!session || session.object !== "checkout.session") {
    return { eligible: false, reason: "invalid_checkout_session" };
  }
  if (session.livemode !== true) return { eligible: false, reason: "session_not_live" };
  if (session.mode !== "payment" || session.payment_status !== "paid") {
    return { eligible: false, reason: "not_paid_one_time_checkout" };
  }
  if (session.payment_link !== CREATOR_BETA_PAYMENT_LINK_ID) {
    return { eligible: false, reason: "unapproved_payment_link" };
  }
  // This one-time link currently has no promotions or automatic taxes.
  // Refuse changed pricing until owner explicitly approves a new price rule.
  if (session.currency !== CREATOR_BETA_CURRENCY ||
      session.amount_total !== CREATOR_BETA_AMOUNT_CENTS) {
    return { eligible: false, reason: "unexpected_payment_amount" };
  }
  if (typeof session.id !== "string" || !session.id.startsWith("cs_live_")) {
    return { eligible: false, reason: "invalid_live_session_id" };
  }
  const email = String(
    session.customer_details?.email || session.customer_email || ""
  ).trim().toLowerCase();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { eligible: false, reason: "invalid_customer_email" };
  }
  return { eligible: true, reason: "verified_creator_beta_checkout", email, session };
}
