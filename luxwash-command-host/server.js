"use strict";
const http = require("node:http");
const { URLSearchParams } = require("node:url");
const fs = require("node:fs");
const path = require("node:path");
const { timingSafeEqual } = require("node:crypto");

const ORIGIN="https://nahwlhptgdkwhjcfkhkt.supabase.co";
const LOGIN_URL=ORIGIN+"/functions/v1/luxwash-ai-os/";
const VERIFY_URL=ORIGIN+"/functions/v1/luxwash-ai-os/api/snapshot";
const BACKEND_URL=ORIGIN+"/functions/v1/luxwash-sales-console-api";
const HTML=fs.readFileSync(path.join(__dirname,"index.html"),"utf8");
const PORT=Number(process.env.PORT||10000);
const COOKIE="lw_command_session";
const MAX_BODY=32768;
const attempts=new Map();

function reply(res,status,body,contentType="application/json; charset=utf-8",extra={}){
 res.writeHead(status,{
  "Content-Type":contentType,
  "Cache-Control":"no-store, private, max-age=0",
  "X-Content-Type-Options":"nosniff",
  "Referrer-Policy":"no-referrer",
  "X-Frame-Options":"DENY",
  ...extra
 });
 res.end(body);
}
function json(res,status,value,extra={}){
 reply(res,status,JSON.stringify(value),"application/json; charset=utf-8",extra);
}
function cookies(req){
 const map={};
 for(const part of (req.headers.cookie||"").split(";")){
  const i=part.indexOf("=");if(i<0)continue;
  map[part.slice(0,i).trim()]=part.slice(i+1).trim();
 }
 return map;
}
function session(req){
 const raw=cookies(req)[COOKIE]||"";
 return /^[0-9]{9,12}\.[a-f0-9]{64}$/.test(raw)?raw:"";
}
function browserOrigin(req){
 // Render terminates HTTPS at its trusted front proxy.
 const host=req.headers.host||"";
 const origin=req.headers.origin||"";
 if(req.headers["sec-fetch-site"]==="cross-site")return false;
 if(!origin)return true;
 const allowed=new Set(["https://"+host, "http://localhost:"+PORT,"http://127.0.0.1:"+PORT]);
 return allowed.has(origin);
}
function readBody(req){
 return new Promise((resolve,reject)=>{
  let total=0;const chunks=[];
  req.on("data",chunk=>{total+=chunk.length;if(total>MAX_BODY){
    reject(new Error("body_too_large"));req.destroy();return;
   }chunks.push(chunk);
  });
  req.on("end",()=>resolve(Buffer.concat(chunks).toString("utf8")));
  req.on("error",reject);
 });
}
function limiter(req){
 const ip=String(req.headers["x-forwarded-for"]||req.socket.remoteAddress||"unknown").split(",")[0].trim();
 const now=Date.now(), old=attempts.get(ip), fresh=old&&now-old.start<15*60*1000;
 const state=fresh?old:{start:now,n:0};
 if(state.n>=5)return false;
 state.n++;attempts.set(ip,state);
 if(attempts.size>10000)attempts.clear();
 return true;
}
async function login(req,res){
 if(!browserOrigin(req))return json(res,403,{error:"invalid_origin"});
 if(!limiter(req))return json(res,429,{error:"Probeer over 15 minuten opnieuw."});
 let body;
 try{body=JSON.parse(await readBody(req))}catch{return json(res,400,{error:"invalid_request"});}
 const password=typeof body.password==="string"?body.password:"";
 if(password.length<1||password.length>512)return json(res,400,{error:"invalid_password"});
 try{
  const upstream=await fetch(LOGIN_URL,{method:"POST",redirect:"manual",
   headers:{"Content-Type":"application/x-www-form-urlencoded"},
   body:new URLSearchParams({password})});
  if(upstream.status!==303)return json(res,401,{error:"Toegangscode onjuist."});
  const setCookie=upstream.headers.get("set-cookie")||"";
  const match=setCookie.match(/(?:^|,\s*)lwos_session=([0-9]{9,12}\.[a-f0-9]{64})(?=;|,|$)/);
  if(!match)return json(res,502,{error:"Supabase heeft geen geldige sessie teruggestuurd."});
  const token=match[1];
  const verified=await fetch(VERIFY_URL,{
   headers:{cookie:"lwos_session="+token,"cache-control":"no-store"},redirect:"manual"
  });
  if(!verified.ok)return json(res,502,{error:"Sessiecontrole mislukt."});
  const exp=Math.min(604800,Math.max(1,Number(token.split(".")[0])-Math.floor(Date.now()/1000)));
  json(res,200,{ok:true},{ "Set-Cookie":COOKIE+"="+token+
    "; Path=/; Max-Age="+exp+"; HttpOnly; Secure; SameSite=Strict"});
 }catch(e){console.error("auth_upstream_error",e?.message||String(e));
  return json(res,502,{error:"Aanmelden tijdelijk niet beschikbaar."});}
}
async function proxy(req,res,pathname){
 if(!browserOrigin(req))return json(res,403,{error:"invalid_origin"});
 const token=session(req);
 if(!token)return json(res,401,{error:"unauthorized"});
 const allow={"/overview":["GET"],"/review":["POST"],"/response":["POST"],"/pipeline":["POST"],"/process":["POST"]};
 const route=pathname.slice(4); // remove /api
 if(!allow[route]||!allow[route].includes(req.method))return json(res,404,{error:"not_found"});
 let body;
 if(req.method==="POST"){
  if(!(req.headers["content-type"]||"").startsWith("application/json"))
   return json(res,415,{error:"json_required"});
  try{body=await readBody(req)}catch{return json(res,413,{error:"body_too_large"});}
 }
 try{
  const upstream=await fetch(BACKEND_URL+route,{
   method:req.method,
   redirect:"manual",
   headers:{"cookie":"lwos_session="+token,"content-type":"application/json","cache-control":"no-store"},
   body:req.method==="POST"?body:undefined
  });
  const payload=await upstream.text();
  if(upstream.status===401)return json(res,401,{error:"unauthorized"},
   {"Set-Cookie":COOKIE+"=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict"});
  if(!upstream.headers.get("content-type")?.includes("application/json"))
   return json(res,502,{error:"backend_response_format"});
  return reply(res,upstream.status,payload,"application/json; charset=utf-8");
 }catch(e){console.error("api_proxy_error",e?.message||String(e));
  return json(res,502,{error:"backend_unavailable"});}
}
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url||"/","http://localhost");
 const p=url.pathname;
 if(p==="/health"&&req.method==="GET")return json(res,200,{ok:true,service:"luxwash-command-host",html:true});
 if(p==="/login"&&req.method==="POST")return login(req,res);
 if(p==="/logout"&&(req.method==="GET"||req.method==="POST")){
  if(!browserOrigin(req))return json(res,403,{error:"invalid_origin"});
  return reply(res,302,"","text/plain; charset=utf-8",
   {"Location":"/","Set-Cookie":COOKIE+"=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict"});
 }
 if(p.startsWith("/api/"))return proxy(req,res,p);
 if((p==="/"||p==="/index.html")&&req.method==="GET")
   return reply(res,200,HTML,"text/html; charset=utf-8",{
     "Content-Security-Policy":"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"
   });
 return json(res,404,{error:"not_found"});
});
server.listen(PORT,"0.0.0.0",()=>console.log("LuxWash Command Host listening on",PORT));
