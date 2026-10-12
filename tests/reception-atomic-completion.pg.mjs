// Disposable real PostgreSQL contract; uses two sessions for lock tests.
import test,{before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';

const root=process.env.RECEPTION_PG_MODULE_ROOT;
if(!root)throw Error('Set RECEPTION_PG_MODULE_ROOT to the isolated pg package directory');
const {Client}=createRequire(root+'/package.json')('pg');
if(!['127.0.0.1','localhost','::1'].includes(process.env.PGHOST)||process.env.PGDATABASE!=='reception_disposable')
 throw Error('Only an explicitly named loopback disposable database is permitted');
const A='10000000-0000-4000-8000-000000000001',B='10000000-0000-4000-8000-000000000002';
const U='20000000-0000-4000-8000-000000000001',L='30000000-0000-4000-8000-000000000001',P='40000000-0000-4000-8000-000000000001';
let db,second;
const migration='ai-receptionist-host/supabase/migrations/20261012010340_atomic_appointment_completion.sql';
async function snapshot(){return (await db.query('SELECT * FROM appointments WHERE id=$1',[P])).rows[0];}
async function complete(client=db,row=null,org=A,user=U){
 row??=await snapshot();
 return (await client.query('SELECT public.complete_reception_appointment($1,$2,$3,$4,$5,$6) result',[org,P,user,row.updated_at,row.start_at,row.end_at])).rows[0].result;
}
async function payment(client=db,org=A,lead=L){return client.query("INSERT INTO customer_payments(organization_id,lead_id,appointment_id,status,amount_cents) VALUES($1,$2,$3,'pending',15000)",[org,lead,P]);}
before(async()=>{
 db=new Client();second=new Client();await db.connect();await second.connect();
 await db.query('SET statement_timeout=5000');await second.query('SET statement_timeout=5000');
 await db.query(readFileSync('tests/reception-atomic-completion-schema.sql','utf8'));
 await db.query(readFileSync('tests/fixtures/reception-lifecycle-live-20261012.sql','utf8'));
 await db.query(readFileSync(migration,'utf8'));
});
beforeEach(async()=>{
 await db.query('TRUNCATE net.fixture_requests,vault.decrypted_secrets,conversations,sales_sequence_steps,sales_sequences,tenant_activation_events,workflow_actions,business_profiles,organizations,audit_events,customer_payments,appointments,leads,memberships RESTART IDENTITY CASCADE');
 await db.query('INSERT INTO organizations(id) VALUES($1)',[A]);
 await db.query('INSERT INTO business_profiles(organization_id) VALUES($1)',[A]);
 await db.query("INSERT INTO memberships VALUES($1,$2,'owner',true);",[A,U]);
 await db.query("INSERT INTO leads(id,organization_id,status) VALUES($1,$2,'qualified')",[L,A]);
 await db.query("INSERT INTO appointments(id,organization_id,lead_id,status,start_at,end_at,updated_at) VALUES($1,$2,$3,'confirmed','2030-01-15T12:00Z','2030-01-15T13:00Z','2026-10-12T09:00Z')",[P,A,L]);
});
after(async()=>{await db?.end();await second?.end();});

test('legacy separate payment check and completion reproduces unpaid completed state',async()=>{
 const check=await db.query("SELECT * FROM customer_payments WHERE appointment_id=$1 AND status<>'paid'",[P]);assert.equal(check.rowCount,0);
 await payment(second);
 // Exactly the former non-transactional completion update; appointment CAS
 // alone cannot observe a concurrent payment insertion.
 await db.query("UPDATE appointments SET status='completed' WHERE id=$1 AND status='confirmed'",[P]);
 assert.equal((await snapshot()).status,'completed');assert.equal((await db.query("SELECT count(*)::int n FROM customer_payments WHERE status='pending'")).rows[0].n,1);
 console.log('REPRODUCED: legacy completion bypasses a newly inserted pending payment');
});
test('legacy separate calls retain completion and lead changes after audit failure',async()=>{
 await db.query("ALTER TABLE audit_events ADD CONSTRAINT fixture_legacy_audit_failure CHECK(event_type<>'appointment.completed')");
 try{
  await db.query("UPDATE appointments SET status='completed' WHERE id=$1",[P]);
  await db.query("UPDATE leads SET status='won' WHERE id=$1",[L]);
  await assert.rejects(db.query("INSERT INTO audit_events(organization_id,event_type) VALUES($1,'appointment.completed')",[A]),/fixture_legacy_audit_failure/);
 }finally{await db.query('ALTER TABLE audit_events DROP CONSTRAINT fixture_legacy_audit_failure');}
 assert.equal((await snapshot()).status,'completed');assert.equal((await db.query('SELECT status FROM leads')).rows[0].status,'won');
 assert.equal((await db.query('SELECT count(*)::int n FROM audit_events')).rows[0].n,0);
 console.log('REPRODUCED: legacy audit failure leaves prior completion and lead conversion committed');
});
test('authorized completion atomically writes appointment, lead and audits',async()=>{
 await db.query('SET ROLE service_role');try{const r=await complete();assert.equal(r.ok,true);assert.equal(r.appointment.status,'completed');}finally{await db.query('RESET ROLE');}
 assert.equal((await db.query('SELECT status FROM leads')).rows[0].status,'won');
 assert.deepEqual((await db.query('SELECT event_type FROM audit_events ORDER BY id')).rows.map(r=>r.event_type),['lead.won_from_completed_appointment','appointment.completed']);
});
test('pending payment returns conflict without any completion mutation',async()=>{
 await payment();const before=await snapshot();const r=await complete();assert.equal(r.ok,false);assert.equal(r.code,'payment_required_before_completion');
 assert.deepEqual(await snapshot(),before);assert.equal((await db.query('SELECT count(*)::int n FROM audit_events')).rows[0].n,0);
});
test('paid payment permits completion',async()=>{await payment();await db.query("UPDATE customer_payments SET status='paid'");assert.equal((await complete()).ok,true);});
test('database rejects unrelated tenant and unauthorized operator',async()=>{
 await assert.rejects(complete(db,null,B),/operator_not_authorized/);
 await db.query("INSERT INTO memberships VALUES($1,$2,'owner',true)",[B,U]);
 await assert.rejects(complete(db,null,B),/appointment_not_found/);
 await db.query("UPDATE memberships SET role='member' WHERE organization_id=$1",[A]);
 await assert.rejects(complete(),/operator_not_authorized/);assert.equal((await snapshot()).status,'confirmed');
});
test('changed slot and repeated completion are rejected',async()=>{
 const old=await snapshot();await db.query("UPDATE appointments SET start_at=start_at+interval '1 hour' WHERE id=$1",[P]);
 await assert.rejects(complete(db,old),/appointment_changed/);await complete();await assert.rejects(complete(),/appointment_changed/);
});
test('audit failure rolls back appointment and lead conversion',async()=>{
 await db.query("ALTER TABLE audit_events ADD CONSTRAINT fixture_audit_failure CHECK(event_type<>'appointment.completed')");
 try{await assert.rejects(complete(),/fixture_audit_failure/);}finally{await db.query('ALTER TABLE audit_events DROP CONSTRAINT fixture_audit_failure');}
 assert.equal((await snapshot()).status,'confirmed');assert.equal((await db.query('SELECT status FROM leads')).rows[0].status,'qualified');
 assert.equal((await db.query('SELECT count(*)::int n FROM audit_events')).rows[0].n,0);
});
test('public callers have no RPC execution privilege and search_path is empty',async()=>{
 const signature='public.complete_reception_appointment(uuid,uuid,uuid,timestamptz,timestamptz,timestamptz)';
 for(const role of ['anon','authenticated'])assert.equal((await db.query('SELECT has_function_privilege($1,$2,\'EXECUTE\') yes',[role,signature])).rows[0].yes,false);
 const row=await snapshot();
 for(const role of ['anon','authenticated']){
  await db.query('SET ROLE '+role);try{await assert.rejects(complete(db,row),/permission denied for function complete_reception_appointment/);}finally{await db.query('RESET ROLE');}
 }
 assert.equal((await db.query('SELECT has_function_privilege(\'service_role\',$1,\'EXECUTE\') yes',[signature])).rows[0].yes,true);
 assert.deepEqual((await db.query("SELECT proconfig FROM pg_proc WHERE proname='complete_reception_appointment'")).rows[0].proconfig,['search_path=""']);
});
test('payment cannot link a different tenant to this appointment',async()=>{await assert.rejects(payment(db,B),/payment_appointment_mismatch/);});
test('old snapshot isolation fails closed',async()=>{
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');try{await assert.rejects(complete(),/unsupported_transaction_isolation/);}finally{await db.query('ROLLBACK');}
});

async function waitForLock(pid){
 const deadline=Date.now()+2500;
 while(Date.now()<deadline){
  const r=await db.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1",[pid]);
  if(r.rows[0]?.wait_event_type==='Lock')return;
  await new Promise(resolve=>setTimeout(resolve,20));
 }
 throw Error('second session did not demonstrably wait on a database lock');
}
test('committing payment writer holds the lock; completion waits then blocks',async()=>{
 const old=await snapshot();await db.query('BEGIN');await payment(db);
 const pid=(await second.query('SELECT pg_backend_pid() pid')).rows[0].pid;
 const pending=complete(second,old);
 try{await waitForLock(pid);await db.query('COMMIT');const r=await pending;assert.equal(r.code,'payment_required_before_completion');}
 finally{await db.query('ROLLBACK');await pending.catch(()=>{});}
 assert.equal((await snapshot()).status,'confirmed');
});
test('completion holds the lock; a later invoice waits until completion commits',async()=>{
 await db.query('BEGIN');await complete(db);
 const pid=(await second.query('SELECT pg_backend_pid() pid')).rows[0].pid;
 const pending=payment(second);
 try{await waitForLock(pid);await db.query('COMMIT');await pending;}
 finally{await db.query('ROLLBACK');await pending.catch(()=>{});}
 assert.equal((await snapshot()).status,'completed');
 // Intentional post-completion invoicing is existing product behavior.
 assert.equal((await db.query('SELECT count(*)::int n FROM customer_payments')).rows[0].n,1);
});

async function enableLifecycle({contact=true,marketing=true,plan='pro'}={}){
 await db.query("UPDATE organizations SET plan=$1,subscription_status='active' WHERE id=$2",[plan,A]);
 await db.query('UPDATE business_profiles SET automation_enabled=true WHERE organization_id=$1',[A]);
 await db.query("UPDATE leads SET source='public_widget',contact_consent_at=CASE WHEN $1 THEN now() ELSE NULL END,marketing_consent_at=CASE WHEN $2 THEN now() ELSE NULL END WHERE id=$3",[contact,marketing,L]);
 await db.query("INSERT INTO vault.decrypted_secrets VALUES('luxwash_reception_bridge_key_v2','fixture-only-not-a-real-secret')");
}
test('live lifecycle queues review/retention once and stamps outcome after completion',async()=>{
 await enableLifecycle();await complete();
 const rows=(await db.query("SELECT action_type,count(*)::int n FROM workflow_actions WHERE action_type IN ('review_request','retention_follow_up') GROUP BY action_type ORDER BY action_type")).rows;
 assert.deepEqual(rows,[{action_type:'retention_follow_up',n:1},{action_type:'review_request',n:1}]);
 assert.ok((await db.query('SELECT won_at FROM leads')).rows[0].won_at);
 await assert.rejects(complete(),/appointment_changed/);
 assert.equal((await db.query("SELECT count(*)::int n FROM workflow_actions WHERE action_type='review_request'")).rows[0].n,1);
 const events=(await db.query('SELECT event_type FROM tenant_activation_events ORDER BY event_type')).rows.map(x=>x.event_type);
 assert.deepEqual(events,['first_appointment_request','first_completed_appointment','first_confirmed_appointment','first_lead','first_qualified_lead']);
 assert.equal((await db.query('SELECT count(*)::int n FROM net.fixture_requests')).rows[0].n,1);
});
test('live lifecycle respects separate contact and marketing consents',async()=>{
 await enableLifecycle({contact:false,marketing:true});await complete();
 assert.equal((await db.query("SELECT count(*)::int n FROM workflow_actions WHERE action_type='review_request'")).rows[0].n,0);
 assert.equal((await db.query("SELECT count(*)::int n FROM workflow_actions WHERE action_type='retention_follow_up'")).rows[0].n,1);
});
test('no consent creates neither review nor retention action',async()=>{
 await enableLifecycle({contact:false,marketing:false});await complete();
 assert.equal((await db.query("SELECT count(*)::int n FROM workflow_actions WHERE action_type IN ('review_request','retention_follow_up')")).rows[0].n,0);
});
test('starter plan cannot receive pro review and retention automations',async()=>{
 await enableLifecycle({plan:'starter'});await complete();
 assert.equal((await db.query("SELECT count(*)::int n FROM workflow_actions WHERE action_type IN ('review_request','retention_follow_up')")).rows[0].n,0);
});
test('live sales follow-ups close for this tenant only after conversion',async()=>{
 await enableLifecycle();await db.query("INSERT INTO sales_sequences(organization_id,lead_id,status) VALUES($1,$2,'active'),($3,$2,'active')",[A,L,B]);
 await db.query("INSERT INTO sales_sequence_steps(organization_id,lead_id,status) VALUES($1,$2,'approved'),($3,$2,'approved')",[A,L,B]);
 await complete();
 assert.deepEqual((await db.query('SELECT status FROM sales_sequences ORDER BY organization_id')).rows.map(x=>x.status),['completed','active']);
 assert.deepEqual((await db.query('SELECT status FROM sales_sequence_steps ORDER BY organization_id')).rows.map(x=>x.status),['skipped','approved']);
});
test('live payment triggers activate paid outcome without duplicating review on completion',async()=>{
 await enableLifecycle();await payment();await db.query("UPDATE customer_payments SET status='paid',paid_at=now()");await complete();
 assert.equal((await db.query("SELECT count(*)::int n FROM workflow_actions WHERE action_type='review_request'")).rows[0].n,1);
 assert.equal((await db.query("SELECT count(*)::int n FROM workflow_actions WHERE action_type='payment_received'")).rows[0].n,1);
 assert.equal((await db.query("SELECT count(*)::int n FROM tenant_activation_events WHERE event_type='first_customer_payment'")).rows[0].n,1);
});
test('audit failure rolls back live lifecycle queues, activation, sales closure and sync enqueue',async()=>{
 await enableLifecycle();await db.query("INSERT INTO sales_sequences(organization_id,lead_id,status) VALUES($1,$2,'active')",[A,L]);
 const queueBefore=(await db.query('SELECT * FROM workflow_actions ORDER BY id')).rows;
 await db.query("ALTER TABLE audit_events ADD CONSTRAINT fixture_full_audit_failure CHECK(event_type<>'appointment.completed')");
 try{await assert.rejects(complete(),/fixture_full_audit_failure/);}finally{await db.query('ALTER TABLE audit_events DROP CONSTRAINT fixture_full_audit_failure');}
 assert.equal((await snapshot()).status,'confirmed');assert.equal((await db.query('SELECT status FROM leads')).rows[0].status,'qualified');
 assert.deepEqual((await db.query('SELECT * FROM workflow_actions ORDER BY id')).rows,queueBefore);
 assert.equal((await db.query('SELECT count(*)::int n FROM tenant_activation_events')).rows[0].n,0);
 assert.equal((await db.query('SELECT status FROM sales_sequences')).rows[0].status,'active');
 assert.equal((await db.query('SELECT count(*)::int n FROM net.fixture_requests')).rows[0].n,0);
});
