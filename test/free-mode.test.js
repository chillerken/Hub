const {test}=require('node:test');const assert=require('node:assert/strict');const crypto=require('node:crypto');
const {bridgeAllowed}=require('../src/site-bridge');
test('server bridge refuses missing, short and forged credentials',()=>{
 const cfg={siteBridgeSecret:crypto.randomBytes(32).toString('hex')};
 assert.equal(bridgeAllowed({headers:{}},cfg),false);
 assert.equal(bridgeAllowed({headers:{'x-luxwash-bridge':'bad'}},cfg),false);
 assert.equal(bridgeAllowed({headers:{'x-luxwash-bridge':cfg.siteBridgeSecret}},cfg),true);
 assert.equal(bridgeAllowed({headers:{'x-luxwash-bridge':'short'}},{siteBridgeSecret:'short'}),false);
});
test('rule classification, catalog quotation and complex chat make no provider requests',async t=>{
 const before=global.fetch;t.after(()=>global.fetch=before);global.fetch=async()=>{throw new Error('Paid/network call forbidden');};
 const cfg={aiMode:'rules',openaiKey:'must-not-be-used'};
 const c=await require('../src/core/classify')(cfg)('Er is schade aan mijn zetel.');assert.equal(c.intent,'complaint');assert.equal(c.mode,'rules');assert.equal(c.handoff,true);
 const sid=crypto.randomUUID();const q=await require('../src/core/quote')(cfg)('QA catalogusconcept',[{id:sid,name:'QA Dienst'}],{service_id:sid,quantity:2});assert.deepEqual(q.items,[{service_id:sid,quantity:2}]);assert.match(q.notes,/zonder generatieve AI/);
 await assert.rejects(require('../src/core/quote')(cfg)('QA onbekende dienst',[],{service_id:sid,quantity:1}),/bestaande dienst/);
 const actions=[];const db=async(action,data)=>{actions.push({action,data});if(action==='session')return {id:'qa-chat',messages:[]};if(action==='catalog')return [];if(action==='settings')return {business:{phone:'053896400'},ai:{}};return {ok:true};};
 const reply=await require('../src/core/ai')(cfg,db).answer('Mijn rode auto heeft een bijzondere vlek op de hemelbekleding.','qa-session');assert.equal(reply.mode,'rules');assert.equal(reply.handoff,true);assert.ok(actions.some(a=>a.action==='handoff'));assert.ok(!actions.some(a=>a.action==='book'));
});
test('email quota failure and synthetic recipients never call an email provider',async t=>{
 const before=global.fetch;t.after(()=>global.fetch=before);global.fetch=async()=>{throw new Error('Provider forbidden');};
 for(const email of ['qa@example.invalid','test@customer.example.org']){
  const events=[];const job={id:crypto.randomUUID(),kind:'lead_ack',attempts:1,lease_token:crypto.randomUUID()};
  const db=async(a,p)=>{events.push({a,p});if(a==='claim_jobs')return [job];if(a==='settings')return {business:{phone:'053896400'},planning:{}};if(a==='job_context')return {job,customer:{id:'qa',name:'QA',email,status:'active'}};if(a==='flow_delivery_allowed')return {allowed:true};if(a==='email_budget')return {allowed:false};return {};};
  const result=await require('../src/core/automation')({aiMode:'rules',resend:{apiKey:'never-call',from:'test@example.invalid'}},db).run();assert.equal(result.jobs[0].status,'dead');assert.ok(events.some(x=>x.a==='finish_job'&&x.p.status==='dead'));
 }
});
