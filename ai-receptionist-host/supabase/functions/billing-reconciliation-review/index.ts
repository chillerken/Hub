import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { reviewPaidCheckoutEvidence } from "./review-core.js";

// Operator-only read endpoint. Do not turn a review response into activation.
// Deployment is disabled unless explicitly enabled with BILLING_REVIEW_ENABLED=true.
// Always deploy with verify_jwt=true. CORS is intentionally not enabled.
const headers={
  "Content-Type":"application/json",
  "Cache-Control":"no-store, max-age=0",
  "X-Content-Type-Options":"nosniff",
  "Referrer-Policy":"no-referrer",
  "Vary":"Authorization"
};
const J=(payload:any,status=200)=>new Response(JSON.stringify(payload),{status,headers});

const configKey=(raw:any)=>String(raw||"").trim();
const apiKey=(raw:string,field:string)=>{
  try{return configKey(JSON.parse(raw||"{}")?.default)}catch{throw Error("invalid_"+field+"_configuration")}
};
const bad=(code:string,status=503)=>J({ok:false,code,can_auto_activate:false},status);

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return bad("method_not_allowed",405);
  if(Deno.env.get("BILLING_REVIEW_ENABLED")!=="true")return bad("review_disabled");
  if(Number(req.headers.get("Content-Length")||"0")>2048)return bad("invalid_request",413);
  const auth=req.headers.get("Authorization")||"";
  if(!/^Bearer \S+$/.test(auth)||auth.length>4096)return bad("unauthorized",401);
  try{
    const bodyText=await req.text();
    if(bodyText.length>2048)return bad("invalid_request",413);
    let input:any;
    try{input=JSON.parse(bodyText)}catch{return bad("invalid_json",400)}
    if(typeof input!=="object"||!input||Array.isArray(input))return bad("invalid_request",400);

    const url=Deno.env.get("SUPABASE_URL")||"";
    const pub=apiKey(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"","public")||configKey(Deno.env.get("SUPABASE_ANON_KEY"));
    const sec=apiKey(Deno.env.get("SUPABASE_SECRET_KEYS")||"","secret")||configKey(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    const stripeKey=configKey(Deno.env.get("STRIPE_SECRET_KEY"));
    const modeMatch=/^(sk|rk)_(live|test)_[A-Za-z0-9]+$/.exec(stripeKey);
    if(!url.startsWith("https://")||!pub||!sec||!modeMatch)return bad("server_not_configured");

    const uc=createClient(url,pub,{auth:{persistSession:false},global:{headers:{Authorization:auth}}});
    const db=createClient(url,sec,{auth:{persistSession:false}});
    const {data:{user}={},error:authErr}=await uc.auth.getUser(auth.slice(7));
    if(authErr||!user?.id)return bad("unauthorized",401);
    // The caller must be an owner/admin of a *platform-internal* organization.
    // An ordinary paying tenant's owner/admin is NOT a platform operator.
    const {data:members,error:memberErr}=await db.from("memberships")
      .select("organization_id,role").eq("user_id",user.id)
      .eq("active",true).in("role",["owner","admin"]).limit(30);
    if(memberErr)throw Error("membership_lookup_failed");
    const orgIds=[...new Set((members||[]).map((m:any)=>m.organization_id).filter(Boolean))];
    if(!orgIds.length)return bad("forbidden",403);
    const {data:internal,error:internalErr}=await db.from("organizations")
      .select("id").in("id",orgIds).eq("is_internal",true).limit(1);
    if(internalErr)throw Error("internal_role_lookup_failed");
    if(!internal?.length)return bad("forbidden",403);

    const stripeGet=async(path:string)=>{
      const result=await fetch("https://api.stripe.com/v1/"+path,{
        method:"GET",
        headers:{"Authorization":"Bearer "+stripeKey},
        signal:AbortSignal.timeout(12000)
      });
      if(!result.ok)throw Error("stripe_read_failed");
      return result.json();
    };
    const single=async(query:any)=>{
      const {data,error}=await query.maybeSingle();
      if(error)throw Error("db_read_failed");
      return data||null;
    };
    const providers={
      getIncident:async(eid:string)=>single(db.from("stripe_events")
        .select("id,status,last_error").eq("id",eid)),
      getStripeEvent:(eid:string)=>stripeGet("events/"+encodeURIComponent(eid)),
      getStripeSession:(sid:string)=>stripeGet("checkout/sessions/"+encodeURIComponent(sid)),
      getStripeSubscription:(sid:string)=>stripeGet("subscriptions/"+encodeURIComponent(sid)),
      getCatalog:(plan:string)=>single(db.from("reception_ai_plan_catalog")
        .select("plan,active,stripe_payment_link_id").eq("plan",plan)),
      getReference:async(digest:string)=>{
        // The private schema is deliberately NOT exposed to REST.
        // The service-role-only review RPC only returns one matching hashed reference.
        const {data,error}=await db.rpc("lookup_billing_checkout_reference_for_review",{p_token_hash:digest});
        if(error)throw Error("review_reference_lookup_failed");
        return (Array.isArray(data)?data[0]:data)||null;
      },
      getOrganization:(oid:string)=>single(db.from("organizations")
        .select("id,is_internal,stripe_customer_id,stripe_subscription_id,subscription_status").eq("id",oid))
    };
    const v=await reviewPaidCheckoutEvidence({
      event_id:input.event_id,session_id:input.session_id,
      expectedLivemode:modeMatch[2]==="live",nowMs:Date.now()
    },providers);
    return J(v.body,v.httpStatus);
  }catch(e){
    // Do not disclose Stripe payloads, tokens, customer emails, DB IDs or secrets.
    console.error("billing_reconciliation_review_failed",e instanceof Error?e.message:"unknown");
    return bad("review_temporarily_unavailable");
  }
});
