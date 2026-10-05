import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const json = (body:any, status=200) => new Response(JSON.stringify(body), {
  status,
  headers: {"Content-Type":"application/json"}
});

const clean = (v:any, max=500) => String(v ?? "").trim().slice(0,max);
const isEmail = (v:any) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||""));
const digits = (v:any) => String(v||"").replace(/\D/g,"");

function retrySeconds(attempt:number) {
  const steps=[60,300,1800,7200,21600];
  return steps[Math.min(Math.max(attempt,0),steps.length-1)];
}

function fmtDate(value:any, locale="nl-BE", timezone="Europe/Brussels") {
  if(!value) return "";
  try {
    return new Intl.DateTimeFormat(locale,{
      dateStyle:"full",timeStyle:"short",timeZone:timezone
    }).format(new Date(value));
  } catch { return String(value); }
}

function actionMessage(action:any, lead:any, profile:any, appointment:any) {
  const business=clean(profile?.business_name||"het bedrijf",120);
  const name=clean(lead?.name||"klant",120);
  const summary=clean(lead?.summary||"",900);
  const appointmentDate=appointment?.start_at ? fmtDate(appointment.start_at,profile?.locale||"nl-BE",appointment?.timezone||"Europe/Brussels") : "";
  const reviewUrl=clean(profile?.review_url||"",500);

  switch(action.action_type) {
    case "notify_owner":
      return {
        subject:`Nieuwe lead voor ${business}: ${name}`,
        text:[
          `Nieuwe lead voor ${business}.`,
          `Naam: ${name}`,
          lead?.email ? `E-mail: ${lead.email}` : null,
          lead?.phone ? `Telefoon: ${lead.phone}` : null,
          `Status: ${lead?.status||"onbekend"}`,
          `Score: ${lead?.score??0}`,
          summary ? `Laatste vraag: ${summary}` : null
        ].filter(Boolean).join("\n")
      };
    case "lead_follow_up":
      return {
        subject:`Uw aanvraag bij ${business}`,
        text:`Beste ${name},\n\nBedankt voor uw aanvraag bij ${business}. We hebben uw gegevens en vraag goed ontvangen. Uw aanvraag wordt verder opgevolgd. Een aanvraag is pas definitief zodra een afspraak of voorstel uitdrukkelijk bevestigd is.\n\nMet vriendelijke groet,\n${business}`
      };
    case "payment_link_send":
      return {
        subject:`Betaalverzoek – ${business}`,
        text:`Beste ${name},\n\nHier vindt u het betaalverzoek voor ${business}:\n${clean(action?.payload?.payment_url||"",1000)}\n\nBedrag: ${action?.payload?.amount_cents ? new Intl.NumberFormat(profile?.locale||"nl-BE",{style:"currency",currency:action?.payload?.currency||"EUR"}).format(action.payload.amount_cents/100) : "zie betaalpagina"}.\n\nMet vriendelijke groet,\n${business}`
      };
    case "appointment_confirmation":
      return {
        subject:`Afspraak bevestigd – ${business}`,
        text:`Beste ${name},\n\nUw afspraak bij ${business}${appointmentDate ? ` op ${appointmentDate}` : ""} is bevestigd.${appointment?.location ? `\nLocatie: ${appointment.location}` : ""}\n\nMet vriendelijke groet,\n${business}`
      };
    case "review_request":
      return {
        subject:`Bedankt voor uw vertrouwen in ${business}`,
        text:`Beste ${name},\n\nBedankt voor uw vertrouwen in ${business}. We hopen dat u tevreden bent over de uitgevoerde service.${reviewUrl ? `\n\nWilt u uw ervaring delen? ${reviewUrl}` : ""}\n\nMet vriendelijke groet,\n${business}`
      };
    case "retention_follow_up":
      return {
        subject:`Opvolging van ${business}`,
        text:`Beste ${name},\n\nWe nemen even opnieuw contact op omdat u eerder toestemming gaf voor relevante opvolging van ${business}. Heeft u opnieuw hulp nodig, dan kunt u gewoon op dit bericht antwoorden.\n\nMet vriendelijke groet,\n${business}`
      };
    default:
      return {subject:`${business} – opvolging`,text:`Opvolging voor workflowactie ${action.action_type}.`};
  }
}

