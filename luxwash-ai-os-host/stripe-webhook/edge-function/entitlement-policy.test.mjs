import test from "node:test";
import assert from "node:assert/strict";
import {
  assessCreatorBetaPayment,
  CREATOR_BETA_PAYMENT_LINK_ID,
  CREATOR_BETA_AMOUNT_CENTS,
} from "./entitlement-policy.mjs";

const valid = {
  id: "evt_live_synthetic",
  type: "checkout.session.completed",
  livemode: true,
  data: {
    object: {
      object: "checkout.session",
      id: "cs_live_synthetic",
      livemode: true,
      mode: "payment",
      payment_status: "paid",
      payment_link: CREATOR_BETA_PAYMENT_LINK_ID,
      amount_total: CREATOR_BETA_AMOUNT_CENTS,
      currency: "eur",
      customer_details: { email: "synthetic@example.test" },
    },
  },
};
const altered = (sessionFields, eventFields) => ({
  ...valid, ...eventFields,
  data: { object: { ...valid.data.object, ...sessionFields } },
});

test("founding beta €19 live payment is eligible without changing an account", () => {
  const result = assessCreatorBetaPayment(valid);
  assert.equal(result.eligible, true);
  assert.equal(result.email, "synthetic@example.test");
});
test("Reception AI or other links never grant AI Creator access", () => {
  assert.equal(assessCreatorBetaPayment(altered({ payment_link: "plink_other" })).eligible, false);
  assert.equal(assessCreatorBetaPayment(altered({ payment_link: null })).eligible, false);
});
test("lower amounts, discounts, altered currency and higher amounts fail closed", () => {
  for (const [key, value] of [["amount_total", 100], ["amount_total", 0], ["amount_total", 2000], ["currency", "usd"]]) {
    assert.equal(assessCreatorBetaPayment(altered({ [key]: value })).eligible, false);
  }
});
test("test mode, unpaid, subscription mode and bad checkout IDs cannot grant access", () => {
  assert.equal(assessCreatorBetaPayment(altered({}, { livemode: false })).eligible, false);
  assert.equal(assessCreatorBetaPayment(altered({ livemode: false })).eligible, false);
  assert.equal(assessCreatorBetaPayment(altered({ payment_status: "unpaid" })).eligible, false);
  assert.equal(assessCreatorBetaPayment(altered({ mode: "subscription" })).eligible, false);
  assert.equal(assessCreatorBetaPayment(altered({ id: "cs_test_fake" })).eligible, false);
});
test("unrelated event types, invalid session objects and missing email fail closed", () => {
  assert.equal(assessCreatorBetaPayment(altered({}, { type: "invoice.paid" })).eligible, false);
  assert.equal(assessCreatorBetaPayment(altered({ object: "payment_intent" })).eligible, false);
  assert.equal(assessCreatorBetaPayment(altered({ customer_details: null })).eligible, false);
});
test("async success event can grant beta access only after paid verification", () => {
  assert.equal(assessCreatorBetaPayment(altered({}, { type: "checkout.session.async_payment_succeeded" })).eligible, true);
});
