import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
const hex=(b:ArrayBuffer)=>Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,"0")).join("");
async function sha256Text(value:string){
 return hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)));
}
function planFromSubscription(o:any){
 const direct=String(o?.metadata?.plan||"").toLowerCase();
 if(["starter","pro","business"].includes(direct))return direct;
 for(const item of (o?.items?.data||[])){
  const lookup=String(item?.price?.lookup_key||"").toLowerCase();
  if(lookup==="reception_ai_starter_monthly")return "starter";
  if(lookup==="reception_ai_pro_monthly")return "pro";
  if(lookup==="reception_ai_business_monthly")return "business";
  const p=String(item?.price?.metadata?.plan||"").toLowerCase();
  if(["starter","pro","business"].includes(p))return p;
 }
 return "";
}

function isReceptionAiApp(v:any){
 return ["reception_ai","mijn_ai_business"].includes(String(v||"").toLowerCase());
}
function invoiceSubscriptionId(o:any){
 const direct=[
  o?.parent?.subscription_details?.subscription,
  o?.subscription,
  o?.subscription_details?.subscription,
  o?.subscription_id
 ].map((x:any)=>String(x||"")).find(Boolean);
 if(direct)return direct;
 for(const line of (o?.lines?.data||[])){
  const candidate=String(
   line?.parent?.subscription_item_details?.subscription||
   line?.subscription||
   line?.subscription_id||
   ""
  );
  if(candidate)return candidate;
 }
 return "";
}

async function customerSuccessPaymentRisk(db:any,organizationId:string,reason:string){
 const {data:invite}=await db.from("sales_onboarding_invites")
  .select("id,lead_id,sales_organization_id")
  .eq("claimed_organization_id",organizationId)
  .eq("status","converted")
  .order("converted_at",{ascending:false}).limit(1).maybeSingle();
 if(!invite)return;
 const {data:lead}=await db.from("leads").select("name,email,phone")
  .eq("id",invite.lead_id).eq("organization_id",invite.sales_organization_id).maybeSingle();
 const who=String(lead?.name||lead?.email||lead?.phone||"klant").trim().slice(0,120);
 const title="Customer Success: URGENT – betaling – "+who;
 const {data:existing}=await db.from("tasks").select("id")
  .eq("organization_id",invite.sales_organization_id).eq("lead_id",invite.lead_id)
  .eq("status","open").eq("title",title).limit(1);
 if(!existing?.length){
   await db.from("tasks").insert({
     organization_id:invite.sales_organization_id,lead_id:invite.lead_id,title,
     status:"open",priority:"urgent",due_at:new Date(Date.now()+2*3600000).toISOString()
   });
 }
 await db.from("audit_events").insert({
   organization_id:invite.sales_organization_id,actor_user_id:null,event_type:"customer_success.payment_risk",
   entity_type:"lead",entity_id:invite.lead_id,
   payload:{claimed_organization_id:organizationId,reason}
 });
}

