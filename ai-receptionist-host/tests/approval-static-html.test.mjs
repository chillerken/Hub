import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script} from "node:vm";

const dir = new URL("../luxwash-approval/",import.meta.url);
const html = readFileSync(new URL("index.html",dir),"utf8");
const headers = readFileSync(new URL("../_headers",import.meta.url),"utf8");
const redirects = readFileSync(new URL("../_redirects",import.meta.url),"utf8");

test("Cloudflare Pages serves a full HTML document, not a Supabase function",()=>{
 assert.match(html,/^<!doctype html>/i);
 assert.match(html,/<title>LuxWash.*Veilige goedkeuringen<\/title>/);
 assert.match(html,/<form id="passwordForm">/);
});
test("browser script parses cleanly for mobile Chrome",()=>{
 const source=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(source?.length>1000,"Missing login script");
 assert.doesNotThrow(()=>new Script(source,{filename:"luxwash-approval.html"}));
});
test("configuration requests are absolute HTTPS and no private key is stored",()=>{
 assert.match(html,/https:\/\/nahwlhptgdkwhjcfkhkt\.supabase\.co\/functions\/v1\/luxwash-ai-approval\/config/);
 assert.match(html,/grant_type=password/);
 assert.match(html,/luxwash_identity_review_queue_v1/);
 assert.match(html,/luxwash_identity_review_decide_v1/);
 assert.doesNotMatch(html,/SUPABASE_SERVICE_ROLE_KEY|whsec_|sk_live_/i);
});
test("security headers and explicit routing exist before global catch-all",()=>{
 assert.match(headers,/\/luxwash-approval\/\*/);
 assert.match(headers,/frame-ancestors 'none'/);
 assert.match(headers,/connect-src 'self' https:\/\/nahwlhptgdkwhjcfkhkt\.supabase\.co/);
 assert.match(headers,/X-Robots-Tag: noindex, nofollow/);
 assert.ok(redirects.indexOf("/luxwash-approval ")<redirects.indexOf("/* /index.html 200"),"Route must precede catch-all");
});
