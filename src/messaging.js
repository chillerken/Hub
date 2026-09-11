function makeMessenger(config,store){
 async function sendEmail({lead,subject,text,type}){
   if(!lead.email)return {ok:false,skipped:true,reason:'Geen e-mail'};
   if(!config.resend.apiKey){await store.createEvent({type,lead_id:lead.id,channel:'email',status:'demo',detail:`${subject} — ${text}`});return {ok:true,demo:true};}
   try{const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${config.resend.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({from:config.resend.from,to:[lead.email],subject,text})});const body=await r.text();if(!r.ok)throw new Error(body);await store.createEvent({type,lead_id:lead.id,channel:'email',status:'sent',detail:subject});return {ok:true};}catch(e){await store.createEvent({type,lead_id:lead.id,channel:'email',status:'error',detail:e.message.slice(0,500)});return {ok:false,error:e.message};}
 }
 async function sendWhatsApp({lead,text,type}){
   if(!lead.phone)return {ok:false,skipped:true,reason:'Geen telefoon'};
   const {token,phoneNumberId,apiVersion}=config.whatsapp;
   if(!(token&&phoneNumberId)){await store.createEvent({type,lead_id:lead.id,channel:'whatsapp',status:'demo',detail:text});return {ok:true,demo:true};}
   const to=String(lead.phone).replace(/[^0-9]/g,'');
   try{const r=await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to,type:'text',text:{body:text}})});const body=await r.text();if(!r.ok)throw new Error(body);await store.createEvent({type,lead_id:lead.id,channel:'whatsapp',status:'sent',detail:text.slice(0,200)});return {ok:true};}catch(e){await store.createEvent({type,lead_id:lead.id,channel:'whatsapp',status:'error',detail:e.message.slice(0,500)});return {ok:false,error:e.message};}
 }
 async function sendBest(args){if(args.lead.email)return sendEmail(args);return sendWhatsApp(args)}
 return {sendEmail,sendWhatsApp,sendBest,emailReady:Boolean(config.resend.apiKey)};
}
module.exports=makeMessenger;
