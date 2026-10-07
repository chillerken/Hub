import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods":"POST,OPTIONS"
};
const json=(body:any,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{...cors,"Content-Type":"application/json"}
});
const clean=(v:any,max=1000)=>String(v??"").trim().slice(0,max);

async function sha256(value:string){
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,"0")).join("");
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return json({error:"Method not allowed"},405);

  try{
    const auth=req.headers.get("Authorization")||"";
    if(!auth.startsWith("Bearer ")) return json({error:"Unauthorized"},401);
    const token=auth.slice(7);

    const url=Deno.env.get("SUPABASE_URL")!;
    const anon=Deno.env.get("SUPABASE_ANON_KEY")!;
    const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userDb=createClient(url,anon,{auth:{persistSession:false},global:{headers:{Authorization:auth}}});
    const db=createClient(url,service,{auth:{persistSession:false}});

    const {data:u,error:ue}=await userDb.auth.getUser(token);
    if(ue||!u?.user) return json({error:"Unauthorized"},401);

    const {data:mem,error:me}=await userDb.from("memberships")
      .select("organization_id,role")
      .eq("user_id",u.user.id).eq("active",true).single();
    if(me||!mem) return json({error:"Membership not found"},403);
    if(!["owner","admin"].includes(mem.role)) return json({error:"Owner or admin role required"},403);

    const {data:integration,error:ie}=await userDb.from("tenant_integrations")
      .select("id,organization_id,channel,provider,status")
      .eq("organization_id",mem.organization_id)
      .eq("channel","calendar")
      .eq("provider","google_calendar")
      .eq("is_default",true)
      .single();
    if(ie||!integration) return json({error:"Google Calendar integration not found"},404);

    const [{data:clientId},{data:appUrl}]=await Promise.all([
      db.rpc("get_platform_secret",{p_name:"reception_ai_google_client_id"}),
      db.rpc("get_platform_secret",{p_name:"reception_ai_app_url"})
    ]);
    if(!clientId) return json({
      ok:false,
      error:"Google OAuth-platformconfiguratie ontbreekt.",
      code:"google_oauth_platform_setup_required",
      detail:"Stel als Platform Owner eerst de Google OAuth Client ID en Client Secret in bij Integraties.",
      redirect_uri:url+"/functions/v1/google-calendar-oauth-callback"
    },200);

    const state=crypto.randomUUID().replace(/-/g,"")+crypto.randomUUID().replace(/-/g,"");
    const stateHash=await sha256(state);
    const returnBase=clean(appUrl,500)||"https://reception-ai-luxwash.onrender.com";
    const redirectAfter=returnBase+"/?view=integrations";
    const expiresAt=new Date(Date.now()+10*60*1000).toISOString();

    const {error:stateErr}=await db.rpc("create_oauth_state",{
      p_state_hash:stateHash,
      p_organization_id:mem.organization_id,
      p_user_id:u.user.id,
      p_integration_id:integration.id,
      p_provider:"google_calendar",
      p_redirect_after:redirectAfter,
      p_expires_at:expiresAt
    });
    if(stateErr) throw stateErr;

    const redirectUri=url+"/functions/v1/google-calendar-oauth-callback";
    const params=new URLSearchParams({
      client_id:String(clientId),
      redirect_uri:redirectUri,
      response_type:"code",
      scope:"https://www.googleapis.com/auth/calendar.events",
      access_type:"offline",
      include_granted_scopes:"true",
      prompt:"consent",
      state
    });

    return json({
      ok:true,
      authorization_url:"https://accounts.google.com/o/oauth2/v2/auth?"+params.toString(),
      redirect_uri:redirectUri,
      scope:"https://www.googleapis.com/auth/calendar.events"
    });
  }catch(e){
    console.error(e);
    return json({error:"Could not start Google Calendar connection",detail:clean(e instanceof Error?e.message:e,1000)},500);
  }
});