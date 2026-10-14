import assert from 'node:assert/strict';
import {runInNewContext, Script} from 'node:vm';
import worker from './worker.js';

const response=await worker.fetch(new Request('https://jarvis-test.example/'),{});
assert.equal(response.status,200);
const html=await response.text();
assert.ok(html.includes('id="jarvisMusePanel"'),'Muse board must live INSIDE the existing JARVIS app');
for(const id of ['museRun','museMetrics','museSummary','musePriorities','museConfirm',
 'museCommit','museCancel','museSpeak','museAi','museAdvice']){
 assert.ok(html.includes('id="'+id+'"'),'Muse UI element missing: '+id);
}
assert.ok(html.includes('window.JarvisPersonal=Object.freeze'),'Personal local task bridge missing');
assert.ok(html.includes('mijn muse dagcentrum'),'Voice command must open Muse');
assert.ok(html.includes('Geen Meta-Muse-model'),'Must accurately distinguish Muse workflow from Meta product');

const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
assert.equal(scripts.length,3);
scripts.forEach((s,i)=>new Script(s,{filename:'jarvis-'+i+'.js'}));
const controller=scripts.at(-1);
const start=controller.indexOf('// MUSE werkmethode:');
const end=controller.indexOf('const missionStatus=text=>',start);
assert.ok(start>=0&&end>start,'Muse controller not found');
const museCode=controller.slice(start,end);
assert.ok(!museCode.includes('confirm('),'Muse must use visible in-app confirmation, not hidden browser popup');
assert.ok(!museCode.includes('service_role'),'No administrator keys may be embedded');
assert.ok(museCode.includes('museActiveLead(itemSource)'),'A lead must be revalidated before staging');
assert.ok(museCode.includes("status:'pending_approval'"),'Muse must never directly activate a staged task');
assert.ok(museCode.includes('client_request_id=eq.'),'Muse must verify newly created tasks in database');

