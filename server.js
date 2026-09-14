const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const querystring = require('querystring');

const config = require('./src/config');
const makeStore = require('./src/store');
const makeMessenger = require('./src/messaging');
const makeAi = require('./src/ai');
const makeAutomation = require('./src/automation');
const bookingCatalog = require('./src/bookingCatalog');
const html = require('./src/html');
const { makeAdminCookie, verifyAdminCookie, parseCookies } = require('./src/auth');

const store = makeStore(config);
const messenger = makeMessenger(config, store);
const ai = makeAi(config);
const central = require('./src/core/routes')(config, store);
const automation = central.automation;
const PUBLIC = path.join(__dirname, 'public');
const hits = new Map();
let automationTimer = null;

function securityHeaders(extra={}) {
  return {
    'X-Content-Type-Options':'nosniff',
    'X-Frame-Options':'SAMEORIGIN',
    // Keep native same-origin form POSTs identifiable; do not disclose referrers to other sites.
    'Referrer-Policy':'same-origin',
    'Strict-Transport-Security':'max-age=31536000',
    'Cache-Control':'no-store',
    'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://www.luxwash.online; connect-src 'self'; form-action 'self'; frame-ancestors 'self'; base-uri 'self'",
    ...extra
  };
}
function send(res,status,body,type='text/html; charset=utf-8',extra={}) { res.writeHead(status,securityHeaders({'Content-Type':type,...extra})); res.end(body); }
function json(res,status,obj,extra={}) { send(res,status,JSON.stringify(obj),'application/json; charset=utf-8',extra); }
function redirect(res,to,extra={}) { send(res,302,'','text/plain; charset=utf-8',{'Location':to,...extra}); }
function safeEq(a,b) { const A=Buffer.from(String(a)),B=Buffer.from(String(b)); return A.length===B.length && crypto.timingSafeEqual(A,B); }
function isAdmin(req) { if(req.url.startsWith('/api/core/admin/') && require('./src/site-bridge').bridgeAllowed(req,config))return true; return req.memberDenied!==true && verifyAdminCookie(parseCookies(req.headers.cookie||'').aba_admin, config.cookieSecret); }
function rateOk(req,key,limit,windowMs) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'x').split(',')[0].trim();
  const k = `${key}:${ip}`; const t=Date.now();
  const a=(hits.get(k)||[]).filter(x=>t-x<windowMs);
  if (a.length >= limit) return false;
  a.push(t); hits.set(k,a); return true;
}
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).origin === new URL(config.baseUrl).origin; } catch { return false; }
}
async function body(req) {
  return new Promise((resolve,reject)=>{
    let d='';
    req.on('data',c=>{ d+=c; if(d.length>100000){ reject(new Error('Request te groot')); req.destroy(); } });
    req.on('end',()=>{
      const ct=req.headers['content-type']||'';
      try {
        if(ct.includes('application/json')) resolve(d?JSON.parse(d):{});
        else if(ct.includes('application/x-www-form-urlencoded')) resolve(querystring.parse(d));
        else resolve({raw:d});
      } catch(e){ reject(e); }
    });
    req.on('error',reject);
  });
}
function staticFile(url,res) {
  const map={'/app.css':'app.css','/public.js':'public.js','/admin.js':'admin.js'};
  if(!map[url]) return false;
  const f=path.join(PUBLIC,map[url]);
  const type=url.endsWith('.css')?'text/css; charset=utf-8':'application/javascript; charset=utf-8';
  send(res,200,fs.readFileSync(f),type,{'Cache-Control':'public, max-age=3600'});
  return true;
}
function validEmail(v){ return !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v)); }

