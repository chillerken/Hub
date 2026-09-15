const crypto = require('node:crypto');
const makeDb = require('./db');
const makeAuth = require('./auth');
const makeStripe = require('./stripe');
const makeMailer = require('./mailer');

const hits = new Map();
const NICHES = {
  schoonmaak:['schoonmaakbedrijf','Reageer automatisch op offerte- en schoonmaakaanvragen terwijl jij op locatie werkt.'],
  detailing:['detailer / carwash','Laat aanvragen voor detailing, interieur- en exterieurreiniging niet afkoelen.'],
  elektricien:['elektricien','Vang offertevragen en dringende aanvragen op en stuur klanten meteen naar de juiste volgende stap.'],
  loodgieter:['loodgieter','Bevestig nieuwe aanvragen direct en volg ze beperkt op zonder achter je inbox aan te lopen.'],
  tuin:['tuinaannemer','Volg offerteaanvragen voor aanleg en onderhoud automatisch en netjes op.'],
  salon:['salon','Zet websitevragen sneller om in een boeking zonder dagelijkse handmatige reminders.']
};
const CITIES = new Set(['aalst','gent','antwerpen','brussel','leuven','brugge']);

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ''));
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));

function shell(title, body, script = '') {
  return `<!doctype html><html lang="nl-BE"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Automatische leadopvolging voor lokale dienstverleners."><title>${esc(title)} · LuxAI Lead Autopilot</title><style>
:root{--bg:#09101a;--card:#111b29;--line:#26364b;--text:#f5f7fa;--muted:#9fb0c4;--gold:#e9bd64;--blue:#65b6ff;--good:#63d39a;--bad:#ff7d7d}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 80% 0,#162943 0,transparent 34%),var(--bg);color:var(--text);font:16px/1.55 Inter,system-ui,Arial,sans-serif}a{color:inherit}.wrap{width:min(1120px,calc(100% - 34px));margin:auto}.nav{display:flex;gap:20px;align-items:center;justify-content:space-between;padding:20px 0}.brand{text-decoration:none;font-size:19px;letter-spacing:-.02em}.brand b{color:var(--gold)}.navlinks{display:flex;gap:14px;align-items:center}.navlinks a{text-decoration:none}.hero{padding:72px 0 48px;display:grid;grid-template-columns:1.15fr .85fr;gap:38px;align-items:center}.eyebrow{text-transform:uppercase;letter-spacing:.13em;color:var(--blue);font-weight:800;font-size:12px}h1{font-size:clamp(42px,7vw,76px);line-height:.98;letter-spacing:-.05em;margin:13px 0 20px}h2{font-size:clamp(31px,5vw,48px);letter-spacing:-.04em;margin:8px 0 14px}h3{margin:2px 0 10px}.lead{font-size:20px;color:#c7d2df;max-width:720px}.muted{color:var(--muted)}.card{background:linear-gradient(180deg,#142033,#0f1825);border:1px solid var(--line);border-radius:20px;padding:24px;box-shadow:0 18px 55px #0005}.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.split{display:grid;grid-template-columns:1fr 1fr;gap:18px}.section{padding:54px 0}.btn{appearance:none;border:1px solid #354961;background:#18263a;color:#fff;border-radius:12px;padding:11px 16px;font-weight:750;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}.btn.primary{background:var(--blue);color:#07111d;border-color:transparent}.btn.gold{background:var(--gold);color:#171003;border-color:transparent}.btn.ghost{background:transparent}.actions{display:flex;gap:11px;flex-wrap:wrap;margin-top:22px}.flow{display:grid;gap:9px}.flow div{padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:#0d1724}.badge{display:inline-flex;padding:5px 9px;border-radius:999px;background:#1b2d43;color:#a8d6ff;font-size:12px;font-weight:800}.price .amount{font-size:40px;font-weight:900;letter-spacing:-.04em}.amount small{font-size:14px;color:var(--muted);font-weight:600}.list{padding-left:18px;color:#d8e2ed}.form{display:grid;gap:13px}.form label{display:grid;gap:6px;font-size:14px;color:#c7d3df}.form input,.form textarea,.form select{width:100%;background:#09111c;border:1px solid #34475e;color:white;border-radius:10px;padding:12px}.authbox{max-width:520px;margin:64px auto}.notice{padding:12px;border:1px solid #506a86;border-radius:10px;background:#162338;margin:12px 0}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.kpi{background:#0c1622;border:1px solid var(--line);border-radius:14px;padding:16px}.kpi b{display:block;font-size:25px;margin-top:4px}.table{width:100%;border-collapse:collapse}.table th,.table td{padding:11px;border-bottom:1px solid var(--line);text-align:left}.code{white-space:pre-wrap;word-break:break-all;background:#070c13;border:1px solid var(--line);padding:12px;border-radius:10px}.status{display:inline-flex;padding:4px 8px;border-radius:999px;background:#29384a}.status.active,.status.trialing{background:#17392c;color:#83e7af}.status.past_due{background:#4a2a1d;color:#ffbd91}footer{padding:45px 0 65px;color:var(--muted);font-size:14px}@media(max-width:780px){.hero,.split,.grid3{grid-template-columns:1fr}.nav{align-items:flex-start}.navlinks{flex-wrap:wrap;justify-content:flex-end}.kpis{grid-template-columns:1fr 1fr}h1{font-size:48px}}
</style></head><body>${body}<footer><div class="wrap">LuxAI Lead Autopilot · <a href="/autopilot/privacy">Privacy</a> · <a href="/autopilot/terms">Voorwaarden</a> · <a href="/autopilot/contact">Contact</a></div></footer>${script}</body></html>`;
}
function nav(loggedIn=false) {
  return `<div class="wrap"><nav class="nav"><a class="brand" href="/autopilot">LuxAI <b>Lead Autopilot</b></a><div class="navlinks"><a href="/autopilot/free-tool">Gratis calculator</a><a href="/autopilot/pricing">Prijzen</a>${loggedIn ? '<a class="btn" href="/autopilot/app">Dashboard</a>' : '<a href="/autopilot/login">Inloggen</a><a class="btn primary" href="/autopilot/signup">Start</a>'}</div></nav></div>`;
}
function landing() {
  return shell('Automatische leadopvolging', `${nav()}<main><section class="wrap hero"><div><div class="eyebrow">Voor lokale dienstverleners</div><h1>Geen warme websitelead meer laten afkoelen.</h1><p class="lead">Elke aanvraag krijgt binnen seconden een bevestiging, daarna maximaal twee relevante opvolgingen en een duidelijke boekingsknop. Jij ziet alleen wat aandacht nodig heeft.</p><div class="actions"><a class="btn primary" href="/autopilot/signup">Start met Lead Autopilot</a><a class="btn ghost" href="/autopilot/free-tool">Bereken gemiste omzet</a></div><p class="muted">Vanaf €99/maand excl. btw. Stopbaar via Stripe. Geen massa-outreach: alleen opvolging van echte inkomende aanvragen.</p></div><div class="card"><div class="badge">SETUP ONCE → AUTOMATE</div><div class="flow" style="margin-top:16px"><div>1. Bezoeker vult jouw formulier in</div><div><strong>2. Antwoord binnen seconden</strong></div><div>3. Slimme opvolging stopt bij interesse/opt-out</div><div>4. Boeking → review → referral</div><div><strong>5. Jij krijgt alleen uitzonderingen</strong></div></div></div></section><section class="section"><div class="wrap"><h2>Gebouwd rond één meetbaar probleem</h2><p class="lead">Geen contentmachine, geen dashboard dat je elke dag moet voeden. Het product verdient zijn plek door sneller en consistenter op aanvragen te reageren.</p><div class="grid3" style="margin-top:28px"><div class="card"><h3>Direct antwoord</h3><p class="muted">Automatische ontvangstbevestiging met jouw bedrijfsnaam, boekingslink en reply-adres.</p></div><div class="card"><h3>Beperkte follow-up</h3><p class="muted">Maximaal twee servicegerichte reminders. Klik, conversie of opt-out stopt de flow.</p></div><div class="card"><h3>Echte cijfers</h3><p class="muted">Leads, engagement, conversies en abonnementstatus uit de echte database.</p></div></div></div></section><section class="section"><div class="wrap card"><div class="split"><div><div class="eyebrow">Gratis acquisitiekanaal</div><h2>Lead Leak Calculator</h2><p class="muted">Laat een prospect zelf berekenen hoeveel omzet trage of gemiste opvolging mogelijk kost.</p></div><div style="display:flex;align-items:center;justify-content:center"><a class="btn gold" href="/autopilot/free-tool">Open gratis tool</a></div></div></div></section></main>`);
}
function pricing(message = '') {
  return shell('Prijzen', `${nav()}<main class="section"><div class="wrap"><div class="eyebrow">Eenvoudige B2B-prijzen</div><h2>Een gemiste opdracht kost vaak meer dan een maand software.</h2>${message ? `<div class="notice">${esc(message)}</div>` : ''}<div class="grid3" style="margin-top:26px"><div class="card price"><span class="badge">Instap</span><h3>Core</h3><div class="amount">€99<small>/m excl. btw</small></div><ul class="list"><li>1 bedrijf / locatie</li><li>Tot 150 leads per maand</li><li>Directe e-mailbevestiging</li><li>2 automatische follow-ups</li><li>Boekings- en stoplinks</li><li>Dashboard + rapportage</li></ul><div class="actions"><a class="btn primary" href="/autopilot/signup?plan=core_monthly">€99/maand</a><a class="btn ghost" href="/autopilot/signup?plan=core_annual">€990/jaar</a></div><p class="muted">2 maanden voordeel bij jaarlijkse betaling.</p></div><div class="card price"><span class="badge">Beste balans</span><h3>Growth</h3><div class="amount">€179<small>/m excl. btw</small></div><ul class="list"><li>Alles van Core</li><li>Tot 500 leads per maand</li><li>Meerdere formulieren</li><li>Referral tracking</li><li>Prioritaire support</li><li>Uitgebreidere analytics</li></ul><div class="actions"><a class="btn gold" href="/autopilot/signup?plan=growth_monthly">€179/maand</a><a class="btn ghost" href="/autopilot/signup?plan=growth_annual">€1.790/jaar</a></div><p class="muted">2 maanden voordeel bij jaarlijkse betaling.</p></div><div class="card price"><span class="badge">Optioneel</span><h3>Assisted setup</h3><div class="amount">€149<small> eenmalig excl. btw</small></div><ul class="list"><li>Wij plaatsen je formulier</li><li>Boekingslink + branding</li><li>End-to-end controle</li><li>Geen verplichte setup fee</li></ul><p class="muted">Zelf installeren blijft inbegrepen in elk abonnement.</p></div></div></div></main>`);
}
function freeTool() {
  const script = `<script>function calc(){const f=document.querySelector('#calc'),leads=+f.leads.value||0,val=+f.value.value||0,loss=Math.min(100,Math.max(0,+f.loss.value||0))/100;const potential=leads*val*loss;document.querySelector('#result').innerHTML='<b>Indicatie: €'+potential.toLocaleString('nl-BE',{maximumFractionDigits:0})+'/maand aan omzet die volgens jouw eigen aannames risico loopt.</b><br><span class="muted">Dit is geen omzetgarantie. Het gebruikt alleen de aantallen en percentages die je zelf invult.</span>';}</script>`;
  return shell('Lead Leak Calculator', `${nav()}<main class="section"><div class="wrap split"><div><div class="eyebrow">Gratis tool</div><h2>Wat kost trage leadopvolging mogelijk?</h2><p class="lead">Gebruik je eigen cijfers. Zo krijg je een transparante indicatie zonder verzonnen benchmarks.</p></div><div class="card"><form id="calc" class="form" onsubmit="event.preventDefault();calc()"><label>Nieuwe websiteleads per maand<input name="leads" type="number" min="0" value="20" required></label><label>Gemiddelde waarde van een gewonnen klant (€)<input name="value" type="number" min="0" value="250" required></label><label>Percentage leads dat je denkt te verliezen door trage/mislukte opvolging<input name="loss" type="number" min="0" max="100" value="20" required></label><button class="btn gold">Bereken</button></form><div id="result" class="notice" style="margin-top:16px">Vul je eigen aannames in.</div><a class="btn primary" href="/autopilot/pricing">Automatiseer de opvolging</a></div></div></main>`, script);
}
function seoPage(niche, city) {
  if (!NICHES[niche] || !CITIES.has(city)) return null;
  const n=NICHES[niche], c=city[0].toUpperCase()+city.slice(1), title=`Leadopvolging voor ${n[0]}s in ${c}`;
  return shell(title, `${nav()}<main><section class="wrap hero"><div><div class="eyebrow">${esc(c)} · ${esc(n[0])}</div><h1>${esc(title)}</h1><p class="lead">${esc(n[1])}</p><div class="actions"><a class="btn primary" href="/autopilot/signup">Start Lead Autopilot</a><a class="btn ghost" href="/autopilot/free-tool">Bereken je leadlek</a></div></div><div class="card"><h3>Wat er automatisch gebeurt</h3><ul class="list"><li>Webaanvraag wordt veilig opgeslagen</li><li>Directe transactionele bevestiging</li><li>Maximaal twee relevante opvolgingen</li><li>Boekingslink, opt-out en engagement tracking</li><li>Maandoverzicht en uitzonderingsmeldingen</li></ul></div></section><section class="section"><div class="wrap"><h2>Geen SEO-truc, wel een concrete workflow</h2><p class="lead">Deze pagina beschrijft dezelfde echte dienst voor een specifieke sector en regio. Er worden geen verzonnen resultaten, reviews of lokale vestigingen geclaimd.</p></div></section></main>`);
}
function sitemap(config) {
  const urls = ['/autopilot','/autopilot/pricing','/autopilot/free-tool'];
  for (const n of Object.keys(NICHES)) for (const c of CITIES) urls.push(`/autopilot/voor/${n}/${c}`);
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(u=>`<url><loc>${config.baseUrl}${u}</loc></url>`).join('')}</urlset>`;
}
function authPage(kind, message = '', plan = '', ref = '') {
  const signup = kind === 'signup'; const forgot = kind === 'forgot';
  const title = signup ? 'Account maken' : forgot ? 'Wachtwoord herstellen' : 'Inloggen';
  const action = signup ? '/autopilot/signup' : forgot ? '/autopilot/forgot' : '/autopilot/login';
  return shell(title, `${nav()}<main class="wrap"><div class="authbox card"><h2>${title}</h2>${message ? `<div class="notice">${esc(message)}</div>` : ''}<form class="form" method="post" action="${action}"><label>E-mail<input name="email" type="email" required autocomplete="email"></label>${forgot ? '' : '<label>Wachtwoord<input name="password" type="password" minlength="8" required autocomplete="current-password"></label>'}${plan ? `<input type="hidden" name="plan" value="${esc(plan)}">` : ''}${ref ? `<input type="hidden" name="ref" value="${esc(ref)}">` : ''}<button class="btn primary" type="submit">${signup ? 'Account maken' : forgot ? 'Stuur herstellink' : 'Inloggen'}</button></form><p class="muted">${signup ? 'Al klant? <a href="/autopilot/login">Log in</a>' : forgot ? '<a href="/autopilot/login">Terug naar login</a>' : 'Nog geen account? <a href="/autopilot/signup">Maak er één</a> · <a href="/autopilot/forgot">Wachtwoord vergeten?</a>'}</p></div></main>`);
}
function callbackPage() {
  const script = `<script>(async()=>{const p=new URLSearchParams(location.hash.slice(1)),q=new URLSearchParams(location.search);const at=p.get('access_token'),rt=p.get('refresh_token'),type=p.get('type'),plan=q.get('plan'),ref=q.get('ref');if(!at||!rt){document.querySelector('#m').textContent='De aanmeldlink is ongeldig of verlopen.';return}const r=await fetch('/autopilot/api/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({access_token:at,refresh_token:rt,expires_in:p.get('expires_in')||3600,ref})});if(!r.ok){document.querySelector('#m').textContent='Aanmelden mislukt.';return}if(type==='recovery'){location.replace('/autopilot/reset');return}if(plan){const c=await fetch('/autopilot/api/checkout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({plan})});const d=await c.json();if(c.ok&&d.url){location.replace(d.url);return}}location.replace('/autopilot/app')})()</script>`;
  return shell('Aanmelden', `${nav()}<main class="wrap"><div class="authbox card"><h2>Aanmelden…</h2><p id="m" class="muted">Je beveiligde sessie wordt klaargezet.</p></div></main>`, script);
}
function resetPage(message = '') {
  return shell('Nieuw wachtwoord', `${nav(true)}<main class="wrap"><div class="authbox card"><h2>Kies een nieuw wachtwoord</h2>${message ? `<div class="notice">${esc(message)}</div>` : ''}<form class="form" method="post" action="/autopilot/reset"><label>Nieuw wachtwoord<input name="password" type="password" minlength="8" required autocomplete="new-password"></label><button class="btn primary">Wachtwoord opslaan</button></form></div></main>`);
}
function appPage() {
  const script = `<script>
const e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(u,o){const r=await fetch(u,o);if(r.status===401){location='/autopilot/login';throw Error('login')}const d=await r.json();if(!r.ok)throw Error(d.error||'Fout');return d}
async function load(){try{const d=await api('/autopilot/api/overview');const a=d.account,x=d.analytics;document.querySelector('#kpis').innerHTML=[['Leads',x.leads||0],['Engaged',x.engaged||0],['Conversies',x.converted||0],['Plan',a.plan||'geen']].map(v=>'<div class="kpi"><span class="muted">'+e(v[0])+'</span><b>'+e(v[1])+'</b></div>').join('');document.querySelector('#status').innerHTML='<span class="status '+e(a.subscription_status)+'">'+e(a.subscription_status||'niet actief')+'</span>';const active=['active','trialing','past_due'].includes(a.subscription_status);document.querySelector('#subscribe-actions').style.display=active?'none':'flex';document.querySelector('#billing-btn').style.display=a.has_billing_customer?'inline-flex':'none';document.querySelector('#business').value=a.business_name||'';document.querySelector('#website').value=a.website||'';document.querySelector('#booking').value=a.booking_url||'';document.querySelector('#review').value=a.review_url||'';document.querySelector('#reply').value=a.reply_email||a.email||'';document.querySelector('#embed').textContent='<iframe src="'+location.origin+'/autopilot/form/'+a.slug+'" style="width:100%;min-height:520px;border:0" loading="lazy"></iframe>';document.querySelector('#referral').textContent=location.origin+'/autopilot/ref/'+a.referral_code;document.querySelector('#leads').innerHTML=(d.leads||[]).map(l=>'<tr><td>'+e(l.name)+'</td><td>'+e(l.service||'')+'</td><td>'+e(l.status)+'</td><td>'+new Date(l.created_at).toLocaleString('nl-BE')+'</td><td>'+(l.status==='converted'?'✓':'<button class="btn" onclick="convertLead(\''+e(l.id)+'\')">Klant</button>')+'</td></tr>').join('')||'<tr><td colspan="5" class="muted">Nog geen leads.</td></tr>'}catch(err){document.querySelector('#msg').textContent=err.message}}
async function save(ev){ev.preventDefault();const f=new FormData(ev.target),data=Object.fromEntries(f);try{await api('/autopilot/api/account',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});document.querySelector('#msg').textContent='Instellingen opgeslagen.';load()}catch(e){document.querySelector('#msg').textContent=e.message}}
async function convertLead(id){try{await api('/autopilot/api/lead/convert',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id})});load()}catch(e){document.querySelector('#msg').textContent=e.message}}
async function billing(){try{const d=await api('/autopilot/api/portal',{method:'POST'});location=d.url}catch(e){document.querySelector('#msg').textContent=e.message}}
async function subscribe(plan){try{const d=await api('/autopilot/api/checkout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({plan})});location=d.url}catch(e){document.querySelector('#msg').textContent=e.message}}
async function support(ev){ev.preventDefault();const message=new FormData(ev.target).get('message');try{await api('/autopilot/api/support',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message})});ev.target.reset();document.querySelector('#msg').textContent='Supportvraag verzonden.'}catch(e){document.querySelector('#msg').textContent=e.message}}
addEventListener('DOMContentLoaded',load)</script>`;
  return shell('Dashboard', `${nav(true)}<main class="section"><div class="wrap"><div class="split"><div><div class="eyebrow">Klantdashboard</div><h2>Lead Autopilot</h2><p id="msg" class="muted"></p></div><div class="card"><b>Abonnement</b><div id="status" style="margin:8px 0 14px">Laden…</div><button id="billing-btn" class="btn" onclick="billing()">Beheer betaling / abonnement</button><div id="subscribe-actions" class="actions" style="margin-top:12px"><button class="btn primary" onclick="subscribe('core_monthly')">Start Core</button><button class="btn gold" onclick="subscribe('growth_monthly')">Start Growth</button></div></div></div><div id="kpis" class="kpis" style="margin:24px 0"></div><div class="split"><section class="card"><h3>Onboarding & instellingen</h3><form class="form" onsubmit="save(event)"><label>Bedrijfsnaam<input id="business" name="business_name" required></label><label>Website<input id="website" name="website" type="url" required></label><label>Boekingslink<input id="booking" name="booking_url" type="url" required></label><label>Reviewlink<input id="review" name="review_url" type="url"></label><label>Reply e-mail<input id="reply" name="reply_email" type="email" required></label><button class="btn primary">Opslaan</button></form></section><section class="card"><h3>Plaats je formulier</h3><p class="muted">Kopieer deze iframe één keer naar je website. Daarna komen echte leads rechtstreeks binnen.</p><pre id="embed" class="code">Laden…</pre><h3>Referral</h3><p class="muted">Deel je link. Na een gekwalificeerde betalende referral wordt automatisch €99 accountkrediet klaargezet.</p><pre id="referral" class="code">Laden…</pre></section></div><section class="card" style="margin-top:18px"><h3>Support</h3><p class="muted">Alleen uitzonderingen die je niet zelf kunt oplossen.</p><form class="form" onsubmit="support(event)"><label>Vraag<textarea name="message" minlength="5" maxlength="3000" required rows="4"></textarea></label><button class="btn">Stuur supportvraag</button></form></section><section class="card" style="margin-top:18px;overflow:auto"><h3>Recente leads</h3><table class="table"><thead><tr><th>Naam</th><th>Dienst</th><th>Status</th><th>Binnengekomen</th><th>Conversie</th></tr></thead><tbody id="leads"><tr><td colspan="5">Laden…</td></tr></tbody></table></section></div></main>`, script);
}
function adminPage() {
  const script = `<script>async function load(){const r=await fetch('/autopilot/api/admin/overview');if(r.status===401){location='/admin/login';return}const d=await r.json();if(!r.ok){document.querySelector('#m').textContent=d.error;return}const x=d.metrics;document.querySelector('#k').innerHTML=[['Omzet vandaag','€'+((x.revenue_today_cents||0)/100).toFixed(0)],['Omzet deze maand','€'+((x.revenue_month_cents||0)/100).toFixed(0)],['MRR','€'+((x.mrr_cents||0)/100).toFixed(0)],['Klanten',x.customers||0],['Actieve abonnementen',x.active_subscriptions||0],['Nieuwe klanten (30d)',x.new_customers_30d||0],['Leads',x.leads||0],['Conversieratio',(x.conversion_rate||0)+'%'],['Churn 30d',(x.churn_30d||0)+'%'],['Mislukte betalingen',x.failed_payments||0],['Support open',x.open_support||0]].map(v=>'<div class="kpi"><span class="muted">'+v[0]+'</span><b>'+v[1]+'</b></div>').join('');document.querySelector('#accounts').innerHTML=(d.accounts||[]).map(a=>'<tr><td>'+a.email+'</td><td>'+a.business_name+'</td><td>'+a.plan+'</td><td>'+a.subscription_status+'</td><td>'+new Date(a.created_at).toLocaleDateString('nl-BE')+'</td></tr>').join('')}addEventListener('DOMContentLoaded',load)</script>`;
  return shell('Admin', `${nav(true)}<main class="section"><div class="wrap"><div class="eyebrow">Operator dashboard</div><h2>Alleen wat aandacht nodig heeft</h2><p id="m" class="muted">Echte SaaS-data, geen voorbeeldwaarden.</p><div id="k" class="kpis" style="margin:24px 0"></div><div class="card" style="overflow:auto"><h3>Accounts</h3><table class="table"><thead><tr><th>E-mail</th><th>Bedrijf</th><th>Plan</th><th>Status</th><th>Sinds</th></tr></thead><tbody id="accounts"></tbody></table></div></div></main>`, script);
}
function legal(kind) {
  const privacy = kind === 'privacy';
  return shell(privacy ? 'Privacybeleid' : 'Voorwaarden', `${nav()}<main class="section"><div class="wrap card"><h2>${privacy ? 'Privacybeleid' : 'Algemene voorwaarden'}</h2>${privacy ? '<p>LuxAI Lead Autopilot verwerkt account-, facturatie- en leadgegevens uitsluitend om de dienst te leveren, te beveiligen en te ondersteunen. Klanten blijven verantwoordelijk voor de rechtsgrond waarmee zij persoonsgegevens van hun eigen leads verzamelen. Leads krijgen een duidelijke stopmogelijkheid. Bewaartermijnen worden beperkt en gegevens worden niet verkocht.</p><p>Betalingen worden verwerkt door Stripe. Transactionele e-mail wordt verwerkt via de geconfigureerde e-mailprovider. Voor toegang en databasefuncties wordt Supabase gebruikt.</p><p>Voor privacyverzoeken kan een klant via het dashboard support contacteren. Essentiële sessiecookies zijn nodig om in te loggen; er worden in deze basisversie geen advertentiecookies geplaatst.</p>' : '<p>Lead Autopilot is een B2B-softwaredienst voor automatische opvolging van aanvragen die een klant zelf rechtmatig ontvangt. De klant mag de dienst niet gebruiken voor massaspam, gekochte lijsten of ongevraagde bulkmail.</p><p>Abonnementen worden vooraf via Stripe betaald en verlengen automatisch totdat ze via het Stripe-klantenportaal worden stopgezet. Jaarplannen worden per jaar gefactureerd. Prijzen op de website zijn exclusief toepasselijke btw.</p><p>De klant is verantwoordelijk voor correcte bedrijfs-, boekings- en reviewlinks en voor de inhoud/rechtsgrond van ingezonden leadgegevens. Misbruik, fraude of veiligheidsrisico kan aanleiding geven tot opschorting.</p>'}<p class="muted">Deze juridische basis beschrijft de werkelijke productflow. Laat ze vóór brede internationale uitrol toetsen aan je definitieve ondernemingsgegevens, btw-registraties en verwerkersafspraken.</p></div></main>`);
}
function contactPage() {
  return shell('Contact', `${nav()}<main class="wrap"><div class="authbox card"><h2>Support</h2><p class="muted">Bestaande klanten kunnen vanuit hun dashboard een supportvraag indienen. Voor verkoopvragen kun je reageren op de e-mails die je tijdens onboarding ontvangt.</p><a class="btn primary" href="/autopilot/login">Naar dashboard</a></div></main>`);
}
function simpleMessage(title, text, link=true) { return shell(title, `${nav()}<main class="wrap"><div class="authbox card"><h2>${esc(title)}</h2><p>${esc(text)}</p>${link?'<a class="btn primary" href="/autopilot/app">Naar dashboard</a>':''}</div></main>`); }
function leadForm(a) {
  return `<!doctype html><html lang="nl-BE"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aanvraag · ${esc(a.business_name)}</title><style>body{margin:0;background:#fff;color:#17202b;font:16px/1.5 system-ui}.box{max-width:600px;margin:auto;padding:22px}.form{display:grid;gap:12px}label{display:grid;gap:5px}input,textarea{padding:11px;border:1px solid #b8c4d0;border-radius:9px;font:inherit}button{padding:12px;border:0;border-radius:9px;background:#15273b;color:white;font-weight:750}.small{font-size:12px;color:#5d6976}.check{display:flex;gap:8px;align-items:flex-start}.check input{width:auto;margin-top:4px}</style></head><body><div class="box"><h2>Vraag informatie aan bij ${esc(a.business_name)}</h2><form class="form" method="post" action="/autopilot/api/capture/${esc(a.slug)}"><label>Naam<input name="name" maxlength="120" required></label><label>E-mail<input name="email" type="email" maxlength="160" required></label><label>Telefoon (optioneel)<input name="phone" maxlength="60"></label><label>Dienst<input name="service" maxlength="160"></label><label>Vraag<textarea name="message" maxlength="1500" rows="5"></textarea></label><label class="check"><input type="checkbox" name="privacy_consent" value="yes" required><span>Ik ga ermee akkoord dat mijn gegevens worden gebruikt om deze aanvraag te beantwoorden en beperkt op te volgen. Ik kan automatische opvolging op elk moment stoppen.</span></label><button>Verstuur aanvraag</button></form><p class="small">Beveiligde leadopvolging via LuxAI Lead Autopilot.</p></div></body></html>`;
}

async function readBody(req, limit = 100000) {
  let raw=''; for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw)>limit) throw Object.assign(new Error('Aanvraag te groot'), {status:413}); }
  const ct = req.headers['content-type'] || ''; let data={};
  if (ct.includes('application/json')) { try { data = raw ? JSON.parse(raw) : {}; } catch { throw Object.assign(new Error('Ongeldige JSON'), {status:400}); } }
  else if (ct.includes('application/x-www-form-urlencoded')) data = Object.fromEntries(new URLSearchParams(raw));
  else data={raw}; return {raw,data};
}

