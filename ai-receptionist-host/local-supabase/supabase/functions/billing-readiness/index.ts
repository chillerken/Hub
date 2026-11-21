import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const H={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Allow-Methods":"POST,OPTIONS",
  "Content-Type":"application/json"
};
const J=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:H});

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:H});
  if(req.method!=="POST")return J({error:"method_not_allowed"},405);
  try{
    const auth=req.headers.get("Authorization")||"";
    if(!auth.startsWith("Bearer "))return J({error:"unauthorized"},401);

    const url=Deno.env.get("SUPABASE_URL")!;
    const pub=Deno.env.get("SUPABASE_ANON_KEY")!;
    const sec=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userDb=createClient(url,pub,{global:{headers:{Authorization:auth}}});
    const db=createClient(url,sec,{auth:{persistSession:false}});

    const {data:{user},error:uerr}=await userDb.auth.getUser(auth.slice(7));
    if(uerr||!user)return J({error:"unauthorized"},401);
    const {data:mem}=await userDb.from("memberships").select("organization_id,role")
      .eq("user_id",user.id).eq("active",true).single();
    if(!mem)return J({error:"membership_not_found"},403);

    const [{data:org},{data:catalog,error:catalogError}]=await Promise.all([
      db.from("organizations").select("plan,subscription_status,stripe_customer_id,stripe_subscription_id,is_internal")
        .eq("id",mem.organization_id).single(),
      db.from("reception_ai_plan_catalog")
        .select("plan,public_name,monthly_cents,setup_cents,currency,daily_ai_limit,sort_order,summary,features,payment_link_url,active")
        .eq("active",true)
        .order("sort_order",{ascending:true})
    ]);
    if(catalogError)throw catalogError;

    const plans=(catalog||[]).map((p:any)=>({
      plan:p.plan,
      public_name:p.public_name,
      monthly_cents:Number(p.monthly_cents||0),
      setup_cents:Number(p.setup_cents||0),
      currency:p.currency||"EUR",
      daily_ai_limit:Number(p.daily_ai_limit||0),
      sort_order:Number(p.sort_order||0),
      summary:p.summary||"",
      features:Array.isArray(p.features)?p.features:[]
    }));
    const checkoutLinksConfigured=(catalog||[]).length===3&&(catalog||[]).every((p:any)=>/^https:\/\/buy\.stripe\.com\//.test(String(p.payment_link_url||"")));
    const webhookSecretConfigured=Boolean(Deno.env.get("STRIPE_WEBHOOK_SECRET"));
    const checkoutReady=checkoutLinksConfigured&&webhookSecretConfigured;

    return J({
      ok:true,
      internal:org?.is_internal===true,
      checkout_ready:org?.is_internal===true?true:checkoutReady,
      checkout_links_configured:checkoutLinksConfigured,
      webhook_secret_configured:webhookSecretConfigured,
      plan:org?.plan||"trial",
      subscription_status:org?.subscription_status||"trialing",
      has_stripe_customer:Boolean(org?.stripe_customer_id),
      has_stripe_subscription:Boolean(org?.stripe_subscription_id),
      webhook_endpoint:url+"/functions/v1/stripe-webhook",
      plans
    });
  }catch(e){
    console.error("BILLING_READINESS",e);
    return J({error:"billing_readiness_failed"},500);
  }
});