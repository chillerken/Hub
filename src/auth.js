const crypto = require('crypto');

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function makeAdminCookie(secret) {
  const payload = b64url(JSON.stringify({ role: 'admin', exp: Date.now() + 1000 * 60 * 60 * 12 }));
  return `${payload}.${sign(payload, secret)}`;
}

function verifyAdminCookie(token, secret) {
  if (!token || !token.includes('.')) return false;
  const [payload, signature] = token.split('.');
  const expected = sign(payload, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.role === 'admin' && data.exp > Date.now();
  } catch {
    return false;
  }
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(v => v.trim()).filter(Boolean).map(pair => {
    const idx = pair.indexOf('=');
    if (idx < 0) return [pair, ''];
    return [decodeURIComponent(pair.slice(0, idx)), decodeURIComponent(pair.slice(idx + 1))];
  }));
}

module.exports = { makeAdminCookie, verifyAdminCookie, parseCookies };
