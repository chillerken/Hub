begin;
select set_config('luxwash.actor','qa:request-details',true);
do $$
declare p jsonb; r jsonb; again jsonb; details jsonb;
begin
 p:=jsonb_build_object('name','Transactional intake QA','email','intake-rollback@example.invalid','idempotency_key',gen_random_uuid()::text,'service','Terrasreiniging','message','Groene aanslag','intake_details',jsonb_build_object('address','Voorbeeldstraat 1','postcode','9340','area_m2',20,'surface_material','Betonnen tegels','preferred_date','2026-09-14','untrusted_extra','not saved'));
 r:=private.luxwash_dispatch('intake',p);
 select metadata->'intake_details' into details from public.leads where id=(r->>'id')::uuid;
 if details->>'address'<>'Voorbeeldstraat 1' or (details->>'area_m2')::int<>20 or details->>'surface_material'<>'Betonnen tegels' or details ? 'untrusted_extra' then raise exception 'TEST request details lost or unfiltered';end if;
 again:=private.luxwash_dispatch('intake',p||jsonb_build_object('intake_details','{"address":"Changed address"}'::jsonb));
 if again->>'id'<>r->>'id' then raise exception 'TEST duplicate intake';end if;
 if (select metadata->'intake_details'->>'address' from public.leads where id=(r->>'id')::uuid)<>'Voorbeeldstraat 1' then raise exception 'TEST replay modified original';end if;
end $$;
rollback;
