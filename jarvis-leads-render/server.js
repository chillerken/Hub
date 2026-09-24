import express from 'express';

const app = express();
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: false }));

const PORT = process.env.PORT || 10000;
const SUPABASE_BASE = 'https://nahwlhptgdkwhjcfkhkt.supabase.co';
const AUTH_URL = SUPABASE_BASE + '/functions/v1/luxwash-ai-os/';
const LEADS_URL = SUPABASE_BASE + '/functions/v1/jarvis-leads/api/leads';

function getCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key === name) return decodeURIComponent(value);
  }
  return null;
}

function setSessionCookie(res, value) {
  res.setHeader(
    'Set-Cookie',
    'jarvis_session=' + encodeURIComponent(value) + '; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800'
  );
}

function clearSessionCookie(res) {
  res.setHeader(
    'Set-Cookie',
    'jarvis_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0'
  );
}

async function fetchLeadsWithSession(session) {
  return fetch(LEADS_URL, {
    method: 'GET',
    headers: {
      'Cookie': 'lwos_session=' + session,
      'Accept': 'application/json',
      'Cache-Control': 'no-store'
    },
    redirect: 'manual'
  });
}

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true, service: 'jarvis-leads-render', version: '1.0.0' });
});

app.post('/api/login', async (req, res) => {
  try {
    const password = String(req.body?.password || '');
    if (!password) return res.status(400).json({ error: 'password_required' });

    const body = new URLSearchParams();
    body.set('password', password);

    const upstream = await fetch(AUTH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cache-Control': 'no-store'
      },
      body,
      redirect: 'manual'
    });

    const setCookie = upstream.headers.get('set-cookie') || '';
    const match = setCookie.match(/(?:^|;\s*)lwos_session=([^;]+)/);

    if (!(upstream.status === 303 || upstream.ok) || !match) {
      return res.status(401).json({ error: 'invalid_login' });
    }

    const session = match[1];
    const check = await fetchLeadsWithSession(session);
    if (!check.ok) return res.status(401).json({ error: 'session_not_accepted' });

    setSessionCookie(res, session);
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('login error', error);
    res.status(502).json({ error: 'login_upstream_error' });
  }
});

app.post('/api/logout', (_req, res) => {
  clearSessionCookie(res);
  res.status(200).json({ ok: true });
});

app.get('/api/leads', async (req, res) => {
  try {
    const session = getCookie(req, 'jarvis_session');
    if (!session) return res.status(401).json({ error: 'unauthorized' });

    const upstream = await fetchLeadsWithSession(session);
    const text = await upstream.text();

    if (upstream.status === 401) {
      clearSessionCookie(res);
      return res.status(401).json({ error: 'unauthorized' });
    }

    if (!upstream.ok) {
      console.error('leads upstream', upstream.status, text.slice(0, 300));
      return res.status(502).json({ error: 'leads_upstream_error' });
    }

    res.setHeader('Cache-Control', 'no-store');
    res.type('application/json').send(text);
  } catch (error) {
    console.error('leads error', error);
    res.status(502).json({ error: 'leads_upstream_error' });
  }
});

