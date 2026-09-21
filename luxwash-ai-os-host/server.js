import http from 'node:http';
import crypto from 'node:crypto';

const PORT = process.env.PORT || 10000;
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || '';
const SESSION_SECRET_HEX = process.env.SESSION_SECRET_HEX || '';
const SUPABASE_EDGE_BASE = (process.env.SUPABASE_EDGE_BASE || '').replace(/\/+$/, '');
const SUPABASE_PROXY_SESSION_SECRET_HEX = process.env.SUPABASE_PROXY_SESSION_SECRET_HEX || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

function hmacHex(secretHex, value) {
  return crypto.createHmac('sha256', Buffer.from(secretHex, 'hex')).update(value).digest('hex');
}
function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}
function validLocalSession(req) {
  const value = parseCookies(req).lwos_session;
  if (!value || !SESSION_SECRET_HEX) return false;
  const [exp, sig] = value.split('.');
  if (!exp || !sig || Number(exp) < Math.floor(Date.now() / 1000)) return false;
  const expected = hmacHex(SESSION_SECRET_HEX, exp);
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}
function localSessionCookie() {
  const exp = String(Math.floor(Date.now() / 1000) + 7 * 24 * 3600);
  const sig = hmacHex(SESSION_SECRET_HEX, exp);
  return `lwos_session=${exp}.${sig}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800`;
}
function supabaseCookie() {
  const exp = String(Math.floor(Date.now() / 1000) + 3600);
  const sig = hmacHex(SUPABASE_PROXY_SESSION_SECRET_HEX, exp);
  return `lwos_session=${exp}.${sig}`;
}
function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers
  });
  res.end(body);
}
function sendHtml(res, html, status = 200, extra = {}) {
  send(res, status, html, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Disposition': 'inline',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; form-action 'self'",
    ...extra
  });
}
function sendJson(res, status, value) {
  send(res, status, JSON.stringify(value), { 'Content-Type': 'application/json; charset=utf-8' });
}
async function readBody(req, max = 1024 * 1024) {
  let size = 0;
  const parts = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) throw new Error('body_too_large');
    parts.push(chunk);
  }
  return Buffer.concat(parts).toString('utf8');
}
async function proxyApi(req, res, path) {
  if (!SUPABASE_EDGE_BASE || !SUPABASE_PROXY_SESSION_SECRET_HEX) {
    return sendJson(res, 503, { error: 'backend_not_configured' });
  }
  const headers = {
    'Cookie': supabaseCookie(),
    'Accept': 'application/json'
  };
  let body;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = await readBody(req);
    headers['Content-Type'] = req.headers['content-type'] || 'application/json';
  }
  const upstream = await fetch(`${SUPABASE_EDGE_BASE}${path}`, {
    method: req.method,
    headers,
    body
  });
  const text = await upstream.text();
  send(res, upstream.status, text, {
    'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8'
  });
}

async function claudeApi(req, res) {
  if (!ANTHROPIC_API_KEY) return sendJson(res, 503, { error: 'anthropic_not_configured' });
  const raw = await readBody(req, 256 * 1024);
  let input;
  try { input = JSON.parse(raw || '{}'); } catch { return sendJson(res, 400, { error: 'invalid_json' }); }
  const prompt = String(input.prompt || '').trim();
  if (!prompt) return sendJson(res, 400, { error: 'prompt_required' });
  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: Math.min(Math.max(Number(input.max_tokens) || 1024, 1), 4096),
      system: 'Je bent de Claude-assistent binnen LuxWash AI OS. Help zakelijk, nauwkeurig en veilig. Verzin geen klant-, prijs- of CRM-gegevens.',
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) return sendJson(res, upstream.status, { error: 'anthropic_error', detail: data?.error?.message || 'request_failed' });
  const text = Array.isArray(data.content) ? data.content.filter(x => x.type === 'text').map(x => x.text).join('\n') : '';
  return sendJson(res, 200, { ok: true, provider: 'anthropic', model: data.model || ANTHROPIC_MODEL, text, usage: data.usage || null });
}

