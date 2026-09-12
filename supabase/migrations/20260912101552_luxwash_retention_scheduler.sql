-- Database-owned cleanup continues independently of the web runtime.
create extension if not exists pg_cron;
create or replace function private.retention_cleanup() returns void
language plpgsql security definer set search_path='' as $$
begin
 perform private.luxwash_dispatch('retention','{}'::jsonb);
 update public.call_actions set result=null where created_at<now()-interval '30 days' and result is not null;
 update public.phone_calls set summary=null where created_at<now()-interval '30 days' and summary is not null;
 delete from cron.job_run_details where end_time<now()-interval '14 days';
end $$;
revoke all on function private.retention_cleanup() from public,anon,authenticated;
select cron.schedule('luxwash-retention','*/15 * * * *','select private.retention_cleanup()');
