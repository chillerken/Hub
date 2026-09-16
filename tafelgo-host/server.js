import http from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const appSource = readFileSync(join(DIR, 'app.js'), 'utf8');
const pricingPatchSource = readFileSync(join(DIR, 'pricing-patch.js'), 'utf8');
const stripModuleImports = source => source.replace(/^import\s+.*?;\s*$/gm, '');
new Function(stripModuleImports(appSource));
new Function(stripModuleImports(pricingPatchSource));
const files = {
  '/app.js': Buffer.from(appSource),
  '/pricing-patch.js': Buffer.from(pricingPatchSource),
  '/styles.css': readFileSync(join(DIR, 'styles.css')),
  '/': readFileSync(join(DIR, 'index.html')),
};
const mime = { '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8' };

http.createServer((req, res) => {
  const parsed = new URL(req.url, 'https://local.invalid');
  if (parsed.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(JSON.stringify({ ok: true, service: 'Tafel&Go', appSyntax: 'ok', pricingPatchSyntax: 'ok' }));
  }
  if (parsed.pathname === '/start') {
    res.writeHead(302, { location: '/?app=1&signup=1', 'cache-control': 'no-store' });
    return res.end();
  }
  if (parsed.pathname === '/login') {
    res.writeHead(302, { location: '/?app=1', 'cache-control': 'no-store' });
    return res.end();
  }
  if (parsed.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8', allow: 'GET, HEAD' });
    return res.end('Method not allowed');
  }
  const key = files[parsed.pathname] ? parsed.pathname : '/';
  const body = files[key];
  const ext = key === '/' ? '.html' : extname(key);
  res.writeHead(200, {
    'content-type': mime[ext] || 'application/octet-stream',
    'cache-control': key === '/' ? 'no-cache' : 'public, max-age=300',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://esm.sh; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://nahwlhptgdkwhjcfkhkt.supabase.co https://esm.sh; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://buy.stripe.com;"
  });
  if (req.method === 'HEAD') return res.end();
  res.end(body);
}).listen(PORT, '0.0.0.0', () => console.log(`Tafel&Go listening on ${PORT}`));
