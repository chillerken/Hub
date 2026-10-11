import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import worker from './worker.js';

const userId='test-owner-1',org='09069b87-e02a-471d-977c-e4acd4e383b7';
let authCalls=0,modelCalls=0;
const leadId='11111111-1111-4111-8111-111111111111';
const dayFmt=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit'});
const localToday=dayFmt.format(new Date());
const todayStart=new Date(Date.parse(localToday+'T12:00:00Z'));
const tomorrowStart=new Date(todayStart.getTime()+86400000);
const appointment=(start,description)=>({id:description,lead_id:leadId,status:'confirmed',organization_id:org,start_at:start.toISOString(),end_at:new Date(start.getTime()+7200000).toISOString(),location:'Voorbeeldstraat 1',requested_text:description});
globalThis.fetch=async (input,opts={})=>{
  const u=new URL(input), token=opts.headers?.Authorization;
  assert.equal(u.hostname,'ndecxbsrxspkuxjsbndq.supabase.co');
  assert.ok(opts.headers?.apikey?.startsWith('sb_publishable_'));
  assert.equal(opts.cache,undefined,'Legacy Cloudflare compatibility does not implement fetch cache option');
  assert.equal(opts.redirect,'manual','Cloudflare Workers do not support fetch redirect=error');
  assert.equal(opts.headers['Cache-Control'],'no-store');
  authCalls++;
  if(u.pathname==='/auth/v1/user'){
    if(token==='Bearer user-owner-jwt')return Response.json({id:userId});
    if(token==='Bearer user-reader-jwt')return Response.json({id:'test-reader-2'});
    return Response.json({message:'unauthorized'},{status:401});
  }
  if(u.pathname==='/rest/v1/memberships'){
    assert.equal(u.searchParams.get('organization_id'),'eq.'+org);
    if(token==='Bearer user-owner-jwt')return Response.json([{user_id:userId,organization_id:org,active:true,role:'owner'}]);
    if(token==='Bearer user-reader-jwt')return Response.json([{user_id:'test-reader-2',organization_id:org,active:true,role:'reader'}]);
  }
  if(u.pathname==='/rest/v1/appointments'){
    assert.equal(u.searchParams.get('organization_id'),'eq.'+org);
    assert.equal(u.searchParams.get('status'),'eq.confirmed');
    return Response.json([appointment(todayStart,'TEST VANDAAG'),appointment(tomorrowStart,'TEST MORGEN')]);
  }
  if(u.pathname==='/rest/v1/leads'){
    assert.equal(u.searchParams.get('organization_id'),'eq.'+org);
    return Response.json([{id:leadId,name:'Voorbeeldklant'}]);
  }
  throw Error('Unexpected auth path');
};
const env={AI:{async run(model,options){modelCalls++;assert.ok(model.includes('llama'));assert.equal(options.messages.at(-1).content,'Dag JARVIS');return {response:'Dag! AI antwoordt.'};}}};
const run=(path,options)=>worker.fetch(new Request('https://jarvis-test.example'+path,options),env);
function post(messages,token='user-owner-jwt'){return {method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({messages})};}
const health=await run('/api/health');
assert.equal(health.status,200);
const h=await health.json();
assert.equal(h.version,'1.3.7');assert.equal(h.aiConfigured,true);assert.equal(h.auth,'reception-ai-login');
assert.equal((await run('/api/chat')).status,405);
assert.equal((await run('/api/chat',{method:'POST',body:'{}'})).status,401);
assert.equal((await run('/api/chat',post([{role:'user',content:'Dag JARVIS'}],'wrong-jwt'))).status,401);
assert.equal((await run('/api/chat',post([{role:'user',content:'Dag JARVIS'}],'user-reader-jwt'))).status,403);
assert.equal(modelCalls,0);
let response=await run('/api/chat',post([{role:'user',content:'Dag JARVIS'}]));
assert.equal(response.status,200);assert.equal((await response.json()).response,'Dag! AI antwoordt.');
assert.equal(modelCalls,1);assert.ok(authCalls>=5);
assert.equal((await run('/api/chat',post([{role:'assistant',content:'No user message'}]))).status,400);
assert.equal((await run('/api/chat',{method:'POST',headers:{Authorization:'Bearer user-owner-jwt'},body:'{broken'})).status,400);
const bad=new Request('https://jarvis-test.example/api/chat',{method:'POST',headers:{Authorization:'Bearer user-owner-jwt','Content-Type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:'x'.repeat(13000)}]})});
assert.equal((await worker.fetch(bad,env)).status,413);
assert.equal((await worker.fetch(new Request('https://jarvis-test.example/api/chat',post([{role:'user',content:'Dag JARVIS'}])),{})).status,503);
const page=await run('/');assert.equal(page.status,200);
const html=await page.text();
assert.ok(html.includes('id="aiLoginShortcut"'));
assert.ok(html.includes('id="aiTest"'));
assert.ok(html.includes('id="aiTestStatus"'));
assert.ok(html.includes('AI niet aangemeld'));
assert.ok(html.includes('AI getest en actief'));
assert.ok(html.includes('requestAI(messages,context)'));
assert.ok(!html.includes('● Lokaal'));
assert.ok(html.includes('PERSONAL OS · V1.3.7'));
assert.ok(!worker.toString().includes("redirect:'error'"));
assert.ok(html.includes('AUTH_UPSTREAM_UNREACHABLE')===false);
assert.ok((await (await run('/api/chat',post([{role:'user',content:'Dag JARVIS'}]))).json()).response.includes('Dag!'));


assert.ok(html.includes('id="lwReceptionLogin"'));
assert.ok(html.includes('id="lwTomorrow"'));
assert.ok(html.includes('window.JarvisAuth=Object.freeze'));
assert.ok(!html.includes('id="saveKey"'));
assert.ok(!html.includes('Persoonlijke AI-toegangscode'));
for(const [,js] of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new Script(js,{filename:'jarvis-inline.js'});
assert.ok(page.headers.get('Content-Security-Policy').includes('ndecxbsrxspkuxjsbndq.supabase.co'));
for(const [path,substring] of [['/manifest.webmanifest','JARVIS Personal OS'],['/sw.js','jarvis-personal-v137'],['/icon.svg','<svg']]){
  const r=await run(path);assert.equal(r.status,200);assert.ok((await r.text()).includes(substring));
}
// Both dates must read the right tenant and not hallucinate appointments.
const agendaToday=await run('/api/chat',post([{role:'user',content:'Wat staat er vandaag gepland?'}]));
assert.equal(agendaToday.status,200);
const todayText=(await agendaToday.json()).response;
assert.ok(todayText.includes('TEST VANDAAG'));
assert.ok(todayText.includes('Bevestigde LuxWash-afspraken'));
assert.ok(!todayText.includes('Bestaande klantafspraak handmatig ingevoerd'));

assert.ok(!todayText.includes('TEST MORGEN'));
assert.ok(todayText.includes('Bron: Reception AI'));
const agendaTomorrow=await run('/api/chat',post([{role:'user',content:'Wat staat er morgen gepland?'}]));
assert.equal(agendaTomorrow.status,200);
const tomorrowText=(await agendaTomorrow.json()).response;
assert.ok(tomorrowText.includes('TEST MORGEN'));
assert.ok(!tomorrowText.includes('TEST VANDAAG'));
// Official LuxWash tariff snapshot must bypass freeform AI.
const priceText=(await (await run('/api/chat',post([{role:'user',content:'Wat zijn de prijzen van luxweg?'}]))).json()).response;
assert.ok(priceText.includes('Clean & Shine sedan €49'));
assert.ok(priceText.includes('hoekzetel €135'));
assert.ok(priceText.includes('https://www.luxwash.online/prijzen'));
const furniture=(await (await run('/api/chat',post([{role:'user',content:'Wat kost een hoekzetel?'}]))).json()).response;
assert.ok(furniture.includes('hoekzetel €135'));
assert.ok(!furniture.includes('Clean & Shine'));
assert.equal(modelCalls,2,'Known schedule and tariff answers must bypass AI');
assert.equal((await run('/missing')).status,404);
console.log('JARVIS v1.3.7 tests OK: JWT auth, admin membership, denied access, AI response, invalid inputs, front-end JS syntax, PWA routes.');
