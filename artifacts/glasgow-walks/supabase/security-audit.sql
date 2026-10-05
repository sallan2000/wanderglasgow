-- Read-only owner audit: run in the Supabase SQL Editor.
-- This reports configuration, not credentials, users or stored visitor data.
begin read only;

select n.nspname as schema_name, c.relname as table_name,
       c.relrowsecurity as row_level_security
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r' and (
  (n.nspname = 'public' and c.relname in (
    'glasgow_attractions', 'glasgow_curated_walks',
    'glasgow_attraction_categories', 'glasgow_starting_areas'))
  or n.nspname = 'glasgow_walks_private')
order by 1, 2;

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where (schemaname = 'public' and tablename like 'glasgow_%')
   or schemaname = 'glasgow_walks_private'
order by schemaname, tablename, policyname;

select table_schema, table_name, grantee, privilege_type
from information_schema.role_table_grants
where grantee in ('PUBLIC', 'anon', 'authenticated') and (
  (table_schema = 'public' and table_name like 'glasgow_%')
  or table_schema = 'glasgow_walks_private')
order by table_schema, table_name, grantee, privilege_type;

select p.proname as function_name, p.prosecdef as security_definer,
       p.proconfig as settings,
       has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in (
  'is_attraction_admin', 'claim_walk_email_send',
  'list_attraction_category_usage', 'remove_attraction_category');

commit;