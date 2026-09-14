const {test}=require('node:test');
const assert=require('node:assert/strict');
const makeAutomation=require('../src/core/automation');
for(const fail of [false,true])test(`Handmatige boeking: beheerlink ${fail?'weigert verzending bij fout':'klaar vóór verzending'}`,async t=>{
 const events=[];let finished;
 const config={cookieSecret:'test-only-secret',baseUrl:'https://example.invalid',resend:{apiKey:'test-only',from:'test@example.invalid'}};
 const appointment={id:'test-appointment',idempotency_key:'test-idempotency',status:'requested',starts_at:'2026-12-01T09:00:00+01:00',price_cents:9000,price_mode:'estimate'};
 const customer={id:'test-customer',name:'Test',email:'qa@example.org',status:'active'};
 const job={id:'test-job',kind:'request_received',attempts:1,lease_token:'test-lease'};
 const db=async(action,p)=>{
  if(action==='flow_delivery_allowed')return {allowed:true};
  if(action==='email_budget')return {allowed:true};
  if(action==='claim_jobs')return [job];
  if(action==='settings')return {business:{phone:'test',email:'test@example.invalid'},planning:{}};
  if(action==='job_context')return {job,appointment,customer,service:{name:'Terrasreiniging'}};
  if(action==='management_prepare'){events.push('prepare');assert.match(p.token_hash,/^[a-f0-9]{64}$/);if(fail)throw new Error('hash mismatch');}
  if(action==='finish_job')finished=p;
  return {};
 };
 t.mock.method(globalThis,'fetch',async()=>{events.push('send');return {ok:true,json:async()=>({id:'test-provider-id'})};});
 await makeAutomation(config,db).run();
 assert.deepEqual(events,fail?['prepare']:['prepare','send']);
 assert.equal(finished.status,fail?'queued':'sent');
});
