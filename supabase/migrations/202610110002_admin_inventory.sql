begin;

create function public.admin_save_promotion(p_id uuid,p_raffle_id uuid,p_name text,p_quantity integer,p_total integer,
  p_starts timestamptz,p_ends timestamptz,p_enabled boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare promotion_id uuid; unit_price integer;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  select price_minor into unit_price from public.raffles where id=p_raffle_id for update;
  if not found then raise exception 'RAFFLE_UNAVAILABLE'; end if;
  if p_name is null or length(trim(p_name)) not between 2 and 100 or p_quantity is null or p_quantity not between 2 and 20
    or p_total is null or p_total<1 or p_total>=unit_price::bigint*p_quantity or p_starts is null or p_ends is null or p_ends<=p_starts then
    raise exception 'INVALID_PROMOTION';
  end if;
  if p_id is null then
    insert into public.promotions(raffle_id,name,quantity,bundle_price_minor,starts_at,ends_at,enabled)
    values(p_raffle_id,trim(p_name),p_quantity,p_total,p_starts,p_ends,p_enabled) returning id into promotion_id;
  else
    update public.promotions set name=trim(p_name),quantity=p_quantity,bundle_price_minor=p_total,starts_at=p_starts,ends_at=p_ends,enabled=p_enabled
    where id=p_id and raffle_id=p_raffle_id returning id into promotion_id;
    if not found then raise exception 'PROMOTION_NOT_FOUND'; end if;
  end if;
  insert into public.audit_events(actor_id,action,entity_id) values(auth.uid(),'promotion_saved',promotion_id);
  return promotion_id;
end;
$$;

create function public.admin_toggle_promotion(p_id uuid,p_enabled boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  perform 1 from public.raffles where id=(select raffle_id from public.promotions where id=p_id) for update;
  update public.promotions set enabled=p_enabled where id=p_id;
  if not found then raise exception 'PROMOTION_NOT_FOUND'; end if;
  insert into public.audit_events(actor_id,action,entity_id) values(auth.uid(),case when p_enabled then 'promotion_enabled' else 'promotion_disabled' end,p_id);
end;
$$;

create function public.admin_set_blocked(p_raffle_id uuid,p_numbers integer[],p_blocked boolean,p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare total integer;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_numbers is null or cardinality(p_numbers)<1 or cardinality(p_numbers)>200 or p_reason is null or length(trim(p_reason)) not between 3 and 300 then raise exception 'INVALID_NUMBERS'; end if;
  perform 1 from public.raffles where id=p_raffle_id for update;
  perform 1 from public.raffle_numbers where raffle_id=p_raffle_id and number=any(p_numbers) order by number for update;
  select count(*) into total from public.raffle_numbers where raffle_id=p_raffle_id and number=any(p_numbers) and state in ('available','blocked');
  if total<>cardinality(p_numbers) then raise exception 'NUMBERS_UNAVAILABLE'; end if;
  if p_blocked then
    insert into public.number_blocks(raffle_id,number,reason,actor_id) select p_raffle_id,x,trim(p_reason),auth.uid() from unnest(p_numbers) x
    on conflict(raffle_id,number) do update set reason=excluded.reason,actor_id=excluded.actor_id,created_at=now();
  else delete from public.number_blocks where raffle_id=p_raffle_id and number=any(p_numbers);
  end if;
  update public.raffle_numbers set state=case when p_blocked then 'blocked' else 'available' end where raffle_id=p_raffle_id and number=any(p_numbers);
  insert into public.audit_events(actor_id,action,entity_id) values(auth.uid(),case when p_blocked then 'numbers_blocked' else 'numbers_unblocked' end,p_raffle_id);
end;
$$;

create function public.admin_configure_inventory(p_raffle_id uuid,p_count integer,p_minutes integer) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.raffles;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_count is null or p_count not between 1 and 10000 or p_minutes is null or p_minutes not between 1 and 60 then raise exception 'INVALID_CONFIGURATION'; end if;
  select * into r from public.raffles where id=p_raffle_id for update;
  if not found then raise exception 'RAFFLE_UNAVAILABLE'; end if;
  if r.number_count<>p_count then
    if exists(select 1 from public.orders where raffle_id=r.id) or exists(select 1 from public.raffle_numbers where raffle_id=r.id and state<>'available') then raise exception 'INVENTORY_IN_USE'; end if;
    delete from public.raffle_numbers where raffle_id=r.id;
  end if;
  update public.raffles set number_count=p_count,reservation_minutes=p_minutes where id=r.id;
  insert into public.raffle_numbers(raffle_id,number) select r.id,n from generate_series(1,p_count) n on conflict do nothing;
  insert into public.audit_events(actor_id,action,entity_id) values(auth.uid(),'inventory_configured',r.id);
end;
$$;

create function public.admin_create_raffle(p_title text,p_slug text,p_count integer,p_price integer,p_minutes integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare raffle_id uuid;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_title is null or length(trim(p_title)) not between 2 and 160 or p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or p_count is null or p_count not between 1 and 10000 or p_price is null or p_price not between 1 and 100000000
    or p_minutes is null or p_minutes not between 1 and 60 then raise exception 'INVALID_CONFIGURATION'; end if;
  insert into public.raffles(title,slug,number_count,price_minor,reservation_minutes) values(trim(p_title),p_slug,p_count,p_price,p_minutes) returning id into raffle_id;
  insert into public.raffle_numbers(raffle_id,number) select raffle_id,n from generate_series(1,p_count) n;
  insert into public.audit_events(actor_id,action,entity_id) values(auth.uid(),'raffle_created',raffle_id);
  return raffle_id;
end;
$$;

do $$ declare proc record; begin
  for proc in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('admin_save_promotion','admin_toggle_promotion','admin_set_blocked','admin_configure_inventory','admin_create_raffle') loop
    execute format('revoke all on function %s from public,anon',proc.signature);
    execute format('grant execute on function %s to authenticated',proc.signature);
  end loop;
end; $$;
commit;
