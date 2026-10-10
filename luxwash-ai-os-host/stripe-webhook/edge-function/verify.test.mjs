import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, webcrypto } from "node:crypto";
import { parseStripeSignature, verifyStripeSignature } from "./verify.mjs";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const secret = "whsec_synthetic_fixture_do_not_use_in_production";
const payload = '{"id":"evt_test","type":"checkout.session.completed"}';
const now = 1791600000;
const goodSignature = createHmac("sha256", secret).update(now + "." + payload).digest("hex");

test("rejects absent, malformed and unsupported signature headers", async () => {
  assert.equal(parseStripeSignature(""), null);
  assert.equal(parseStripeSignature("t=abc,v1=123"), null);
  assert.equal(parseStripeSignature("t=1791600000,v0=" + goodSignature), null);
  assert.equal(await verifyStripeSignature(payload, "", secret, now), false);
});

test("accepts a valid timestamped HMAC without network or database access", async () => {
  assert.equal(
    await verifyStripeSignature(payload, "t=" + now + ",v1=" + goodSignature, secret, now),
    true
  );
});

test("rejects tampered bodies and wrong signing secrets", async () => {
  const header = "t=" + now + ",v1=" + goodSignature;
  assert.equal(await verifyStripeSignature(payload + " ", header, secret, now), false);
  assert.equal(await verifyStripeSignature(payload, header, secret + "-wrong", now), false);
});

test("rejects signatures older or newer than five minutes", async () => {
  const header = "t=" + now + ",v1=" + goodSignature;
  assert.equal(await verifyStripeSignature(payload, header, secret, now + 301), false);
  assert.equal(await verifyStripeSignature(payload, header, secret, now - 301), false);
});

test("supports Stripe rotating multiple v1 signatures in one header", async () => {
  const incorrectSignature = "0".repeat(64);
  assert.equal(
    await verifyStripeSignature(
      payload,
      "t=" + now + ",v1=" + incorrectSignature + ",v1=" + goodSignature,
      secret, now
    ),
    true
  );
});

test("rejects missing secret and invalid HMAC lengths", async () => {
  const header = "t=" + now + ",v1=" + goodSignature;
  assert.equal(await verifyStripeSignature(payload, header, "", now), false);
  assert.equal(await verifyStripeSignature(payload, "t=" + now + ",v1=xyz", secret, now), false);
});
