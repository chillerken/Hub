import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "godmode_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

const rateLimits = new Map();

export function createSessionValue(secret, now = Date.now()) {
  const expiresAt = Math.floor(now / 1000) + SESSION_TTL_SECONDS;
  const nonce = randomBytes(16).toString("hex");
  const signature = createHmac("sha256", secret)
    .update("godmode-session:" + expiresAt + ":" + nonce)
    .digest("hex");
  return String(expiresAt) + "." + nonce + "." + signature;
}

export function verifySessionValue(value, secret, now = Date.now()) {
  if (typeof value !== "string" || !secret) return null;
  const parts = value.split(".");
  if (parts.length !== 3 || !/^\d+$/.test(parts[0]) ||
      !/^[a-f0-9]{32}$/i.test(parts[1]) || !/^[a-f0-9]{64}$/i.test(parts[2])) {
    return null;
  }

  const expiresAt = Number(parts[0]);
  const nowSeconds = Math.floor(now / 1000);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= nowSeconds ||
      expiresAt > nowSeconds + SESSION_TTL_SECONDS + 60) return null;

  const expected = createHmac("sha256", secret)
    .update("godmode-session:" + expiresAt + ":" + parts[1])
    .digest();
  const supplied = Buffer.from(parts[2], "hex");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;

  return { expiresAt, id: createHash("sha256").update(value).digest("hex") };
}

export function readCookie(req, name = SESSION_COOKIE) {
  const cookieHeader = req.headers?.cookie;
  if (typeof cookieHeader !== "string") return null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator >= 0 && part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return null;
}

export function getSession(req) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) return null;
  return verifySessionValue(readCookie(req), secret);
}

function secureCookieSuffix(req) {
  const forwardedProto = String(req.headers?.["x-forwarded-proto"] || "").split(",")[0].trim();
  return process.env.NODE_ENV === "production" || forwardedProto === "https" ? "; Secure" : "";
}

export function makeSessionCookie(value, req) {
  return SESSION_COOKIE + "=" + value +
    "; Path=/; HttpOnly; SameSite=Strict; Max-Age=" + SESSION_TTL_SECONDS +
    secureCookieSuffix(req);
}

export function clearSessionCookie(req) {
  return SESSION_COOKIE + "=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0" +
    secureCookieSuffix(req);
}

export function isSameOrigin(req) {
  const origin = req.headers?.origin;
  const forwardedHost = req.headers?.["x-forwarded-host"];
  const host = forwardedHost || req.headers?.host;
  if (!origin || !host) return false;
  try {
    return new URL(origin).host.toLowerCase() === String(host).split(",")[0].trim().toLowerCase();
  } catch {
    return false;
  }
}

export function getClientIp(req) {
  // Prefer Express' resolved client IP. The server sets a one-proxy trust
  // boundary so arbitrary leftmost X-Forwarded-For values are not trusted.
  if (typeof req.ip === "string" && req.ip.trim()) return req.ip.trim();

  const realIp = req.headers?.["x-real-ip"];
  if (typeof realIp === "string" && realIp.trim()) return realIp.trim();

  const forwarded = req.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0].trim();
  return "unknown";
}

export function passwordMatches(supplied, configured) {
  if (typeof supplied !== "string" || typeof configured !== "string") return false;
  if (supplied.length === 0 || supplied.length > 256) return false;
  const suppliedHash = createHash("sha256").update(supplied).digest();
  const configuredHash = createHash("sha256").update(configured).digest();
  return timingSafeEqual(suppliedHash, configuredHash);
}

export function takeRateLimit(key, limit, windowMs, now = Date.now()) {
  let entry = rateLimits.get(key);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    rateLimits.set(key, entry);
  }
  entry.count += 1;

  if (rateLimits.size > 3000) {
    for (const [storedKey, storedValue] of rateLimits.entries()) {
      if (now >= storedValue.resetAt) rateLimits.delete(storedKey);
    }
  }

  return {
    allowed: entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000))
  };
}

export function resetRateLimit(key) {
  rateLimits.delete(key);
}

function hasImageSignature(bytes, mimeType) {
  if (mimeType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return bytes.length >= 8 &&
      bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (mimeType === "image/webp") {
    return bytes.length >= 12 &&
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP";
  }
  return false;
}

export function parseImageDataUrl(value, maxBytes = 4 * 1024 * 1024) {
  if (typeof value !== "string") return null;
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return null;

  const mimeType = match[1];
  const data = match[2];
  const bytes = Buffer.from(data, "base64");
  if (!bytes.length || bytes.length > maxBytes ||
      bytes.toString("base64") !== data ||
      !hasImageSignature(bytes, mimeType)) return null;

  return { mimeType, data, bytes };
}
