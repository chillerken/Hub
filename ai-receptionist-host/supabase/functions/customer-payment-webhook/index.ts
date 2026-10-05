import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const json=(body:any,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{"Content-Type":"application/json"}
});
const clean=(v:any,max=1000)=>String(v??"").trim().slice(0,max);

function parseStripeSignature(value:string){
  let timestamp=0;
  const v1:string[]=[];
  for(const part of value.split(",")){
    const [k,v]=part.split("=",2);
    if(k==="t") timestamp=Number(v||0);
    if(k==="v1"&&v) v1.push(v);
  }
  return {timestamp,v1};
}

function safeEqualHex(a:string,b:string){
  if(a.length!==b.length || a.length===0) return false;
  let diff=0;
  for(let i=0;i<a.length;i++) diff|=a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}

async function hmacHex(secret:string,payload:string){
  const key=await crypto.subtle.importKey(
    "raw",new TextEncoder().encode(secret),
    {name:"HMAC",hash:"SHA-256"},false,["sign"]
  );
  const sig=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig)).map(x=>x.toString(16).padStart(2,"0")).join("");
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST") return json({error:"Method not allowed"},405);

  const raw=await req.text();
  const header=req.headers.get("stripe-signature")||"";
  if(!header||!raw) return json({error:"Missing signature or body"},400);

  const url=Deno.env.get("SUPABASE_URL")!;
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db=createClient(url,service,{auth:{persistSession:false}});

  const requestUrl=new URL(req.url);
  const integrationId=clean(requestUrl.searchParams.get("integration_id"),80);

  let integration:any=null;
  let legacyEvent:any=null;

  if(integrationId){
    const {data,error}=await db.from("tenant_integrations")
      .select("*")
      .eq("id",integrationId)
      .eq("channel","payment")
      .eq("provider","stripe")
      .eq("is_default",true)
      .single();
    if(error||!data||data.status!=="active") return json({error:"Active Stripe integration not found"},401);
    integration=data;
  }else{
    // Backward compatibility for older manually configured endpoints.
    try{legacyEvent=JSON.parse(raw)}catch{return json({error:"Invalid JSON"},400)}
    const legacyOrg=clean(legacyEvent?.data?.object?.metadata?.organization_id,80);
    if(!legacyOrg) return json({error:"integration_id missing"},400);
    const {data,error}=await db.from("tenant_integrations")
      .select("*")
      .eq("organization_id",legacyOrg)
      .eq("channel","payment")
      .eq("provider","stripe")
      .eq("is_default",true)
      .single();
    if(error||!data||data.status!=="active") return json({error:"Active Stripe integration not found"},401);
    integration=data;
  }

  const organizationId=String(integration.organization_id);
  const {data:rawCredential,error:credErr}=await db.rpc("get_integration_credential",{
    p_integration_id:integration.id,
    p_organization_id:organizationId
  });
  if(credErr||!rawCredential) return json({error:"Stripe credential unavailable"},401);

  let webhookSecret="";
  try{
    const parsed=JSON.parse(rawCredential);
    webhookSecret=clean(parsed?.webhook_secret,1000);
  }catch{}
  if(!webhookSecret.startsWith("whsec_")) return json({error:"Webhook secret unavailable"},401);

  const sig=parseStripeSignature(header);
  const now=Math.floor(Date.now()/1000);
  if(!sig.timestamp || Math.abs(now-sig.timestamp)>300) return json({error:"Webhook timestamp outside tolerance"},400);

  const expected=await hmacHex(webhookSecret,`${sig.timestamp}.${raw}`);
  if(!sig.v1.some(x=>safeEqualHex(x,expected))) return json({error:"Invalid Stripe signature"},400);

  let event:any;
  try{event=legacyEvent||JSON.parse(raw)}catch{return json({error:"Invalid JSON"},400)}
  const obj=event?.data?.object||{};
  const signedOrganizationId=clean(obj?.metadata?.organization_id,80);
  const paymentId=clean(obj?.metadata?.customer_payment_id,80);

  if(!signedOrganizationId||!paymentId) return json({error:"Required payment metadata missing"},400);
  if(signedOrganizationId!==organizationId) return json({error:"Organization reference mismatch"},400);

  if(!["checkout.session.completed","checkout.session.async_payment_succeeded"].includes(event?.type)){
    return json({received:true,ignored:true});
  }
  if(obj?.payment_status!=="paid"){
    return json({received:true,ignored:true,reason:"payment_not_paid"});
  }

  const {data:payment,error:paymentErr}=await db.from("customer_payments")
    .select("id,organization_id,lead_id,status,amount_cents,currency,provider_payment_id")
    .eq("id",paymentId)
    .eq("organization_id",organizationId)
    .single();
  if(paymentErr||!payment) return json({error:"Payment record not found"},404);

  if(String(obj?.client_reference_id||"")!==String(payment.id)){
    return json({error:"Client reference mismatch"},400);
  }
  if(obj?.metadata?.lead_id && String(obj.metadata.lead_id)!==String(payment.lead_id)){
    return json({error:"Lead reference mismatch"},400);
  }
  if(Number(obj?.amount_total||0)!==Number(payment.amount_cents||0)){
    return json({error:"Amount mismatch"},400);
  }
  if(String(obj?.currency||"").toUpperCase()!==String(payment.currency||"").toUpperCase()){
    return json({error:"Currency mismatch"},400);
  }

  if(payment.status==="paid") return json({received:true,already_processed:true});

  const providerPaymentId=clean(obj?.payment_intent||obj?.id,500);
  const paidAt=event?.created ? new Date(Number(event.created)*1000).toISOString() : new Date().toISOString();
  const {data:updated,error:updateErr}=await db.rpc("mark_customer_payment_paid",{
    p_organization_id:organizationId,
    p_payment_id:paymentId,
    p_provider_payment_id:providerPaymentId,
    p_paid_at:paidAt
  });
  if(updateErr) return json({error:"Payment update failed"},500);

  await db.from("audit_events").insert({
    organization_id:organizationId,
    actor_user_id:null,
    event_type:"payment.verified",
    entity_type:"customer_payment",
    entity_id:paymentId,
    payload:{
      provider:"stripe",
      provider_payment_id:providerPaymentId,
      amount_cents:payment.amount_cents,
      currency:payment.currency
    }
  });

  return json({received:true,payment_id:updated?.id,status:updated?.status});
});