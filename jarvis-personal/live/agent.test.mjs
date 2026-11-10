import assert from 'node:assert/strict';
import { Script, runInNewContext } from 'node:vm';
import worker from './worker.js';

const response=await worker.fetch(new Request('https://jarvis-test.example/'),{});
assert.equal(response.status,200);
const html=await response.text();
assert.ok(html.includes('data-tab="agent"'),'Agent tab missing');
assert.ok(html.includes('id="agentForm"'),'Agent form missing');
assert.ok(html.includes('id="agentList"'),'Agent list missing');
assert.ok(html.includes('id="agentStatus"'),'Agent status missing');
assert.ok(html.includes('JARVIS Agent · opdrachten'),'Agent heading missing');
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
assert.equal(scripts.length,3,'Expected legacy app scripts and new agent controller');
for(const [i,js] of scripts.entries())new Script(js,{filename:'jarvis-inline-'+i+'.js'});
const controller=scripts.at(-1);
assert.ok(controller.includes('window.JarvisAuth?.token?.()'),'Must require Reception AI session');
assert.ok(controller.includes('/rest/v1/jarvis_agent_tasks'),'Must persist tasks in existing backend');
assert.ok(controller.includes('/rest/v1/jarvis_agent_events'),'Must expose task audit log');
assert.ok(controller.includes("status:'pending_approval'"),'Must never enqueue without approval');
assert.ok(controller.includes("status:'queued'"),'Must require owner approval');
assert.ok(controller.includes("kind==='draft'"),'Draft capability missing');
assert.ok(controller.includes("'/api/chat'"),'Draft must invoke protected model');
assert.ok(controller.includes('crypto.randomUUID()'),'Idempotency key missing');
assert.ok(html.includes('id="agentPlan"'),'Autonomous planning UI missing');
assert.ok(html.includes('#agent .form{flex-wrap:wrap'),'Agent actions must wrap on phones');
assert.ok(html.includes('#agent .note p,#agent .note .help'),'Agent long text must wrap');
assert.ok(!html.includes('vereist/vergen je aandacht'),'Status must read naturally in Dutch');

assert.ok(controller.includes('Antwoord met 3 tot 5 genummerde actie-stappen'),'Planner must produce reviewable steps');
assert.ok(html.includes('<option value="plan">Actieplan met afvinkbare stappen</option>'),'Dedicated plan type is required');
assert.ok(controller.includes("byId('agentKind').value='plan'"),'AI-planning must select plan mode, not reminder');
assert.ok(controller.includes('stepsFromPlan(job.objective)'),'Plan must render individual steps');
assert.ok(controller.includes("plan_progress:next"),'Ticking a step must persist in Supabase');
assert.ok(controller.includes("status=eq.queued"),'Checklist must not be writable after closing');
assert.ok(controller.includes('Plan afgerond'),'Plan completion action missing');
assert.ok(controller.includes('geen bedrijfsnamen'),'Prospecting prompt must ban invented leads');
assert.ok(controller.includes('looksLikeLeadGoal(title)'),'Lead-intent must be recognized');
assert.ok(controller.includes("byId('agentKind').value='plan'"),'Lead-intent must auto select plan');
assert.ok(controller.includes("stepsFromPlan(objective).length<2"),'Reject plans with no actionable steps');
assert.ok(controller.includes("kind==='reminder'&&looksLikeLeadGoal(title)"),'Reject prospecting reminders');

assert.ok(controller.includes('textContent'),'DOM content must be escaped');
assert.ok(!controller.includes('service_role'),'No privileged secrets in browser');
assert.ok(!controller.includes('/send-message'),'Do not claim outbound messaging');
assert.ok(html.includes('id="jarvisMissionPanel"'),'Mission Control UI missing');
assert.ok(html.includes('id="jarvisMissionRun"'),'Mission analysis button missing');
assert.ok(html.includes('id="jarvisMissionStage"'),'Safe staging button missing');
assert.ok(controller.includes("fetch('/api/mission'"),'Browser must use same-origin authenticated mission endpoint');
assert.ok(!controller.includes("fetch(BASE+'/functions/v1/jarvis-orchestrator'"),'Browser must not invoke cross-origin Edge Function directly');
assert.ok(!controller.includes("fetch('/api/mission'")===false,'Mission Control must call the proxy');
assert.ok(controller.includes("data?.ok!==true"),'Orchestrator failures must be explicit');
assert.ok(controller.includes("jwt()!==token||crmJwt()!==crmToken"),'Both sessions must be unchanged before storing recommendations');
assert.ok(controller.includes("status:'pending_approval'"),'Mission must stage proposals without executing them');
assert.ok(controller.includes('resolution=ignore-duplicates'),'Repeated analysis must avoid duplicate tasks');
assert.ok(controller.includes("crypto.subtle.digest('SHA-256'"),'Mission keys must be deterministic');
assert.ok(controller.includes('missionRequestId'),'Mission idempotency missing');
assert.ok(controller.includes("slice(0,3)"),'Max three approval-gated tasks');
assert.ok(controller.includes("source==='luxwash_crm'"),'Only verified CRM proposals may be staged');
assert.ok(controller.includes("missionCrmToken!==crmJwt()"),'Staging must check unchanged CRM session');
assert.ok(controller.includes('nog niets uitgevoerd of verzonden'),'Never overclaim outbound execution');
assert.ok(!controller.includes("service_role"),'Never expose service role in agent controller');


