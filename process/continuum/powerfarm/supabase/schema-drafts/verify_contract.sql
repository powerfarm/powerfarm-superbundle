-- Read-only verification query for a deployed Continuum schema.
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'continuum'
  and c.relkind in ('r','p')
order by c.relname;

select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'continuum'
  and grantee in ('anon','authenticated')
order by grantee, table_name, privilege_type;
