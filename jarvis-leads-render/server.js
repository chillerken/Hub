import express from 'express';
import crypto from 'crypto';

const app = express();
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: false }));

const PORT = process.env.PORT || 10000;
const ACCESS_CODE = process.env.JARVIS_ACCESS_CODE || '';
const SESSION_SECRET = process.env.JARVIS_SESSION_SECRET || '';
const BACKEND_TOKEN = process.env.JARVIS_BACKEND_TOKEN || '';
const UI_VERSION = process.env.JARVIS_UI_VERSION || '3.1.0';
const LEADS_URL = 'https://nahwlhptgdkwhjcfkhkt.supabase.co/functions/v1/jarvis-leads/api/leads';

function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}
function sign(exp) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(exp).digest('hex');
}
function makeSession() {
  const exp = String(Math.floor(Date.now() / 1000) + 604800);
  return `${exp}.${sign(exp)}`;
}
function validSession(value) {
  if (!value || !SESSION_SECRET) return false;
  const [exp, sig] = value.split('.');
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  return safeEqual(sign(exp), sig);
}
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
  res.setHeader('Set-Cookie', 'jarvis_session=' + encodeURIComponent(value) + '; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800');
}
function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'jarvis_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
}
function authOk(req) {
  return validSession(getCookie(req, 'jarvis_session'));
}
async function backendFetch(path = '', options = {}) {
  const headers = {
    'X-Jarvis-Token': BACKEND_TOKEN,
    'Accept': 'application/json',
    'Cache-Control': 'no-store',
    ...(options.headers || {})
  };
  return fetch(LEADS_URL + path, { ...options, headers });
}

app.get('/health', (_req, res) => {
  res.status(200).json({
    ok: true,
    service: 'jarvis-leads-render',
    version: UI_VERSION,
    authConfigured: Boolean(ACCESS_CODE && SESSION_SECRET && BACKEND_TOKEN)
  });
});

app.post('/api/login', (req, res) => {
  const password = String(req.body?.password || '');
  if (!ACCESS_CODE || !SESSION_SECRET || !BACKEND_TOKEN) return res.status(503).json({ error: 'auth_not_configured' });
  if (!safeEqual(password, ACCESS_CODE)) return res.status(401).json({ error: 'invalid_login' });
  setSessionCookie(res, makeSession());
  res.status(200).json({ ok: true });
});

app.post('/api/logout', (_req, res) => {
  clearSessionCookie(res);
  res.status(200).json({ ok: true });
});

