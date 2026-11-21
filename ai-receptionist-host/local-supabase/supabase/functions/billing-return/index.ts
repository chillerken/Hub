import {createClient} from "https://esm.sh/@supabase/supabase-js@2.95.0";

const DEFAULT_APP="https://reception-ai-luxwash.onrender.com";
const clean=(v:any,max=500)=>String(v??"").trim().slice(0,max);

function safeAppUrl(raw:any){
  try{
    const u=new URL(clean(raw,500)||DEFAULT_APP);
    if(u.protocol!=="https:"||u.username||u.password)return new URL(DEFAULT_APP);
    u.pathname="/";
    u.search="";
    u.hash="";
    return u;
  }catch{
    return new URL(DEFAULT_APP);
  }
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="GET")return new Response("Method not allowed",{status:405,headers:{"Allow":"GET"}});
  try{
    const incoming=new URL(req.url);
    const sessionId=clean(incoming.searchParams.get("session_id"),200);
    const url=Deno.env.get("SUPABASE_URL")!;
    const sec=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db=createClient(url,sec,{auth:{persistSession:false}});
    const {data:appUrl}=await db.rpc("get_platform_secret",{p_name:"reception_ai_app_url"});
    const target=safeAppUrl(appUrl);
    target.searchParams.set("billing","success");
    if(/^cs_(?:test_|live_)[A-Za-z0-9_]+$/.test(sessionId))target.searchParams.set("session_id",sessionId);
    return new Response(null,{
      status:302,
      headers:{
        "Location":target.toString(),
        "Cache-Control":"no-store, max-age=0",
        "Referrer-Policy":"no-referrer",
        "X-Content-Type-Options":"nosniff"
      }
    });
  }catch(e){
    console.error("BILLING_RETURN",e);
    const target=safeAppUrl(DEFAULT_APP);
    target.searchParams.set("billing","success");
    return new Response(null,{
      status:302,
      headers:{
        "Location":target.toString(),
        "Cache-Control":"no-store, max-age=0",
        "Referrer-Policy":"no-referrer"
      }
    });
  }
});