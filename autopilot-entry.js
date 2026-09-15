const http = require('node:http');
const config = require('./src/config');
const legacy = require('./server').server;
const makeAutopilot = require('./src/autopilot');
const makeStore = require('./src/store');
const { verifyAdminCookie, parseCookies } = require('./src/auth');

const autopilot = makeAutopilot(config);
const store = makeStore(config);
const central = require('./src/core/routes')(config, store);
let timer = null;

function securityHeaders(extra = {}) {
  const headers = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Strict-Transport-Security': 'max-age=31536000',
    'Cache-Control': 'no-store',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors 'self'; base-uri 'self'",
    ...extra
  };
  return Object.fromEntries(Object.entries(headers).filter(([, v]) => v !== null && v !== undefined));
}
function send(res, status, body, type = 'text/html; charset=utf-8', extra = {}) {
  res.writeHead(status, securityHeaders({ 'Content-Type': type, ...extra })); res.end(body);
}
function json(res, status, obj, extra = {}) { send(res, status, JSON.stringify(obj), 'application/json; charset=utf-8', extra); }
function redirect(res, to, extra = {}) { send(res, 302, '', 'text/plain; charset=utf-8', { Location: to, ...extra }); }
function sameOrigin(req) {
  const origin = req.headers.origin; if (!origin) return true;
  try { return new URL(origin).origin === new URL(config.baseUrl).origin; } catch { return false; }
}
function isAdmin(req) { return verifyAdminCookie(parseCookies(req.headers.cookie || '').aba_admin, config.cookieSecret); }
const helpers = { send, json, redirect, sameOrigin, isAdmin };

const app = http.createServer(async (req, res) => {
  try {
    if (await autopilot.webhook(req, res, helpers)) return;
    if (await autopilot.routes(req, res, helpers)) return;
    legacy.emit('request', req, res);
  } catch (error) {
    console.error('Gateway request error', error);
    if (!res.headersSent) json(res, 500, { error: 'Interne serverfout' }); else res.end();
  }
});

async function start() {
  await store.init();
  await central.db('health');
  app.listen(config.port, '0.0.0.0', () => console.log(`Productiegateway draait op ${config.baseUrl}; Lead Autopilot=${autopilot.ready ? 'enabled' : 'disabled'}`));
  if (config.automationIntervalMinutes > 0) {
    const run = async () => {
      await central.automation.run().catch(e => console.error('LuxWash automation error', e.message));
      await autopilot.run().catch(e => console.error('Lead Autopilot automation error', e.message));
    };
    run().catch(() => {});
    timer = setInterval(run, config.automationIntervalMinutes * 60 * 1000); timer.unref();
  }
}
async function shutdown() {
  if (timer) clearInterval(timer);
  app.close(async () => { await store.close().catch(() => {}); process.exit(0); });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
start().catch(error => { console.error('Gateway startup failed', error); process.exit(1); });
