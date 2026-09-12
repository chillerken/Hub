alter function private.luxwash_dispatch(text,jsonb) rename to luxwash_dispatch_before_management;
create function private.luxwash_dispatch(action text,p jsonb) returns jsonb language plpgsql set search_path='' as $$
declare a public.appointments;
begin
if action='management_prepare' then
 if coalesce(p->>'token_hash','') !~ '^[a-f0-9]{64}$' then raise exception 'Invalid management hash'; end if;
 select * into a from public.appointments where id=(p->>'id')::uuid for update;
 if not found or a.idempotency_key is distinct from p->>'idempotency_key' then raise exception 'Appointment mismatch'; end if;
 if a.manage_token_hash is null then
  update public.appointments set manage_token_hash=p->>'token_hash' where id=a.id;
 elsif a.manage_token_hash<>p->>'token_hash' then raise exception 'Existing management hash must not be replaced';
 end if;
 return '{"ok":true}';
end if;
return private.luxwash_dispatch_before_management(action,p);
end $$;
revoke all on function private.luxwash_dispatch(text,jsonb) from public,anon,authenticated;
