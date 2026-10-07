-- Fail closed for future database objects created by the postgres migration role.
-- Browser roles receive no automatic table/sequence/function access.
-- service_role keeps server-side access so Edge Functions continue to work.

alter default privileges in schema public
  revoke select, insert, update, delete, truncate, references, trigger, maintain
  on tables from anon, authenticated;

alter default privileges in schema public
  revoke usage, select, update on sequences from anon, authenticated;

-- PostgreSQL's built-in function EXECUTE grant is global, so this revoke must
-- be global rather than schema-local.
alter default privileges
  revoke execute on functions from public, anon, authenticated;

alter default privileges
  grant execute on functions to service_role;
