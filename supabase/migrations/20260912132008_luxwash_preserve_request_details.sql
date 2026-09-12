alter function private.luxwash_dispatch(text,jsonb) rename to luxwash_dispatch_before_intake_details;
create function private.luxwash_dispatch(action text,p jsonb) returns jsonb language plpgsql set search_path='' as $$
declare r jsonb; existing_id uuid; details jsonb;
begin
 if action='intake' then
  perform pg_advisory_xact_lock(hashtextextended('intake:'||(p->>'idempotency_key'),0));
  select id into existing_id from public.leads where metadata->>'intake_key'=p->>'idempotency_key';
  if existing_id is not null then return jsonb_build_object('id',existing_id,'status','received');end if;
  r:=private.luxwash_dispatch_before_intake_details(action,p);
  select coalesce(jsonb_object_agg(key,value),'{}') into details from jsonb_each(coalesce(p->'intake_details','{}')) where key in ('address','postcode','vehicle','preferred_date','area_m2','surface_material') and value<>'null'::jsonb and value<>'""'::jsonb;
  update public.leads set metadata=coalesce(metadata,'{}')||jsonb_build_object('intake_details',details) where id=(r->>'id')::uuid;
  return r;
 end if;
 return private.luxwash_dispatch_before_intake_details(action,p);
end $$;
revoke all on function private.luxwash_dispatch(text,jsonb) from public,anon,authenticated;
