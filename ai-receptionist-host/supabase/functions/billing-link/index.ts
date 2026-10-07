import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods":"POST,OPTIONS"
};
const out=(body:any,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store, max-age=0","Referrer-Policy":"no-referrer"}
});
const clean=(v:any,max=500)=>String(v??"").trim().slice(0,max);

async function sha256(value:string){
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,"0")).join("");
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return out({error:"Method not allowed"},405);

  try{
    const auth=req.headers.get("Authorization")||"";
    if(!auth.startsWith("Bearer ")) return out({error:"Unauthorized"},401);
    const token=auth.slice(7);

    const url=Deno.env.get("SUPABASE_URL")!;
    const anon=Deno.env.get("SUPABASE_ANON_KEY")!;
    const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userDb=createClient(url,anon,{auth:{persistSession:false},global:{headers:{Authorization:auth}}});
    const db=createClient(url,service,{auth:{persistSession:false}});

    const {data:u,error:ue}=await userDb.auth.getUser(token);
    if(ue||!u?.user) return out({error:"Unauthorized"},401);

    const {data:mem,error:me}=await userDb.from("memberships")
      .select("organization_id,role")
      .eq("user_id",u.user.id).eq("active",true).single();
    if(me||!mem) return out({error:"Membership not found"},403);
    if(!["owner","admin"].includes(mem.role)) return out({error:"Owner or admin role required"},403);

    const {data:orgrow}=await db.from("organizations").select("is_internal").eq("id",mem.organization_id).single();
    if(orgrow?.is_internal===true) return out({error:"Platform Owner-account is intern en heeft geen betaald abonnement nodig.",code:"internal_account"},403);

    const b=await req.json();
    const plan=clean(b.plan,20).toLowerCase();
    const {data:planRow,error:planError}=await db.from("reception_ai_plan_catalog")
      .select("plan,public_name,monthly_cents,setup_cents,currency,payment_link_url,active")
      .eq("plan",plan)
      .eq("active",true)
      .maybeSingle();
    if(planError) throw planError;
    if(!planRow||!/^https:\/\/buy\.stripe\.com\//.test(String(planRow.payment_link_url||""))) return out({error:"Invalid plan"},400);

    const raw=crypto.randomUUID().replace(/-/g,"")+crypto.randomUUID().replace(/-/g,"");
    const tokenHash=await sha256(raw);
    const expiresAt=new Date(Date.now()+2*60*60*1000).toISOString();

    const {error:re}=await db.rpc("create_billing_checkout_ref",{
      p_token_hash:tokenHash,
      p_organization_id:mem.organization_id,
      p_user_id:u.user.id,
      p_plan:plan,
      p_expires_at:expiresAt
    });
    if(re) throw re;

    await db.from("audit_events").insert({
      organization_id:mem.organization_id,
      actor_user_id:u.user.id,
      event_type:"billing.checkout_prepared",
      entity_type:"organization",
      entity_id:mem.organization_id,
      payload:{plan,public_name:planRow.public_name,monthly_cents:planRow.monthly_cents,setup_cents:planRow.setup_cents,currency:planRow.currency,expires_at:expiresAt}
    });

    return out({
      ok:true,
      plan,
      public_name:planRow.public_name,
      monthly_cents:Number(planRow.monthly_cents||0),
      setup_cents:Number(planRow.setup_cents||0),
      currency:planRow.currency||"EUR",
      checkout_url:String(planRow.payment_link_url)+"?client_reference_id="+encodeURIComponent(raw),
      expires_at:expiresAt
    });
  }catch(e){
    console.error(e);
    return out({error:"Could not prepare secure checkout",detail:clean(e instanceof Error?e.message:e,1000)},500);
  }
});