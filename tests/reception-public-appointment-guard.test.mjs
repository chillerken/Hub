// Real HTTP handler, isolated persistence. No production requests or AI calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
import ts from 'typescript';
import * as intent from '../ai-receptionist-host/supabase/functions/public-reception-chat/intent.js';

class Query {
 constructor(db,name){this.db=db;this.name=name;this.filters=[];this.mode='select';this.cap=Infinity;}
 select(){return this;}
 eq(k,v){this.filters.push(r=>r[k]===v);return this;}
 in(k,vs){this.filters.push(r=>vs.includes(r[k]));return this;}
 gte(k,v){this.filters.push(r=>r[k]>=v);return this;}
 order(k,{ascending=true}={}){this.sort={k,ascending};return this;}
 limit(n){this.cap=n;return this;}
 insert(payload){this.mode='insert';this.patch=payload;return this;}
 update(payload){this.mode='update';this.patch=payload;return this;}
 execute(){
  const table=this.db[this.name]??(this.db[this.name]=[]);
  if(this.name==='appointments'&&this.mode==='update'&&this.db.confirmBeforeUpdate){
   this.db.confirmBeforeUpdate=false;table[0].status='confirmed';
  }
  let rows=table.filter(r=>this.filters.every(f=>f(r)));
  if(this.sort){const {k,ascending}=this.sort;rows.sort((a,b)=>String(a[k]).localeCompare(String(b[k]))*(ascending?1:-1));}
  rows=rows.slice(0,this.cap);
  if(this.mode==='insert'){const row={id:'fixture-'+this.name+'-'+table.length,created_at:new Date().toISOString(),...this.patch};table.push(row);rows=[row];}
  if(this.mode==='update')for(const row of rows)Object.assign(row,this.patch);
  return {data:rows.map(r=>({...r})),error:null,count:rows.length};
 }
 async single(){const r=this.execute();return {...r,data:r.data[0]??null};}
 async maybeSingle(){return this.single();}
 then(resolve,reject){return Promise.resolve(this.execute()).then(resolve,reject);}
}
function fixture(status='confirmed',options={}){
 const original={id:'appointment-a',organization_id:'org-a',lead_id:'lead-a',status,
  start_at:'2030-01-15T12:00:00.000Z',end_at:'2030-01-15T13:00:00.000Z',
  requested_text:'Oorspronkelijke aanvraag',created_at:'2026-10-01T00:00:00Z'};
 const db={
  business_profiles:[{organization_id:'org-a',widget_token:'public-fixture',widget_enabled:true,locale:'nl-BE',business_name:'Testbedrijf'}],
  organizations:[{id:'org-a',plan:'business',status:'active',is_internal:true}],
  leads:[{id:'lead-a',organization_id:'org-a',name:'Testbezoeker',email:'person@example.invalid',status:'qualified'}],
  conversations:[{id:'conversation-a',organization_id:'org-a',lead_id:'lead-a'}],
  appointments:[{...original}],messages:[],tasks:[],workflow_actions:[],widget_rate_limits:[]
 };
 let handler;const requests=[];
 const source=readFileSync('ai-receptionist-host/supabase/functions/public-reception-chat/index.ts','utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 runInNewContext(compiled,{
  exports:{},Request,Response,Headers,AbortController,crypto:webcrypto,TextEncoder,Date:options.clock||Date,setTimeout,clearTimeout,
  console:{error(){},log(){}},
  async fetch(url,request){if(!options.ai)throw Error('External requests forbidden in this fixture');requests.push(JSON.parse(request.body));return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'Alleen een gecontroleerd fixture-antwoord.'}]}}]}),{status:200});},
  Deno:{env:{get(k){if(k==='GEMINI_API_KEY'&&options.ai)return 'isolated-fixture-key';return k==='SUPABASE_URL'?'https://fixture.invalid':undefined;}},serve(h){handler=h;}},
  require(name){
   if(name.startsWith('https://esm.sh/'))return {createClient(){return {from(n){return new Query(db,n);},async rpc(name){assert.equal(name,'consume_ai_daily_quota');return {data:true,error:null};}};}};
   if(name==='./intent.js')return intent;
   throw Error('Unmocked import: '+name);
  }
 },{timeout:2000});
 return {db,original,requests,async send(message,extra={}){
  const response=await handler(new Request('https://fixture.invalid/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({widget_token:'public-fixture',lead_id:'lead-a',conversation_id:'conversation-a',message,...extra})}));
  return {status:response.status,body:await response.json()};
 }};
}
test('public rescheduling cannot modify an operator-confirmed appointment',async()=>{
 const f=fixture();
 const r=await f.send('Ik wil een afspraak boeken op 16/01/2030 om 14u30');
 assert.equal(r.status,200);
 assert.deepEqual(f.db.appointments.find(a=>a.id===f.original.id),f.original,'Confirmed appointment must remain unchanged');
 const requested=f.db.appointments.find(a=>a.id===r.body.appointment_id);
 assert.notEqual(requested.id,f.original.id);
 assert.equal(requested.status,'requested');
 assert.equal(requested.start_at,'2030-01-16T13:30:00.000Z');
 assert.match(r.body.reply,/aanvraag/);
});
for(const status of ['requested','proposed'])test('visitor may refine an unconfirmed '+status+' request',async()=>{
 const f=fixture(status);const r=await f.send('Ik wil een afspraak boeken op 16/01/2030 om 14u30');
 assert.equal(r.status,200);assert.equal(r.body.appointment_id,f.original.id);
 assert.equal(f.db.appointments.length,1);assert.equal(f.db.appointments[0].status,status);
 assert.equal(f.db.appointments[0].start_at,'2030-01-16T13:30:00.000Z');
});
test('repeated scheduling messages reuse the pending request',async()=>{
 const f=fixture();const a=await f.send('Ik wil een afspraak boeken op 16/01/2030 om 14u30');
 const b=await f.send('Ik wil een afspraak boeken op 17/01/2030 om 15u30');
 assert.equal(a.status,200);assert.equal(b.status,200);
 assert.equal(a.body.appointment_id,b.body.appointment_id);
 assert.equal(f.db.appointments.filter(x=>x.status==='requested').length,1);
 assert.deepEqual(f.db.appointments.find(x=>x.id===f.original.id),f.original);
});
test('cross-tenant conversation is rejected before any customer-data write',async()=>{
 const f=fixture();f.db.conversations[0].organization_id='org-b';
 const r=await f.send('Ik wil een afspraak boeken op 16/01/2030 om 14u30');
 assert.equal(r.status,404);assert.equal(f.db.messages.length,0);
 assert.deepEqual(f.db.appointments,[f.original]);
});
test('concurrent operator confirmation prevents a public update',async()=>{
 const f=fixture('requested');f.db.confirmBeforeUpdate=true;
 const r=await f.send('Ik wil een afspraak boeken op 16/01/2030 om 14u30');
 assert.equal(r.status,409);
 assert.deepEqual(f.db.appointments[0],{...f.original,status:'confirmed'});
 assert.equal(f.db.appointments.length,1);
});
test('tenant chat gives the provider a Brussels server date without booking data',async()=>{
 const instant=Date.parse('2026-12-31T23:30:00Z');
 class Clock extends Date{constructor(...args){super(...(args.length?args:[instant]));}static now(){return instant;}}
 const f=fixture('confirmed',{ai:true,clock:Clock});const r=await f.send('Wat zijn jullie diensten?');
 assert.equal(r.status,200);assert.equal(r.body.ai_status,'generated');
 assert.match(f.requests[0].system_instruction.parts[0].text,/Huidige datum \(Europe\/Brussels\): vrijdag 1 januari 2027/);
 assert.deepEqual(f.db.appointments,[f.original]);
});
