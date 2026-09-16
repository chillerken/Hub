import http from 'node:http';

const PORT = process.env.PORT || 3000;
const UPSTREAM = 'https://nahwlhptgdkwhjcfkhkt.supabase.co/functions/v1/leadpilot-site';

function publicBase(req) {
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/health') {
      res.writeHead(200, {'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
      return res.end(JSON.stringify({ok:true, service:'LuxAI LeadPilot'}));
    }
    if (req.url === '/favicon.ico') {
      res.writeHead(204); return res.end();
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, {'content-type':'text/plain; charset=utf-8','allow':'GET, HEAD'});
      return res.end('Method not allowed');
    }

    const incoming = new URL(req.url, 'https://local.invalid');
    const upstreamUrl = `${UPSTREAM}${incoming.search}`;
    const upstream = await fetch(upstreamUrl, {
      headers: {'accept':'text/html,application/xhtml+xml'},
      redirect: 'follow'
    });

    let body = await upstream.text();
    const base = publicBase(req);
    body = body.split(UPSTREAM).join(base);
    body = body.split('https://nahwlhptgdkwhjcfkhkt.supabase.co/storage/v1/object/public/leadpilot-public/index.html').join(base);
    body = body.split('https://nahwlhptgdkwhjcfkhkt.supabase.co/storage/v1/object/public/leadpilot-public/form.html').join(`${base}?form=1`);

    const headers = {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=60, s-maxage=300',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'permissions-policy': 'camera=(), microphone=(), geolocation=()',
      'content-security-policy': "default-src 'self' https://esm.sh https://nahwlhptgdkwhjcfkhkt.supabase.co; script-src 'self' 'unsafe-inline' https://esm.sh; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://nahwlhptgdkwhjcfkhkt.supabase.co https://esm.sh; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://buy.stripe.com;"
    };
    res.writeHead(upstream.ok ? 200 : upstream.status, headers);
    if (req.method === 'HEAD') return res.end();
    return res.end(body);
  } catch (err) {
    console.error(err);
    res.writeHead(502, {'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
    res.end('<!doctype html><html lang="nl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LeadPilot</title><body><h1>LeadPilot is tijdelijk niet bereikbaar</h1><p>Probeer over enkele ogenblikken opnieuw.</p></body></html>');
  }
});

server.listen(PORT, '0.0.0.0', () => console.log(`LeadPilot host listening on ${PORT}`));