app.get('/api/leads', async (req, res) => {
  try {
    if (!authOk(req)) return res.status(401).json({ error: 'unauthorized' });
    const upstream = await backendFetch();
    const text = await upstream.text();
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

app.patch('/api/leads/:id', async (req, res) => {
  try {
    if (!authOk(req)) return res.status(401).json({ error: 'unauthorized' });
    const id = String(req.params.id || '');
    if (!/^[0-9a-fA-F-]{36}$/.test(id)) return res.status(400).json({ error: 'invalid_id' });
    const upstream = await backendFetch('/' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body || {})
    });
    const text = await upstream.text();
    if (!upstream.ok) {
      console.error('lead update upstream', upstream.status, text.slice(0, 300));
      return res.status(upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502).type('application/json').send(text || JSON.stringify({ error: 'update_failed' }));
    }
    res.setHeader('Cache-Control', 'no-store');
    res.type('application/json').send(text);
  } catch (error) {
    console.error('lead update error', error);
    res.status(502).json({ error: 'lead_update_error' });
  }
});

const PAGE = String.raw`<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#030711">
<title>JARVIS · LuxWash Leads</title>
<style>
:root{--bg:#030711;--panel:#091421;--line:#173a4d;--cyan:#38eaff;--blue:#6b8cff;--green:#65e6a1;--gold:#ffd56b;--red:#ff7584;--muted:#82a0b0}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 10% 0,#0d2b3e,#030711 36%);color:#effcff;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;min-height:100vh}.wrap{max-width:1450px;margin:auto;padding:14px}.top{position:sticky;top:0;z-index:8;background:#030711e8;backdrop-filter:blur(14px);display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0}.brand{font-size:20px;font-weight:950;letter-spacing:.12em;color:var(--cyan)}.sub,.meta{font-size:11px;color:var(--muted)}.panel{background:#091421e8;border:1px solid var(--line);border-radius:18px;padding:15px;box-shadow:0 20px 60px #0006}.login{max-width:520px;margin:9vh auto}.hidden{display:none!important}.toolbar{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}.input,.select,.button{border:1px solid #1b465c;background:#04101b;color:#ecfbff;border-radius:11px;padding:11px 12px;font:inherit}.input{flex:1;min-width:220px}.button{font-weight:850;cursor:pointer;text-decoration:none}.button:hover{border-color:#39c8e9}.button.primary{border:0;background:linear-gradient(135deg,#25e8f8,#5b79ff);color:#031019}.button.good{border-color:#236f4c;color:#9af1be}.button.warn{border-color:#80661d;color:#ffdc73}.button.bad{border-color:#7e2932;color:#ff9ba6}.button.small{padding:7px 9px;font-size:11px}.button:disabled{opacity:.45;cursor:wait}.kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:9px}.kpi{border:1px solid #14394b;background:#050d16;border-radius:14px;padding:13px}.num{font-size:26px;font-weight:950}.lab{font-size:11px;color:var(--muted)}.list{display:grid;gap:9px}.lead{border:1px solid #14394b;background:#050d16;border-radius:14px;padding:12px}.lead.due{border-color:#8a6c1e;box-shadow:0 0 0 1px #8a6c1e33 inset}.row{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.name{font-weight:900}.badges,.actions{display:flex;gap:5px;flex-wrap:wrap}.actions{margin-top:10px}.badge{font-size:10px;border-radius:999px;padding:4px 7px;background:#122738;color:#a8ebf4}.badge.new{background:#312a10;color:#ffd56b}.badge.contacted{background:#102b36;color:#82e7ff}.badge.qualified{background:#182d4f;color:#a7bcff}.badge.won,.badge.closed{background:#11301f;color:#8df0b8}.badge.lost{background:#35161c;color:#ff9aa7}.badge.test{background:#2b1b36;color:#dbaaff}.badge.due{background:#4b3610;color:#ffe08a}.details{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:9px}.detail{padding:8px;background:#07111c;border-radius:9px;font-size:12px;color:#bfd8e3}.label{color:#688899;font-size:10px;text-transform:uppercase}.ok{color:var(--green)}.err{color:var(--red)}.empty{text-align:center;padding:28px;color:var(--muted)}.toast{position:fixed;right:14px;bottom:14px;z-index:20;background:#0b1b28;border:1px solid #24566c;border-radius:12px;padding:11px 14px;box-shadow:0 10px 40px #0008;max-width:340px}.sectionTitle{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}.sectionTitle h2{font-size:14px;margin:0;letter-spacing:.04em}.hint{font-size:11px;color:var(--muted)}
@media(max-width:900px){.kpis{grid-template-columns:repeat(2,1fr)}.details{grid-template-columns:1fr 1fr}}@media(max-width:560px){.row{flex-direction:column}.details{grid-template-columns:1fr}.brand{font-size:16px}.toolbar{flex-direction:column}.input,.select{min-width:0;width:100%}.actions .button{flex:1;text-align:center}}
</style>
</head>
<body>
<div class="wrap">
<header class="top"><div><div class="brand">JARVIS · LUXWASH</div><div id="stamp" class="sub">Beveiligde live leads</div></div><button id="logoutBtn" class="button hidden">Uitloggen</button></header>
<section id="login" class="panel login"><h2 style="margin-top:0">JARVIS-login</h2><p class="meta">Gebruik je JARVIS-toegangscode.</p><div class="toolbar"><input id="password" class="input" type="password" autocomplete="current-password" placeholder="Toegangscode"><button id="loginBtn" class="button primary">Login & verbind</button></div><div id="loginMsg" class="meta"></div></section>
<main id="app" class="hidden">
<section class="panel"><div class="sectionTitle"><h2>Vandaag</h2><span class="hint">JARVIS sorteert opvolging eerst</span></div><div id="kpis" class="kpis"></div></section>
<div class="toolbar"><input id="search" class="input" placeholder="Zoek naam, bedrijf, e-mail, dienst…"><select id="status" class="select"><option value="">Alle statussen</option><option value="new">new</option><option value="contacted">contacted</option><option value="qualified">qualified</option><option value="won">won</option><option value="closed">closed</option><option value="lost">lost</option></select><select id="tests" class="select"><option value="real">Echte leads</option><option value="all">Alles</option><option value="test">Alleen testrecords</option></select><button id="refreshBtn" class="button">↻ Vernieuw</button></div>
<section class="panel"><div id="list" class="list"></div></section>
</main>
</div>
<div id="toast" class="toast hidden"></div>
<script>
let leads=[];
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>v?new Date(v).toLocaleString('nl-BE',{dateStyle:'short',timeStyle:'short'}):'—';
const isTest=x=>/qa|test|invalid|example\.com/i.test([x.name,x.company,x.email,x.source].filter(Boolean).join(' '));
const isClosed=x=>['won','closed','lost'].includes(x.status);
const isDue=x=>x.follow_up_at&&!isClosed(x)&&new Date(x.follow_up_at).getTime()<=Date.now();
function toast(message,bad=false){const t=$('toast');t.textContent=message;t.style.borderColor=bad?'#7e2932':'#24566c';t.classList.remove('hidden');clearTimeout(window.__toast);window.__toast=setTimeout(()=>t.classList.add('hidden'),2500)}
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
async function updateLead(id,patch,success='Lead bijgewerkt'){
  try{
    const r=await fetch('/api/leads/'+encodeURIComponent(id),{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(patch)});
    if(r.status===401){showLogin('Je sessie is verlopen. Log opnieuw in.');return false;}
    const body=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(body.error||('HTTP '+r.status));
    const i=leads.findIndex(x=>x.id===id);if(i>=0)leads[i]={...leads[i],...body};render();toast(success);return true;
  }catch(e){toast('Bijwerken mislukt: '+e.message,true);return false;}
}
function setStatus(id,status){const patch={status};if(status==='contacted')patch.last_contact_at=new Date().toISOString();updateLead(id,patch,'Status aangepast naar '+status);}
function followTomorrow(id){const d=new Date();d.setDate(d.getDate()+1);d.setHours(9,0,0,0);updateLead(id,{follow_up_at:d.toISOString(),next_action:'Opvolgen'},'Opvolging morgen om 09:00 gepland');}
function editAction(id,current){const value=prompt('Volgende actie voor deze lead:',current||'');if(value===null)return;updateLead(id,{next_action:value},'Volgende actie opgeslagen');}
function render(){
  const q=$('search').value.toLowerCase(),st=$('status').value,tf=$('tests').value;
  const filtered=leads.filter(x=>(!st||x.status===st)&&(!q||[x.name,x.company,x.email,x.phone,x.service,x.source,x.next_action].join(' ').toLowerCase().includes(q))&&(tf==='all'||(tf==='test'&&isTest(x))||(tf==='real'&&!isTest(x)))).sort((a,b)=>(Number(isDue(b))-Number(isDue(a)))||(Number(b.status==='new')-Number(a.status==='new'))||(new Date(b.created_at)-new Date(a.created_at)));
  const real=leads.filter(x=>!isTest(x)),due=real.filter(isDue).length,newc=real.filter(x=>x.status==='new').length,won=real.filter(x=>x.status==='won'||x.status==='closed').length,active=real.filter(x=>!isClosed(x)).length;
  $('kpis').innerHTML=[['Echte leads',real.length],['Opvolgen nu',due],['Nieuw',newc],['Actief',active],['Gewonnen',won]].map(x=>'<div class="kpi"><div class="num">'+x[1]+'</div><div class="lab">'+x[0]+'</div></div>').join('');
  $('list').innerHTML=filtered.length?filtered.map(x=>{
    const dueNow=isDue(x);const phone=x.phone?String(x.phone).replace(/[^+\d]/g,''):'';
    return '<article class="lead '+(dueNow?'due':'')+'"><div class="row"><div><div class="name">'+esc(x.name||x.company||'Naamloos')+'</div><div class="meta">'+esc(x.company||'')+(x.email?' · '+esc(x.email):'')+(x.phone?' · '+esc(x.phone):'')+'</div></div><div class="badges"><span class="badge '+esc(x.status||'')+'">'+esc(x.status||'unknown')+'</span>'+(dueNow?'<span class="badge due">NU OPVOLGEN</span>':'')+(isTest(x)?'<span class="badge test">TEST</span>':'')+(x.opted_out?'<span class="badge lost">OPT-OUT</span>':'')+'</div></div><div class="details"><div class="detail"><div class="label">Dienst</div>'+esc(x.service||'—')+'</div><div class="detail"><div class="label">Bron</div>'+esc(x.source||'—')+'</div><div class="detail"><div class="label">Volgende actie</div>'+esc(x.next_action||'—')+'</div><div class="detail"><div class="label">Follow-up</div>'+fmt(x.follow_up_at)+'</div><div class="detail"><div class="label">Laatste contact</div>'+fmt(x.last_contact_at)+'</div><div class="detail"><div class="label">Agent</div>'+esc(x.agent_owner||'—')+'</div><div class="detail"><div class="label">Aangemaakt</div>'+fmt(x.created_at)+'</div><div class="detail"><div class="label">Bijgewerkt</div>'+fmt(x.updated_at)+'</div></div><div class="actions">'+(phone?'<a class="button small" href="tel:'+esc(phone)+'">📞 Bel</a>':'')+(x.email?'<a class="button small" href="mailto:'+esc(x.email)+'">✉️ Mail</a>':'')+'<button class="button small" onclick="setStatus(\''+esc(x.id)+'\',\'contacted\')">Gecontacteerd</button><button class="button small good" onclick="setStatus(\''+esc(x.id)+'\',\'won\')">Gewonnen</button><button class="button small bad" onclick="setStatus(\''+esc(x.id)+'\',\'lost\')">Verloren</button><button class="button small warn" onclick="followTomorrow(\''+esc(x.id)+'\')">Morgen opvolgen</button><button class="button small" onclick="editAction(\''+esc(x.id)+'\',\''+esc(String(x.next_action||'').replace(/'/g,"\\'"))+'\')">Actie wijzigen</button></div></article>';
  }).join(''):'<div class="empty">Geen leads voor deze filter.</div>';
}
$('loginBtn').onclick=login;$('logoutBtn').onclick=logout;$('refreshBtn').onclick=load;$('search').oninput=render;$('status').onchange=render;$('tests').onchange=render;$('password').addEventListener('keydown',e=>{if(e.key==='Enter')login();});load();setInterval(load,60000);
</script>
</body></html>`;

app.get('/', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.type('html').status(200).send(PAGE);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('JARVIS Leads listening on', PORT, 'version', UI_VERSION);
});