let receptionToken='eyJ-reception-owner',crmToken='eyJ-crm-staff';
const ownerId='6574c619-8dad-4e79-872a-18e53d4f5277';
const leadId='11111111-1111-4111-8111-111111111111';
const outdatedId='99999999-9999-4999-8999-999999999999';
const blockedId='22222222-2222-4222-8222-222222222222';
const aptId='33333333-3333-4333-8333-333333333333';
const now=Date.now();
const iso=offset=>new Date(now+offset).toISOString();
const crmLeads=[
 {id:leadId,name:'Zakelijk Contact',company:'Garage Echt',source:'luxscout',status:'new',
  pipeline_stage:'email_sent',follow_up_at:iso(-48*3600000),opted_out:false,is_test:false,commercial_score:90},
 {id:outdatedId,name:'Reeds gecontacteerd',company:'Garage Met Oude Datum',source:'luxscout',status:'new',
  pipeline_stage:'email_sent',follow_up_at:iso(-72*3600000),
  last_outbound_at:iso(-8*3600000),updated_at:iso(-6*3600000),opted_out:false,is_test:false,commercial_score:99},
 {id:'44444444-4444-4444-8444-444444444444',name:'Gert Jan',company:'LuxWash',email:'info@luxwash.online',
  pipeline_stage:'analyzed',follow_up_at:iso(-72*3600000),opted_out:false,is_test:false,commercial_score:100},
 {id:'55555555-5555-4555-8555-555555555555',name:'Uitgeschreven',company:'Garage Geen Contact',
  pipeline_stage:'email_sent',follow_up_at:iso(-72*3600000),opted_out:true,is_test:false},
 {id:'66666666-6666-4666-8666-666666666666',name:'Te vroeg',company:'Garage Volgend Jaar',
  pipeline_stage:'email_sent',follow_up_at:iso(20*86400000),opted_out:false,is_test:false}
];
const appointment={id:aptId,status:'confirmed',starts_at:iso(3*3600000),service_id:'Carwash'};
const crmTasks=[{id:blockedId,task_type:'whatsapp_sync',status:'blocked',scheduled_for:iso(-4*3600000)}];
const receptionTasks=[
 {id:'77777777-7777-4777-8777-777777777777',title:'Review voorstel',status:'pending_approval',kind:'plan'},
 {id:'88888888-8888-4888-8888-888888888888',title:'Klant opvolgen',status:'queued',kind:'reminder'}
];
const handlers=new Map(),nodes=new Map(),calls=[],saves=[],externalRequests=[],spoken=[];
const navState={active:'agent',crmMode:'reception'};
const navButton={click(){navState.active='luxwash'}};
const taskNavButton={click(){navState.active='tasks'}};
let refreshed=0,corrected=0;
const node=(tag='div',content='')=>({
 tag,textContent:String(content??''),className:'',disabled:false,hidden:false,children:[],listeners:{},value:'',
 append(...parts){this.children.push(...parts);},
 replaceChildren(...parts){this.children=[...parts];},
 scrollIntoView(){this.scrolled=true;},
 click(){this.clicked=true;},
 addEventListener(evt,handler){this.listeners[evt]=handler;}
});
const byId=id=>{
 if(!nodes.has(id)){
  const result=node('div');
  result.hidden=['museSummary','museMetrics','museAdvice','museConfirm'].includes(id);
  result.addEventListener=(evt,handler)=>handlers.set(id+'.'+evt,handler);
  nodes.set(id,result);
 }
 return nodes.get(id);
};
const fetch=async (input,options={})=>{
 const url=new URL(input,'https://jarvis-test.example');
 externalRequests.push({url:url.href,method:options.method||'GET',headers:options.headers||{}});
 assert.ok(url.hostname==='nahwlhptgdkwhjcfkhkt.supabase.co'||url.hostname==='jarvis-test.example');
 if(url.hostname==='jarvis-test.example'){
  assert.equal(url.pathname,'/api/chat');
  return Response.json({response:'1. Controleer de CRM-fout. 2. Bekijk de afspraak. 3. Beoordeel de opvolging.'});
 }
 if(url.pathname==='/rest/v1/rpc/jarvis_muse_correct_stale_followup'){
  assert.equal(options.method,'POST');
  assert.equal(options.headers.Authorization,'Bearer '+crmToken);
  const input=JSON.parse(options.body);
  assert.equal(input.p_lead_id,outdatedId);
  assert.equal(input.p_expected_last_outbound_at,crmLeads[1].last_outbound_at);
  assert.equal(input.p_expected_updated_at,crmLeads[1].updated_at);
  assert.equal(input.p_decision,'clear_stale_deadline');
  assert.equal(input.p_new_follow_up_at,null);
  assert.ok(input.p_reason.length>=12);
  corrected++;
  return Response.json({ok:true,lead_id:outdatedId,decision:input.p_decision,audit_logged:true,outbound_sent:false});
 }
 assert.equal(options.method,'GET');
 assert.equal(options.headers.Authorization,'Bearer '+crmToken);
 assert.ok(options.headers.apikey.startsWith('sb_publishable_'));
 assert.equal(options.headers['Cache-Control'],undefined,'Supabase CORS preflight must stay compatible');
 if(url.pathname==='/rest/v1/leads'){
  if(url.searchParams.has('id'))return Response.json([crmLeads.find(x=>x.id===url.searchParams.get('id')?.replace(/^eq\./,''))].filter(Boolean));
  return Response.json(crmLeads);
 }
 if(url.pathname==='/rest/v1/appointments'){
  if(url.searchParams.has('id'))return Response.json([appointment]);
  return Response.json([appointment]);
 }
 if(url.pathname==='/rest/v1/luxwash_ai_tasks'){
  if(url.searchParams.has('id'))return Response.json([crmTasks[0]]);
  return Response.json(crmTasks);
 }
 throw Error('Unexpected CRM route '+url.pathname);
};
const call=async (path,opts={})=>{
 calls.push({path,opts});
 if(path.includes('select=id,kind,status,title'))return receptionTasks;
 if(path.includes('objective=ilike.')){
  return saves.filter(x=>path.includes(x.objective.match(/[0-9a-f]{8}-[0-9a-f-]{27,}/i)?.[0]||'NO_MATCH'))
   .map(x=>({id:'staged',title:x.title,status:x.status}));
 }
 if(opts.method==='POST'){
  const data=JSON.parse(opts.body);
  assert.equal(data.status,'pending_approval');
  assert.equal(data.kind,'plan');
  assert.ok(!data.objective.includes('bericht verzonden'));
  saves.push(data);return null;
 }
 if(path.includes('client_request_id=eq.')){
  const key=path.split('client_request_id=eq.')[1].split('&')[0];
  return saves.filter(x=>x.client_request_id===key)
   .map(x=>({id:'staged',status:x.status,title:x.title,client_request_id:x.client_request_id}));
 }
 throw Error('Unexpected Reception route '+path);
};
const listeners={};
const fakeWindow={
 JarvisPersonal:{snapshot:()=>({open:2,dueSoon:1,notes:4,source:'local_device_only'})},
 JarvisAuth:{token:()=>receptionToken},
 addEventListener:(event,cb)=>{(listeners[event]??=[]).push(cb);},
 dispatchEvent:(event)=>{for(const cb of listeners[event.type]||[])cb(event);},
 speechSynthesis:{cancel(){},speak:u=>spoken.push(u.text)},
 JarvisNative:{speak:s=>spoken.push(s)}
};
byId('lwShowCrm').click=()=>{
 navState.crmMode='crm';
 fakeWindow.dispatchEvent({type:'jarvis-auth-changed'});
};
const sandbox={
 byId,item:node,jwt:()=>receptionToken,crmJwt:()=>crmToken,window:fakeWindow,
 document:{querySelector:(selector)=>{
  if(selector==='nav button[data-tab="luxwash"]')return navButton;
  if(selector==='button[data-tab="tasks"]')return taskNavButton;
  return null;
 }},
 owner:async()=>ownerId,call,refresh:async()=>{refreshed++},
 missionRequestId:async()=> '99999999-9999-8999-8999-999999999999',
 ORG:'09069b87-e02a-471d-977c-e4acd4e383b7',
 fetch,Date,Intl,Promise,JSON,Math,Number,String,Error,Array,Set,Boolean,
 AbortController,setTimeout,clearTimeout,Response,SpeechSynthesisUtterance:function(t){this.text=t;this.lang='';},
 console
};
runInNewContext(museCode+'\nthis.museTestHooks={museRun,museSelect,museCommit,museAi,museFindings,clear:museClear,snapshot:()=>museSnapshot,musePrepareCorrection,museApplyCorrection};',sandbox,{filename:'muse-control.js'});
const hooks=sandbox.museTestHooks;
assert.equal(typeof handlers.get('museRun.click'),'function');
// Execute the actual authenticated-mode notification listener from the JARVIS
// navigation script: opening CRM must not switch to Assistent.
const navScript=scripts[0];
const authStart=navScript.indexOf('let lastReceptionAuthForAI=');
const authEnd=navScript.indexOf("$('export').onclick=",authStart);
assert.ok(authStart>=0&&authEnd>authStart,'Could not locate real reception auth-navigation handler');
let renderCalls=0,notices=[];
runInNewContext(navScript.slice(authStart,authEnd),{
 window:fakeWindow,render:()=>{renderCalls++},notice:x=>notices.push(x),
 $:id=>byId(id),aiVerified:true,aiError:'',console
},{filename:'auth-navigation.js'});
assert.equal(typeof handlers.get('museRun.click'),'function');