async function resolveCustomerSuccessPaymentRisk(db:any,organizationId:string){
 const {data:invite}=await db.from("sales_onboarding_invites")
  .select("lead_id,sales_organization_id")
  .eq("claimed_organization_id",organizationId)
  .eq("status","converted")
  .order("converted_at",{ascending:false}).limit(1).maybeSingle();
 if(!invite)return;
 await db.from("tasks").update({status:"done",completed_at:new Date().toISOString()})
  .eq("organization_id",invite.sales_organization_id).eq("lead_id",invite.lead_id)
  .eq("status","open").ilike("title","Customer Success: URGENT – betaling – %");
}
async function markSalesConverted(db:any,organizationId:string,plan:string){
 const {data:invite}=await db.from("sales_onboarding_invites")
  .select("id,lead_id,sales_organization_id,status")
  .eq("claimed_organization_id",organizationId)
  .in("status",["pending","claimed"])
  .order("created_at",{ascending:false}).limit(1).maybeSingle();
 if(!invite)return;
 const now=new Date().toISOString();
 const {data:lead}=await db.from("leads").select("name,email,phone")
  .eq("id",invite.lead_id).eq("organization_id",invite.sales_organization_id).maybeSingle();
 const who=String(lead?.name||lead?.email||lead?.phone||"nieuwe klant").trim().slice(0,120);

 await db.from("organizations").update({status:"active",updated_at:now}).eq("id",organizationId);
 await db.from("sales_onboarding_invites").update({status:"converted",converted_at:now,updated_at:now}).eq("id",invite.id);
 await db.from("leads").update({
   status:"won",
   outcome_reason:"Reception AI abonnement geactiveerd",
   outcome_notes:"SaaS-plan: "+plan,
   updated_at:now
 }).eq("id",invite.lead_id).eq("organization_id",invite.sales_organization_id);
 await db.from("sales_opportunities").update({
   temperature:"hot",stage:"won",confidence:100,
   next_action:"Voer een productiecontrole uit en volg de eerste klantresultaten op.",
   reason:"De prospect heeft een betaald Reception AI-abonnement geactiveerd.",
   updated_at:now,analyzed_at:now
 }).eq("organization_id",invite.sales_organization_id).eq("lead_id",invite.lead_id);
 await db.from("tasks").update({status:"done",completed_at:now})
   .eq("organization_id",invite.sales_organization_id).eq("lead_id",invite.lead_id)
   .eq("status","open").ilike("title","Sales Agent:%");

 const csTitle="Customer Success: productiecontrole – "+who;
 const {data:existingCs}=await db.from("tasks").select("id")
   .eq("organization_id",invite.sales_organization_id).eq("lead_id",invite.lead_id)
   .eq("status","open").eq("title",csTitle).limit(1);
 if(!existingCs?.length){
   await db.from("tasks").insert({
     organization_id:invite.sales_organization_id,
     lead_id:invite.lead_id,
     title:csTitle,
     status:"open",
     priority:"high",
     due_at:new Date(Date.now()+48*3600000).toISOString()
   });
 }

 await db.from("audit_events").insert({
   organization_id:invite.sales_organization_id,actor_user_id:null,event_type:"sales_onboarding.converted",
   entity_type:"lead",entity_id:invite.lead_id,
   payload:{invite_id:invite.id,claimed_organization_id:organizationId,plan,customer_success_task:true}
 });
}
async function valid(payload:string,header:string,secret:string){
 const vals:Record<string,string[]>={};
 for(const x of header.split(",")){const i=x.indexOf("=");if(i>0){const k=x.slice(0,i).trim(),v=x.slice(i+1).trim();(vals[k]??=[]).push(v)}}
 const t=vals.t?.[0], signatures=vals.v1||[]; if(!t||!signatures.length)return false;
 const ts=Number(t); if(!Number.isFinite(ts)||Math.abs(Date.now()/1000-ts)>300)return false;
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const expected=new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(t+"."+payload)));
 for(const s of signatures){if(!/^[0-9a-f]{64}$/i.test(s))continue;const got=new Uint8Array(s.match(/../g)!.map(x=>parseInt(x,16)));if(got.length!==expected.length)continue;let diff=0;for(let i=0;i<expected.length;i++)diff|=expected[i]^got[i];if(diff===0)return true}
 return false;
}
Deno.serve(async req=>{
 if(req.method!=="POST")return new Response("method",{status:405});
 const payload=await req.text(), secret=Deno.env.get("STRIPE_WEBHOOK_SECRET")||"", sig=req.headers.get("stripe-signature")||"";
 if(!secret){console.error("STRIPE_WEBHOOK_SECRET missing");return new Response("config",{status:500})}
 if(!(await valid(payload,sig,secret)))return new Response("signature",{status:400});
 try{
  const e=JSON.parse(payload),o=e.data?.object||{};
  const url=Deno.env.get("SUPABASE_URL")!,sec=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db=createClient(url,sec,{auth:{persistSession:false}});
  if(e.id){
   const eid=String(e.id), et=String(e.type||"unknown");
   const {data:prior}=await db.from("stripe_events").select("status,attempts").eq("id",eid).maybeSingle();
   if(prior?.status==="processed")return new Response("ok");
   if(prior){
    const {error:ue}=await db.from("stripe_events").update({status:"processing",last_error:null,attempts:Number(prior.attempts||0)+1,updated_at:new Date().toISOString()}).eq("id",eid);
    if(ue)throw ue;
   }else{
    const {error:ie}=await db.from("stripe_events").insert({id:eid,event_type:et,status:"processing",attempts:1,updated_at:new Date().toISOString()});
    if(ie?.code==="23505"){const {data:r}=await db.from("stripe_events").select("status").eq("id",eid).single();if(r?.status==="processed")return new Response("ok");}
    else if(ie)throw ie;
   }
  }
  if(["checkout.session.completed","checkout.session.async_payment_succeeded","checkout.session.async_payment_failed"].includes(e.type)&&o.mode==="subscription"&&isReceptionAiApp(o.metadata?.app)){
   const plan=String(o.metadata?.plan||"").toLowerCase(),ref=String(o.client_reference_id||""),customer=String(o.customer||""),sub=String(o.subscription||"");
   const paymentStatus=String(o.payment_status||"").toLowerCase();
   const paid=e.type==="checkout.session.async_payment_succeeded"||paymentStatus==="paid";
   const noPaymentRequired=paymentStatus==="no_payment_required";
   const explicitlyFailed=e.type==="checkout.session.async_payment_failed";
   const checkoutStatus=paid?"active":noPaymentRequired?"trialing":explicitlyFailed?"past_due":"incomplete";
   let resolvedOrg:string|null=null;

   if(["starter","pro","business"].includes(plan)&&ref){
    const refHash=await sha256Text(ref);
    const {data:refs,error:refErr}=await db.rpc("apply_billing_checkout_ref",{p_token_hash:refHash,p_plan:plan,p_subscription_status:checkoutStatus,p_customer_id:customer,p_subscription_id:sub});
    if(refErr)throw refErr;
    const row=Array.isArray(refs)?refs[0]:refs;
    if(row?.organization_id)resolvedOrg=String(row.organization_id);
   }

   const email=String(o.customer_details?.email||o.customer_email||"").toLowerCase();
   if(!resolvedOrg && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ref) && email){
    let uid:string|null=null;
    for(let page=1;page<10&&!uid;page++){
     const {data}=await db.auth.admin.listUsers({page,perPage:100});
     uid=data?.users?.find((u:any)=>u.email?.toLowerCase()===email)?.id||null;
     if(!data?.users?.length||data.users.length<100)break;
    }
    if(uid){
     const {data:m}=await db.from("memberships").select("organization_id,role").eq("user_id",uid).eq("organization_id",ref).eq("active",true).in("role",["owner","admin"]).maybeSingle();
     if(m?.organization_id)resolvedOrg=String(m.organization_id);
    }
   }

   if(!resolvedOrg && sub){
    const {data:bySub}=await db.from("organizations").select("id").eq("stripe_subscription_id",sub).maybeSingle();
    if(bySub?.id)resolvedOrg=String(bySub.id);
   }
   if(!resolvedOrg && customer){
    const {data:byCustomer}=await db.from("organizations").select("id").eq("stripe_customer_id",customer).maybeSingle();
    if(byCustomer?.id)resolvedOrg=String(byCustomer.id);
   }

   if(["starter","pro","business"].includes(plan)&&resolvedOrg){
    const {error:checkoutWriteError}=await db.from("organizations").update({
      plan,
      subscription_status:checkoutStatus,
      stripe_customer_id:customer,
      stripe_subscription_id:sub
    }).eq("id",resolvedOrg);
    if(checkoutWriteError)throw checkoutWriteError;
    if(checkoutStatus==="active"){await markSalesConverted(db,resolvedOrg,plan);await resolveCustomerSuccessPaymentRisk(db,resolvedOrg)}
    console.log(paid?"BILLING activated tenant":"BILLING checkout pending payment",resolvedOrg,plan,String(o.payment_status||"unknown"));
   }else if(["starter","pro","business"].includes(plan)){
    console.warn("BILLING checkout not linked to an authorized tenant",String(e.id||""),plan);
   }
  }
  if(["customer.subscription.created","customer.subscription.updated","customer.subscription.deleted","customer.subscription.paused","customer.subscription.resumed"].includes(e.type)){
   const status=String(o.status||(e.type==="customer.subscription.deleted"?"canceled":"incomplete"));
   const customer=String(o.customer||""),subscriptionId=String(o.id||"");
   const derivedPlan=planFromSubscription(o);
   let targetOrgs:any[]=[];
   if(subscriptionId){
    const {data:bySub}=await db.from("organizations").select("id,plan,stripe_subscription_id").eq("stripe_subscription_id",subscriptionId);
    targetOrgs=bySub||[];
   }
   if(!targetOrgs.length&&customer&&isReceptionAiApp(o?.metadata?.app)&&derivedPlan){
    const {data:byCustomer}=await db.from("organizations").select("id,plan,stripe_subscription_id").eq("stripe_customer_id",customer);
    targetOrgs=byCustomer||[];
   }
   if(!targetOrgs.length){
    console.log("BILLING ignored unrelated subscription event",String(e.id||""),subscriptionId||"no_subscription_id");
   }else{
    for(const target of targetOrgs){
     const patch:any={subscription_status:status,stripe_subscription_id:subscriptionId};
     if(derivedPlan)patch.plan=derivedPlan;
     const {data:updated,error:subscriptionWriteError}=await db.from("organizations").update(patch).eq("id",target.id).select("id,plan").single();
     if(subscriptionWriteError)throw subscriptionWriteError;
     if(status==="active"&&updated){await markSalesConverted(db,String(updated.id),String(updated.plan||derivedPlan||"paid"));await resolveCustomerSuccessPaymentRisk(db,String(updated.id))}
     if(["past_due","unpaid","canceled","incomplete_expired"].includes(status)&&updated)await customerSuccessPaymentRisk(db,String(updated.id),"subscription_"+status);
    }
   }
  }
  if(e.type==="invoice.payment_failed"){
   const subscriptionId=invoiceSubscriptionId(o);
   if(subscriptionId){
    const {data:updatedOrgs,error:invoiceWriteError}=await db.from("organizations").update({subscription_status:"past_due"}).eq("stripe_subscription_id",subscriptionId).select("id");
    if(invoiceWriteError)throw invoiceWriteError;
    for(const orgRow of updatedOrgs||[])await customerSuccessPaymentRisk(db,String(orgRow.id),"invoice_payment_failed");
   }else console.log("BILLING ignored invoice.payment_failed without linked subscription",String(e.id||""));
  }
  if(e.type==="invoice.paid"){
   const subscriptionId=invoiceSubscriptionId(o);
   if(subscriptionId){
    const {data:updatedOrgs,error:invoiceWriteError}=await db.from("organizations").update({subscription_status:"active"}).eq("stripe_subscription_id",subscriptionId).select("id,plan");
    if(invoiceWriteError)throw invoiceWriteError;
    for(const orgRow of updatedOrgs||[]){await markSalesConverted(db,String(orgRow.id),String(orgRow.plan||"paid"));await resolveCustomerSuccessPaymentRisk(db,String(orgRow.id))}
   }else console.log("BILLING ignored invoice.paid without linked subscription",String(e.id||""));
  }
  if(e.id){const {error:completeError}=await db.from("stripe_events").update({status:"processed",last_error:null,updated_at:new Date().toISOString()}).eq("id",String(e.id));if(completeError)throw completeError;}
  return new Response("ok");
 }catch(err){console.error(err);try{const e=JSON.parse(payload);if(e?.id){const url=Deno.env.get("SUPABASE_URL")!,sec=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;const db=createClient(url,sec,{auth:{persistSession:false}});await db.from("stripe_events").update({status:"failed",last_error:String(err).slice(0,1000),updated_at:new Date().toISOString()}).eq("id",String(e.id));}}catch{}return new Response("error",{status:500})}
});
