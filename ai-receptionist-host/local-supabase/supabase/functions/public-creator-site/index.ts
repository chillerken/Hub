import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const htmlHeaders={
  "Content-Type":"text/html; charset=utf-8",
  "Cache-Control":"public, max-age=60, s-maxage=300",
  "X-Content-Type-Options":"nosniff",
  "Referrer-Policy":"strict-origin-when-cross-origin",
  "X-Frame-Options":"DENY",
  "Permissions-Policy":"camera=(), microphone=(), geolocation=(), payment=()",
  "Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; font-src https: data:; script-src 'none'; connect-src 'none'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
};
const text=(s:string,status=200)=>new Response(s,{status,headers:{...htmlHeaders,"Cache-Control":"no-store"}});
const uuidRe=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async(req:Request)=>{
  if(req.method!=="GET")return text("<h1>Method not allowed</h1>",405);
  try{
    const u=new URL(req.url);
    const token=String(u.searchParams.get("token")||"").trim();
    if(!uuidRe.test(token))return text("<h1>Website niet gevonden</h1>",404);

    const url=Deno.env.get("SUPABASE_URL")!;
    const sec=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db=createClient(url,sec,{auth:{persistSession:false}});
    const {data,error}=await db.from("creator_hub_assets")
      .select("payload,title,status")
      .eq("public_token",token)
      .eq("asset_type","website")
      .eq("status","live")
      .maybeSingle();
    if(error||!data)return text("<!doctype html><html><body><h1>Website niet gevonden</h1><p>Deze publicatie is niet actief.</p></body></html>",404);

    const content=String(data.payload?.content||"").trim();
    if(!/^<!doctype html>|^<html[\s>]/i.test(content)){
      return text("<!doctype html><html><body><h1>Ongeldige website</h1></body></html>",422);
    }
    return new Response(content,{status:200,headers:htmlHeaders});
  }catch(e){
    console.error("PUBLIC_CREATOR_SITE",e);
    return text("<!doctype html><html><body><h1>Tijdelijk niet beschikbaar</h1></body></html>",500);
  }
});