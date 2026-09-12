begin;
do $$
declare r jsonb; r2 jsonb; n int; begin
r:=private.luxwash_dispatch('intake','{"name":"Transactional QA","phone":"+32468000000","service":"QA","message":"test","idempotency_key":"qa-intake-rollback-001"}');
r2:=private.luxwash_dispatch('intake','{"name":"Transactional QA","phone":"+32468000000","idempotency_key":"qa-intake-rollback-001"}');
if r->>'id'<>r2->>'id' then raise exception 'intake not idempotent'; end if;
select count(*) into n from public.leads where id=(r->>'id')::uuid and customer_id is not null;
if n<>1 then raise exception 'unlinked lead'; end if;
perform private.luxwash_dispatch('claim_jobs','{}');
if exists(select 1 from public.automation_jobs where status='processing' and first_attempt_at is null) then raise exception 'missing delivery anchor';end if;
end $$;
select 'PASS atomic intake, deduplication, CRM link, delivery anchor' result;
rollback;
