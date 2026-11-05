import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createSessionValue,
  verifySessionValue,
  isSameOrigin,
  parseImageDataUrl,
  getClientIp,
  takeRateLimit
} from "../server/security.js";

const secret = "test-secret-for-godmode-session-signing-0123456789";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("signed private session is accepted before expiry", () => {
  const now = 1_800_000_000_000;
  const value = createSessionValue(secret, now);
  assert.ok(verifySessionValue(value, secret, now));
});

test("expired and tampered sessions are rejected", () => {
  const now = 1_800_000_000_000;
  const value = createSessionValue(secret, now);
  assert.equal(verifySessionValue(value, secret, now + 9 * 60 * 60 * 1000), null);
  const tampered = value.slice(0, -1) + (value.endsWith("0") ? "1" : "0");
  assert.equal(verifySessionValue(tampered, secret, now), null);
});

test("same-origin POSTs are accepted and cross-origin requests are rejected", () => {
  assert.equal(isSameOrigin({
    headers: { origin: "https://hub.example.com", host: "hub.example.com" }
  }), true);
  assert.equal(isSameOrigin({
    headers: { origin: "https://attacker.example", host: "hub.example.com" }
  }), false);
  assert.equal(isSameOrigin({ headers: { host: "hub.example.com" } }), false);
});

test("image data URL validation accepts JPEG and rejects unsupported or oversized data", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]).toString("base64");
  const parsed = parseImageDataUrl("data:image/jpeg;base64," + jpeg);
  assert.equal(parsed?.mimeType, "image/jpeg");
  assert.equal(parsed?.data, jpeg);
  assert.equal(parseImageDataUrl("data:image/svg+xml;base64," + jpeg), null);
  assert.equal(parseImageDataUrl("data:image/jpeg;base64," + jpeg, 2), null);
});


test("login throttling prefers the trusted proxy-resolved client IP", () => {
  assert.equal(getClientIp({
    ip: "203.0.113.10",
    headers: { "x-forwarded-for": "198.51.100.99, 203.0.113.10" }
  }), "203.0.113.10");
});

test("rate limiter blocks requests above the configured threshold", () => {
  const key = "godmode-test-" + Date.now();
  assert.equal(takeRateLimit(key, 2, 60_000).allowed, true);
  assert.equal(takeRateLimit(key, 2, 60_000).allowed, true);
  assert.equal(takeRateLimit(key, 2, 60_000).allowed, false);
});

test("Gemini credentials and SDK calls are absent from browser source and Vite config", async () => {
  const app = await readFile(path.join(root, "src", "App.tsx"), "utf8");
  const vite = await readFile(path.join(root, "vite.config.ts"), "utf8");
  assert.doesNotMatch(app, /GEMINI_API_KEY|process\.env|@google\/genai|x-goog-api-key|GoogleGenAI/);
  assert.doesNotMatch(vite, /GEMINI_API_KEY/);
});
