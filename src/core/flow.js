const crypto=require('node:crypto');
const {z}=require('./validation');
const {hash}=require('./db');
function quoteToken(id,secret){if(!secret||secret.length<32)throw new Error('Beveiligde offertelinks zijn niet geconfigureerd');return crypto.createHmac('sha256',secret).update('luxwash-quote:'+id).digest('base64url');}
function integrations(config,checks){
 const checked=checks?.checked_at||null;
 return [
 {name:'Centrale database',status:'LIVE',detail:'Deze pagina is zojuist uit Supabase geladen.'},
 {name:'AI-klantenservice',status:checks?.openai?.inference_available?'LIVE':checks?.openai?.inference_error?'FOUT':'GEBOUWD MAAR NOG NIET GEKOPPELD',detail:checks?.openai?.inference_error==='insufficient_quota'?'OpenAI meldt onvoldoende tegoed of projectbudget. Aanvragen blijven bewaard.':checks?.openai?.inference_available?'Antwoordgeneratie getest op '+checked:'Echte antwoordgeneratie moet nog slagen.',checked_at:checked},
 {name:'E-mail',status:'GEBOUWD MAAR NOG NIET GEKOPPELD',detail:config.resend.apiKey&&config.resend.from?'Verzendconfiguratie aanwezig. Controleer verzendwachtrij en ontvangst; dit is geen aflevergarantie.':'Resend-afzender en server-side sleutel ontbreken.'},
 {name:'Inkomende e-mail',status:'GEBOUWD MAAR NOG NIET GEKOPPELD',detail:process.env.RESEND_WEBHOOK_SECRET?'Webhookgeheim aanwezig; ontvangst van echte antwoorden nog testen.':'Webhook niet geconfigureerd. Vervolgberichten blijven handmatige taken.'},
 {name:'Google Calendar',status:'GEBOUWD MAAR NOG NIET GEKOPPELD',detail:'Beveiligde agenda-export beschikbaar. Automatische tweerichtingssynchronisatie ontbreekt.'},
 {name:'WhatsApp Business',status:'GEBOUWD MAAR NOG NIET GEKOPPELD',detail:'Een WhatsApp-link is geen Business API-koppeling. Er is geen werkende gedeelde berichtenflow geverifieerd.'},
 {name:'Metricool in dashboard',status:'GEBOUWD MAAR NOG NIET GEKOPPELD',detail:'De accountcontrole hieronder is een momentopname. De bestaande ChatGPT Social Agent werkt apart; dit dashboard publiceert niet zelfstandig.'},
 {name:'Telefonische assistente',status:'GEBOUWD MAAR NOG NIET GEKOPPELD',detail:'Bestaande Lina-service. Een geslaagde echte telefoonoproep blijft vereist.'}
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
 async function prepare(id){const token=quoteToken(id,config.cookieSecret);const data=await db('quote_publish',{id,token_hash:hash(token)});return {...data,url:config.baseUrl+'/offerte#'+id+'/'+token};}
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
