import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { page } from "./page.ts";

const projectURL = Deno.env.get("SUPABASE_URL") || "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const securityHeaders: Record<string,string> = {
 "x-content-type-options":"nosniff",
 "referrer-policy":"no-referrer",
 "cache-control":"no-store",
 "x-frame-options":"DENY"
};

Deno.serve(async (req:Request) => {
 const pathname=new URL(req.url).pathname;
 if(req.method!=="GET")return new Response("Method Not Allowed",{status:405,headers:securityHeaders});
 if(pathname.endsWith("/health")) return new Response(JSON.stringify({ok:true,service:"luxwash-ai-approval",mode:"identity_only",sending:false}),{
  status:200,headers:{"content-type":"application/json",...securityHeaders}});
 if(pathname.endsWith("/config")){
   if(!projectURL||!anonKey)return new Response(JSON.stringify({error:"public_auth_configuration_unavailable"}),{
      status:503,headers:{"content-type":"application/json",...securityHeaders}});
   // Supabase ANON key is the public publishable key; never return service_role.
   return new Response(JSON.stringify({url:projectURL,anonKey}),{
      status:200,headers:{"content-type":"application/json",...securityHeaders}});
 }
 if(pathname.endsWith("/luxwash-ai-approval")||pathname.endsWith("/luxwash-ai-approval/")){
  const origin=new URL(projectURL).origin;
  return new Response(page,{status:200,headers:{
   "content-type":"text/html; charset=utf-8",
   "content-security-policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self' "+origin+"; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
   ...securityHeaders
  }});
 }
 return new Response("Not Found",{status:404,headers:securityHeaders});
});
