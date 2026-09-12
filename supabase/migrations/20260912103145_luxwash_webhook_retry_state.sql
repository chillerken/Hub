alter table private.webhook_events alter column lease_until set default now()+interval '120 seconds';
do $$ declare definition text; begin
 definition:=pg_get_functiondef('private.luxwash_dispatch_v1(text,jsonb)'::regprocedure);
 definition:=replace(definition,'lease_until=now()+interval ''60 seconds''','lease_until=now()+interval ''120 seconds''');
 definition:=replace(definition,'jsonb_build_object(''claimed'',vkey is not null)',
 'jsonb_build_object(''claimed'',vkey is not null,''completed'',exists(select 1 from private.webhook_events where id=p->>''id'' and status=''completed''))');
 execute definition;
end $$;