crmToken='';
await hooks.museRun();
assert.ok(byId('museStatus').textContent.includes('BEIDE accounts'));
assert.equal(externalRequests.length,0,'Never query another organization with missing CRM JWT');

crmToken='eyJ-crm-staff';
await hooks.museRun();
assert.ok(byId('museStatus').textContent.includes('MUSE-briefing'));
const snap=hooks.snapshot();
assert.equal(snap.metrics.appointments,1);
assert.equal(snap.metrics.overdue,1,'Exclude test, opted-out, future and stale deadlines');
assert.equal(snap.metrics.outdated_followups,1,'Count stale dates separately after later outbound contact');
assert.ok(snap.actions.some(x=>x.kind==='hygiene'&&x.noStage===true));
assert.ok(!snap.actions.some(x=>x.kind==='followup'&&x.id===outdatedId),
 'Never prioritize a lead with a follow-up date predating outbound contact');
assert.equal(snap.metrics.crm_errors,1);
assert.equal(snap.metrics.approvals,1);
assert.equal(snap.metrics.personal,2);
assert.ok(snap.actions.some(x=>x.kind==='personal'));
assert.ok(snap.actions.some(x=>x.kind==='followup'&&x.id===leadId));
assert.ok(byId('musePriorities').children.length>=4);
assert.equal(saves.length,0,'Analysis must be read-only');
assert.equal(navState.active,'agent');
hooks.museSelect(snap.actions.find(x=>x.kind==='hygiene'));
assert.equal(navState.active,'luxwash','The Open CRM button must land on the LuxWash tab, not Assistent');
assert.equal(navState.crmMode,'crm','The Open CRM button must activate CRM, not Reception AI');
assert.equal(byId('lwMuseStalePanel').hidden,false,'MUSE must show stale follow-ups inside LuxWash CRM');
assert.equal(byId('lwMuseStaleList').children.length,1,'Stale contact listing must contain actual sourced lead');
const staleCard=byId('lwMuseStaleList').children[0];
assert.equal(staleCard.className,'lw-stale-row','Records need a separated, readable card');
const staleHeading=staleCard.children[0],staleFields=staleCard.children[1];
assert.equal(staleHeading.className,'lw-stale-heading');
assert.ok(staleHeading.children.some(x=>String(x.textContent).includes('Garage Met Oude Datum')),'Name must be visible on a separate heading line');
assert.equal(staleFields.className,'lw-stale-fields');
assert.equal(staleFields.children.length,3,'Show date, last outbound and status as three independently labeled fields');
assert.deepEqual(staleFields.children.map(x=>x.children[0].textContent),['Oude opvolgdatum','Laatst uitgaand contact','CRM-status']);
assert.ok(staleFields.children.every(x=>x.children[1].textContent),'Each field must have a real value');
assert.ok(html.includes('#lwMuseStaleList .lw-stale-row'),'Stale cards must have dedicated CSS outside the Muse panel');
assert.ok(html.includes('@media(max-width:700px){#lwMuseStaleList .lw-stale-fields{grid-template-columns:1fr}'),'Cards must be readable on phones');
assert.equal(saves.length,0,'CRM hygiene shortcut must not stage outreach or write data');
assert.ok(html.includes('id="lwMuseCorrection"'),'Secure CRM correction form must be visible per prospect');
const editButton=staleCard.children[2];
assert.ok(editButton.textContent.includes('CRM-correctie'));
editButton.listeners.click();
assert.equal(byId('lwMuseCorrection').hidden,false,'Prepare correction only after explicit prospect selection');
assert.equal(corrected,0,'Selecting a prospect must not modify CRM');
await hooks.museApplyCorrection();
assert.equal(corrected,0,'Blank reason must never modify CRM');
handlers.get('lwMuseCancelCorrection.click')();
assert.equal(byId('lwMuseCorrection').hidden,true,'Cancel must hide form without writes');
assert.equal(renderCalls,0,'Switching CRM mode must not trigger an unnecessary assistant rerender');

