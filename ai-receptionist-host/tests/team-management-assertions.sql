\set ON_ERROR_STOP on

do $$
declare
  v_org uuid := '10000000-0000-4000-8000-000000000001';
  v_user uuid := '20000000-0000-4000-8000-000000000001';
  v_invite uuid;
  v_expiry timestamptz;
  v_count integer;
begin
  insert into auth.users(id,email,email_confirmed_at)
  values(v_user,'owner@example.test',now());

  insert into public.organizations(id,name) values(v_org,'CI Test Company');
  insert into public.memberships(organization_id,user_id,role,active)
  values(v_org,v_user,'owner',true);

  if not (select relrowsecurity from pg_class where oid='public.user_org_context'::regclass) then
    raise exception 'RLS is not enabled on user_org_context';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.team_invitations'::regclass) then
    raise exception 'RLS is not enabled on team_invitations';
  end if;

  select count(*) into v_count from pg_policies
  where schemaname='public' and tablename in ('user_org_context','team_invitations');
  if v_count <> 0 then
    raise exception 'Server-only tables unexpectedly have client policies: %',v_count;
  end if;

  if has_table_privilege('anon','public.user_org_context','SELECT')
     or has_table_privilege('authenticated','public.user_org_context','SELECT')
     or has_table_privilege('anon','public.team_invitations','SELECT')
     or has_table_privilege('authenticated','public.team_invitations','SELECT') then
    raise exception 'Anonymous or authenticated role can read server-only tables';
  end if;
  if not has_table_privilege('service_role','public.user_org_context','SELECT')
     or not has_table_privilege('service_role','public.team_invitations','SELECT') then
    raise exception 'service_role is missing expected table access';
  end if;

  insert into public.user_org_context(user_id,organization_id) values(v_user,v_org);
  if not exists (
    select 1 from public.user_org_context
    where user_id=v_user and organization_id=v_org
  ) then
    raise exception 'Active organization context could not be stored';
  end if;

  insert into public.team_invitations(organization_id,email,role,invited_by,token_hash)
  values(v_org,'staff@example.test','agent',v_user,repeat('a',64))
  returning id,expires_at into v_invite,v_expiry;

  if v_expiry < now()+interval '6 days' or v_expiry > now()+interval '8 days' then
    raise exception 'Invitation expiry default is not approximately seven days';
  end if;

  begin
    insert into public.team_invitations(organization_id,email,role,invited_by,token_hash)
    values(v_org,'STAFF@example.test','viewer',v_user,repeat('b',64));
    raise exception 'Duplicate pending invitation unexpectedly accepted';
  exception when unique_violation then
    null;
  end;

  update public.team_invitations set status='revoked',revoked_at=now()
  where id=v_invite;

  insert into public.team_invitations(organization_id,email,role,invited_by,token_hash)
  values(v_org,'staff@example.test','viewer',v_user,repeat('c',64));

  begin
    insert into public.team_invitations(organization_id,email,role,invited_by,token_hash)
    values(v_org,'bad-role@example.test','owner',v_user,repeat('d',64));
    raise exception 'Forbidden invitation role unexpectedly accepted';
  exception when check_violation then
    null;
  end;

  insert into auth.users(id,email,email_confirmed_at)
  values('20000000-0000-4000-8000-000000000002','unassigned@example.test',now());

  begin
    insert into public.user_org_context(user_id,organization_id)
    values('20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001');
    raise exception 'Invalid organization reference unexpectedly accepted';
  exception when foreign_key_violation then
    null;
  end;

  raise notice 'PASS: RLS, grants, tenant FK, seven-day expiry, pending uniqueness and role constraint';
end $$;
