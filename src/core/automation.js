const crypto=require('node:crypto');
function formatMessage(context,settings,config){
 const {job,appointment:a,customer:c,service:s}=context;const when=a?new Date(a.starts_at).toLocaleString('nl-BE',{dateStyle:'full',timeStyle:'short',timeZone:'Europe/Brussels'}):'';
 const manage=a?.idempotency_key?crypto.createHmac('sha256',config.cookieSecret).update(a.idempotency_key).digest('base64url'):null;
 const link=manage?`${config.baseUrl}/boeking#${a.id}/${manage}`:'';
 const details=a?`${s?.name||'Reiniging'}\n${when}\n${a.address||''}\n${a.vehicle||''}\n${a.price_mode==='fixed'?'Prijs':'Prijsindicatie'}: €${(a.price_cents/100).toFixed(2)}\n${s?.preparation||''}`:'';
 const kinds={confirmation:[`Afspraak bevestigd — LuxWash`,`Uw afspraak is bevestigd.\n${details}\nBeheren: ${link}`],request_received:[`Aanvraag ontvangen — LuxWash`,`Uw voorkeursmoment is opgeslagen. LuxWash bevestigt de definitieve prijs en afspraak nog persoonlijk.\n${details}\nBeheren: ${link}`],reminder:[`Herinnering aan uw LuxWash-afspraak`,`${details}\nBeheren: ${link}`],cancellation:[`Afspraak geannuleerd — LuxWash`,`Uw afspraak op ${when} is geannuleerd.`],aftercare:[`Hoe was uw LuxWash-beurt?`,`Bedankt dat u voor LuxWash koos. Laat ons weten of alles naar wens was; u kunt op deze mail antwoorden. U kunt uw eerlijke ervaring ook delen op Google: ${settings.business.review_url}`],repeat:[`Opnieuw een frisse wagen?`,`Het is ongeveer ${settings.planning.repeat_weeks} weken geleden sinds uw laatste beurt. Zullen we opnieuw een moment zoeken? ${config.baseUrl}/boeken\nGeen uitnodigingen meer? ${config.baseUrl}/voorkeuren#${a?.id}/${manage}`]};
 if(job.kind==='email')return {subject:job.payload.subject,text:job.payload.text};
 const v=kinds[job.kind];if(!v)throw new Error('Onbekende berichtsoort');return {subject:v[0],text:`Dag ${c.name},\n\n${v[1]}\n\nLuxWash\n${settings.business.phone}\n${settings.business.email}`};
}
module.exports=function automation(config,db){
 async function run(){
 const jobs=await db('claim_jobs');const settings=await db('settings');const results=[];
 for(const job of jobs){
  let status='sent',provider_id='',error='';
  try{
   const ctx=await db('job_context',{id:job.id});const c=ctx.customer,a=ctx.appointment;
   if(!c||c.status!=='active')status='skipped';
   else if(job.kind==='repeat'&&!c.marketing_consent)status='skipped';
   else if(job.kind==='reminder'&&(!['confirmed','scheduled'].includes(a.status)||new Date(a.starts_at)<=new Date()))status='skipped';
   else if(['confirmation','request_received'].includes(job.kind)&&['cancelled','completed'].includes(a.status))status='skipped';
   else if(job.attempts>1&&Date.now()-new Date(job.first_attempt_at).getTime()>23*3600000)throw Object.assign(new Error('Bezorging onzeker: controleer provider voordat u opnieuw verstuurt'),{deliveryUncertain:true});
   else{
    if(!c.email)throw new Error('E-mailadres ontbreekt; klant telefonisch bevestigen');
    if(!config.resend.apiKey||!config.resend.from)throw new Error('RESEND_API_KEY en geverifieerde afzender ontbreken');
    const message=formatMessage(ctx,settings,config);
    const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${config.resend.apiKey}`,'Content-Type':'application/json','Idempotency-Key':`luxwash/${job.id}`},body:JSON.stringify({from:config.resend.from,to:[c.email],reply_to:settings.business.email,...message}),signal:AbortSignal.timeout(20000)});
    const data=await response.json();if(!response.ok)throw new Error(`Mailprovider: ${response.status}`);provider_id=data.id;
    // This journal write is idempotent; after a crash Resend receives the same key.
    try{await db('save',{table:'emails',data:{customer_id:c.id,subject:message.subject,body:message.text,direction:'outbound',recipient:c.email,sender:config.resend.from,provider_id,status:'sent'}});}catch(e){if(e.code!=='23505')throw e;}
   }
  }catch(e){status=e.deliveryUncertain||job.attempts>=5?'dead':'queued';error=String(e.message).slice(0,300);}
  await db('finish_job',{id:job.id,lease_token:job.lease_token,status,provider_id,error});results.push({id:job.id,status});
 }
 await db('retention');return {processed:results.length,jobs:results};
 }
 return {run,ready:Boolean(config.resend.apiKey&&config.resend.from)};
};
module.exports.formatMessage=formatMessage;