async function finish(db:any, action:any, outcome:string, opts:any={}) {
  const {data,error}=await db.rpc("finish_workflow_action",{
    p_action_id:action.id,
    p_outcome:outcome,
    p_provider:opts.provider||null,
    p_provider_reference:opts.provider_reference||null,
    p_http_status:opts.http_status||null,
    p_error_code:opts.error_code||null,
    p_error_message:opts.error_message||null,
    p_response_meta:opts.response_meta||{},
    p_retry_after_seconds:opts.retry_after_seconds||null
  });
  if(error) console.error("finish_workflow_action",action.id,error.message);
  return data;
}

async function credential(db:any,integration:any,orgId:string) {
  const {data,error}=await db.rpc("get_integration_credential",{
    p_integration_id:integration.id,
    p_organization_id:orgId
  });
  if(error) return null;
  return data || null;
}

async function sendResend(db:any,action:any,integration:any,lead:any,profile:any,appointment:any) {
  const secret=await credential(db,integration,action.organization_id);
  if(!secret) return {outcome:"blocked",provider:"resend",error_code:"credential_missing",error_message:"Email integration credential missing"};

  const cfg=integration.config||{};
  const fromEmail=clean(cfg.sender_email,250);
  const fromName=clean(cfg.sender_name||profile?.business_name,120);
  if(!isEmail(fromEmail)) return {outcome:"blocked",provider:"resend",error_code:"sender_missing",error_message:"Email sender is not configured"};

  let to="";
  if(action.action_type==="notify_owner") to=clean(profile?.notification_email,250);
  else to=clean(lead?.email,250);
  if(!isEmail(to)) return {outcome:"blocked",provider:"resend",error_code:"recipient_missing",error_message:"No valid email recipient"};

  if(action.action_type!=="notify_owner" && !lead?.contact_consent_at) {
    return {outcome:"failed",provider:"resend",error_code:"contact_consent_required",error_message:"Customer contact consent missing"};
  }
  if(action.action_type==="retention_follow_up" && !lead?.marketing_consent_at) {
    return {outcome:"failed",provider:"resend",error_code:"marketing_consent_required",error_message:"Retention consent missing"};
  }
  if(action.action_type==="review_request" && !cfg.review_url) {
    return {outcome:"blocked",provider:"resend",error_code:"review_url_missing",error_message:"Review URL is not configured"};
  }

  const m=actionMessage(action,lead,{...profile,review_url:cfg.review_url},appointment);
  let resp:Response;
  try{
    resp=await fetch("https://api.resend.com/emails",{
      method:"POST",
      headers:{
        "Authorization":`Bearer ${secret}`,
        "Content-Type":"application/json",
        "Idempotency-Key":action.idempotency_key
      },
      body:JSON.stringify({
        from:fromName ? `${fromName} <${fromEmail}>` : fromEmail,
        to:[to],
        subject:m.subject,
        text:m.text,
        reply_to:cfg.reply_to && isEmail(cfg.reply_to) ? cfg.reply_to : undefined,
        tags:[
          {name:"workflow_action",value:action.action_type.replace(/[^A-Za-z0-9_-]/g,"_").slice(0,256)},
          {name:"organization",value:String(action.organization_id).replace(/-/g,"").slice(0,256)}
        ]
      })
    });
  }catch(e){
    return {outcome:"retry",provider:"resend",error_code:"network_error",error_message:String(e),retry_after_seconds:retrySeconds(action.attempts)};
  }

  let body:any={};
  try{ body=await resp.json(); }catch{}
  if(resp.ok) return {outcome:"completed",provider:"resend",provider_reference:body?.id||null,http_status:resp.status,response_meta:{accepted:true}};
  if(resp.status===429 || resp.status>=500) {
    const retryHeader=Number(resp.headers.get("retry-after")||0);
    return {outcome:"retry",provider:"resend",http_status:resp.status,error_code:"provider_retryable",error_message:clean(body?.message||body?.error||resp.statusText,1000),retry_after_seconds:retryHeader>0?retryHeader:retrySeconds(action.attempts)};
  }
  return {outcome:"failed",provider:"resend",http_status:resp.status,error_code:"provider_rejected",error_message:clean(body?.message||body?.error||resp.statusText,1000)};
}

