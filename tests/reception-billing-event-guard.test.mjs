import test from "node:test";
import assert from "node:assert/strict";
import {
  INVOICE_UPDATABLE_STATUSES,
  shouldApplySubscriptionStatus
} from "../ai-receptionist-host/supabase/functions/stripe-webhook/billing-event-guard.js";

test("late subscription events do not reactivate the same canceled subscription", () => {
  assert.equal(shouldApplySubscriptionStatus("canceled", "active", true), false);
  assert.equal(shouldApplySubscriptionStatus("canceled", "trialing", true), false);
  assert.equal(shouldApplySubscriptionStatus("incomplete_expired", "active", true), false);
  assert.equal(shouldApplySubscriptionStatus("canceled", "canceled", true), true);
});

test("valid renewal and legitimate new-subscription transitions are still possible", () => {
  assert.equal(shouldApplySubscriptionStatus("past_due", "active", true), true);
  assert.equal(shouldApplySubscriptionStatus("paused", "active", true), true);
  assert.equal(shouldApplySubscriptionStatus("canceled", "active", false), true);
  assert.equal(shouldApplySubscriptionStatus("trialing", "active", true), true);
});

test("late invoice events cannot change canceled, expired or paused subscriptions", () => {
  for (const invalid of ["canceled", "incomplete_expired", "paused", ""]) {
    assert.equal(INVOICE_UPDATABLE_STATUSES.includes(invalid), false, invalid);
  }
  for (const valid of ["active", "trialing", "past_due", "incomplete", "unpaid"]) {
    assert.equal(INVOICE_UPDATABLE_STATUSES.includes(valid), true, valid);
  }
});
