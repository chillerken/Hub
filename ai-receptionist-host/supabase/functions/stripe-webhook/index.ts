import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
const hex=(b:ArrayBuffer)=>Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,"0")).join("");
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
  if(e.type==="checkout.session.completed"&&o.mode==="subscription"&&String(o.metadata?.app||"")==="mijn_ai_business"){
   const plan=String(o.metadata?.plan||""),orgRef=String(o.client_reference_id||o.metadata?.organization_id||""),customer=String(o.customer||""),sub=String(o.subscription||"");
   if(["starter","pro","business"].includes(plan)){
    if(orgRef){
     const {data:org}=await db.from("organizations").select("id").eq("id",orgRef).single();
     if(org){await db.from("organizations").update({plan,subscription_status:"active",stripe_customer_id:customer,stripe_subscription_id:sub}).eq("id",orgRef);console.log("BILLING activated tenant",orgRef,plan)}
    }
    const email=String(o.customer_details?.email||o.customer_email||"").toLowerCase();
    if(email){
     let uid:string|null=null;
     for(let page=1;page<10&&!uid;page++){const {data}=await db.auth.admin.listUsers({page,perPage:100});uid=data?.users?.find((u:any)=>u.email?.toLowerCase()===email)?.id||null;if(!data?.users?.length||data.users.length<100)break}
     if(uid){const {data:m}=await db.from("memberships").select("organization_id").eq("user_id",uid).eq("active",true).limit(1).single();if(m)await db.from("organizations").update({plan,subscription_status:"active",stripe_customer_id:customer,stripe_subscription_id:sub}).eq("id",m.organization_id)}
    }
   }
  }
  if(["customer.subscription.created","customer.subscription.updated","customer.subscription.deleted"].includes(e.type)){
   const status=String(o.status||"cancelled"),customer=String(o.customer||"");const patch:any={subscription_status:status,stripe_subscription_id:String(o.id||"")}; if(o.metadata?.plan&&["starter","pro","business"].includes(String(o.metadata.plan)))patch.plan=String(o.metadata.plan);
   
   await db.from("organizations").update(patch).eq("stripe_customer_id",customer);
  }
  if(e.type==="invoice.payment_failed")await db.from("organizations").update({subscription_status:"past_due"}).eq("stripe_customer_id",String(o.customer||""));
  if(e.type==="invoice.paid")await db.from("organizations").update({subscription_status:"active"}).eq("stripe_customer_id",String(o.customer||""));
  if(e.id)await db.from("stripe_events").update({status:"processed",last_error:null,updated_at:new Date().toISOString()}).eq("id",String(e.id));
  return new Response("ok");
 }catch(err){console.error(err);try{const e=JSON.parse(payload);if(e?.id){const url=Deno.env.get("SUPABASE_URL")!,sec=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;const db=createClient(url,sec,{auth:{persistSession:false}});await db.from("stripe_events").update({status:"failed",last_error:String(err).slice(0,1000),updated_at:new Date().toISOString()}).eq("id",String(e.id));}}catch{}return new Response("error",{status:500})}
});