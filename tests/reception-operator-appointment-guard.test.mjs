// Actual operations-admin handler; auth and persistence are isolated fixtures.
// No real users, Supabase requests, payments, or customer messages.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

class Query {
 constructor(db,name){this.db=db;this.name=name;this.filters=[];this.mode='select';}
 select(){return this;}
 eq(k,v){this.filters.push(r=>r[k]===v);return this;}
 is(k,v){this.filters.push(r=>(r[k]??null)===v);return this;}
 neq(k,v){this.filters.push(r=>r[k]!==v);return this;}
 order(){return this;}
 limit(){return this;}
 update(patch){this.mode='update';this.patch=patch;return this;}
 insert(patch){this.mode='insert';this.patch=patch;return this;}
 execute(){
  if(this.name==='customer_payments'&&this.db.paymentReadError)return {data:null,error:{message:'fixture database unavailable'}};
  const table=this.db[this.name]??(this.db[this.name]=[]);
  if(this.name==='appointments'&&this.mode==='update'&&this.db.beforeWrite){
   const mutate=this.db.beforeWrite;this.db.beforeWrite=null;mutate(table[0]);
  }
  let rows=table.filter(r=>this.filters.every(f=>f(r)));
  if(this.mode==='update')for(const row of rows)Object.assign(row,this.patch);
  if(this.mode==='insert'){const row={...this.patch};table.push(row);rows=[row];}
  return {data:rows.map(r=>({...r})),error:null};
 }
 async single(){const r=this.execute();if(r.error)return r;return r.data.length===1?{data:r.data[0],error:null}:{data:null,error:{code:'PGRST116'}};}
 async maybeSingle(){const r=this.execute();return r.error?r:{data:r.data[0]??null,error:null};}
 then(resolve,reject){return Promise.resolve(this.execute()).then(resolve,reject);}
}
function fixture({status='proposed',role='owner',active=true,authenticated=true}={}){
 const original={id:'appointment-a',organization_id:'org-a',lead_id:'lead-a',status,
  start_at:'2030-01-15T12:00:00.000Z',end_at:'2030-01-15T13:00:00.000Z',
  updated_at:'2026-10-12T09:00:00.000Z'};
 const db={appointments:[{...original}],memberships:[{organization_id:'org-a',user_id:'operator-a',role,active}],
  leads:[{id:'lead-a',organization_id:'org-a',status:'qualified'}],customer_payments:[],audit_events:[]};
 let handler;
 const source=readFileSync(process.env.RECEPTION_OPERATIONS_SOURCE||'ai-receptionist-host/supabase/functions/operations-admin/index.ts','utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 runInNewContext(compiled,{
  exports:{},Request,Response,Headers,Date,
  console:{error(){}},fetch(){throw Error('External requests forbidden');},
  Deno:{env:{get(k){return {SUPABASE_URL:'https://fixture.invalid',SUPABASE_ANON_KEY:'fixture-anon',SUPABASE_SERVICE_ROLE_KEY:'fixture-service'}[k];}},serve(h){handler=h;}},
  require(name){assert.equal(name,'https://esm.sh/@supabase/supabase-js@2.95.0');return {createClient(){return {
   from(n){return new Query(db,n);},auth:{async getUser(){return authenticated?{data:{user:{id:'operator-a'}},error:null}:{data:null,error:{message:'invalid token'}};}}
  };}};}
 },{timeout:2000});
 return {db,original,async send(action,extra={},authorization='Bearer fixture-token'){
  const headers={'Content-Type':'application/json'};if(authorization)headers.Authorization=authorization;
  const res=await handler(new Request('https://fixture.invalid/operations-admin',{method:'POST',headers,body:JSON.stringify({action,appointment_id:'appointment-a',...extra})}));
  return {status:res.status,body:await res.json()};
 }};
}
const slot={start_at:'2030-01-16T14:00:00Z',end_at:'2030-01-16T15:00:00Z',status:'proposed'};

