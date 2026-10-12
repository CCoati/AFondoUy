begin;

alter table public.raffles drop constraint if exists raffles_status_check;
alter table public.raffles add constraint raffles_status_check
  check (status in ('draft','active','paused','closed','drawn','cancelled'));

create table public.platform_settings (
  key text primary key check (key in ('business_name','contact_whatsapp','contact_email','instagram_url','facebook_url')),
  value text not null check (length(value) <= 500),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from public,anon,authenticated,service_role;
grant select on public.platform_settings to authenticated,service_role;
create policy settings_admin_read on public.platform_settings for select to authenticated
  using ((select public.is_admin()));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('raffle-evidence','raffle-evidence',false,5242880,array['application/pdf','image/jpeg','image/png','image/webp']);
create policy admin_evidence_read on storage.objects for select to authenticated
  using(bucket_id='raffle-evidence' and (select public.is_admin()));
create policy admin_evidence_insert on storage.objects for insert to authenticated
  with check(bucket_id='raffle-evidence' and (select public.is_admin()));
create policy admin_evidence_delete on storage.objects for delete to authenticated
  using(bucket_id='raffle-evidence' and (select public.is_admin()));

create function public.admin_update_raffle(
  p_id uuid, p_title text, p_slug text, p_description text, p_terms text,
  p_draw_at timestamptz, p_price integer, p_status text
) returns void
language plpgsql security definer set search_path = '' as $$
declare previous public.raffles;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  select * into previous from public.raffles where id=p_id for update;
  if not found then raise exception 'RAFFLE_UNAVAILABLE'; end if;
  if p_title is null or length(trim(p_title)) not between 2 and 160
    or p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or p_description is null or length(p_description)>5000
    or p_terms is null or length(p_terms)>10000
    or p_price is null or p_price not between 1 and 100000000
    or p_status is null or p_status not in ('draft','active','paused','closed','drawn','cancelled')
    or (p_status='active' and length(trim(p_terms))=0) then
    raise exception 'INVALID_RAFFLE';
  end if;
  if previous.status='drawn' and p_status<>'drawn' then raise exception 'RESULT_STATUS_IMMUTABLE'; end if;
  if exists(select 1 from public.orders where raffle_id=p_id)
    and (previous.price_minor<>p_price or previous.terms<>p_terms) then raise exception 'RAFFLE_HAS_ORDERS'; end if;
  update public.raffles set title=trim(p_title),slug=p_slug,description=p_description,terms=p_terms,
    draw_at=p_draw_at,price_minor=p_price,status=p_status where id=p_id;
  insert into public.audit_events(actor_id,action,entity_id,details)
  values(auth.uid(),'raffle_updated',p_id,jsonb_build_object('status_before',previous.status,'status_after',p_status));
end; $$;

create function public.admin_save_platform_setting(p_key text,p_value text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then raise exception 'OWNER_REQUIRED'; end if;
  if p_key is null or p_key not in ('business_name','contact_whatsapp','contact_email','instagram_url','facebook_url')
    or p_value is null or length(p_value)>500 then raise exception 'INVALID_SETTING'; end if;
  if p_key='contact_email' and p_value<>'' and p_value !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'INVALID_SETTING'; end if;
  if p_key in ('instagram_url','facebook_url') and p_value<>'' and p_value !~ '^https://[^[:space:]]+$' then raise exception 'INVALID_SETTING'; end if;
  insert into public.platform_settings(key,value,updated_by) values(p_key,trim(p_value),auth.uid())
  on conflict(key) do update set value=excluded.value,updated_by=excluded.updated_by,updated_at=now();
  insert into public.audit_events(actor_id,action,entity_id,details)
  values(auth.uid(),'platform_setting_updated',null,jsonb_build_object('key',p_key));
end; $$;

create function public.admin_dashboard_summary(p_days integer default 7) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare summary jsonb;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_days is null or p_days not between 7 and 31 then raise exception 'INVALID_RANGE'; end if;
  select jsonb_build_object(
    'raffles_active',(select count(*) from public.raffles where status='active' and not is_demo),
    'numbers_sold',(select count(*) from public.raffle_numbers n join public.raffles r on r.id=n.raffle_id where n.state='sold' and not r.is_demo),
    'numbers_available',(select count(*) from public.raffle_numbers n join public.raffles r on r.id=n.raffle_id where n.state='available' and not r.is_demo),
    'numbers_blocked',(select count(*) from public.raffle_numbers n join public.raffles r on r.id=n.raffle_id where n.state='blocked' and not r.is_demo),
    'reservations_active',(select count(*) from public.reservations x join public.raffles r on r.id=x.raffle_id where x.status='active' and x.expires_at>now() and not r.is_demo),
    'payments_pending',(select count(*) from public.payments p join public.orders o on o.id=p.order_id join public.raffles r on r.id=o.raffle_id where p.status='pending' and not r.is_demo),
    'orders_paid',(select count(*) from public.orders o join public.raffles r on r.id=o.raffle_id where o.status='paid' and not r.is_demo),
    'revenue_confirmed_minor',(select coalesce(sum(o.total_minor),0) from public.orders o join public.raffles r on r.id=o.raffle_id where o.status='paid' and not r.is_demo),
    'sales_by_day',coalesce((select jsonb_agg(jsonb_build_object('day',d.day_value,'count',coalesce(s.quantity,0),'revenue_minor',coalesce(s.revenue,0)) order by d.day_value)
      from generate_series(current_date-(p_days-1),current_date,interval '1 day') as d(day_value)
      left join (select (o.created_at at time zone 'America/Montevideo')::date sale_date,count(*) quantity,sum(o.total_minor) revenue
        from public.orders o join public.raffles r on r.id=o.raffle_id where o.status='paid' and not r.is_demo
          and o.created_at>=now()-make_interval(days => p_days) group by 1) s on s.sale_date=d.day_value::date),'[]'::jsonb),
    'activity',coalesce((select jsonb_agg(jsonb_build_object('action',a.action,'entity_id',a.entity_id,'created_at',a.created_at) order by a.created_at desc)
      from (select action,entity_id,created_at from public.audit_events order by created_at desc limit 8) a),'[]'::jsonb)
  ) into summary;
  return summary;
end; $$;

create or replace function public.admin_record_result(p_raffle_id uuid,p_number integer,p_drawn_at timestamptz,p_evidence text,p_publish boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.raffles; result_id uuid;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  select * into r from public.raffles where id=p_raffle_id for update;
  if not found or r.status not in('closed','drawn') then raise exception 'RAFFLE_NOT_CLOSED'; end if;
  if p_drawn_at is null or p_drawn_at>now() or p_evidence is null or p_evidence !~ ('^'||p_raffle_id::text||'/[a-zA-Z0-9_-]+\.(pdf|jpg|jpeg|png|webp)$') or p_publish is null then raise exception 'INVALID_RESULT'; end if;
  if not exists(select 1 from storage.objects where bucket_id='raffle-evidence' and name=p_evidence) then raise exception 'EVIDENCE_REQUIRED'; end if;
  if exists(select 1 from public.draw_results where raffle_id=r.id) then raise exception 'RESULT_ALREADY_EXISTS'; end if;
  insert into public.draw_results(raffle_id,winning_number,drawn_at,evidence_path,published_at)
    values(r.id,p_number,p_drawn_at,p_evidence,case when p_publish then now() else null end) returning id into result_id;
  insert into public.winners(result_id,raffle_id,winning_number,verified_by) values(result_id,r.id,p_number,auth.uid());
  update public.raffles set status='drawn',draw_at=p_drawn_at where id=r.id;
  insert into public.audit_events(actor_id,action,entity_id) values(auth.uid(),'result_recorded',result_id);
  return result_id;
end; $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('admin_update_raffle','admin_save_platform_setting','admin_dashboard_summary') loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to authenticated',f.signature);
  end loop;
end $$;

commit;
