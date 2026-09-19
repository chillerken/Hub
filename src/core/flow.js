const crypto=require('node:crypto');
const {z}=require('./validation');
const {hash}=require('./db');
function quoteToken(id,secret){if(!secret||secret.length<32)throw new Error('Beveiligde offertelinks zijn niet geconfigureerd');return crypto.createHmac('sha256',secret).update('luxwash-quote:'+id).digest('base64url');}
function envFlag(name){return /^(1|true|yes|on)$/i.test(String(process.env[name]||'').trim());}
function integrations(config,checks){
 const checked=checks?.checked_at||null;
 const gmail=envFlag('CHATGPT_GMAIL_CONNECTED');
 const outlook=envFlag('CHATGPT_OUTLOOK_CONNECTED');
 const calendar=envFlag('CHATGPT_CALENDAR_CONNECTED');
 const metricool=envFlag('CHATGPT_METRICOOL_CONNECTED');
 const gbp=envFlag('CHATGPT_GBP_CONNECTED');
 const whatsapp=envFlag('CHATGPT_WHATSAPP_CONNECTED');
 const website=envFlag('CHATGPT_WEBSITE_CONNECTED');
 const crm=envFlag('CHATGPT_CRM_CONNECTED');
 return [
 {name:'Website',status:website?'LIVE':'INGESTELD',detail:website?'LuxWash website/intake is actief en gekoppeld aan de bedrijfsflow.':'Website is voorbereid; intakekoppeling nog niet als actief gemarkeerd.'},
 {name:'CRM',status:crm?'LIVE':'INGESTELD',detail:crm?'LuxWash CRM is actief als centrale bron voor leads en klanten.':'CRM is beschikbaar maar nog niet als actief gemarkeerd.'},
 {name:'Centrale database',status:'LIVE',detail:'Deze pagina is zojuist uit Supabase geladen.'},
 config.aiMode==='rules'?{name:'Regelgebaseerde assistent',status:'INGESTELD',detail:'Vaste antwoorden en menselijke opvolging. Geen generatieve AI of betaalde AI-aanroep.'}:{name:'AI-klantenservice',status:checks?.openai?.inference_available?'LIVE':checks?.openai?.inference_error?'FOUT':'GEBOUWD MAAR NOG NIET GEKOPPELD',detail:checks?.openai?.inference_error==='insufficient_quota'?'OpenAI meldt onvoldoende tegoed of projectbudget. Aanvragen blijven bewaard.':checks?.openai?.inference_available?'Antwoordgeneratie getest op '+checked:'Echte antwoordgeneratie moet nog slagen.',checked_at:checked},
 {name:'E-mail',status:(gmail||outlook||Boolean(config.resend.apiKey&&config.resend.from))?'LIVE':'GEBOUWD MAAR NOG NIET GEKOPPELD',detail:gmail&&outlook?'Gmail en Outlook zijn als actieve LuxWash-kanalen geverifieerd.':gmail?'Gmail-koppeling is actief.':outlook?'Outlook-koppeling is actief.':config.resend.apiKey&&config.resend.from?'Server-side verzendconfiguratie is aanwezig.':'Geen actieve e-mailkoppeling geregistreerd.'},
 {name:'Inkomende e-mail',status:(gmail||outlook||Boolean(process.env.RESEND_WEBHOOK_SECRET))?'LIVE':'GEBOUWD MAAR NOG NIET GEKOPPELD',detail:outlook&&gmail?'Reacties kunnen via de gekoppelde Outlook- en Gmail-flow worden opgevolgd.':process.env.RESEND_WEBHOOK_SECRET?'Webhookconfiguratie aanwezig.':'Geen inkomende e-mailkoppeling geregistreerd.'},
 {name:'Google Agenda',status:calendar?'LIVE':'GEBOUWD MAAR NOG NIET GEKOPPELD',detail:calendar?'Google Calendar is actief voor beschikbaarheid en afspraken.':'Alleen agenda-export beschikbaar; automatische Calendar-koppeling niet actief gemarkeerd.'},
 {name:'WhatsApp',status:whatsapp?'LIVE':'GEBOUWD MAAR NOG NIET GEKOPPELD',detail:whatsapp?'WhatsApp Business-koppeling is actief gemarkeerd.':'Nog geen werkende WhatsApp Business-koppeling geverifieerd.'},
 {name:'Metricool',status:metricool?'LIVE':'GEBOUWD MAAR NOG NIET GEKOPPELD',detail:metricool?'LuxWash Metricool-brand is gekoppeld voor social planning.':'Metricool is nog niet als actief gemarkeerd.'},
 {name:'Google Reviews',status:gbp?'LIVE':'GEBOUWD MAAR NOG NIET GEKOPPELD',detail:gbp?'LuxWash Google Business Profile is gekoppeld; reviews kunnen worden opgevolgd.':'Google Business Profile/reviews nog niet als actief gemarkeerd.'},
 {name:'Telefonische assistente Astra',status:'GEBOUWD MAAR NOG NIET GEKOPPELD',detail:'Astra geeft korte antwoorden, verwijst naar WhatsApp en bewaart gesprekslogs. Een geslaagde echte telefoonoproep blijft vereist.'}
 ];
}
function escapeICS(value){return String(value||'').replaceAll('\\','\\\\').replace(/\r?\n/g,'\\n').replaceAll(';','\\;').replaceAll(',','\\,');}
function stamp(value){return new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');}
function fold(line){let out='',part='';for(const char of line){if(Buffer.byteLength(part+char)>73){out+=part+'\r\n';part=' ';}part+=char;}return out+part;}
function calendarExport(appointments,customers,services){
 const rows=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//LuxWash//Planning//NL','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:LuxWash'];
 for(const a of appointments){if(!a.starts_at||!a.ends_at)continue;const s=services.find(x=>x.id===a.catalog_service_id),c=customers.find(x=>x.id===a.customer_id);rows.push('BEGIN:VEVENT','UID:'+a.id+'@luxwash.online','DTSTAMP:'+stamp(a.updated_at||a.created_at||a.starts_at),'DTSTART:'+stamp(a.starts_at),'DTEND:'+stamp(a.ends_at),'SUMMARY:'+escapeICS((s?.name||'Reiniging')+' — '+(c?.name||'Klant')),'LOCATION:'+escapeICS(a.address),'DESCRIPTION:'+escapeICS('Beheer wijzigingen in het LuxWash-dashboard. Deze export synchroniseert niet automatisch.'),'STATUS:'+(a.status==='cancelled'?'CANCELLED':['confirmed','scheduled','completed'].includes(a.status)?'CONFIRMED':'TENTATIVE'),'END:VEVENT');}
 rows.push('END:VCALENDAR');return rows.map(fold).join('\r\n')+'\r\n';
}
module.exports=function makeFlow(config,db){
 async function prepare(id){const token=quoteToken(id,config.cookieSecret);const data=await db('quote_publish',{id,token_hash:hash(token)});return {...data,url:(config.publicSiteUrl||config.baseUrl)+'/offerte#'+id+'/'+token};}
 return async function flowRoutes(req,res,{json,send},p,b){
  if(req.method==='GET'&&p==='/api/core/admin/flow'){
   const result=await db('flow_overview');json(res,200,{...result,integrations:integrations(config,require('./diagnostics').getLatest())});return true;
  }
  if(req.method==='POST'&&p==='/api/core/admin/lead'){
   const v=z.object({id:z.string().uuid(),status:z.enum(['new','contacted','quote','waiting','scheduled','confirmed','completed','paid','review_requested','closed','repeat_due','won','lost','not_interested']),next_action:z.string().max(500).optional(),follow_up_at:z.string().datetime({offset:true}).nullable().optional(),opted_out:z.boolean().optional(),contacted:z.boolean().optional()}).strict().parse(b);
   json(res,200,await db('lead_update',v));return true;
  }
  if(req.method==='POST'&&p==='/api/core/admin/quote-link'){json(res,200,await prepare(z.string().uuid().parse(b.id)));return true;}
  if(req.method==='POST'&&p==='/api/core/admin/delivery'&&b.action==='quote_send'){const id=z.string().uuid().parse(b.id);const link=await prepare(id);json(res,200,await db('quote_send',{id,accept_url:link.url}));return true;}
  if(req.method==='POST'&&p==='/api/core/quote'){
   const v=z.object({id:z.string().uuid(),token:z.string().min(32).max(120),decision:z.enum(['accepted','declined']).optional(),confirmed:z.literal(true).optional()}).strict().parse(b);
   if(v.decision&&v.confirmed!==true)throw Object.assign(new Error('Bevestig uw keuze'),{status:400});
   json(res,200,await db(v.decision?'quote_decide':'quote_public',{id:v.id,token_hash:hash(v.token),decision:v.decision,confirmed:v.confirmed}));return true;
  }
  if(req.method==='GET'&&p==='/api/core/admin/calendar.ics'){
   const [appointments,customers,services]=await Promise.all(['appointments','customers','services'].map(table=>db('list',{table})));
   send(res,200,calendarExport(appointments,customers,services),'text/calendar; charset=utf-8',{'Content-Disposition':'attachment; filename="luxwash-agenda.ics"'});return true;
  }
  if(req.method==='GET'&&p==='/api/core/admin/social'){json(res,200,{rows:await db('social_list')});return true;}
  if(req.method==='POST'&&p==='/api/core/admin/social'){
   const v=z.object({platform:z.enum(['facebook','instagram','tiktok','youtube','google_business']),post_type:z.enum(['post','reel','poll','short','story']),caption:z.string().trim().min(1).max(5000),topic:z.string().max(200).default(''),media_prompt:z.string().max(2000).default('')}).strict().parse(b);
   json(res,201,await db('social_save',v));return true;
  }
  return false;
 };
};
module.exports.quoteToken=quoteToken;module.exports.integrations=integrations;module.exports.calendarExport=calendarExport;