test('authorized operator may propose then confirm an exact appointment',async()=>{
 const f=fixture({status:'requested'});let r=await f.send('schedule_appointment',slot);
 assert.equal(r.status,200);assert.equal(f.db.appointments[0].status,'proposed');
 r=await f.send('confirm_appointment');assert.equal(r.status,200);assert.equal(f.db.appointments[0].status,'confirmed');
 assert.deepEqual(f.db.audit_events.map(x=>x.event_type),['appointment.scheduled','appointment.confirmed']);
});
for(const options of [{role:'member'},{active:false},{authenticated:false}])test('unauthorized operator cannot mutate appointments: '+JSON.stringify(options),async()=>{
 const f=fixture(options);const r=await f.send('confirm_appointment');assert.ok([401,403].includes(r.status));
 assert.deepEqual(f.db.appointments,[f.original]);assert.equal(f.db.audit_events.length,0);
});
test('missing authorization rejects before appointment access',async()=>{
 const f=fixture();const r=await f.send('confirm_appointment',{},'');assert.equal(r.status,401);assert.deepEqual(f.db.appointments,[f.original]);
});
test('operator cannot confirm another tenant appointment',async()=>{
 const f=fixture();f.db.appointments[0].organization_id='org-b';const before={...f.db.appointments[0]};
 const r=await f.send('confirm_appointment');assert.equal(r.status,404);assert.deepEqual(f.db.appointments,[before]);assert.equal(f.db.audit_events.length,0);
});
for(const [action,status,mutation] of [
 ['schedule_appointment','proposed',{status:'cancelled'}],
 ['confirm_appointment','proposed',{status:'cancelled'}],
 ['complete_appointment','confirmed',{status:'cancelled'}],
 ['cancel_appointment','confirmed',{status:'completed'}],
 ['confirm_appointment','proposed',{start_at:'2030-01-17T12:00:00.000Z',end_at:'2030-01-17T13:00:00.000Z'}],
 ['schedule_appointment','proposed',{updated_at:'2026-10-12T09:00:01.000Z'}]
])test('stale '+action+' cannot overwrite concurrent change '+JSON.stringify(mutation),async()=>{
 const f=fixture({status});f.db.beforeWrite=row=>Object.assign(row,mutation);
 const r=await f.send(action,action==='schedule_appointment'?slot:{});
 assert.equal(r.status,409);assert.equal(r.body.code,'appointment_changed');
 assert.deepEqual(f.db.appointments[0],{...f.original,...mutation});assert.equal(f.db.audit_events.length,0);
});
for(const [start_at,end_at] of [
 ['not-a-date','2030-01-15T13:00:00Z'],
 ['2030-01-15T12:00:00Z','2030-01-15T11:00:00Z'],
 ['2030-01-15T12:00:00Z','2030-01-15T12:00:00Z']
])test('confirmation refuses invalid time window '+start_at+' / '+end_at,async()=>{
 const f=fixture();Object.assign(f.db.appointments[0],{start_at,end_at});const before={...f.db.appointments[0]};
 const r=await f.send('confirm_appointment');assert.equal(r.status,409);assert.deepEqual(f.db.appointments[0],before);assert.equal(f.db.audit_events.length,0);
});
test('completion fails closed when payment check is unavailable',async()=>{
 const f=fixture({status:'confirmed'});f.db.paymentReadError=true;
 const r=await f.send('complete_appointment');assert.equal(r.status,500);assert.deepEqual(f.db.appointments,[f.original]);assert.equal(f.db.audit_events.length,0);
});
test('unpaid request blocks completion',async()=>{
 const f=fixture({status:'confirmed'});f.db.customer_payments.push({id:'payment-a',organization_id:'org-a',appointment_id:'appointment-a',status:'pending'});
 const r=await f.send('complete_appointment');assert.equal(r.status,409);assert.equal(r.body.code,'payment_required_before_completion');assert.deepEqual(f.db.appointments,[f.original]);
});
test('confirmed paid appointment can be completed without touching other tenant',async()=>{
 const f=fixture({status:'confirmed'});const other={...f.original,id:'appointment-b',organization_id:'org-b'};f.db.appointments.push(other);
 f.db.customer_payments.push({id:'payment-a',organization_id:'org-a',appointment_id:'appointment-a',status:'paid'});
 const r=await f.send('complete_appointment');assert.equal(r.status,200);assert.equal(f.db.appointments[0].status,'completed');assert.deepEqual(f.db.appointments[1],other);
 assert.equal(f.db.leads[0].status,'won');assert.deepEqual(f.db.audit_events.map(x=>x.event_type),['lead.won_from_completed_appointment','appointment.completed']);
});
test('operator can schedule a text-only request without an existing exact time',async()=>{
 const f=fixture({status:'requested'});Object.assign(f.db.appointments[0],{start_at:null,end_at:null});
 const r=await f.send('schedule_appointment',slot);assert.equal(r.status,200);assert.equal(f.db.appointments[0].status,'proposed');
});
