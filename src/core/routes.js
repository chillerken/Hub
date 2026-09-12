const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const {z,booking,contact,planning,safeEqual,quoteSlot,quoteBooking}=require('./validation');const {hash}=require('./db');const {parseCookies,makeAdminCookie}=require('../auth');
const shell=title=>`<!doctype html><html lang="nl-BE"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title} · LuxWash</title><link rel="stylesheet" href="/central.css"><script src="/central.js" defer></script></head><body><div id="root"></div></body></html>`;
async function rawBody(req){let data='';for await(const c of req){data+=c;if(Buffer.byteLength(data)>100000)throw Object.assign(new Error('Aanvraag te groot'),{status:413});}return data;}
module.exports=function central(config,legacyStore){
 const classify=require('./classify')(config);
 const db=require('./db')(config),ai=require('./ai')(config,db),automation=require('./automation')(config,db);
 async function routes(req,res,helpers){
 const {send,json,isAdmin,redirect,sameOrigin}=helpers;const url=new URL(req.url,config.baseUrl),p=url.pathname;
 const write=['POST','PUT','PATCH','DELETE'].includes(req.method);
 if(['/central.js','/central.css'].includes(p)){send(res,200,fs.readFileSync(path.join(__dirname,'../../public',p.slice(1))),p.endsWith('css')?'text/css':'application/javascript',{'Cache-Control':'no-cache'});return true;}
 if(['/cockpit','/boeken','/boeking','/voorkeuren'].includes(p)&&req.method==='GET'){
 if(p==='/cockpit'&&!isAdmin(req)){redirect(res,'/admin/login');return true;}
 send(res,200,shell(p==='/cockpit'?'Bedrijfsoverzicht':'Afspraak'),undefined,{'Cache-Control':'no-store'});return true;
 }
 if(req.method==='GET'&&p==='/privacy-ai'){send(res,200,fs.readFileSync(path.join(__dirname,'../../public/privacy-ai.html')));return true;}
 if(!p.startsWith('/api/webhooks/')&&!p.startsWith('/api/core/')&&!p.startsWith('/api/lina/')&&p!=='/api/chat'&&p!=='/api/booking/services')return false;
 try{
  let b={};let raw='';if(write){raw=await rawBody(req);try{b=JSON.parse(raw||'{}');}catch{throw Object.assign(new Error('Ongeldige JSON'),{status:400});}}
  if(p.startsWith('/api/webhooks/')){
   const {verifySvix,verifyStripe}=require('./webhooks');
   if(req.method!=='POST')throw Object.assign(new Error('POST vereist'),{status:405});
   if(p==='/api/webhooks/resend'){
    if(!verifySvix(raw,req.headers,process.env.RESEND_WEBHOOK_SECRET))throw Object.assign(new Error('Ongeldige webhookhandtekening'),{status:401});
    const claim=await db('webhook_claim',{id:req.headers['svix-id'],provider:'resend'});if(!claim.claimed){json(res,claim.completed?200:503,claim.completed?{ok:true}:{error:'Gebeurtenis wordt nog verwerkt; probeer opnieuw'});return true;}
    if(b.type==='email.received'){
     const r=await fetch('https://api.resend.com/emails/receiving/'+encodeURIComponent(b.data.email_id),{headers:{Authorization:`Bearer ${config.resend.apiKey}`},signal:AbortSignal.timeout(15000)});const mail=await r.json();if(!r.ok)throw new Error('E-mail ophalen mislukt');
     const sender=String(mail.from||'').match(/<([^>]+)>/)?.[1]||String(mail.from||'');
     await db('inbound_email',{sender,recipient:(mail.to||[]).join(','),subject:String(mail.subject||'').slice(0,300),body:String(mail.text||'').slice(0,12000),provider_id:b.data.email_id,priority:'normal'});
    }else if(['email.delivered','email.bounced','email.complained'].includes(b.type))await db('delivery_status',{provider_id:b.data.email_id,status:b.type.split('.')[1]});
    await db('webhook_finish',{id:req.headers['svix-id']});json(res,200,{ok:true});return true;
   }
   if(p==='/api/webhooks/stripe'){
    if(!verifyStripe(raw,req.headers['stripe-signature'],process.env.STRIPE_WEBHOOK_SECRET))throw Object.assign(new Error('Ongeldige webhookhandtekening'),{status:401});
    if(b.type==='checkout.session.completed'&&b.data.object.payment_status==='paid'){const obj=b.data.object;await db('stripe_payment',{appointment_id:obj.metadata.appointment_id,amount_cents:obj.amount_total,currency:obj.currency,provider_id:obj.payment_intent});}json(res,200,{ok:true});return true;
   }
   json(res,404,{error:'Niet gevonden'});return true;
  }
  if(p.startsWith('/api/lina/')){
   const ts=req.headers['x-luxwash-timestamp'];const expected=crypto.createHmac('sha256',config.supabase.appSecret).update(`${ts}.${raw}`).digest('hex');
   if(!ts||Math.abs(Date.now()/1000-Number(ts))>120||!safeEqual(expected,req.headers['x-luxwash-signature']))throw Object.assign(new Error('Niet gemachtigd'),{status:401});
   if(p==='/api/lina/summary'){
    const v=z.object({provider_call_id:z.string().max(180),transcript:z.string().max(24000)}).parse(b);const summary=await classify(v.transcript);
    const call=await db('call_update',{provider_call_id:v.provider_call_id,...summary,...(summary.handoff?{escalated:true}:{})});
    if(summary.handoff&&call?.id)await db('handoff',{phone_call_id:call.id,customer_id:call.customer_id,summary:summary.summary,priority:summary.priority});
    json(res,200,{ok:true});
   }else if(p==='/api/lina/bootstrap')json(res,200,{instructions:ai.instructions(await db('settings')),tools:ai.tools.definitions});
   else if(p==='/api/lina/tool'){
    const ctx=z.object({sessionId:z.string().max(160),toolCallId:z.string().max(160),phoneCallId:z.string().uuid().optional(),customerId:z.string().uuid().optional()}).parse(b.context);const call=await db('call_start',{provider_call_id:ctx.sessionId});ctx.customerId=call?.customer_id||ctx.customerId;json(res,200,await ai.tools.execute(b.name,b.arguments,{...ctx,source:'phone'}));
   }else if(p==='/api/lina/event'){
    const allowed=['call_start','call_update','transcript','tool_claim','tool_finish','webhook_claim','webhook_finish','handoff'];if(!allowed.includes(b.action))throw new Error('Onbekende actie');json(res,200,await db(b.action,b.payload));
   }else json(res,404,{error:'Niet gevonden'});return true;
  }
  if(p.startsWith('/api/core/admin/')){
   if(!isAdmin(req))throw Object.assign(new Error('Log eerst in'),{status:401});
   if(write&&!sameOrigin(req))throw Object.assign(new Error('Ongeldige oorsprong'),{status:403});
  }else if(write&&!sameOrigin(req))throw Object.assign(new Error('Ongeldige oorsprong'),{status:403});
  if(!p.startsWith('/api/core/admin/')){
   const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress).split(',').at(-1).trim();
   const r=await db('rate',{key:hash(`${ip}:${p}`),limit:p==='/api/chat'?25:60,seconds:60});if(!r.allowed)throw Object.assign(new Error('Te veel aanvragen. Probeer over een minuut opnieuw.'),{status:429});
  }
  if(req.method==='GET'&&['/api/core/catalog','/api/booking/services'].includes(p))json(res,200,{services:await db('catalog')});
  else if(req.method==='GET'&&p==='/api/core/settings'){const s=await db('settings');json(res,200,{business:s.business,ai:s.ai});}
  else if(req.method==='GET'&&p==='/api/core/slots'){
   const q=z.object({service_id:z.string().uuid(),postcode:z.string().regex(/^\d{4}$/),from:z.string().datetime({offset:true}),to:z.string().datetime({offset:true})}).parse(Object.fromEntries(url.searchParams));json(res,200,{slots:await db('slots',q)});
  }else if(req.method==='POST'&&p==='/api/core/book'){
   const v=booking.parse(b);const token=crypto.createHmac('sha256',config.cookieSecret).update(v.idempotency_key).digest('base64url');
   const r=await db('book',{...v,source:'website',manage_token_hash:hash(token)});const a=r.appointment;
   json(res,201,{ok:true,id:a.id,status:a.status,starts_at:a.starts_at,price_cents:a.price_cents,price_mode:a.price_mode,manage_token:token,confirmation:'queued'});
  }else if(req.method==='POST'&&p==='/api/core/request'){
   const v=contact.parse(b);const key=z.string().min(16).max(120).parse(b.idempotency_key);const l=await db('intake',{...v,idempotency_key:key,service:String(b.service||'').slice(0,160),message:String(b.message||'').slice(0,1500)});json(res,201,{ok:true,...l});
  }else if(req.method==='POST'&&p==='/api/chat'){
   const v=z.object({message:z.string().trim().min(1).max(2000),session_token:z.string().min(32).max(120).optional()}).parse(b);json(res,200,await ai.answer(v.message,v.session_token||crypto.randomBytes(32).toString('base64url')));
  }else if(req.method==='POST'&&p==='/api/core/manage'){
   const v=z.object({id:z.string().uuid(),manage_token:z.string().min(32).max(120),starts_at:z.string().datetime({offset:true}).optional(),cancel:z.boolean().optional(),unsubscribe:z.boolean().optional()}).parse(b);
   if(v.unsubscribe){const a=await db('manage_get',{id:v.id,token_hash:hash(v.manage_token)});await db('save',{table:'customers',id:a.customer_id,data:{marketing_consent:false}});json(res,200,{ok:true});}
   else if(v.starts_at||v.cancel)json(res,200,await db('appointment_change',{id:v.id,token_hash:hash(v.manage_token),...(v.starts_at?{starts_at:v.starts_at}:{status:'cancelled'})}));
   else json(res,200,await db('manage_get',{id:v.id,token_hash:hash(v.manage_token)}));
  }else if(req.method==='POST'&&p==='/api/core/auth'){
   const v=z.object({email:z.string().email(),password:z.string().min(8).max(256)}).parse(b);
   const r=await fetch(`${config.supabase.url}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:config.supabase.publishableKey,'Content-Type':'application/json'},body:JSON.stringify(v),signal:AbortSignal.timeout(15000)});const data=await r.json();
   const member=r.ok?await db('member',{id:data.user.id}):null;if(!member||!['owner','admin'].includes(member.role))throw Object.assign(new Error('Geen toegang tot LuxWash-beheer'),{status:401});
   json(res,200,{ok:true},{'Set-Cookie':`aba_admin=${encodeURIComponent(makeAdminCookie(config.cookieSecret,member.id))}; HttpOnly; SameSite=Strict; Secure; Path=/; Max-Age=43200`});
  }else if(req.method==='GET'&&p==='/api/core/admin/analytics')json(res,200,await db('analytics'));
  else if(req.method==='POST'&&p==='/api/core/admin/quote-draft'){const v=z.object({customer_id:z.string().uuid(),brief:z.string().min(10).max(3000)}).parse(b);const proposal=await require('./quote')(config)(v.brief,await db('catalog'));json(res,201,await db('quote_draft',{...proposal,customer_id:v.customer_id}));
  }else if(req.method==='GET'&&p==='/api/core/admin/status'){
   const s=await db('settings');let voice={reachable:false};try{const r=await fetch('https://luxwash-lina-phone-agent.onrender.com/health',{signal:AbortSignal.timeout(5000)});voice={reachable:r.ok,...await r.json()};}catch{}
   json(res,200,{database:true,ai_configured:Boolean(config.openaiKey),email_configured:automation.ready,voice,provider_checks:require('./diagnostics').getLatest(),planning_configured:Boolean((s.planning.open_24_7||s.planning.opening_hours.length>0)&&(s.planning.all_postcodes||s.planning.allowed_postcodes.length>0)),settings:s});
  }else if(req.method==='GET'&&p==='/api/core/admin/list')json(res,200,{rows:await db('list',{table:url.searchParams.get('table')})});
  else if(req.method==='POST'&&p==='/api/core/admin/save'){
   if(b.table==='users')throw Object.assign(new Error('Gebruikersrechten worden door de eigenaar toegekend via Supabase'),{status:403});
   json(res,200,{row:await db('save',{table:b.table,id:b.id,data:b.data})});
  }else if(req.method==='POST'&&p==='/api/core/admin/quote-slots'){
   json(res,200,{slots:await db('quote_slots',{...quoteSlot.parse(b),admin:true})});
  }else if(req.method==='POST'&&p==='/api/core/admin/quote-book'){
   const v=quoteBooking.parse(b);const token=crypto.createHmac('sha256',config.cookieSecret).update(v.idempotency_key).digest('base64url');
   const r=await db('quote_book',{...v,manage_token_hash:hash(token),admin:true});json(res,201,{...r,manage_token:token});
  }else if(req.method==='POST'&&p==='/api/core/admin/settings'){
   let value=b.value;if(b.key==='planning')value=planning.parse(value);
   else if(b.key==='business')value=z.object({name:z.string().min(2).max(100),phone:z.string().max(30),email:z.string().email(),website:z.string().url(),review_url:z.string().url(),timezone:z.literal('Europe/Brussels'),area:z.string().max(500)}).strict().parse(value);
   else if(b.key==='ai')value=z.object({name:z.string().min(1).max(50),greeting:z.string().min(20).max(300),tone:z.string().max(300)}).strict().parse(value);
   else throw new Error('Instelling niet bewerkbaar');json(res,200,{row:await db('setting_save',{key:b.key,value})});
  }else if(req.method==='POST'&&p==='/api/core/admin/delivery'){const action=z.enum(['quote_approve','quote_send','email_send','retry_job']).parse(b.action);json(res,200,await db(action,{id:z.string().uuid().parse(b.id)}));
  }else if(req.method==='POST'&&p==='/api/core/admin/appointment')json(res,200,await db('appointment_change',{...z.object({id:z.string().uuid(),starts_at:z.string().datetime({offset:true}).optional(),status:z.enum(['confirmed','completed','cancelled']).optional()}).parse(b),admin:true}));
  else if(req.method==='POST'&&p==='/api/core/admin/automation')json(res,200,await automation.run());
  else if(req.method==='GET'&&p==='/api/core/admin/export')json(res,200,await db('export_customer',{id:z.string().uuid().parse(url.searchParams.get('id'))}),{'Content-Disposition':'attachment; filename="luxwash-klantgegevens.json"'});
  else if(req.method==='POST'&&p==='/api/core/admin/erase'){if(b.confirm!=='VERWIJDEREN')throw new Error('Bevestiging ontbreekt');json(res,200,await db('erase_customer',{id:z.string().uuid().parse(b.id)}));}
  else json(res,404,{error:'Niet gevonden'});
 }catch(e){const status=e instanceof z.ZodError?400:e.status||400;json(res,status,{error:e instanceof z.ZodError?e.issues.map(x=>x.message).join('; '):e.message==='slot_unavailable'?'Dit tijdstip is niet meer beschikbaar. Kies een ander moment.':e.message});}
 return true;
 }
 return {routes,db,ai,automation};
};
