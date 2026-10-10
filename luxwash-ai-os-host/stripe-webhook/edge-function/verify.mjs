const encoder = new TextEncoder();

export function parseStripeSignature(header) {
  if (typeof header !== "string" || header.length > 4000) return null;
  let timestamp = null;
  const signatures = [];
  for (const part of header.split(",")) {
    const [key, ...rest] = part.trim().split("=");
    const value = rest.join("=").trim();
    if (key === "t" && /^[0-9]{1,15}$/.test(value)) timestamp = Number(value);
    if (key === "v1" && /^[0-9a-fA-F]{64}$/.test(value)) signatures.push(value.toLowerCase());
  }
  return Number.isSafeInteger(timestamp) && signatures.length
    ? { timestamp, signatures }
    : null;
}

function timingSafeHexEqual(a, b) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

export async function verifyStripeSignature(rawBody, header, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  const parsed = parseStripeSignature(header);
  if (!parsed || typeof rawBody !== "string" || typeof secret !== "string" || !secret) return false;
  if (Math.abs(nowSeconds - parsed.timestamp) > 300) return false;
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signed = encoder.encode(String(parsed.timestamp) + "." + rawBody);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, signed));
  const expected = Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("");
  let valid = false;
  for (const candidate of parsed.signatures) valid = timingSafeHexEqual(expected, candidate) || valid;
  return valid;
}
