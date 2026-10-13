import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import worker from './worker.js';

const userId='6574c619-8dad-4e79-872a-18e53d4f5277',org='09069b87-e02a-471d-977c-e4acd4e383b7';
let authCalls=0,modelCalls=0,priceCalls=0,pricesUnavailable=false,missionCalls=0,crmReads=0,missionMode='ok';
const leadId='11111111-1111-4111-8111-111111111111';
const dayFmt=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit'});
const localToday=dayFmt.format(new Date());
const todayStart=new Date(Date.parse(localToday+'T12:00:00Z'));
const tomorrowStart=new Date(todayStart.getTime()+86400000);
const appointment=(start,description)=>({id:description,lead_id:leadId,status:'confirmed',organization_id:org,start_at:start.toISOString(),end_at:new Date(start.getTime()+7200000).toISOString(),location:'Locatie '+description,requested_text:description});
globalThis.fetch=async (input,opts={})=>{
  const u=new URL(input), token=opts.headers?.Authorization;
  if(u.hostname==='www.luxwash.online'){
    priceCalls++;assert.equal(u.pathname,'/prijzen');
    assert.equal(opts.redirect,'manual');
    if(pricesUnavailable)return new Response('Prijslijst tijdelijk niet bereikbaar',{status:503,headers:{'Content-Type':'text/html'}});
    const html='<html><body><h1>Prijzen LuxWash</h1>'
    +'<h2>Clean &amp; Shine &mdash; Sedan</h2><p>Handwas exterieur. €59</p>'
    +'<h2>Clean &amp; Shine — Break/SUV</h2><p>€69</p>'
    +'<h2>Clean &amp; Shine — Kleine bestelwagen</h2><p>€79</p>'
    +'<h2>COMBI — INTERIEUR + EXTERIEUR</h2><p>vanaf €109</p>'
    +'<h2>Premium Mobile Detail — Sedan</h2><p>€149</p>'
    +'<h2>Premium Mobile Detail — Break/SUV</h2><p>€169</p>'
    +'<p>Alleen interieur — Sedan €59</p><p>Alleen interieur — Break/SUV €69</p>'
    +'<p>Alleen interieur — Kleine bestelwagen €79</p>'
    +'<h2>Opritreiniging</h2><p>vanaf €4,50/m²</p><h2>Terrasreiniging</h2><p>vanaf €5,00/m²</p>'
    +'<p>Anti-mos nabehandeling vanaf €1,75/m²</p>'
    +'<p>1-zit zetel vanaf €55</p><p>2-zit zetel vanaf €79</p><p>3-zit zetel vanaf €109</p>'
    +'<p>Hoekzetel vanaf €149</p><p>Eetkamerstoel vanaf €20/stuk</p>'
    +'<p>Binnen 10 km Gratis</p><p>10–20 km €10</p><p>20–30 km €20</p>'
    +'</body></html>';
    return new Response(html,{status:200,headers:{'Content-Type':'text/html; charset=utf-8'}});
  }

  if(u.hostname==='nahwlhptgdkwhjcfkhkt.supabase.co'){
    crmReads++;assert.ok(opts.headers?.apikey?.startsWith('sb_publishable_'));
    assert.equal(opts.redirect,'manual');
    if(u.pathname==='/auth/v1/user'){
      if(token==='Bearer eyJ-crm-owner-token'||token==='Bearer eyJ-crm-reader-token')
        return Response.json({id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'});
      return Response.json({message:'unauthorized'},{status:401});
    }
    if(u.pathname==='/rest/v1/luxwash_app_members')
      return Response.json([{user_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        role:token==='Bearer eyJ-crm-reader-token'?'visitor':'owner',active:true}]);
    if(u.pathname==='/rest/v1/leads'){
      assert.equal(token,'Bearer eyJ-crm-owner-token');
      return Response.json([
        {id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',company:'Garage Testgenoot',city:'Aalst',source:'internal_test',
          is_test:true,pipeline_stage:'new',commercial_score:99},
        {id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',company:'Garage Extern',city:'Lede',source:'luxscout',
          is_test:false,pipeline_stage:'new',commercial_score:78,opted_out:false,consent_basis:null},
        {id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',company:'Garage Al Gebeld',city:'Wetteren',source:'luxscout',
          is_test:false,pipeline_stage:'email_sent',commercial_score:85,opted_out:false,last_outbound_at:'2026-10-01T09:00:00Z'},
        {id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',company:'Garage Uitgeschreven',city:'Aalst',source:'luxscout',
          is_test:false,pipeline_stage:'new',opted_out:true,commercial_score:100}
      ]);
    }
    throw Error('Unexpected CRM route '+u.pathname);
  }
  assert.equal(u.hostname,'ndecxbsrxspkuxjsbndq.supabase.co');
  assert.ok(opts.headers?.apikey?.startsWith('sb_publishable_'));
  assert.equal(opts.cache,undefined,'Legacy Cloudflare compatibility does not implement fetch cache option');
  assert.equal(opts.redirect,'manual','Cloudflare Workers do not support fetch redirect=error');
  assert.equal(opts.headers['Cache-Control'],'no-store');
  authCalls++;
  if(u.pathname==='/auth/v1/user'){
    if(token==='Bearer user-owner-jwt')return Response.json({id:userId});
    if(token==='Bearer user-reader-jwt')return Response.json({id:'11111111-1111-4111-8111-111111111111'});
    return Response.json({message:'unauthorized'},{status:401});
  }
  if(u.pathname==='/rest/v1/memberships'){
    assert.equal(u.searchParams.get('organization_id'),'eq.'+org);
    if(token==='Bearer user-owner-jwt')return Response.json([{user_id:userId,organization_id:org,active:true,role:'owner'}]);
    if(token==='Bearer user-reader-jwt')return Response.json([{user_id:'11111111-1111-4111-8111-111111111111',organization_id:org,active:true,role:'reader'}]);
  }
  if(u.pathname==='/functions/v1/jarvis-orchestrator')throw Error('Old orchestrator must not feed lead recommendations');
  if(u.pathname==='/rest/v1/tasks'){
    assert.equal(u.searchParams.get('organization_id'),'eq.'+org);
    return Response.json([{id:'abababab-abab-4aba-8aba-abababababab',status:'open'}]);
  }
  if(u.pathname==='/rest/v1/appointments'){
    assert.equal(u.searchParams.get('organization_id'),'eq.'+org);
    assert.equal(u.searchParams.get('status'),'eq.confirmed');
    return Response.json([appointment(todayStart,'TEST VANDAAG'),appointment(tomorrowStart,'TEST MORGEN')]);
  }
  if(u.pathname==='/rest/v1/leads'){
    assert.equal(u.searchParams.get('organization_id'),'eq.'+org);
    const isMission=u.searchParams.get('select')?.includes('contact_consent_at');
    if(!isMission)return Response.json([{id:leadId,name:'Voorbeeldklant'}]);
    missionCalls++;
    if(missionMode==='http')return Response.json({error:'upstream_failed'},{status:503});
    if(missionMode==='invalid')return Response.json({error:'not_an_array'});
    return Response.json([
      {id:'11111111-1111-4111-8111-111111111111',name:'Gert-Jan',email:'info@luxwash.online',
        source:'reception_ai_sales',status:'follow_up',score:90,summary:'Bedrijf: Luxwash',
        contact_consent_at:'2026-10-12T10:00:00Z'},
      {id:'22222222-2222-4222-8222-222222222222',name:'Immo Echt',source:'reception_ai_outbound_research',
        status:'qualified',score:85,email:'',phone:'',contact_consent_at:null},
      {id:'33333333-3333-4333-8333-333333333333',name:'Websitebezoeker',source:'web_chat',
        status:'qualifying',score:80,contact_consent_at:null}
    ]);
  }
  throw Error('Unexpected auth path');
};
const env={AI:{async run(model,options){modelCalls++;assert.ok(model.includes('llama'));assert.ok(['Dag JARVIS','Wat kost Muse?'].includes(options.messages.at(-1).content),'Unexpected AI prompt');
assert.ok(options.messages[0].content.includes('JARVIS GOD MODE'));
assert.ok(options.messages[0].content.includes('EERST WAARHEID'));
assert.ok(options.messages[0].content.includes('www.luxwash.online/prijzen'));
return {response:'Dag! AI antwoordt.'};}}};
const run=(path,options)=>worker.fetch(new Request('https://jarvis-test.example'+path,options),env);
function post(messages,token='user-owner-jwt'){return {method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({messages})};}
const health=await run('/api/health');
assert.equal(health.status,200);
const h=await health.json();
assert.equal(h.version,'1.4.2-muse');assert.equal(h.aiConfigured,true);assert.equal(h.auth,'reception-ai-login');
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
assert.ok(html.includes('PERSONAL OS · V1.4.2 MUSE · GOD MODE'));
assert.ok(html.includes('id="lwCrmComms"'));
assert.ok(html.includes('id="lwWhatsapp"'));
assert.ok(html.includes('id="lwEmails"'));
assert.ok(html.includes('window.JarvisCRM=Object.freeze'));
assert.ok(html.includes('channel=eq.whatsapp&direction=eq.inbound'));
assert.ok(html.includes('direction=eq.inbound'));
assert.ok(html.includes('privateReply(await window.JarvisCRM.summary())'));
assert.ok(html.includes("mode==='crm'&&!!token"));
assert.ok(html.includes('geen rechtstreekse Gmail- of iZap-inbox'));
assert.ok(!html.includes('jarvis-reception-session-v1'));
assert.ok(!worker.toString().includes("redirect:'error'"));
assert.ok(html.includes('AUTH_UPSTREAM_UNREACHABLE')===false);
assert.ok((await (await run('/api/chat',post([{role:'user',content:'Dag JARVIS'}]))).json()).response.includes('Dag!'));


assert.ok(html.includes('id="jarvisUpdateBanner"'));
assert.ok(html.includes('JARVIS_PAGE_VERSION='));
assert.ok(html.includes('async function checkJarvisVersion()'));
assert.ok(html.includes("cache:'no-store'"));
assert.ok(html.includes('jarvisUpdateButton'));
assert.ok(!html.includes('setInterval(()=>location.reload()'));
assert.ok(html.includes('id="lwReceptionLogin"'));
assert.ok(html.includes('id="lwTomorrow"'));
assert.ok(html.includes('window.JarvisAuth=Object.freeze'));
assert.ok(!html.includes('id="saveKey"'));
assert.ok(!html.includes('Persoonlijke AI-toegangscode'));
for(const [,js] of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new Script(js,{filename:'jarvis-inline.js'});
assert.ok(page.headers.get('Content-Security-Policy').includes('ndecxbsrxspkuxjsbndq.supabase.co'));
for(const [path,substring] of [['/manifest.webmanifest','JARVIS Personal OS'],['/sw.js','jarvis-personal-v142-muse'],['/icon.svg','<svg']]){
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
assert.ok(priceText.includes('Clean & Shine sedan: €59'),priceText);
assert.ok(priceText.includes('Hoekzetel: vanaf €149'),priceText);
assert.ok(priceText.includes('https://www.luxwash.online/prijzen'));
assert.ok(!priceText.includes('hoekzetel €135'),'Never return obsolete prices');
const furniture=(await (await run('/api/chat',post([{role:'user',content:'Wat kost een hoekzetel?'}]))).json()).response;
assert.ok(furniture.includes('Hoekzetel: vanaf €149'),furniture);
assert.ok(!furniture.includes('Clean & Shine'));
pricesUnavailable=true;
const inaccessible=(await (await run('/api/chat',post([{role:'user',content:'Wat kost een hoekzetel?'}]))).json()).response;
assert.ok(inaccessible.includes('geen oude of verzonnen bedragen'),inaccessible);
assert.ok(!inaccessible.includes('€'),'Never invent a price if the official source is unavailable');
pricesUnavailable=false;
assert.equal(priceCalls,3,'Every price answer must fetch the official site again');
const personalPrice=(await (await run('/api/chat',post([{role:'user',content:'Wat kost Muse?'}]))).json()).response;
assert.ok(personalPrice.includes('Dag! AI antwoordt.'),'Personal cost queries must reach the AI rather than LuxWash tariffs');
assert.equal(priceCalls,3,'Unrelated price question must never fetch LuxWash tariffs');
assert.equal(modelCalls,3,'Known schedule and LuxWash tariff answers bypass AI, unrelated prices do not');

assert.equal((await run('/api/mission')).status,405,'Mission is POST only');
assert.equal((await run('/api/mission',{method:'POST',body:'{}'})).status,401,'Missing Reception JWT denied');
assert.equal((await run('/api/mission',{method:'POST',headers:{Authorization:'Bearer wrong-jwt'},body:'{}'})).status,401,'Invalid Reception JWT denied');
assert.equal((await run('/api/mission',{method:'POST',headers:{Authorization:'Bearer user-reader-jwt'},body:'{}'})).status,403,'Reception non-admin cannot read Mission Control');
assert.equal(missionCalls,0,'No DB reads before owner authorization');
const missionOptions=(crm)=>({method:'POST',headers:{Authorization:'Bearer user-owner-jwt',
  ...(crm?{'X-Luxwash-Crm-Token':crm}:{})},body:'{}'});
const receptionOnly=await run('/api/mission',missionOptions());
assert.equal(receptionOnly.status,200);
const receptionData=await receptionOnly.json();
assert.equal(receptionData.ok,true);
assert.equal(receptionData.reception.total,3);
assert.equal(receptionData.reception.excluded_internal,1,'Own Reception demo must not be treated as customer lead');
assert.equal(receptionData.reception.warm,1,'Anonymous widget lead does not count as a warm B2B prospect');
assert.equal(receptionData.reception.actionable,0);
assert.equal(receptionData.crm.connected,false,'Real LuxWash CRM is not silently read');
assert.equal(receptionData.plan.length,0,'No cross-source verified proposals when CRM is disconnected');
assert.equal(crmReads,0,'No CRM subrequests without separate CRM authorization');
assert.equal((await run('/api/mission',missionOptions('invalid-crm-token'))).status,401,'Reject invalid CRM token');
const deniedCRM=await run('/api/mission',missionOptions('eyJ-crm-reader-token'));
assert.equal(deniedCRM.status,403,'Only active CRM staff may read');
const crmResponse=await run('/api/mission',missionOptions('eyJ-crm-owner-token'));
assert.equal(crmResponse.status,200);
const linked=await crmResponse.json();
assert.equal(linked.crm.connected,true);
assert.equal(linked.crm.stats.total,4);
assert.equal(linked.crm.stats.excluded_internal,1,'Test CRM lead excluded');
assert.equal(linked.crm.stats.opted_out,1,'Opt-out observed');
assert.equal(linked.crm.stats.not_contacted,1,'Already contacted and opted-out leads excluded');
assert.equal(linked.plan.length,1);
assert.equal(linked.plan[0].lead_id,'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
assert.equal(linked.plan[0].source,'luxwash_crm');
assert.ok(linked.plan[0].reason.includes('contactbasis nog te controleren'));
assert.ok(!JSON.stringify(linked).includes('info@luxwash.online'),'Own email should never be echoed');
missionMode='http';
const failed=await run('/api/mission',missionOptions());
assert.equal(failed.status,503);
assert.equal((await failed.json()).code,'DUAL_SOURCE_READ_FAILED');
missionMode='invalid';
const invalid=await run('/api/mission',missionOptions());
assert.equal(invalid.status,503);
assert.equal((await invalid.json()).code,'DUAL_SOURCE_READ_FAILED');
missionMode='ok';
assert.equal((await run('/missing')).status,404);
console.log('JARVIS v1.4.2 Muse smoke tests OK: JWT auth, admin membership, denied access, AI response, invalid inputs, front-end JS syntax, PWA routes.');