hooks.museSelect(snap.actions.find(x=>x.kind==='error'));
assert.equal(byId('museConfirm').hidden,false,'First click must show visible user confirmation');
assert.equal(saves.length,0);
await hooks.museCommit();
assert.equal(saves.length,1);
assert.equal(saves[0].status,'pending_approval');
assert.ok(byId('museStatus').textContent.includes('bevestigd'));
assert.equal(refreshed,1);

hooks.museSelect(snap.actions.find(x=>x.kind==='followup'));
assert.equal(saves.length,1,'Selecting a prospect may not send messages');
await hooks.museCommit();
assert.equal(saves.length,2);
assert.ok(saves[1].objective.includes('Lees de echte contacthistoriek'));

// Race condition: a genuine outbound contact may be recorded after the briefing.
// Re-read source immediately before stage; refuse staging an outdated date.
crmLeads.find(x=>x.id===leadId).last_outbound_at=iso(-2*3600000);
hooks.museSelect(snap.actions.find(x=>x.kind==='followup'));
await hooks.museCommit();
assert.equal(saves.length,2,'Do not stage a contact after a newer outbound send');
assert.ok(byId('museStatus').textContent.includes('verouderde datum'));


await hooks.museAi();
assert.ok(byId('museAdvice').textContent.includes('AI-advies'));
assert.ok(externalRequests.filter(x=>x.url.endsWith('/api/chat')).length===1);
assert.ok(!externalRequests.some(x=>x.url.includes('/send-message')),'Never send WhatsApp');

crmToken='eyJ-different-login';
fakeWindow.dispatchEvent({type:'jarvis-auth-changed'});
assert.equal(hooks.snapshot(),null,'Logout or account change must invalidate stale Muse results');
assert.ok(byId('museStatus').textContent.includes('Vernieuw'));

// Separate explicit owner confirmation should perform a single auditable RPC call.
crmToken='eyJ-crm-staff';
await hooks.museRun();
hooks.museSelect(hooks.snapshot().actions.find(x=>x.kind==='hygiene'));
hooks.musePrepareCorrection(hooks.snapshot().staleRows[0]);
byId('lwMuseReason').value='Contacthistoriek controleren; oude deadline was vóór laatst verzonden bericht.';
assert.equal(corrected,0,'Draft remains read-only');
await hooks.museApplyCorrection();
assert.equal(corrected,1,'Explicit confirmation invokes exactly one correction RPC');
assert.ok(byId('museStatus').textContent.includes('bevestigd door Supabase'));
assert.equal(hooks.snapshot(),null,'Correction invalidates stale cached briefing');
assert.equal(saves.length,2,'No external contact or new JARVIS task created');

console.log('MUSE integration tests OK: CRM navigation stays on LuxWash, actual stale lead listing visible, no forced Assistent tab, dual auth protection, lead freshness and no outbound.');