const LOGIN = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#090909"><title>LuxWash AI OS</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 30% 0,#302715,#111 35%,#050505);color:#f7f2e5;font-family:Inter,system-ui,-apple-system,sans-serif}.card{width:min(430px,100%);padding:29px;border-radius:24px;background:#121212f2;border:1px solid #6f5720;box-shadow:0 30px 90px #000a}.brand{color:#ddba55;letter-spacing:.22em;font-size:12px;font-weight:900}.title{font-size:34px;font-weight:900;margin:7px 0}.sub{color:#999;margin:0 0 24px}.in{width:100%;border:1px solid #3b3528;background:#080808;color:#fff;border-radius:13px;padding:15px;font-size:16px;outline:none}.in:focus{border-color:#ddba55}.btn{width:100%;margin-top:12px;border:0;border-radius:13px;padding:15px;background:linear-gradient(135deg,#efd46f,#a97b1c);font-weight:900;color:#171105;font-size:16px}.note{font-size:12px;color:#777;text-align:center;margin-top:17px}.err{margin:0 0 14px;padding:10px 12px;border-radius:10px;background:#361616;color:#ffaaa5;font-size:13px}
</style></head><body><form class="card" method="post" action="/login"><div class="brand">LUXWASH</div><div class="title">AI OS</div><p class="sub">Beveiligde bedrijfscockpit</p>__ERROR__<input class="in" type="password" name="password" placeholder="Toegangscode" autocomplete="current-password" required><button class="btn">Open dashboard</button><div class="note">🔒 Sessie vervalt automatisch na 7 dagen.</div></form></body></html>`;

const DASH = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#080808"><title>LuxWash AI OS</title><style>
:root{--g:#ddb956;--bg:#070707;--p:#121212;--l:#2b2821;--m:#929292;--r:#ff6969;--ok:#6ce0a2}*{box-sizing:border-box}body{margin:0;background:linear-gradient(150deg,#181308,#070707 20%,#040404);color:#f8f4e8;font-family:Inter,system-ui,-apple-system,sans-serif;min-height:100vh}.w{max-width:1400px;margin:auto;padding:16px}.top{position:sticky;top:0;z-index:3;display:flex;justify-content:space-between;gap:10px;align-items:center;padding:12px 0;background:#070707e8;backdrop-filter:blur(10px)}.brand{font-weight:900;letter-spacing:.16em;color:var(--g)}.stamp{font-size:11px;color:#888;margin-top:3px}.b,.sel,.in{border:1px solid var(--l);background:#111;color:#eee;border-radius:11px;padding:10px 12px}.b{cursor:pointer;font-weight:800;text-decoration:none}.gold{background:linear-gradient(135deg,#e9ca69,#a9791d);color:#171105;border:0}.tabs{display:flex;gap:8px;overflow:auto;padding:7px 0 16px}.tab{white-space:nowrap;border:1px solid var(--l);background:#111;color:#aaa;padding:9px 13px;border-radius:999px}.tab.on{background:var(--g);color:#151005}.sec{display:none}.sec.on{display:block}.hero,.grid{display:grid;gap:13px}.hero{grid-template-columns:2fr 1fr}.grid{grid-template-columns:1.35fr 1fr}.p{background:linear-gradient(180deg,#141414,#0d0d0d);border:1px solid var(--l);border-radius:18px;padding:15px}.p h2{font-size:17px;margin:0 0 12px}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:9px}.k{border:1px solid #27231c;background:#090909;border-radius:14px;padding:13px}.kv{font-size:24px;font-weight:900}.kl,.meta,.small{font-size:12px;color:var(--m)}.red{color:var(--r)}.green{color:var(--ok)}.list{display:grid;gap:8px;max-height:620px;overflow:auto}.item{border:1px solid #27231d;background:#090909;border-radius:13px;padding:11px}.it{display:flex;justify-content:space-between;gap:8px}.ttl{font-weight:800}.pill{font-size:10px;text-transform:uppercase;letter-spacing:.06em;background:#2b2415;color:#e7c465;border-radius:999px;padding:5px 7px}.pill.urgent{background:#3a1515;color:#ff9f9f}.pill.high{background:#382a10;color:#ffd56b}.txt{font-size:13px;color:#c3c3c3;margin-top:6px;white-space:pre-wrap}.form{display:grid;grid-template-columns:1fr 140px 120px auto;gap:8px}.empty{padding:24px;border:1px dashed #333;border-radius:13px;color:#777;text-align:center}.space{height:13px}.row{display:flex;gap:8px;margin-top:8px}.topBtns{display:flex;gap:7px}.banner{margin-bottom:13px;padding:11px 13px;border:1px solid #4a3815;background:#1b160b;border-radius:12px;color:#e7cd7b;font-size:13px}@media(max-width:900px){.hero,.grid{grid-template-columns:1fr}.kpis{grid-template-columns:repeat(2,1fr)}.form{grid-template-columns:1fr 1fr}.form .in{grid-column:1/-1}}@media(max-width:520px){.w{padding:10px}.kv{font-size:21px}.p{padding:12px}.topBtns .refresh{display:none}}
</style></head><body><div class="w"><div class="top"><div><div class="brand">LUXWASH AI OS</div><div id="stamp" class="stamp">Live bedrijfscockpit</div></div><div class="topBtns"><button class="b refresh" onclick="load()">↻ Vernieuw</button><a class="b" href="/logout">Uitloggen</a></div></div><div id="backendBanner"></div><div class="tabs"><button class="tab on" data-x="overview">Overzicht</button><button class="tab" data-x="luxwash">🧽 LuxWash</button><button class="tab" data-x="saas">💰 AI SaaS</button><button class="tab" data-x="personal">🧠 Persoonlijk</button><button class="tab" data-x="fitness">🏋️ Fitness</button><button class="tab" data-x="dj">🎧 DJ</button><button class="tab" data-x="claude">🤖 Claude</button></div>
<section id="overview" class="sec on"><div class="hero"><div class="p"><h2>Vandaag</h2><div id="today" class="kpis"></div></div><div class="p"><h2>Systeemstatus</h2><div id="system" class="kpis"></div></div></div><div class="space"></div><div class="grid"><div class="p"><h2>Actie nodig</h2><div id="actions" class="list"></div></div><div class="p"><h2>Recente inbox</h2><div id="inbox" class="list"></div></div></div></section>
<section id="luxwash" class="sec"><div class="p"><h2>LuxWash kerncijfers</h2><div id="luxk" class="kpis"></div></div><div class="space"></div><div class="grid"><div class="p"><h2>LuxWash acties</h2><div id="luxa" class="list"></div></div><div class="p"><h2>Inbox</h2><div id="luxi" class="list"></div></div></div></section>
<section id="saas" class="sec"><div class="p"><h2>AI SaaS</h2><div id="saask" class="kpis"></div></div><div class="space"></div><div class="p"><h2>SaaS acties</h2><div id="saasa" class="list"></div></div></section>
<section id="personal" class="sec"><div class="p"><h2>Nieuwe taak</h2><div class="form"><input id="tt" class="in" placeholder="Wat moet gebeuren?"><select id="td" class="sel"><option value="personal">Persoonlijk</option><option value="luxwash">LuxWash</option><option value="saas">AI SaaS</option><option value="fitness">Fitness</option><option value="dj">DJ</option></select><select id="tp" class="sel"><option value="normal">Normaal</option><option value="high">Hoog</option><option value="urgent">Urgent</option><option value="low">Laag</option></select><button class="b gold" onclick="addTask()">Toevoegen</button></div></div><div class="space"></div><div class="p"><h2>Open taken</h2><div id="tasks" class="list"></div></div></section>
<section id="fitness" class="sec"><div class="p"><h2>Fitness-assistent</h2><p class="small">Trainingsdoelen en acties komen hier samen.</p><div id="fit" class="list"></div></div></section>
<section id="dj" class="sec"><div class="p"><h2>DJ Ferocious</h2><p class="small">Trackselectie, setvoorbereiding en oefentaken.</p><div id="djt" class="list"></div></div></section>
<section id="claude" class="sec"><div class="p"><h2>Claude · LuxWash AI</h2><p class="small">Vraag Claude om analyses, teksten, controles of ideeën. Klant- en CRM-data worden niet automatisch meegestuurd.</p><textarea id="cp" class="in" style="min-height:130px;resize:vertical" placeholder="Geef Claude een opdracht…"></textarea><div class="row"><button id="cb" class="b gold" onclick="askClaude()">Vraag Claude</button><button class="b" onclick="document.getElementById('cp').value=''">Wissen</button></div><div class="space"></div><div id="cr" class="item" style="display:none"><div class="ttl" id="cm">Claude</div><div class="txt" id="ct"></div></div></div></section></div>
<script>
let D=null;const eur=c=>new Intl.NumberFormat('nl-BE',{style:'currency',currency:'EUR'}).format((+c||0)/100),num=v=>new Intl.NumberFormat('nl-BE').format(+v||0),dt=v=>v?new Date(v).toLocaleString('nl-BE',{dateStyle:'short',timeStyle:'short'}):'';function E(t,c,x){const e=document.createElement(t);if(c)e.className=c;if(x!==undefined)e.textContent=x;return e}function K(c,v,l,cl=''){const d=E('div','k');d.append(E('div','kv '+cl,v),E('div','kl',l));c.append(d)}
function KP(){const l=D.luxwash||{},s=D.saas||{};for(const id of ['today','system','luxk','saask'])document.getElementById(id).replaceChildren();let c=document.getElementById('today');K(c,num(l.appointments_today),'Afspraken vandaag');K(c,eur(l.expected_today_cents),'Verwacht vandaag');K(c,eur(l.paid_today_cents),'Betaald vandaag','green');K(c,num(l.leads_new),'Nieuwe leads',l.leads_new?'red':'');c=document.getElementById('system');K(c,num(l.automation_dead),'Automations fout',l.automation_dead?'red':'green');K(c,num(l.social_failed),'Social fout',l.social_failed?'red':'green');K(c,num(l.followups_overdue),'Overdue follow-ups',l.followups_overdue?'red':'green');K(c,num(l.repeat_booking_due),'Herboekingen');c=document.getElementById('luxk');[['customers_total','Klanten'],['followups_open','Open follow-ups'],['quotes_open','Open offertes'],['invoices_open','Open facturen'],['reviews_count','Reviews'],['review_average','Gem. score'],['repeat_booking_due','Herboekingen'],['automation_dead','Automations fout']].forEach(([k,nm])=>K(c,num(l[k]),nm,k==='automation_dead'&&l[k]?'red':''));c=document.getElementById('saask');K(c,num(s.client_accounts_total),'Klantaccounts');K(c,num(s.client_accounts_active),'Actieve klanten');K(c,num(s.subscriptions_active),'Abonnementen');K(c,eur(s.mrr_cents),'MRR');K(c,num(s.leadpilot_accounts),'LeadPilot accounts');K(c,num(s.leadpilot_leads),'LeadPilot leads');K(c,num(s.sales_opportunities_open),'Open sales');K(c,num(s.sales_actions_due),'Sales acties due',s.sales_actions_due?'red':'')}
function A(a){const d=E('div','item'),top=E('div','it'),left=E('div'),t=E('div','ttl',a.title||a.type||'Actie'),p=E('span','pill '+(a.priority||''),a.priority||a.domain||'actie');left.append(t);if(a.detail)left.append(E('div','meta',String(a.detail).slice(0,220)));if(a.due_at)left.append(E('div','meta','⏱ '+dt(a.due_at)));top.append(left,p);d.append(top);if(a.type==='manual_task'){const r=E('div','row'),b=E('button','b','✓ Klaar');b.onclick=()=>done(a.id);r.append(b);d.append(r)}return d}
function AR(){const all=D.actions||[];for(const [id,f] of [['actions',()=>true],['luxa',a=>a.domain==='luxwash'||a.domain==='system'],['saasa',a=>a.domain==='saas']]){const c=document.getElementById(id);c.replaceChildren();const r=all.filter(f);if(!r.length)c.append(E('div','empty','Geen open acties 🎉'));else r.slice(0,50).forEach(a=>c.append(A(a)))}}
function I(i){const d=E('div','item'),top=E('div','it');top.append(E('div','ttl',(i.channel||i.type||'bericht')+' · '+dt(i.occurred_at)),E('span','pill',i.direction||'in'));d.append(top);if(i.subject)d.append(E('div','meta',i.subject));if(i.content)d.append(E('div','txt',i.content));return d}
function IR(){for(const id of ['inbox','luxi']){const c=document.getElementById(id);c.replaceChildren();const r=D.inbox||[];if(!r.length)c.append(E('div','empty','Nog geen inkomende berichten.'));else r.forEach(i=>c.append(I(i)))}}
function TR(){const ts=D.manual_tasks||[];for(const [id,dom] of [['tasks',null],['fit','fitness'],['djt','dj']]){const c=document.getElementById(id);c.replaceChildren();const r=dom?ts.filter(t=>t.domain===dom):ts;if(!r.length)c.append(E('div','empty','Geen open taken.'));else r.forEach(t=>c.append(A({...t,type:'manual_task'})))}}
async function load(){try{const r=await fetch('/api/snapshot',{cache:'no-store'});if(r.status===401){location.href='/';return}if(!r.ok)throw new Error('HTTP '+r.status);D=await r.json();document.getElementById('stamp').textContent='Live · '+new Date(D.generated_at).toLocaleString('nl-BE');document.getElementById('backendBanner').replaceChildren();KP();AR();IR();TR()}catch(e){document.getElementById('stamp').textContent='Backend niet bereikbaar';const b=document.getElementById('backendBanner');b.replaceChildren(E('div','banner','⚠️ Data laden mislukt: '+e.message))}}
async function addTask(){const title=document.getElementById('tt').value.trim();if(!title)return;const r=await fetch('/api/tasks',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({p_domain:document.getElementById('td').value,p_title:title,p_priority:document.getElementById('tp').value})});if(r.ok){document.getElementById('tt').value='';load()}}
async function done(id){const r=await fetch('/api/tasks/'+encodeURIComponent(id),{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:'done'})});if(r.ok)load()}
async function askClaude(){const p=document.getElementById('cp').value.trim();if(!p)return;const b=document.getElementById('cb'),box=document.getElementById('cr'),t=document.getElementById('ct'),m=document.getElementById('cm');b.disabled=true;b.textContent='Claude denkt…';box.style.display='block';m.textContent='Claude';t.textContent='Bezig…';try{const r=await fetch('/api/claude',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({prompt:p})});const d=await r.json();if(!r.ok)throw new Error(d.detail||d.error||('HTTP '+r.status));m.textContent='Claude · '+(d.model||'Anthropic');t.textContent=d.text||'Geen tekst ontvangen.'}catch(e){m.textContent='Claude fout';t.textContent=e.message}finally{b.disabled=false;b.textContent='Vraag Claude'}}
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('on',x===b));document.querySelectorAll('.sec').forEach(x=>x.classList.toggle('on',x.id===b.dataset.x))});load();setInterval(load,60000);
</script></body></html>`;

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/health') return sendJson(res, 200, { ok: true, service: 'luxwash-ai-os-host', version: '1.1', claudeConfigured: Boolean(ANTHROPIC_API_KEY), claudeModel: ANTHROPIC_MODEL });

    if (url.pathname === '/login' && req.method === 'POST') {
      const raw = await readBody(req, 16 * 1024);
      const form = new URLSearchParams(raw);
      const password = form.get('password') || '';
      if (!ADMIN_PASSWORD_HASH || sha256(password) !== ADMIN_PASSWORD_HASH) {
        return sendHtml(res, LOGIN.replace('__ERROR__', '<div class="err">Toegangscode onjuist.</div>'), 401);
      }
      return send(res, 303, '', { 'Location': '/', 'Set-Cookie': localSessionCookie() });
    }
    if (url.pathname === '/logout') {
      return send(res, 303, '', { 'Location': '/', 'Set-Cookie': 'lwos_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0' });
    }

    const isAuthed = validLocalSession(req);
    if (url.pathname.startsWith('/api/')) {
      if (!isAuthed) return sendJson(res, 401, { error: 'unauthorized' });
      if (url.pathname === '/api/claude' && req.method === 'POST') return claudeApi(req, res);
      return proxyApi(req, res, url.pathname);
    }
    if (!isAuthed) return sendHtml(res, LOGIN.replace('__ERROR__', ''));
    if (url.pathname === '/' || url.pathname === '/index.html') return sendHtml(res, DASH);
    return sendJson(res, 404, { error: 'not_found' });
  } catch (err) {
    console.error(err);
    return sendJson(res, 500, { error: 'internal_error' });
  }
});

server.listen(PORT, '0.0.0.0', () => console.log(`LuxWash AI OS listening on ${PORT}`));
