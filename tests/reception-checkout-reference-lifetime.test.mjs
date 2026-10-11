import test from "node:test";
import assert from "node:assert/strict";
import { CHECKOUT_REFERENCE_TTL_MS, checkoutReferenceExpiresAt } from "../ai-receptionist-host/supabase/functions/billing-link/checkout-reference-lifetime.js";

test("checkout reference remains usable beyond a standard 24-hour Checkout session", () => {
  const issued = Date.UTC(2026, 9, 11, 0, 0, 0);
  const expires = Date.parse(checkoutReferenceExpiresAt(issued));
  assert.equal(expires - issued, 72 * 60 * 60 * 1000);
  assert.ok(expires - issued > 24 * 60 * 60 * 1000);
});

test("checkout reference policy is bounded and does not accept invalid timestamps", () => {
  assert.ok(CHECKOUT_REFERENCE_TTL_MS <= 72 * 60 * 60 * 1000);
  assert.ok(CHECKOUT_REFERENCE_TTL_MS >= 48 * 60 * 60 * 1000);
  assert.throws(() => checkoutReferenceExpiresAt(Number.NaN), RangeError);
  assert.throws(() => checkoutReferenceExpiresAt(Infinity), RangeError);
});
