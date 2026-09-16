import http from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const files = {
  '/app.js': readFileSync(join(DIR, 'app.js')),
  '/styles.css': readFileSync(join(DIR, 'styles.css')),
  '/': readFileSync(join(DIR, 'index.html')),
};
const mime = { '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8' };

http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(JSON.stringify({ ok: true, service: 'Tafel&Go' }));
  }
  if (req.url === '/favicon.ico') { res.writeHead(204); return res.end(); }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8', allow: 'GET, HEAD' });
    return res.end('Method not allowed');
  }
  const path = new URL(req.url, 'https://local.invalid').pathname;
  const key = files[path] ? path : '/';
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
