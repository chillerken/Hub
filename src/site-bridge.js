const crypto = require('node:crypto');

// Only the two servers receive this key. It is never a browser credential.
function bridgeAllowed(req, config) {
  const expected = config.siteBridgeSecret;
  const supplied = req.headers['x-luxwash-bridge'];
  if (typeof expected !== 'string' || expected.length < 32 || typeof supplied !== 'string') return false;
  const a = Buffer.from(expected), b = Buffer.from(supplied);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
module.exports = { bridgeAllowed };