const server = http.createServer(async (req,res) => {
  try {
    const u = new URL(req.url, config.baseUrl);
    const p = u.pathname;
    if(config.centralDashboard&&req.method==='GET'&&(p==='/cockpit'||p==='/admin'||p.startsWith('/admin/'))){const section=p.includes('appointment')?'calendar':p.includes('leads')?'leads':p.includes('activity')?'audit_logs':'overzicht';return redirect(res,'https://www.luxwash.online/controle#'+section);}
    if (staticFile(p,res)) return;
    const adminToken=parseCookies(req.headers.cookie||'').aba_admin;
    if (verifyAdminCookie(adminToken,config.cookieSecret)) {
      const claims=JSON.parse(Buffer.from(adminToken.split('.')[0],'base64url').toString());
      if (claims.sub) { const member=await central.db('member',{id:claims.sub}); req.memberDenied=!member||!['owner','admin'].includes(member.role); }
    }
    if(req.method==='POST' && p==='/api/leads')req.url='/api/core/legacy-request';
    if(await central.routes(req,res,{send,json,isAdmin,redirect,sameOrigin})) return;
    if(req.method==='GET' && p==='/admin' && isAdmin(req)) return redirect(res,'/cockpit');

    if(req.method==='GET' && p==='/health') {
      try {
        const db = await store.health();
        return json(res, db?200:503, { ok:Boolean(db), database:Boolean(db), ai:config.aiMode!=='rules'&&ai.ready, chatbot_mode:config.aiMode, email_configured:messenger.emailReady, whatsapp_configured:messenger.whatsappReady, service:'ai-business-automation-production' });
      } catch(e) { return json(res,503,{ok:false,database:false,error:'Database niet bereikbaar'}); }
    }

    if(req.method==='GET' && p==='/api/booking/services') {
      return json(res,200,{ok:true,source:'wix-bookings',updatedAt:bookingCatalog.UPDATED_AT,services:bookingCatalog.publicServices()},{'Cache-Control':'public, max-age=300'});
    }

    if(req.method==='GET' && p==='/') return redirect(res,'/boeken');

    if(req.method==='POST' && p==='/api/leads') {
      if(!rateOk(req,'lead',20,60000)) return json(res,429,{error:'Te veel aanvragen. Probeer later opnieuw.'});
      const b=await body(req);
      const name=String(b.name||'').trim(), email=String(b.email||'').trim(), phone=String(b.phone||'').trim();
      if(!name || (!email && !phone)) return json(res,400,{error:'Naam en e-mail of telefoon zijn verplicht.'});
      if(!validEmail(email)) return json(res,400,{error:'Ongeldig e-mailadres.'});
      const follow=new Date(Date.now()+config.leadFollowupHours*36e5).toISOString();
      const lead=await store.createLead({
        name:name.slice(0,120), email:email.slice(0,160), phone:phone.slice(0,60),
        service:String(b.service||'').trim().slice(0,160), message:String(b.message||'').trim().slice(0,1500),
        source:'website', follow_up_at:follow, next_action:`Automatische follow-up binnen ${config.leadFollowupHours}u`
      });
      const text=`Dag ${lead.name}, bedankt voor je aanvraag bij ${config.business.name}. We hebben je vraag goed ontvangen${lead.service?` over ${lead.service}`:''} en nemen contact met je op.`;
      const confirmation=await messenger.sendBest({lead,subject:`Aanvraag ontvangen — ${config.business.name}`,text,type:'lead_confirmation'});
      return json(res,201,{ok:true,id:lead.id,confirmationSent:Boolean(confirmation.ok)});
    }

    if(req.method==='POST' && p==='/api/chat') {
      if(!rateOk(req,'chat',30,60000)) return json(res,429,{error:'Te veel berichten'});
      const b=await body(req); const message=String(b.message||'').trim().slice(0,2000);
      if(!message) return json(res,400,{error:'Bericht ontbreekt'});
      try { const out=await ai.answer(message); return json(res,200,{answer:out.text,mode:'ai'}); }
      catch(e) {
        console.error('AI error:',e.message);
        if(e.code==='AI_NOT_CONFIGURED') return json(res,503,{error:'AI-assistent is nog niet geconfigureerd.'});
        return json(res,502,{error:'AI-assistent is tijdelijk niet bereikbaar.'});
      }
    }

    if(req.method==='GET' && p==='/admin/login') { if(isAdmin(req)) return redirect(res,'/admin'); return send(res,200,html.loginPage(config.business)); }
    if(req.method==='POST' && p==='/admin/login') {
      if(!sameOrigin(req)) return send(res,403,'Ongeldige oorsprong','text/plain; charset=utf-8');
      if(!rateOk(req,'login',10,15*60000)) return send(res,429,'Te veel pogingen','text/plain; charset=utf-8');
      const b=await body(req);
      if(!config.adminPassword || !safeEq(b.password||'',config.adminPassword)) return send(res,401,html.loginPage(config.business,'Onjuist wachtwoord.'));
      const token=makeAdminCookie(config.cookieSecret);
      return redirect(res,'/cockpit',{'Set-Cookie':`aba_admin=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${config.production?'; Secure':''}`});
    }
    if(req.method==='POST' && p==='/admin/logout') return json(res,200,{ok:true},{'Set-Cookie':'aba_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});
    if(p.startsWith('/admin') && !isAdmin(req)) return redirect(res,'/admin/login');
    if(p.startsWith('/api/admin/') && !isAdmin(req)) return json(res,401,{error:'Niet ingelogd'});
    if(p.startsWith('/api/admin/') && ['POST','PATCH','PUT','DELETE'].includes(req.method) && !sameOrigin(req)) return json(res,403,{error:'Ongeldige oorsprong'});

    if(req.method==='GET' && p==='/admin') {
      const [leads,appts,events,db]=await Promise.all([store.listLeads(),store.listAppointments(),store.listEvents(500),store.health()]);
      const t=Date.now();
      return send(res,200,html.dashboard(config.business,{
        total:leads.length,
        newLeads:leads.filter(x=>x.status==='new').length,
        upcoming:appts.filter(a=>a.status==='scheduled'&&new Date(a.starts_at).getTime()>t).length,
        sent:events.filter(e=>e.status==='sent').length,
        ai:ai.ready,
        email:messenger.emailReady,
        whatsapp:messenger.whatsappReady,
        db:Boolean(db)
      }));
    }
    if(req.method==='GET' && p==='/admin/leads') return send(res,200,html.leadsPage(config.business,await store.listLeads()));
    if(req.method==='GET' && p==='/admin/appointments') { const [a,l]=await Promise.all([store.listAppointments(),store.listLeads()]); return send(res,200,html.appointmentsPage(config.business,a,l)); }
    if(req.method==='GET' && p==='/admin/activity') return send(res,200,html.activityPage(config.business,await store.listEvents(200)));

    const mLead=p.match(/^\/api\/admin\/leads\/([a-f0-9-]+)$/);
    if(req.method==='PATCH' && mLead) {
      const b=await body(req); const allowed=['status','next_action','follow_up_at','last_contact_at'];
      const patch=Object.fromEntries(Object.entries(b).filter(([k])=>allowed.includes(k)));
      const row=await store.updateLead(mLead[1],patch); return row?json(res,200,row):json(res,404,{error:'Lead niet gevonden'});
    }
    if(req.method==='POST' && p==='/api/admin/appointments') return json(res,410,{error:'Gebruik het centrale dashboard voor een veilige boeking.'});
    if(false) {
      const b=await body(req); if(!b.lead_id||!b.starts_at) return json(res,400,{error:'Klant en datum/tijd zijn verplicht'});
      const lead=await store.getLead(b.lead_id); if(!lead) return json(res,404,{error:'Lead niet gevonden'});
      const starts=new Date(b.starts_at); if(Number.isNaN(starts.getTime())) return json(res,400,{error:'Ongeldige datum/tijd'});
      const row=await store.createAppointment({lead_id:b.lead_id,starts_at:starts.toISOString(),status:'scheduled'});
      await store.updateLead(b.lead_id,{status:'won',next_action:'Afspraak gepland'}); return json(res,201,row);
    }
    const mAppt=p.match(/^\/api\/admin\/appointments\/([a-f0-9-]+)$/);
    if(req.method==='PATCH' && mAppt) return json(res,410,{error:'Gebruik het centrale dashboard.'});
    if(false) {
      const b=await body(req); const allowed=['status','reminder_sent_at','completed_at'];
      const patch=Object.fromEntries(Object.entries(b).filter(([k])=>allowed.includes(k)));
      const row=await store.updateAppointment(mAppt[1],patch); return row?json(res,200,row):json(res,404,{error:'Afspraak niet gevonden'});
    }
    if(req.method==='POST' && p==='/api/admin/automation/run') return json(res,200,await automation.run());
    if(req.method==='POST' && p==='/api/cron/run') {
      const supplied=req.headers['x-cron-secret']||'';
      if(!config.cronSecret || !safeEq(supplied,config.cronSecret)) return json(res,401,{error:'Ongeldige cron secret'});
      return json(res,200,await automation.run());
    }
    return send(res,404,'Niet gevonden','text/plain; charset=utf-8');
  } catch(e) {
    console.error('Request error:',e);
    return json(res,500,{error:'Interne serverfout'});
  }
});

async function start() {
  await store.init();
  await central.db('health');
  console.log('LuxWash integration configuration',JSON.stringify({database:true,ai:Boolean(config.openaiKey),email:Boolean(config.resend.apiKey&&config.resend.from),inboundEmail:Boolean(process.env.RESEND_WEBHOOK_SECRET),stripe:Boolean(process.env.STRIPE_WEBHOOK_SECRET),version:'central-1'}));
  require('./src/core/diagnostics')(config).then(report=>console.log('LuxWash provider checks',JSON.stringify(report))).catch(()=>{});
  server.listen(config.port,'0.0.0.0',()=>console.log(`AI Business Automation productie draait op ${config.baseUrl}`));
  if(config.automationIntervalMinutes > 0) {
    automation.run().catch(e=>console.error('Automation startup failed:',e.message));
    automationTimer=setInterval(()=>automation.run().catch(e=>console.error('Automation error:',e)),config.automationIntervalMinutes*60*1000);
    automationTimer.unref();
  }
}
async function shutdown() {
  if(automationTimer) clearInterval(automationTimer);
  server.close(async()=>{ await store.close().catch(()=>{}); process.exit(0); });
  setTimeout(()=>process.exit(1),10000).unref();
}
module.exports = {server,start};
if (require.main === module) {
 process.on('SIGTERM',shutdown); process.on('SIGINT',shutdown);
 start().catch(e=>{ console.error('Startup failed:',e); process.exit(1); });
}
