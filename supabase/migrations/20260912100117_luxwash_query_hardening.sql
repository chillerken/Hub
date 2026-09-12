do $fix$ begin execute replace(pg_get_functiondef('private.luxwash_dispatch_v1(text,jsonb)'::regprocedure),'AS $function$',E'AS $function$\n#variable_conflict use_column'); end $fix$;
