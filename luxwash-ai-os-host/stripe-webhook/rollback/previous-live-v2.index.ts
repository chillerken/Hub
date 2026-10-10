import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const enc=new TextEncoder();
function hex(bytes:Uint8Array){return Array.from(bytes).map(b=>b.toString(16).padStart(2,"0")).join("")}
function safeEq(a:string,b:string){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0}
async function hmac(secret:string,msg:string){
 const key=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 return hex(new Uint8Array(await crypto.subtle.sign("HMAC",key,enc.encode(msg))));
}
Deno.serve(async(req)=>{
 if(req.method!=="POST") return new Response("method",{status:405});
 const raw=await req.text();
 const sig=req.headers.get("stripe-signature")||"";
 const parts=Object.fromEntries(sig.split(",").map(x=>x.split("=",2)));
 const ts=parts.t||"", v1=parts.v1||"";
 if(!ts||!v1) return new Response("bad signature",{status:400});
 const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
 const {data:cfg,error:cfgErr}=await admin.schema("private").from("ai_creator_config").select("value").eq("key","stripe_webhook_secret").maybeSingle();
 if(cfgErr||!cfg?.value) return new Response("not configured",{status:503});
 const age=Math.abs(Math.floor(Date.now()/1000)-Number(ts));
 if(!Number.isFinite(age)||age>300) return new Response("stale",{status:400});
 const expected=await hmac(cfg.value,ts+"."+raw);
 if(!safeEq(expected,v1)) return new Response("invalid",{status:400});
 let event:any; try{event=JSON.parse(raw)}catch{return new Response("json",{status:400})}
 if(event.type==="checkout.session.completed"||event.type==="checkout.session.async_payment_succeeded"){
   const s=event.data?.object||{};
   if(s.payment_status!=="paid") return new Response("ok",{status:200});
   const email=String(s.customer_details?.email||s.customer_email||"").trim().toLowerCase();
   if(!email) return new Response("missing email",{status:400});
   const row={email,stripe_event_id:String(event.id),stripe_checkout_session_id:String(s.id||""),stripe_payment_intent_id:s.payment_intent?String(s.payment_intent):null,stripe_customer_id:s.customer?String(s.customer):null,product_id:"prod_VN3yN8r2Y15Pwy",payment_link_id:s.payment_link?String(s.payment_link):null,amount_total:s.amount_total??null,currency:s.currency??null,status:"active",updated_at:new Date().toISOString()};
   const {error}=await admin.schema("private").from("ai_creator_entitlements").upsert(row,{onConflict:"stripe_event_id"});
   if(error) return new Response("db",{status:500});
 }
 return new Response("ok",{status:200});
});