const PAGE = String.raw`<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#030711">
<title>JARVIS Leads Live</title>
<style>
:root{--bg:#030711;--panel:#091421;--line:#173a4d;--cyan:#38eaff;--green:#65e6a1;--red:#ff7584;--gold:#f4c75e;--muted:#82a0b0}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 10% 0,#0d2b3e,#030711 36%);color:#effcff;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;min-height:100vh}.wrap{max-width:1450px;margin:auto;padding:14px}.top{position:sticky;top:0;z-index:5;background:#030711e8;backdrop-filter:blur(14px);display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0}.brand{font-size:20px;font-weight:950;letter-spacing:.12em;color:var(--cyan)}.sub,.meta{font-size:11px;color:var(--muted)}.panel{background:#091421e8;border:1px solid var(--line);border-radius:18px;padding:15px;box-shadow:0 20px 60px #0006}.login{max-width:520px;margin:9vh auto}.hidden{display:none!important}.toolbar{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}.input,.select,.button{border:1px solid #1b465c;background:#04101b;color:#ecfbff;border-radius:11px;padding:11px 12px;font:inherit}.input{flex:1;min-width:220px}.button{font-weight:850;cursor:pointer}.button.primary{border:0;background:linear-gradient(135deg,#25e8f8,#5b79ff);color:#031019}.kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:9px}.kpi{border:1px solid #14394b;background:#050d16;border-radius:14px;padding:13px}.num{font-size:26px;font-weight:950}.lab{font-size:11px;color:var(--muted)}.list{display:grid;gap:9px}.lead{border:1px solid #14394b;background:#050d16;border-radius:14px;padding:12px}.row{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.name{font-weight:900}.badges{display:flex;gap:5px;flex-wrap:wrap}.badge{font-size:10px;border-radius:999px;padding:4px 7px;background:#122738;color:#a8ebf4}.badge.new{background:#312a10;color:#ffd56b}.badge.won,.badge.closed{background:#11301f;color:#8df0b8}.badge.lost{background:#35161c;color:#ff9aa7}.badge.test{background:#2b1b36;color:#dbaaff}.details{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:9px}.detail{padding:8px;background:#07111c;border-radius:9px;font-size:12px;color:#bfd8e3}.label{color:#688899;font-size:10px;text-transform:uppercase}.ok{color:var(--green)}.err{color:var(--red)}.empty{text-align:center;padding:28px;color:var(--muted)}
@media(max-width:900px){.kpis{grid-template-columns:repeat(2,1fr)}.details{grid-template-columns:1fr 1fr}}@media(max-width:560px){.row{flex-direction:column}.details{grid-template-columns:1fr}.brand{font-size:16px}.toolbar{flex-direction:column}.input{min-width:0;width:100%}}
</style>
</head>
<body>
<div class="wrap">
<header class="top"><div><div class="brand">JARVIS LEADS LIVE</div><div id="stamp" class="sub">LuxWash · beveiligde live data</div></div><button id="logoutBtn" class="button hidden">Uitloggen</button></header>
<section id="login" class="panel login"><h2 style="margin-top:0">LuxWash-login</h2><p class="meta">Gebruik dezelfde toegangscode als voor LuxWash AI OS. De code wordt niet opgeslagen.</p><div class="toolbar"><input id="password" class="input" type="password" autocomplete="current-password" placeholder="Toegangscode"><button id="loginBtn" class="button primary">Login & verbind</button></div><div id="loginMsg" class="meta"></div></section>
<main id="app" class="hidden">
<section class="panel"><div id="kpis" class="kpis"></div></section>
<div class="toolbar"><input id="search" class="input" placeholder="Zoek naam, bedrijf, e-mail, dienst…"><select id="status" class="select"><option value="">Alle statussen</option><option value="new">new</option><option value="won">won</option><option value="closed">closed</option><option value="lost">lost</option></select><select id="tests" class="select"><option value="all">Alles</option><option value="real">Testrecords verbergen</option><option value="test">Alleen testrecords</option></select><button id="refreshBtn" class="button">↻ Vernieuw</button></div>
<section class="panel"><div id="list" class="list"></div></section>
</main>
</div>
<script>
let leads=[];
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>v?new Date(v).toLocaleString('nl-BE',{dateStyle:'short',timeStyle:'short'}):'—';
const isTest=x=>/qa|test|invalid|example\.com/i.test([x.name,x.company,x.email,x.source].filter(Boolean).join(' '));
function showLogin(message=''){ $('login').classList.remove('hidden');$('app').classList.add('hidden');$('logoutBtn').classList.add('hidden');$('loginMsg').textContent=message; }
function showApp(){ $('login').classList.add('hidden');$('app').classList.remove('hidden');$('logoutBtn').classList.remove('hidden'); }
async function load(){
  $('stamp').textContent='Live leads laden…';
  try{
    const r=await fetch('/api/leads',{cache:'no-store'});
    if(r.status===401){showLogin('Log in om de live leads te bekijken.');$('stamp').textContent='Beveiligde login nodig';return;}
    if(!r.ok)throw new Error('HTTP '+r.status);
    leads=await r.json();showApp();render();$('stamp').innerHTML='<span class="ok">LIVE</span> · '+leads.length+' leads · '+new Date().toLocaleString('nl-BE');
  }catch(e){$('stamp').innerHTML='<span class="err">Laden mislukt: '+esc(e.message)+'</span>';}
}
async function login(){
  const password=$('password').value;if(!password)return;
  $('loginBtn').disabled=true;$('loginMsg').textContent='Bezig met aanmelden…';
  try{
    const r=await fetch('/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password})});
    $('password').value='';
    if(!r.ok){showLogin('Toegangscode niet aanvaard.');return;}
    await load();
  }catch(e){showLogin('Aanmelden mislukt. Probeer opnieuw.');}
  finally{$('loginBtn').disabled=false;}
}
async function logout(){await fetch('/api/logout',{method:'POST'});leads=[];showLogin('Uitgelogd.');$('stamp').textContent='Uitgelogd';}
function render(){
  const q=$('search').value.toLowerCase(),st=$('status').value,tf=$('tests').value;
  const filtered=leads.filter(x=>(!st||x.status===st)&&(!q||[x.name,x.company,x.email,x.phone,x.service,x.source,x.next_action].join(' ').toLowerCase().includes(q))&&(tf==='all'||(tf==='test'&&isTest(x))||(tf==='real'&&!isTest(x))));
  const n=leads.length,newc=leads.filter(x=>x.status==='new').length,won=leads.filter(x=>x.status==='won'||x.status==='closed').length,lost=leads.filter(x=>x.status==='lost').length,tests=leads.filter(isTest).length;
  $('kpis').innerHTML=[['Totaal',n],['Nieuw',newc],['Won / closed',won],['Lost',lost],['Testrecords',tests]].map(x=>'<div class="kpi"><div class="num">'+x[1]+'</div><div class="lab">'+x[0]+'</div></div>').join('');
  $('list').innerHTML=filtered.length?filtered.map(x=>'<article class="lead"><div class="row"><div><div class="name">'+esc(x.name||x.company||'Naamloos')+'</div><div class="meta">'+esc(x.company||'')+(x.email?' · '+esc(x.email):'')+(x.phone?' · '+esc(x.phone):'')+'</div></div><div class="badges"><span class="badge '+esc(x.status||'')+'">'+esc(x.status||'unknown')+'</span>'+(isTest(x)?'<span class="badge test">TEST</span>':'')+(x.opted_out?'<span class="badge lost">OPT-OUT</span>':'')+'</div></div><div class="details"><div class="detail"><div class="label">Dienst</div>'+esc(x.service||'—')+'</div><div class="detail"><div class="label">Bron</div>'+esc(x.source||'—')+'</div><div class="detail"><div class="label">Volgende actie</div>'+esc(x.next_action||'—')+'</div><div class="detail"><div class="label">Follow-up</div>'+fmt(x.follow_up_at)+'</div><div class="detail"><div class="label">Laatste contact</div>'+fmt(x.last_contact_at)+'</div><div class="detail"><div class="label">Agent</div>'+esc(x.agent_owner||'—')+'</div><div class="detail"><div class="label">Aangemaakt</div>'+fmt(x.created_at)+'</div><div class="detail"><div class="label">Bijgewerkt</div>'+fmt(x.updated_at)+'</div></div></article>').join(''):'<div class="empty">Geen leads voor deze filter.</div>';
}
$('loginBtn').onclick=login;$('logoutBtn').onclick=logout;$('refreshBtn').onclick=load;$('search').oninput=render;$('status').onchange=render;$('tests').onchange=render;$('password').addEventListener('keydown',e=>{if(e.key==='Enter')login();});load();setInterval(load,60000);
</script>
</body></html>`;

app.get('/', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.type('html').status(200).send(PAGE);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('JARVIS Leads listening on', PORT);
});
