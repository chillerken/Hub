const crypto=require('node:crypto');
function formatMessage(context,settings,config){
 const publicUrl=config.publicSiteUrl||config.baseUrl;
 const {job,appointment:a,customer:c,service:s}=context;const when=a?new Date(a.starts_at).toLocaleString('nl-BE',{dateStyle:'full',timeStyle:'short',timeZone:'Europe/Brussels'}):'';
 const manage=a?.idempotency_key?crypto.createHmac('sha256',config.cookieSecret).update(a.idempotency_key).digest('base64url'):null;
 const link=manage?`${publicUrl}/boeking#${a.id}/${manage}`:'';
 const details=a?`${s?.name||'Reiniging'}\n${when}\n${a.address||''}\n${a.vehicle||''}\n${a.price_mode==='fixed'?'Prijs':'Prijsindicatie'}: €${(a.price_cents/100).toFixed(2)}\n${s?.preparation||''}`:'';
 const kinds={lead_ack:[`Aanvraag ontvangen — LuxWash`,`Uw aanvraag${job.payload?.service?' voor '+job.payload.service:''} is veilig opgeslagen. LuxWash bekijkt uw vraag en neemt contact met u op. Dit is nog geen afspraakbevestiging. U kunt antwoorden op deze e-mail.`],confirmation:[`Afspraak bevestigd — LuxWash`,`Uw afspraak is bevestigd.\n${details}\nBeheren: ${link}`],request_received:[`Aanvraag ontvangen — LuxWash`,`Uw voorkeursmoment is opgeslagen. LuxWash bevestigt de definitieve prijs en afspraak nog persoonlijk.\n${details}\nBeheren: ${link}`],reminder:[`Herinnering aan uw LuxWash-afspraak`,`${details}\nBeheren: ${link}`],cancellation:[`Afspraak geannuleerd — LuxWash`,`Uw afspraak op ${when} is geannuleerd.`],aftercare:[`Hoe was uw LuxWash-beurt?`,`Bedankt dat u voor LuxWash koos. Laat ons weten of alles naar wens was; u kunt op deze mail antwoorden. U kunt uw eerlijke ervaring ook delen op Google: ${settings.business.review_url}`],repeat:[`Opnieuw een frisse wagen?`,`Het is ongeveer ${settings.planning.repeat_weeks} weken geleden sinds uw laatste beurt. Zullen we opnieuw een moment zoeken? ${publicUrl}/boeken\nGeen uitnodigingen meer? ${publicUrl}/voorkeuren#${a?.id}/${manage}`]};
 if(job.kind==='email')return {subject:job.payload.subject,text:job.payload.text};
 const v=kinds[job.kind];if(!v)throw new Error('Onbekende berichtsoort');return {subject:v[0],text:`Dag ${c.name},\n\n${v[1]}\n\nLuxWash\n${settings.business.phone}\n${settings.business.email}`};
}
module.exports=function automation(config,db){
 const classify=require('./classify')(config);
 async function run(){
 await db('flow_schedule');
 const jobs=await db('claim_jobs');const settings=await db('settings');const results=[];
 for(const job of jobs){
  let status='sent',provider_id='',error='';
  try{
   const ctx=await db('job_context',{id:job.id});const c=ctx.customer,a=ctx.appointment;
   if(job.kind==='classify'){
    const message=await db('message_get',{id:job.payload.message_id});
    if(!message)status='skipped';else {const classification=await classify(message.content);if(!classification.available)throw Object.assign(new Error(`${require('./provider-errors').explain(classification.error_code)} (${classification.error_code})`),{nonRetryable:['insufficient_quota','invalid_api_key','model_not_found'].includes(classification.error_code)});await db('message_classified',{id:message.id,...classification});status='completed';}
   }else if(!c||c.status!=='active')status='skipped';
   else if(job.kind==='repeat'&&!c.marketing_consent)status='skipped';
   else if(job.kind==='reminder'&&(!['confirmed','scheduled'].includes(a.status)||new Date(a.starts_at)<=new Date()))status='skipped';
   else if(['confirmation','request_received'].includes(job.kind)&&['cancelled','completed'].includes(a.status))status='skipped';
   else if(job.attempts>1&&Date.now()-new Date(job.first_attempt_at).getTime()>23*3600000)throw Object.assign(new Error('Bezorging onzeker: controleer provider voordat u opnieuw verstuurt'),{deliveryUncertain:true});
   else{
    const permission=await db('flow_delivery_allowed',{id:job.id,lease_token:job.lease_token});
    if(permission?.allowed!==true){await db('finish_job',{id:job.id,lease_token:job.lease_token,status:'skipped',provider_id:'',error:'Verzending gestopt door opvolgings- of toestemmingscontrole'});results.push({id:job.id,status:'skipped'});continue;}
    if(c.email&&/@(?:[^@]*\.)?(?:invalid|example|test)$/i.test(c.email))throw Object.assign(new Error('Herkenbare testgegevens: geen e-mail verstuurd'),{nonRetryable:true});
    if(!c.email)throw new Error('E-mailadres ontbreekt; klant telefonisch bevestigen');
    if(!config.resend.apiKey||!config.resend.from)throw new Error('RESEND_API_KEY en geverifieerde afzender ontbreken');
    if(a?.idempotency_key){
     const token=crypto.createHmac('sha256',config.cookieSecret).update(a.idempotency_key).digest('base64url');
     await db('management_prepare',{id:a.id,idempotency_key:a.idempotency_key,token_hash:crypto.createHash('sha256').update(token).digest('hex')});
    }
    const message=formatMessage(ctx,settings,config);
    const budget=await db('email_budget',{id:job.id});
    if(!budget.allowed)throw Object.assign(new Error('Gratis verzendlimiet bereikt. Open het handmatige e-mailconcept in de wachtrij.'),{nonRetryable:true});
    const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${config.resend.apiKey}`,'Content-Type':'application/json','Idempotency-Key':`luxwash/${job.id}`},body:JSON.stringify({from:config.resend.from,to:[c.email],reply_to:settings.business.email,...message}),signal:AbortSignal.timeout(20000)});
    const data=await response.json();if(!response.ok)throw new Error(`Mailprovider: ${response.status}`);provider_id=data.id;
    // This journal write is idempotent; after a crash Resend receives the same key.
    try{await db('save',{table:'emails',data:{customer_id:c.id,subject:message.subject,body:message.text,direction:'outbound',recipient:c.email,sender:config.resend.from,provider_id,status:'sent'}});}catch(e){if(e.code!=='23505')throw e;}
   }
  }catch(e){status=e.nonRetryable||e.deliveryUncertain||job.attempts>=5?'dead':'queued';error=String(e.message).slice(0,300);}
  await db('finish_job',{id:job.id,lease_token:job.lease_token,status,provider_id,error});results.push({id:job.id,status});
 }
 await db('retention');await db('flow_heartbeat',{processed:results.length});return {processed:results.length,jobs:results};
 }
 return {run,ready:Boolean(config.resend.apiKey&&config.resend.from)};
};
module.exports.formatMessage=formatMessage;
