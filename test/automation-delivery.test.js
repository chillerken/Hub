const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
async function scenario(email,status=200,body={id:'provider-1'}){
 const writes=[],requests=[];const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(__dirname+'/../src/core/automation.js','utf8'),{module,exports:module.exports,require:p=>p==='./classify'?()=>async()=>({available:true}):require(p),Date,AbortSignal,fetch:async(url,opts)=>{requests.push({url,opts});return {ok:status<400,status,json:async()=>body};}});
 const job={id:'job-1',kind:'lead_ack',attempts:1,lease_token:'lease',payload:{}};
 const settings={business:{email:'info@luxwash.online',phone:'test'},planning:{}};
 const db=async(action,payload)=>{if(action==='claim_jobs')return [job];if(action==='settings')return settings;if(action==='job_context')return {job,customer:{id:'customer-1',status:'active',email,name:'QA'}};if(action==='flow_delivery_allowed'||action==='email_budget')return {allowed:true};writes.push({action,payload});return {};};
 const result=await module.exports({resend:{apiKey:'mock',from:'mock'},publicSiteUrl:'https://www.luxwash.online'},db).run();return {result,writes,requests};
}
test('reserved test domains never reach the mail provider',async()=>{for(const email of ['qa@example.com','qa@sub.example.net','qa@example.org','qa@acme.invalid','qa@acme.test','qa@foo.example']){const r=await scenario(email);assert.equal(r.requests.length,0,email);assert.equal(r.result.jobs[0].status,'dead');}});
test('permanent provider failures stop retries',async()=>{for(const code of [400,401,403,404,422]){const r=await scenario('valid@customer.be',code);assert.equal(r.result.jobs[0].status,'dead');assert.equal(r.requests.length,1);}});
test('temporary failures remain retryable',async()=>{for(const code of [408,429,500,503])assert.equal((await scenario('valid@customer.be',code)).result.jobs[0].status,'queued');});
test('accepted message is journaled with provider id and stable idempotency key',async()=>{const r=await scenario('valid@customer.be');assert.equal(r.result.jobs[0].status,'sent');assert.equal(r.requests[0].opts.headers['Idempotency-Key'],'luxwash/job-1');assert.equal(r.writes.find(w=>w.action==='save').payload.data.provider_id,'provider-1');});
test('missing provider receipt is held for reconciliation',async()=>{assert.equal((await scenario('valid@customer.be',200,{})).result.jobs[0].status,'dead');});
test('missing email stops without provider request',async()=>{const r=await scenario('');assert.equal(r.requests.length,0);assert.equal(r.result.jobs[0].status,'dead');});
