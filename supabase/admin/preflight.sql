-- Read-only impact assessment before applying new migrations to an existing project.
select current_database() as database_name,current_user as database_role,version();
select schemaname,tablename,rowsecurity from pg_tables where schemaname='public' order by tablename;
select conrelid::regclass as relation,conname,pg_get_constraintdef(oid) as definition
from pg_constraint where connamespace='public'::regnamespace order by conrelid::regclass::text,conname;
select schemaname,tablename,policyname,roles,cmd from pg_policies where schemaname in('public','storage') order by schemaname,tablename,policyname;
select pubname,schemaname,tablename from pg_publication_tables order by pubname,schemaname,tablename;
-- If the base schema already exists, also assess counts and unresolved business states.
-- select status,count(*) from public.orders group by status;
-- select state,count(*) from public.raffle_numbers group by state;
-- select status,is_live,count(*) from public.payments group by status,is_live;
-- Never export participants/phones/emails to diagnose migration readiness.
