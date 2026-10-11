-- Must be executed after installing the RELEASE-CANDIDATE production PL/pgSQL function.
\set ON_ERROR_STOP on
begin;
create trigger trg_appointment_lifecycle_actions
after insert or update of status,start_at,end_at,location on public.appointments
for each row execute function public.enqueue_appointment_lifecycle_actions();

insert into public.business_profiles(organization_id,automation_enabled) values
 ('10000000-0000-4000-8000-000000000001',true),
 ('10000000-0000-4000-8000-000000000002',true),
 ('10000000-0000-4000-8000-000000000003',false);
insert into public.leads(id,organization_id) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002'),
 ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003');

-- A website-created request with a concrete slot MUST NOT create calendar or confirmation actions.
insert into public.appointments(id,organization_id,lead_id,status,requested_text,start_at,end_at)
values (
 '30000000-0000-4000-8000-000000000001',
 '10000000-0000-4000-8000-000000000001',
 '20000000-0000-4000-8000-000000000001',
 'requested','Ik wil op 17 november om 14 uur',
 '2026-11-17T14:00:00+01:00','2026-11-17T15:00:00+01:00'
);
select public.assert_test((select count(*)=0 from public.workflow_actions),
 'Visitor request with complete timestamps cannot enqueue external actions');

update public.appointments set status='proposed'
where id='30000000-0000-4000-8000-000000000001';
select public.assert_test((select count(*)=0 from public.workflow_actions),
 'Proposed slot cannot enqueue external actions');

update public.appointments set start_at='2026-11-17T16:00:00+01:00',
end_at='2026-11-17T17:00:00+01:00'
where id='30000000-0000-4000-8000-000000000001';
select public.assert_test((select count(*)=0 from public.workflow_actions),
 'Changing a proposed slot is not a calendar booking');

-- Confirmed by an authorized operator through operations-admin.
update public.appointments set status='confirmed'
where id='30000000-0000-4000-8000-000000000001';
select public.assert_test((select count(*)=1 from public.workflow_actions where action_type='calendar_request'),
 'Human approval queues exactly one calendar action');
select public.assert_test((select count(*)=1 from public.workflow_actions where action_type='appointment_confirmation'),
 'Human approval queues exactly one confirmation action');
select public.assert_test((select count(*)=0 from public.workflow_actions where status<>'pending'),
 'Confirmed outbound actions are pending and not falsely delivered');
select public.assert_test((
 select payload->>'start_at'='2026-11-17T15:00:00+00:00'
 from public.workflow_actions where action_type='calendar_request'),
 'Calendar action contains precise approved UTC instant');

update public.appointments set status='confirmed'
where id='30000000-0000-4000-8000-000000000001';
select public.assert_test((select count(*)=2 from public.workflow_actions),
 'Duplicate confirmation cannot create duplicate queued actions');

-- A later approved reschedule refreshes the existing action idempotently.
update public.appointments set start_at='2026-11-18T10:00:00+01:00',
 end_at='2026-11-18T11:00:00+01:00'
where id='30000000-0000-4000-8000-000000000001';
select public.assert_test((select count(*)=2 from public.workflow_actions),
 'Reschedule reuses calendar and confirmation idempotency keys');
select public.assert_test((
 select payload->>'rescheduled'='true'
 from public.workflow_actions where action_type='appointment_confirmation'),
 'Confirmation payload records operator-approved reschedule');

update public.appointments set provider='google_calendar',provider_booking_id='gcal_qa_fixture',status='cancelled'
where id='30000000-0000-4000-8000-000000000001';
select public.assert_test((select count(*)=1 from public.workflow_actions where action_type='calendar_cancel'),
 'Cancellation queues one calendar deletion for existing provider booking');

-- Second tenant has its own lifecycle and unique idempotency keys.
insert into public.appointments(id,organization_id,lead_id,status,start_at,end_at)
values (
 '30000000-0000-4000-8000-000000000002',
 '10000000-0000-4000-8000-000000000002',
 '20000000-0000-4000-8000-000000000002',
 'requested','2026-11-19T10:00:00+01:00','2026-11-19T11:00:00+01:00'
);
select public.assert_test((select count(*)=0 from public.workflow_actions
 where organization_id='10000000-0000-4000-8000-000000000002'),
 'Second tenant request remains unconfirmed and separate');
update public.appointments set status='confirmed'
where id='30000000-0000-4000-8000-000000000002';
select public.assert_test((select count(*)=2 from public.workflow_actions
 where organization_id='10000000-0000-4000-8000-000000000002'),
 'Second tenant only receives its own confirmed actions');
select public.assert_test((select count(*)=3 from public.workflow_actions
 where organization_id='10000000-0000-4000-8000-000000000001'),
 'First tenant action count unaffected by second tenant');

-- Disabled automation must produce no external actions.
insert into public.appointments(id,organization_id,lead_id,status,start_at,end_at)
values (
 '30000000-0000-4000-8000-000000000003',
 '10000000-0000-4000-8000-000000000003',
 '20000000-0000-4000-8000-000000000003',
 'confirmed','2026-11-20T10:00:00+01:00','2026-11-20T11:00:00+01:00'
);
select public.assert_test((select count(*)=0 from public.workflow_actions
 where organization_id='10000000-0000-4000-8000-000000000003'),
 'Automation disabled means no workflow dispatch');

update public.appointments set status='completed'
where id='30000000-0000-4000-8000-000000000002';
select public.assert_test((select status='won' from public.leads
 where id='20000000-0000-4000-8000-000000000002'),
 'Completion marks the correctly scoped lead as won');
rollback;