assert.ok(html.includes('id="jarvisMissionCRMLogin"'),'Dedicated CRM login link missing');
assert.ok(html.includes('id="jarvisMissionCRMMetrics"'),'Separate CRM figures missing');
assert.ok(controller.includes('window.JarvisCRMAuth?.token?.()'),'CRM must require its own login token');
assert.ok(html.includes("authSessions={reception:'',crm:''}"),'Independent logins must remain in volatile memory only');
assert.ok(html.includes("authSessions.reception='';authSessions.crm=''"),'Logout must revoke both local sessions');
assert.ok(controller.includes("['Interne/demo eruit'"),'Internal demo filtering must be visible');
assert.ok(controller.includes('Bron: LuxWash CRM'),'Every prospect must show data provenance');


// Interactietest: klik 1 opent altijd de eigen bevestiging; klik 2 maakt
// uitsluitend controleopdrachten aan en verifieert de opslag, zonder native dialog.
assert.ok(html.includes('id="jarvisMissionConfirm"'),'Visible confirmation panel missing');
assert.ok(html.includes('id="jarvisMissionCommit"'),'Explicit second-step confirmation missing');
assert.ok(html.includes('id="jarvisMissionCancel"'),'Cancellation missing');
assert.ok(controller.includes('function missionCommit()'),'Mission save handler missing');
assert.ok(controller.includes('client_request_id=in.('),'Staged tasks must be verified via read-back');
const missionSnippet=controller.slice(controller.indexOf('function missionProposals(){'),
  controller.indexOf("byId('jarvisMissionCRMLogin').addEventListener"));
assert.ok(missionSnippet.startsWith('function missionProposals(){'),'Could not extract task-stage controller');
assert.ok(!missionSnippet.includes('confirm('),'Do not use suppressed native browser confirmation');
const ids=[
 '11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222',
 '33333333-3333-4333-8333-333333333333'
];
const callbacks={},elements={},messages=[],writes=[];
let refreshed=0,crmToken='luxwash-crm-jwt',loginToken='reception-owner-jwt',failAt=0;
const byId=id=>{
 if(!elements[id]){
  elements[id]={
   id,hidden:id==='jarvisMissionConfirm',disabled:false,textContent:'',
   children:[],listeners:{},className:'',
   replaceChildren(...nodes){this.children=[...nodes];},
   append(...nodes){this.children.push(...nodes);},
   addEventListener(event,handler){this.listeners[event]=handler;callbacks[id+'.'+event]=handler;},
   scrollIntoView(){this.scrolled=true;}
  };
 }
 return elements[id];
};
const calls=async(path,opts={})=>{
 if(opts.method==='POST'){
  writes.push(JSON.parse(opts.body));
  if(failAt&&writes.length===failAt)throw Error('simulated_upstream_failure');
  return null;
 }
 if(path.includes('client_request_id=in.(')){
  return writes.filter((x,i,a)=>a.findIndex(y=>y.client_request_id===x.client_request_id)===i)
    .map(x=>({id:'test-row',client_request_id:x.client_request_id,status:'pending_approval',kind:'plan'}));
 }
 throw Error('Unexpected simulated DB path '+path);
};
const sandbox={
 byId,item:(tag,content)=>({tag,textContent:content||'',className:''}),
 jwt:()=>loginToken,crmJwt:()=>crmToken,
 missionReset:()=>{throw Error('Session was unexpectedly reset');},
 missionStatus:s=>messages.push(String(s)),
 missionRequestId:async input=>ids.find(id=>input.endsWith(id))||'unknown-id',
 owner:async()=>ids[0],ORG:'09069b87-e02a-471d-977c-e4acd4e383b7',
 call:calls,refresh:async()=>{refreshed++},
 latestMission:{crm:{connected:true},plan:ids.map((id,i)=>({
  source:'luxwash_crm',verified:true,lead_id:id,
  action:'Controleer bedrijf '+String(i+1),reason:'CRM prospect, nog niets verzonden'
 }))},
 missionToken:loginToken,missionCrmToken:crmToken,
 Intl,Date,Set,Error,String,JSON
};
runInNewContext(missionSnippet,sandbox,{filename:'mission-interaction.js'});
assert.equal(typeof callbacks['jarvisMissionCommit.click'],'function');
assert.equal(typeof callbacks['jarvisMissionCancel.click'],'function');
assert.equal(writes.length,0);
callbacks['jarvisMissionStage.click']?.();
if(!callbacks['jarvisMissionStage.click'])sandbox.missionStage();
assert.equal(byId('jarvisMissionConfirm').hidden,false,'First click must reveal confirmation');
assert.equal(byId('jarvisMissionCommit').hidden,false,'Confirmation must be visible');
assert.equal(writes.length,0,'First click must never persist or send anything');
assert.ok(messages.at(-1).includes('Ja, zet opdrachten klaar'),messages.at(-1));
await callbacks['jarvisMissionCommit.click']();
assert.equal(writes.length,3,'Second click must persist exactly three proposals');
assert.ok(writes.every(x=>x.kind==='plan'&&x.status==='pending_approval'),'Only unapproved review tasks');
assert.equal(refreshed,1,'Saved tasks must refresh the list');
assert.ok(messages.some(x=>x.includes('3 van 3 controleopdrachten BEVESTIGD')));
assert.equal(byId('jarvisMissionGoTasks').hidden,false,'Success must show view-tasks button');
sandbox.missionStage();
assert.equal(byId('jarvisMissionCommit').hidden,false,'A new confirmation must be possible after success');
callbacks['jarvisMissionCancel.click']();
assert.equal(byId('jarvisMissionConfirm').hidden,true,'Cancel must hide confirmation');
assert.equal(writes.length,3,'Cancel must never create more tasks');

console.log('JARVIS agent smoke tests passed: HTML, JS syntax, approvals, storage, audit, draft workflow, no outbound.');