async function sendWebhook(db:any,action:any,integration:any,lead:any,profile:any,appointment:any,payment:any) {
  const cfg=integration.config||{};
  const endpoint=clean(cfg.endpoint,1000);
  if(!/^https:\/\//i.test(endpoint)) return {outcome:"blocked",provider:"webhook",error_code:"endpoint_missing",error_message:"Webhook HTTPS endpoint missing"};
  const secret=await credential(db,integration,action.organization_id);
  const headers:any={"Content-Type":"application/json","Idempotency-Key":action.idempotency_key};
  if(secret) headers["Authorization"]=`Bearer ${secret}`;

  let resp:Response;
  try{
    resp=await fetch(endpoint,{
      method:"POST",
      headers,
      body:JSON.stringify({
        event:"workflow.action",
        action:{
          id:action.id,
          type:action.action_type,
          channel:action.channel,
          idempotency_key:action.idempotency_key,
          payload:action.payload,
          scheduled_at:action.scheduled_at
        },
        lead:lead?{id:lead.id,name:lead.name,email:lead.email,phone:lead.phone,status:lead.status,score:lead.score}:null,
        appointment:appointment?{id:appointment.id,status:appointment.status,start_at:appointment.start_at,end_at:appointment.end_at,timezone:appointment.timezone,location:appointment.location}:null,
        payment:payment?{id:payment.id,status:payment.status,amount_cents:payment.amount_cents,currency:payment.currency,payment_url:payment.payment_url}:null,
        business:{name:profile?.business_name,locale:profile?.locale}
      })
    });
  }catch(e){
    return {outcome:"retry",provider:"webhook",error_code:"network_error",error_message:String(e),retry_after_seconds:retrySeconds(action.attempts)};
  }

  let body:any={};
  try{ body=await resp.json(); }catch{}
  if(resp.ok) return {outcome:"completed",provider:"webhook",provider_reference:clean(body?.id||body?.reference||resp.headers.get("x-request-id"),500)||null,http_status:resp.status,response_meta:{accepted:true}};
  if(resp.status===429||resp.status>=500) return {outcome:"retry",provider:"webhook",http_status:resp.status,error_code:"provider_retryable",error_message:clean(body?.message||resp.statusText,1000),retry_after_seconds:retrySeconds(action.attempts)};
  return {outcome:"failed",provider:"webhook",http_status:resp.status,error_code:"provider_rejected",error_message:clean(body?.message||resp.statusText,1000)};
}

async function createStripeCheckout(db:any,action:any,integration:any,lead:any,profile:any,payment:any) {
  if(!payment) return {outcome:"failed",provider:"stripe",error_code:"payment_missing",error_message:"Payment record not found"};
  if(payment.status==="paid") return {outcome:"completed",provider:"stripe",provider_reference:payment.provider_payment_id||null,response_meta:{already_paid:true}};
  if(payment.payment_url && payment.provider_payment_id) return {outcome:"completed",provider:"stripe",provider_reference:payment.provider_payment_id,response_meta:{existing_checkout:true}};
  if(!payment.amount_cents || payment.amount_cents<=0) return {outcome:"blocked",provider:"stripe",error_code:"amount_missing",error_message:"A positive payment amount is required"};

  const raw=await credential(db,integration,action.organization_id);
  if(!raw) return {outcome:"blocked",provider:"stripe",error_code:"credential_missing",error_message:"Stripe credential missing"};
  let secretKey="";
  try{
    const parsed=JSON.parse(raw);
    secretKey=clean(parsed?.secret_key,500);
  }catch{
    secretKey=clean(raw,500);
  }
  if(!secretKey.startsWith("sk_") && !secretKey.startsWith("rk_")) return {outcome:"blocked",provider:"stripe",error_code:"credential_invalid",error_message:"Stripe secret or restricted key missing"};

  const cfg=integration.config||{};
  const successUrl=clean(cfg.success_url,1000);
  const cancelUrl=clean(cfg.cancel_url,1000);
  if(!/^https:\/\//i.test(successUrl)||!/^https:\/\//i.test(cancelUrl)) return {outcome:"blocked",provider:"stripe",error_code:"redirect_url_missing",error_message:"HTTPS success_url and cancel_url are required"};

  const params=new URLSearchParams();
  params.set("mode","payment");
  params.set("success_url",successUrl);
  params.set("cancel_url",cancelUrl);
  params.set("client_reference_id",String(payment.id));
  if(isEmail(lead?.email)) params.set("customer_email",lead.email);
  params.set("line_items[0][price_data][currency]",String(payment.currency||"EUR").toLowerCase());
  params.set("line_items[0][price_data][product_data][name]",clean(cfg.product_name||(`Betaling ${profile?.business_name||"service"}`),120));
  params.set("line_items[0][price_data][unit_amount]",String(payment.amount_cents));
  params.set("line_items[0][quantity]","1");
  params.set("metadata[organization_id]",String(action.organization_id));
  params.set("metadata[lead_id]",String(action.lead_id||""));
  params.set("metadata[customer_payment_id]",String(payment.id));

  let resp:Response;
  try{
    resp=await fetch("https://api.stripe.com/v1/checkout/sessions",{
      method:"POST",
      headers:{
        "Authorization":`Bearer ${secretKey}`,
        "Content-Type":"application/x-www-form-urlencoded",
        "Idempotency-Key":action.idempotency_key
      },
      body:params
    });
  }catch(e){
    return {outcome:"retry",provider:"stripe",error_code:"network_error",error_message:String(e),retry_after_seconds:retrySeconds(action.attempts)};
  }

  let body:any={}; try{body=await resp.json();}catch{}
  if(resp.ok && body?.id && body?.url){
    const {error:updateError}=await db.from("customer_payments")
      .update({provider:"stripe",provider_payment_id:body.id,payment_url:body.url,updated_at:new Date().toISOString()})
      .eq("id",payment.id).eq("organization_id",action.organization_id);
    if(updateError) return {outcome:"retry",provider:"stripe",provider_reference:body.id,http_status:resp.status,error_code:"payment_record_update_failed",error_message:updateError.message,retry_after_seconds:60};
    return {outcome:"completed",provider:"stripe",provider_reference:body.id,http_status:resp.status,response_meta:{checkout_created:true}};
  }
  if(resp.status===429||resp.status>=500) return {outcome:"retry",provider:"stripe",http_status:resp.status,error_code:"provider_retryable",error_message:clean(body?.error?.message||resp.statusText,1000),retry_after_seconds:retrySeconds(action.attempts)};
  return {outcome:"failed",provider:"stripe",http_status:resp.status,error_code:clean(body?.error?.code||"provider_rejected",200),error_message:clean(body?.error?.message||resp.statusText,1000)};
}

async function sendMetaWhatsApp(db:any,action:any,integration:any,lead:any,profile:any,appointment:any) {
  if(!lead?.phone) return {outcome:"blocked",provider:"meta_whatsapp",error_code:"recipient_missing",error_message:"No WhatsApp phone number"};
  if(!lead?.contact_consent_at) return {outcome:"failed",provider:"meta_whatsapp",error_code:"contact_consent_required",error_message:"Customer contact consent missing"};
  if(action.action_type==="retention_follow_up" && !lead?.marketing_consent_at) return {outcome:"failed",provider:"meta_whatsapp",error_code:"marketing_consent_required",error_message:"Retention consent missing"};

  const cfg=integration.config||{};
  const template=cfg?.templates?.[action.action_type];
  if(!template?.name || !template?.language) return {outcome:"blocked",provider:"meta_whatsapp",error_code:"template_missing",error_message:`Approved WhatsApp template mapping missing for ${action.action_type}`};
  const phoneNumberId=clean(cfg.phone_number_id,100);
  const apiVersion=clean(cfg.api_version,20);
  if(!phoneNumberId||!/^v\d+\.\d+$/.test(apiVersion)) return {outcome:"blocked",provider:"meta_whatsapp",error_code:"provider_config_missing",error_message:"WhatsApp phone_number_id/api_version missing"};

  const token=await credential(db,integration,action.organization_id);
  if(!token) return {outcome:"blocked",provider:"meta_whatsapp",error_code:"credential_missing",error_message:"WhatsApp access token missing"};

  const values:any={
    lead_name:clean(lead.name||"klant",120),
    business_name:clean(profile?.business_name||"",120),
    appointment_date:appointment?.start_at?fmtDate(appointment.start_at,profile?.locale||"nl-BE",appointment?.timezone||"Europe/Brussels"):"",
    review_url:clean(cfg.review_url||"",500)
  };
  const variableKeys=Array.isArray(template.variables)?template.variables:[];
  const parameters=variableKeys.map((k:string)=>({type:"text",text:clean(values[k]||"",1000)}));

  let resp:Response;
  try{
    resp=await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,{
      method:"POST",
      headers:{"Authorization":`Bearer ${token}`,"Content-Type":"application/json"},
      body:JSON.stringify({
        messaging_product:"whatsapp",
        to:digits(lead.phone),
        type:"template",
        template:{
          name:template.name,
          language:{code:template.language},
          components:parameters.length?[{type:"body",parameters}]:undefined
        }
      })
    });
  }catch(e){
    return {outcome:"retry",provider:"meta_whatsapp",error_code:"network_error",error_message:String(e),retry_after_seconds:retrySeconds(action.attempts)};
  }
  let body:any={}; try{body=await resp.json();}catch{}
  if(resp.ok) return {outcome:"completed",provider:"meta_whatsapp",provider_reference:body?.messages?.[0]?.id||null,http_status:resp.status,response_meta:{accepted:true}};
  if(resp.status===429||resp.status>=500) return {outcome:"retry",provider:"meta_whatsapp",http_status:resp.status,error_code:"provider_retryable",error_message:clean(body?.error?.message||resp.statusText,1000),retry_after_seconds:retrySeconds(action.attempts)};
  return {outcome:"failed",provider:"meta_whatsapp",http_status:resp.status,error_code:String(body?.error?.code||"provider_rejected"),error_message:clean(body?.error?.message||resp.statusText,1000)};
}

Deno.serve(async (req:Request)=>{
  if(req.method!=="POST") return json({error:"Method not allowed"},405);

  const url=Deno.env.get("SUPABASE_URL")!;
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db=createClient(url,service,{auth:{persistSession:false}});

  const runnerToken=req.headers.get("x-runner-token")||"";
  if(!runnerToken) return json({error:"Unauthorized"},401);
  const {data:valid,error:tokenError}=await db.rpc("validate_workflow_runner_token",{p_token:runnerToken});
  if(tokenError||valid!==true) return json({error:"Unauthorized"},401);

  const workerId=`workflow-runner:${crypto.randomUUID()}`;
  const {data:actions,error:claimError}=await db.rpc("claim_workflow_actions",{p_worker_id:workerId,p_batch_size:10});
  if(claimError) return json({error:"Claim failed",detail:claimError.message},500);

  const results:any[]=[];
  for(const action of actions||[]) {
    try{
      const [{data:profile},{data:lead}]=await Promise.all([
        db.from("business_profiles").select("*").eq("organization_id",action.organization_id).single(),
        action.lead_id ? db.from("leads").select("*").eq("id",action.lead_id).eq("organization_id",action.organization_id).maybeSingle() : Promise.resolve({data:null})
      ]);

      let appointment:any=null;
      const appointmentId=action.payload?.appointment_id;
      if(appointmentId) {
        const {data}=await db.from("appointments").select("*").eq("id",appointmentId).eq("organization_id",action.organization_id).maybeSingle();
        appointment=data;
      } else if(action.lead_id && ["calendar_request","appointment_confirmation","review_request"].includes(action.action_type)) {
        const {data}=await db.from("appointments").select("*").eq("lead_id",action.lead_id).eq("organization_id",action.organization_id).order("created_at",{ascending:false}).limit(1).maybeSingle();
        appointment=data;
      }

      let payment:any=null;
      if(action.payload?.payment_id) {
        const {data}=await db.from("customer_payments").select("*").eq("id",action.payload.payment_id).eq("organization_id",action.organization_id).maybeSingle();
        payment=data;
      }

      if(action.action_type==="payment_received") {
        await finish(db,action,"completed",{provider:"internal",provider_reference:action.payload?.payment_id||null,response_meta:{recorded:true}});
        results.push({id:action.id,status:"completed",provider:"internal"});
        continue;
      }

      if(action.action_type==="calendar_request" && (!appointment?.start_at || !appointment?.end_at)) {
        await finish(db,action,"blocked",{provider:"calendar",error_code:"scheduling_required",error_message:"A precise start and end time must be resolved before creating a calendar event"});
        results.push({id:action.id,status:"blocked",reason:"scheduling_required"});
        continue;
      }

      if(action.action_type==="appointment_confirmation" && appointment?.status!=="confirmed") {
        await finish(db,action,"blocked",{provider:"internal",error_code:"appointment_not_confirmed",error_message:"Appointment must be confirmed before sending confirmation"});
        results.push({id:action.id,status:"blocked",reason:"appointment_not_confirmed"});
        continue;
      }

      if(action.action_type==="review_request") {
        const {count}=await db.from("appointments").select("id",{count:"exact",head:true})
          .eq("organization_id",action.organization_id).eq("lead_id",action.lead_id).eq("status","completed");
        if(!count) {
          await finish(db,action,"blocked",{provider:"internal",error_code:"execution_not_proven",error_message:"Review request requires a completed appointment"});
          results.push({id:action.id,status:"blocked",reason:"execution_not_proven"});
          continue;
        }
      }

      let channel=action.channel;
      if(action.action_type==="notify_owner") channel="email";
      else if(action.action_type==="calendar_request") channel="calendar";
      else if(action.action_type==="payment_request") channel="payment";
      else if(channel==="auto") {
        const preferred=profile?.preferred_followup_channel;
        if(preferred==="email"&&lead?.email) channel="email";
        else if(preferred==="whatsapp"&&lead?.phone) channel="whatsapp";
        else if(lead?.email) channel="email";
        else if(lead?.phone) channel="whatsapp";
        else channel="email";
      }

      const {data:integration}=await db.from("tenant_integrations").select("*")
        .eq("organization_id",action.organization_id)
        .eq("channel",channel)
        .eq("is_default",true)
        .maybeSingle();

      if(!integration || integration.status!=="active") {
        await finish(db,action,"blocked",{provider:integration?.provider||channel,error_code:"integration_missing",error_message:`No active ${channel} integration for this organization`});
        results.push({id:action.id,status:"blocked",reason:"integration_missing",channel});
        continue;
      }

      let outcome:any;
      if(integration.provider==="resend" && channel==="email") {
        outcome=await sendResend(db,action,integration,lead,profile,appointment);
      } else if(integration.provider==="stripe" && channel==="payment" && action.action_type==="payment_request") {
        outcome=await createStripeCheckout(db,action,integration,lead,profile,payment);
      } else if(integration.provider==="webhook") {
        outcome=await sendWebhook(db,action,integration,lead,profile,appointment,payment);
      } else if(integration.provider==="meta_whatsapp" && channel==="whatsapp") {
        outcome=await sendMetaWhatsApp(db,action,integration,lead,profile,appointment);
      } else {
        outcome={outcome:"blocked",provider:integration.provider,error_code:"adapter_unavailable",error_message:`Provider adapter ${integration.provider} is not enabled in the runtime`};
      }

      await finish(db,action,outcome.outcome,outcome);
      results.push({id:action.id,status:outcome.outcome,provider:outcome.provider,code:outcome.error_code||null});
    }catch(e){
      const msg=String(e instanceof Error?e.message:e);
      await finish(db,action,"retry",{provider:"runner",error_code:"runner_exception",error_message:msg,retry_after_seconds:retrySeconds(action.attempts)});
      results.push({id:action.id,status:"retry",reason:"runner_exception"});
    }
  }

  return json({worker_id:workerId,claimed:(actions||[]).length,results});
});