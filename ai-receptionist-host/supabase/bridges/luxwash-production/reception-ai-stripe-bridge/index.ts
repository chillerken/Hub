import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const EXPECTED_ACCOUNT="acct_1UFg6GKMkGczYQpS";

const json=(body:any,status=200)=>new Response(JSON.stringify(body),{
  status,
  headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}
});
const clean=(v:any,max=1000)=>String(v??"").trim().slice(0,max);

async function secret(name:string){
  const {data}=await sb.rpc("get_vault_secret_text",{secret_name:name});
  return typeof data==="string"?data:"";
}
async function stripeKey(){
  const key=Deno.env.get("STRIPE_TAFELGO_SECRET_LIVE")||Deno.env.get("STRIPE_SECRET_KEY")||await secret("stripe_tafelgo_secret_live");
  return /^(sk|rk)_live_/.test(key)?key:"";
}
async function stripeJson(path:string,key:string,init:RequestInit={}){
  const headers=new Headers(init.headers||{});
  headers.set("authorization",`Bearer ${key}`);
  const r=await fetch("https://api.stripe.com"+path,{...init,headers});
  const j=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(clean(j?.error?.message||r.statusText,800));
  return j;
}
async function account(key:string){
  return stripeJson("/v1/account",key);
}
async function authorized(req:Request){
  const expected=await secret("reception_ai_stripe_bridge_token");
  const supplied=clean(req.headers.get("x-reception-bridge-token"),200);
  return Boolean(expected&&supplied&&expected===supplied);
}
function validHttps(v:string){
  try{return new URL(v).protocol==="https:"}catch{return false}
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST") return json({error:"method_not_allowed"},405);
  if(!await authorized(req)) return json({error:"forbidden"},403);

  try{
    const key=await stripeKey();
    if(!key) return json({error:"stripe_live_key_missing"},503);
    const acc=await account(key);
    if(String(acc?.id||"")!==EXPECTED_ACCOUNT){
      return json({error:"stripe_account_mismatch",account_id:String(acc?.id||"")},503);
    }

    const body=await req.json().catch(()=>({}));
    const action=clean(body.action,40);

    if(action==="health"){
      return json({
        ok:true,
        account_id:String(acc.id),
        country:String(acc.country||""),
        charges_enabled:Boolean(acc.charges_enabled),
        payouts_enabled:Boolean(acc.payouts_enabled)
      });
    }

    if(action==="create_checkout"){
      const amount=Math.round(Number(body.amount_cents));
      const currency=clean(body.currency||"EUR",8).toLowerCase();
      const productName=clean(body.product_name||"LuxWash betaling",120);
      const successUrl=clean(body.success_url,1000);
      const cancelUrl=clean(body.cancel_url,1000);
      const paymentId=clean(body.customer_payment_id,100);
      const organizationId=clean(body.organization_id,100);
      const leadId=clean(body.lead_id,100);
      const idempotency=clean(body.idempotency_key,255);
      const email=clean(body.customer_email,250);

      if(!Number.isInteger(amount)||amount<50||amount>5000000) return json({error:"invalid_amount"},400);
      if(!/^[a-z]{3,8}$/.test(currency)) return json({error:"invalid_currency"},400);
      if(!validHttps(successUrl)||!validHttps(cancelUrl)) return json({error:"invalid_redirect_url"},400);
      if(!paymentId||!organizationId||!idempotency) return json({error:"missing_reference"},400);

      const p=new URLSearchParams();
      p.set("mode","payment");
      p.set("success_url",successUrl);
      p.set("cancel_url",cancelUrl);
      p.set("client_reference_id",paymentId);
      if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) p.set("customer_email",email);
      p.set("line_items[0][price_data][currency]",currency);
      p.set("line_items[0][price_data][product_data][name]",productName);
      p.set("line_items[0][price_data][unit_amount]",String(amount));
      p.set("line_items[0][quantity]","1");
      p.set("metadata[organization_id]",organizationId);
      if(leadId) p.set("metadata[lead_id]",leadId);
      p.set("metadata[customer_payment_id]",paymentId);

      const session=await stripeJson("/v1/checkout/sessions",key,{
        method:"POST",
        headers:{
          "content-type":"application/x-www-form-urlencoded",
          "idempotency-key":idempotency
        },
        body:p
      });

      return json({
        ok:true,
        checkout_session_id:String(session?.id||""),
        checkout_url:String(session?.url||""),
        payment_status:String(session?.payment_status||"")
      });
    }

    if(action==="expire_checkout"){
      const sessionId=clean(body.checkout_session_id,500);
      if(!/^cs_(live|test)_/.test(sessionId)) return json({error:"invalid_checkout_session_id"},400);
      const session=await stripeJson("/v1/checkout/sessions/"+encodeURIComponent(sessionId)+"/expire",key,{
        method:"POST",
        headers:{"content-type":"application/x-www-form-urlencoded"},
        body:new URLSearchParams()
      });
      return json({ok:true,checkout_session_id:String(session?.id||sessionId),status:String(session?.status||"expired")});
    }

    if(action==="provision_webhook"){
      const webhookUrl=clean(body.webhook_url,1000);
      const organizationId=clean(body.organization_id,100);
      if(!validHttps(webhookUrl)||!webhookUrl.startsWith("https://ndecxbsrxspkuxjsbndq.supabase.co/functions/v1/customer-payment-webhook")){
        return json({error:"invalid_webhook_url"},400);
      }
      if(!organizationId) return json({error:"organization_id_required"},400);

      const p=new URLSearchParams();
      p.set("url",webhookUrl);
      p.append("enabled_events[]","checkout.session.completed");
      p.append("enabled_events[]","checkout.session.async_payment_succeeded");
      p.append("enabled_events[]","checkout.session.async_payment_failed");
      p.append("enabled_events[]","checkout.session.expired");
      p.set("description","Reception AI LuxWash customer payment verification");
      p.set("metadata[organization_id]",organizationId);

      const endpoint=await stripeJson("/v1/webhook_endpoints",key,{
        method:"POST",
        headers:{"content-type":"application/x-www-form-urlencoded"},
        body:p
      });
      if(!endpoint?.id||!endpoint?.secret) return json({error:"webhook_secret_missing"},502);
      return json({
        ok:true,
        webhook_endpoint_id:String(endpoint.id),
        webhook_secret:String(endpoint.secret),
        webhook_url:String(endpoint.url||webhookUrl)
      });
    }

    return json({error:"unknown_action"},400);
  }catch(e){
    console.error("reception-ai-stripe-bridge",e);
    return json({error:"bridge_failed",detail:clean(e instanceof Error?e.message:e,800)},502);
  }
});