module.exports = function makeAutopilot(config) {
  const enabled = process.env.AUTOPILOT_ENABLED === 'true';
  const db = makeDb(config), auth = makeAuth(config), stripe = makeStripe(config), mailer = makeMailer(config);
  const signKey = crypto.createHash('sha256').update(`${config.cookieSecret}:lead-autopilot`).digest();
  const signed = (id, action) => crypto.createHmac('sha256', signKey).update(`${id}:${action}`).digest('base64url');
  const sameSig = (id, action, token) => { const a=Buffer.from(signed(id,action)),b=Buffer.from(String(token||''));return a.length===b.length&&crypto.timingSafeEqual(a,b); };
  function rateOk(req,key,limit,windowMs){const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'x').split(',')[0].trim(),k=`${key}:${ip}`,now=Date.now(),a=(hits.get(k)||[]).filter(x=>now-x<windowMs);if(a.length>=limit)return false;a.push(now);hits.set(k,a);return true;}
  async function accountFor(req) {
    const s = await auth.session(req);
    if (!s.user) return { session: s, account: null };
    const account = await db('account_claim', { email: s.user.email, user_id: s.user.id });
    return { session: s, account };
  }
  function refreshedHeaders(s) { return s?.refreshed ? { 'Set-Cookie': auth.sessionCookies(s.refreshed) } : {}; }
  function requireEnabled() { if (!enabled) throw Object.assign(new Error('Lead Autopilot backend wacht nog op de eenmalige productie-activatie.'), { status: 503 }); }

  async function immediateLeadEmail(lead) {
    const book = `${config.baseUrl}/autopilot/r/${lead.id}/${signed(lead.id, 'book')}?action=book`;
    const stop = `${config.baseUrl}/autopilot/r/${lead.id}/${signed(lead.id, 'stop')}?action=stop`;
    const text = `Dag ${lead.name},\n\nBedankt voor je aanvraag bij ${lead.business_name}. We hebben je vraag goed ontvangen${lead.service ? ` over ${lead.service}` : ''}.\n\nWil je meteen een geschikt moment kiezen? ${book}\n\nJe kunt op deze e-mail antwoorden; je antwoord gaat naar ${lead.reply_email}.\n\nAutomatische opvolging stoppen: ${stop}\n\nGroeten,\n${lead.business_name}\n\nDit transactionele bericht werd automatisch verstuurd via LuxAI Lead Autopilot.`;
    return mailer.send({ to: lead.email, subject: `Aanvraag ontvangen — ${lead.business_name}`, text, replyTo: lead.reply_email });
  }
  async function followupEmail(lead) {
    const book = `${config.baseUrl}/autopilot/r/${lead.id}/${signed(lead.id, 'book')}?action=book`;
    const stop = `${config.baseUrl}/autopilot/r/${lead.id}/${signed(lead.id, 'stop')}?action=stop`;
    const first = Number(lead.follow_up_stage || 0) === 0;
    const text = first
      ? `Dag ${lead.name},\n\nEven een korte opvolging van je aanvraag bij ${lead.business_name}. Als je nog interesse hebt, kun je hier meteen verder: ${book}\n\nGeen verdere automatische opvolging nodig? ${stop}\n\nGroeten,\n${lead.business_name}`
      : `Dag ${lead.name},\n\nDit is onze laatste automatische herinnering over je aanvraag bij ${lead.business_name}. Je kunt hier een moment kiezen: ${book}\n\nStop opvolging: ${stop}\n\nGroeten,\n${lead.business_name}`;
    return mailer.send({ to: lead.email, subject: first ? `Nog interesse? — ${lead.business_name}` : `Laatste opvolging — ${lead.business_name}`, text, replyTo: lead.reply_email });
  }

  async function routes(req, res, helpers) {
    const { send, json, redirect, sameOrigin, isAdmin } = helpers;
    const url = new URL(req.url, config.baseUrl); const p = url.pathname;
    if (!p.startsWith('/autopilot')) return false;
    try {
      if (req.method === 'GET' && p === '/autopilot') { send(res, 200, landing()); return true; }
      if (req.method === 'GET' && p === '/autopilot/pricing') { send(res, 200, pricing(url.searchParams.get('cancelled') ? 'Checkout geannuleerd. Er is niets aangerekend.' : '')); return true; }
      if (req.method === 'GET' && p === '/autopilot/free-tool') { send(res, 200, freeTool()); return true; }
      if (req.method === 'GET' && p === '/autopilot/sitemap.xml') { send(res, 200, sitemap(config), 'application/xml; charset=utf-8', { 'Cache-Control':'public, max-age=3600' }); return true; }
      const seoMatch = p.match(/^\/autopilot\/voor\/([a-z-]+)\/([a-z-]+)$/);
      if (req.method === 'GET' && seoMatch) { const page=seoPage(seoMatch[1],seoMatch[2]); if(!page){send(res,404,'Niet gevonden','text/plain; charset=utf-8');return true} send(res,200,page,undefined,{ 'Cache-Control':'public, max-age=3600' }); return true; }
      if (req.method === 'GET' && p === '/autopilot/privacy') { send(res, 200, legal('privacy')); return true; }
      if (req.method === 'GET' && p === '/autopilot/terms') { send(res, 200, legal('terms')); return true; }
      if (req.method === 'GET' && p === '/autopilot/contact') { send(res, 200, contactPage()); return true; }
      if (req.method === 'GET' && p === '/autopilot/auth/callback') { send(res, 200, callbackPage()); return true; }

      const referralMatch = p.match(/^\/autopilot\/ref\/([A-Z0-9]{6,20})$/i);
      if (req.method === 'GET' && referralMatch) { redirect(res, `/autopilot/signup?ref=${encodeURIComponent(referralMatch[1].toUpperCase())}`); return true; }
      if (req.method === 'GET' && p === '/autopilot/signup') { send(res, 200, authPage('signup', '', url.searchParams.get('plan') || '', url.searchParams.get('ref') || '')); return true; }
      if (req.method === 'POST' && p === '/autopilot/signup') {
        if (!sameOrigin(req)) throw Object.assign(new Error('Ongeldige oorsprong'), { status: 403 });
        if (!rateOk(req, 'lra-signup', 8, 15 * 60000)) throw Object.assign(new Error('Te veel pogingen'), { status: 429 });
        requireEnabled(); const { data } = await readBody(req); const email = String(data.email || '').trim().toLowerCase(), password = String(data.password || '');
        if (!validEmail(email) || password.length < 8) throw Object.assign(new Error('Gebruik een geldig e-mailadres en minstens 8 tekens als wachtwoord.'), { status: 400 });
        const plan = String(data.plan || ''), ref = String(data.ref || '');
        const callback = `${config.baseUrl}/autopilot/auth/callback?plan=${encodeURIComponent(plan)}&ref=${encodeURIComponent(ref)}`;
        const r = await auth.signUp(email, password, callback);
        if (r.access_token) {
          const account = await db('account_claim', { email, user_id: r.user.id, ref });
          if (plan && stripe.PLANS[plan]) { const co = await stripe.checkout({ account, planKey: plan }); redirect(res, co.url, { 'Set-Cookie': auth.sessionCookies(r) }); return true; }
          redirect(res, '/autopilot/app', { 'Set-Cookie': auth.sessionCookies(r) }); return true;
        }
        send(res, 200, authPage('signup', 'Controleer je inbox om je e-mailadres te bevestigen.', plan, ref)); return true;
      }
      if (req.method === 'GET' && p === '/autopilot/login') { send(res, 200, authPage('login')); return true; }
      if (req.method === 'POST' && p === '/autopilot/login') {
        if (!sameOrigin(req)) throw Object.assign(new Error('Ongeldige oorsprong'), { status: 403 });
        if (!rateOk(req, 'lra-login', 10, 15 * 60000)) throw Object.assign(new Error('Te veel pogingen'), { status: 429 });
        requireEnabled(); const { data } = await readBody(req); const r = await auth.signIn(String(data.email || '').trim().toLowerCase(), String(data.password || ''));
        await db('account_claim', { email: r.user.email, user_id: r.user.id });
        redirect(res, '/autopilot/app', { 'Set-Cookie': auth.sessionCookies(r) }); return true;
      }
      if (req.method === 'GET' && p === '/autopilot/forgot') { send(res, 200, authPage('forgot')); return true; }
      if (req.method === 'POST' && p === '/autopilot/forgot') {
        if (!sameOrigin(req)) throw Object.assign(new Error('Ongeldige oorsprong'), { status: 403 });
        requireEnabled(); const { data } = await readBody(req); const email = String(data.email || '').trim().toLowerCase();
        if (validEmail(email)) await auth.recover(email, `${config.baseUrl}/autopilot/auth/callback`);
        send(res, 200, authPage('forgot', 'Als dit adres bestaat, is een herstellink verzonden.')); return true;
      }
      if (req.method === 'GET' && p === '/autopilot/reset') {
        requireEnabled(); const { session } = await accountFor(req); if (!session.user) { redirect(res, '/autopilot/login'); return true; }
        send(res, 200, resetPage(), undefined, refreshedHeaders(session)); return true;
      }
      if (req.method === 'POST' && p === '/autopilot/reset') {
        if (!sameOrigin(req)) throw Object.assign(new Error('Ongeldige oorsprong'), { status: 403 });
        requireEnabled(); const { session } = await accountFor(req); if (!session.user) throw Object.assign(new Error('Niet ingelogd'), { status: 401 });
        const { data } = await readBody(req); if (String(data.password || '').length < 8) throw Object.assign(new Error('Minstens 8 tekens'), { status: 400 });
        await auth.updatePassword(session.accessToken, String(data.password)); send(res, 200, resetPage('Wachtwoord aangepast.'), undefined, refreshedHeaders(session)); return true;
      }
      if (req.method === 'POST' && p === '/autopilot/logout') { redirect(res, '/autopilot', { 'Set-Cookie': auth.clearCookies() }); return true; }
      if (req.method === 'GET' && p === '/autopilot/app') {
        requireEnabled(); const { session } = await accountFor(req); if (!session.user) { redirect(res, '/autopilot/login'); return true; }
        send(res, 200, appPage(), undefined, refreshedHeaders(session)); return true;
      }
      if (req.method === 'GET' && p === '/autopilot/admin') {
        requireEnabled(); if (!isAdmin(req)) { redirect(res, '/admin/login'); return true; } send(res, 200, adminPage()); return true;
      }
      if (req.method === 'GET' && p === '/autopilot/success') {
        requireEnabled(); send(res, 200, simpleMessage('Betaling ontvangen', 'Stripe verwerkt je abonnement. Je dashboard wordt automatisch geactiveerd zodra de webhook bevestigd is.')); return true;
      }

      const formMatch = p.match(/^\/autopilot\/form\/([a-z0-9-]{4,80})$/);
      if (req.method === 'GET' && formMatch) { requireEnabled(); const account = await db('public_account', { slug: formMatch[1] }); if (!account) throw Object.assign(new Error('Formulier niet gevonden'), { status: 404 }); send(res, 200, leadForm(account), undefined, { 'X-Frame-Options': null, 'Content-Security-Policy': "default-src 'self'; style-src 'unsafe-inline'; script-src 'none'; form-action 'self'; frame-ancestors *; base-uri 'self'" }); return true; }
      const trackMatch = p.match(/^\/autopilot\/r\/([0-9a-f-]{36})\/([A-Za-z0-9_-]+)$/);
      if (req.method === 'GET' && trackMatch) {
        requireEnabled(); const id = trackMatch[1], action = url.searchParams.get('action') || ''; if (!uuid(id) || !['book','stop'].includes(action) || !sameSig(id, action, trackMatch[2])) throw Object.assign(new Error('Ongeldige link'), { status: 403 });
        const result = await db('lead_action', { id, action });
        if (action === 'book') { redirect(res, result.booking_url || result.website || '/autopilot'); return true; }
        send(res, 200, simpleMessage('Opvolging gestopt', 'Je ontvangt geen verdere automatische opvolging voor deze aanvraag.')); return true;
      }

      if (!p.startsWith('/autopilot/api/')) { send(res, 404, 'Niet gevonden', 'text/plain; charset=utf-8'); return true; }
      requireEnabled();
      if (req.method === 'POST' && p === '/autopilot/api/session') {
        if (!sameOrigin(req)) throw Object.assign(new Error('Ongeldige oorsprong'), { status: 403 }); const { data } = await readBody(req);
        const user = await auth.getUser(data.access_token); if (!user) throw Object.assign(new Error('Ongeldige sessie'), { status: 401 });
        await db('account_claim', { email: user.email, user_id: user.id, ref: String(data.ref || '') });
        json(res, 200, { ok: true }, { 'Set-Cookie': auth.sessionCookies(data) }); return true;
      }
      const captureMatch = p.match(/^\/autopilot\/api\/capture\/([a-z0-9-]{4,80})$/);
      if (req.method === 'POST' && captureMatch) {
        if (!rateOk(req, 'lra-capture', 20, 60000)) throw Object.assign(new Error('Te veel aanvragen'), { status: 429 });
        const { data } = await readBody(req); const email = String(data.email || '').trim().toLowerCase();
        if (!String(data.name || '').trim() || !validEmail(email) || String(data.privacy_consent || '') !== 'yes') throw Object.assign(new Error('Naam, geldig e-mailadres en privacytoestemming zijn verplicht.'), { status: 400 });
        const lead = await db('lead_capture', { slug: captureMatch[1], name: String(data.name).trim().slice(0,120), email, phone: String(data.phone || '').trim().slice(0,60), service: String(data.service || '').trim().slice(0,160), message: String(data.message || '').trim().slice(0,1500), source: 'hosted_form' });
        const sent = await immediateLeadEmail(lead); await db('lead_delivery', { id: lead.id, stage: 'confirmation', ok: sent.ok, provider_id: sent.id || '', error: sent.error || '' });
        const ownerText=`Nieuwe lead via Lead Autopilot\n\nNaam: ${lead.name}\nE-mail: ${lead.email}\nTelefoon: ${lead.phone || '-'}\nDienst: ${lead.service || '-'}\nBericht: ${lead.message || '-'}\n\nDashboard: ${config.baseUrl}/autopilot/app`;
        const ownerSent=await mailer.send({to:lead.reply_email,subject:`Nieuwe lead — ${lead.name}`,text:ownerText}); await db('lead_delivery',{id:lead.id,stage:'owner_notification',ok:ownerSent.ok,provider_id:ownerSent.id||'',error:ownerSent.error||''});
        send(res, 201, simpleMessage('Aanvraag ontvangen', `Bedankt. ${lead.business_name} heeft je aanvraag ontvangen en de opvolging is gestart.`)); return true;
      }

      const { session, account } = await accountFor(req); if (!session.user || !account) throw Object.assign(new Error('Niet ingelogd'), { status: 401 });
      const headers = refreshedHeaders(session);
      if (req.method === 'GET' && p === '/autopilot/api/overview') { const [analytics, leads] = await Promise.all([db('account_analytics', { account_id: account.id }), db('lead_list', { account_id: account.id, limit: 50 })]); const publicAccount={ id:account.id,email:account.email,business_name:account.business_name,website:account.website,booking_url:account.booking_url,review_url:account.review_url,reply_email:account.reply_email,slug:account.slug,plan:account.plan,billing_cycle:account.billing_cycle,subscription_status:account.subscription_status,referral_code:account.referral_code,onboarding_complete:account.onboarding_complete,has_billing_customer:Boolean(account.stripe_customer_id) }; json(res, 200, { account:publicAccount, analytics, leads }, headers); return true; }
      if (req.method === 'POST' && p === '/autopilot/api/account') {
        if (!sameOrigin(req)) throw Object.assign(new Error('Ongeldige oorsprong'), { status: 403 }); const { data } = await readBody(req);
        const values = { business_name: String(data.business_name || '').trim().slice(0,120), website: String(data.website || '').trim(), booking_url: String(data.booking_url || '').trim(), review_url: String(data.review_url || '').trim(), reply_email: String(data.reply_email || '').trim().toLowerCase() };
        if (!values.business_name || !/^https:\/\//.test(values.website) || !/^https:\/\//.test(values.booking_url) || !validEmail(values.reply_email) || (values.review_url && !/^https:\/\//.test(values.review_url))) throw Object.assign(new Error('Vul geldige HTTPS-links en een geldig reply-adres in.'), { status: 400 });
        json(res, 200, { account: await db('account_update', { account_id: account.id, ...values }) }, headers); return true;
      }
      if (req.method === 'POST' && p === '/autopilot/api/checkout') {
        if (!sameOrigin(req)) throw Object.assign(new Error('Ongeldige oorsprong'), { status: 403 }); if (['active','trialing','past_due'].includes(account.subscription_status)) throw Object.assign(new Error('Je hebt al een abonnement. Beheer het via Stripe.'), { status: 409 }); const { data } = await readBody(req); const out = await stripe.checkout({ account, planKey: data.plan }); json(res, 200, { url: out.url }, headers); return true;
      }
      if (req.method === 'POST' && p === '/autopilot/api/portal') { if (!sameOrigin(req)) throw Object.assign(new Error('Ongeldige oorsprong'), { status: 403 }); const out = await stripe.portal(account); json(res, 200, { url: out.url }, headers); return true; }
      if (req.method === 'POST' && p === '/autopilot/api/lead/convert') { if (!sameOrigin(req)) throw Object.assign(new Error('Ongeldige oorsprong'), { status: 403 }); const { data } = await readBody(req); if (!uuid(data.id)) throw Object.assign(new Error('Ongeldige lead'), { status: 400 }); json(res, 200, { lead: await db('lead_convert', { account_id: account.id, id: data.id }) }, headers); return true; }
      if (req.method === 'POST' && p === '/autopilot/api/support') { if (!sameOrigin(req)) throw Object.assign(new Error('Ongeldige oorsprong'), { status: 403 }); const { data } = await readBody(req); const message = String(data.message || '').trim().slice(0,3000); if (message.length < 5) throw Object.assign(new Error('Omschrijf je vraag kort.'), { status: 400 }); json(res, 201, { ticket: await db('support_create', { account_id: account.id, message }) }, headers); return true; }
      if (req.method === 'GET' && p === '/autopilot/api/admin/overview') {
        if (!isAdmin(req)) throw Object.assign(new Error('Niet gemachtigd'), { status: 401 }); const [metrics, accounts] = await Promise.all([db('admin_analytics'), db('admin_accounts', { limit: 100 })]); json(res, 200, { metrics, accounts }); return true;
      }
      if (req.method === 'POST' && p === '/autopilot/api/stripe-webhook') { throw Object.assign(new Error('Webhookroute moet vóór sessie-auth worden verwerkt'), { status: 500 }); }
      json(res, 404, { error: 'Niet gevonden' }, headers); return true;
    } catch (error) {
      const status = Number(error.status || 500); const message = error.message;
      if (p.startsWith('/autopilot/api/')) { json(res, status, { error: message }); return true; }
      send(res, status, simpleMessage(status >= 500 ? 'Tijdelijk niet beschikbaar' : 'Actie niet gelukt', message, status < 500)); return true;
    }
  }

  async function webhook(req, res, helpers) {
    const { json } = helpers; const p = new URL(req.url, config.baseUrl).pathname;
    if (p !== '/autopilot/api/stripe-webhook') return false;
    try {
      requireEnabled(); if (req.method !== 'POST') throw Object.assign(new Error('POST vereist'), { status: 405 });
      const { raw } = await readBody(req, 500000); if (!stripe.verify(raw, req.headers['stripe-signature'])) throw Object.assign(new Error('Ongeldige Stripe-handtekening'), { status: 401 });
      const event = JSON.parse(raw); const claim = await db('webhook_claim', { provider: 'stripe', id: event.id }); if (!claim.claimed) { json(res, 200, { ok: true, duplicate: true }); return true; }
      const o = event.data?.object || {};
      if (event.type === 'checkout.session.completed' && (o.payment_status === 'paid' || o.status === 'complete')) await db('stripe_checkout', { account_id: o.client_reference_id || o.metadata?.account_id, email: o.customer_details?.email || o.customer_email || '', customer_id: o.customer || '', subscription_id: o.subscription || '', plan: o.metadata?.plan || 'core', billing: o.metadata?.billing || 'monthly' });
      else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') await db('stripe_subscription', { account_id: o.metadata?.account_id || '', subscription_id: o.id, customer_id: o.customer || '', status: event.type === 'customer.subscription.deleted' ? 'canceled' : (o.status || 'unknown'), plan: o.metadata?.plan || '' });
      else if (event.type === 'invoice.payment_failed') await db('stripe_invoice', { subscription_id: o.subscription || o.parent?.subscription_details?.subscription || '', status: 'payment_failed', invoice_id: o.id });
      else if (event.type === 'invoice.paid') await db('stripe_invoice', { subscription_id: o.subscription || o.parent?.subscription_details?.subscription || '', status: 'paid', invoice_id: o.id, amount_paid: o.amount_paid || 0 });
      await db('webhook_finish', { id: event.id }); json(res, 200, { ok: true }); return true;
    } catch (e) { json(res, Number(e.status || 500), { error: e.message }); return true; }
  }

  async function run() {
    if (!enabled) return { ok: true, disabled: true };
    const due = await db('due_followups', { limit: 30 }); const results = [];
    for (const lead of due) {
      const sent = await followupEmail(lead);
      const row = await db('followup_result', { id: lead.id, ok: sent.ok, provider_id: sent.id || '', error: sent.error || '' });
      results.push({ id: lead.id, ok: sent.ok, status: row?.status });
    }
    const summaries = await db('summary_due');
    for (const a of summaries) {
      const usage = Number(a.leads_30d || 0), upsell = a.plan === 'core' && usage >= 100 ? `\nJe zit aan ${usage}/150 leads. Growth geeft ruimte tot 500 leads.` : '';
      const text = `Maandoverzicht ${a.business_name || 'Lead Autopilot'}\n\nLeads: ${usage}\nEngaged: ${a.engaged_30d || 0}\nConversies gemarkeerd: ${a.converted_30d || 0}${upsell}\n\nReferral-link: ${config.baseUrl}/autopilot/ref/${a.referral_code}\nDashboard: ${config.baseUrl}/autopilot/app`;
      const sent = await mailer.send({ to: a.email, subject: 'Je Lead Autopilot maandoverzicht', text });
      if (sent.ok) await db('summary_sent', { id: a.id });
    }
    const reviews = await db('review_due');
    for (const r of reviews) {
      const text = `Dag ${r.name},\n\nBedankt dat je voor ${r.business_name} koos. Als je tevreden bent, helpt een korte review enorm: ${r.review_url}\n\nAlvast bedankt!\n${r.business_name}`;
      const sent = await mailer.send({ to: r.email, subject: `Hoe was je ervaring met ${r.business_name}?`, text, replyTo: r.reply_email });
      if (sent.ok) await db('review_sent', { id: r.id });
    }
    const winbacks = await db('winback_due');
    for (const a of winbacks) {
      const text = `Dag,\n\nJe Lead Autopilot-abonnement bij ${a.business_name || 'LuxAI'} is gestopt. Je account blijft bewaard zodat je eenvoudig opnieuw kunt starten wanneer je weer automatische leadopvolging nodig hebt.\n\nOpnieuw starten: ${config.baseUrl}/autopilot/app\n\nGroeten,\nLuxAI Lead Autopilot`;
      const sent = await mailer.send({ to: a.email, subject: 'Lead Autopilot opnieuw activeren', text });
      if (sent.ok) await db('winback_sent', { id: a.id });
    }
    if (stripe.secretConfigured) {
      const referrals = await db('qualified_referrals');
      for (const r of referrals) {
        try { await stripe.applyCredit(r.stripe_customer_id, Number(r.reward_cents || 9900), 'Referral reward — LuxAI Lead Autopilot'); await db('referral_rewarded', { id: r.id }); } catch (e) { console.error('Referral credit failed', r.id, e.message); }
      }
    }
    await db('retention').catch(()=>{});
    return { ok: true, processed: results.length, summaries: summaries.length, reviews: reviews.length, winbacks: winbacks.length, results };
  }

  return { routes, webhook, run, ready: enabled, billingReady: stripe.ready, emailReady: mailer.ready };
};
