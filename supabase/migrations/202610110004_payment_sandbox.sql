begin;

-- Checkout Pro preference identifiers are private server-side integration data.
alter table public.payment_attempts add column provider_preference_id text unique;

create or replace function public.reservation_receipt(p_order_id uuid,p_guest_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare o public.orders; res public.reservations; payment_state text;
begin
  select * into o from public.orders where id=p_order_id and guest_hash=p_guest_hash;
  if not found then raise exception 'RESERVATION_NOT_FOUND'; end if;
  select * into res from public.reservations where order_id=o.id;
  select case
    when exists(select 1 from public.payments where order_id=o.id and status='refunded') then 'refunded'
    when exists(select 1 from public.payments where order_id=o.id and status in('charged_back','review')) then 'review'
    when exists(select 1 from public.payments where order_id=o.id and status='approved') then 'approved'
    when exists(select 1 from public.payment_attempts where order_id=o.id and status='terminal_unpaid') then 'rejected'
    when exists(select 1 from public.payment_attempts where order_id=o.id and status in('creating','pending','unknown')) then 'pending'
    else 'not_started' end into payment_state;
  return jsonb_build_object('orderId',o.id,'raffleId',o.raffle_id,'status',o.status,'reservationStatus',res.status,
    'numberCount',(select number_count from public.raffles where id=o.raffle_id),
    'expiresAt',res.expires_at,'serverNow',clock_timestamp(),'totalMinor',o.total_minor,'subtotalMinor',o.subtotal_minor,
    'discountMinor',o.discount_minor,'currency',o.currency,'breakdown',o.price_breakdown,'paymentStatus',payment_state,
    'numbers',(select jsonb_agg(number order by number) from public.order_items where order_id=o.id));
end;
$$;

create function public.save_sandbox_preference(p_attempt_id uuid,p_preference_id text) returns void
language plpgsql security definer set search_path='' as $$
declare a public.payment_attempts;
begin
  if p_preference_id is null or length(p_preference_id) not between 1 and 200 then raise exception 'INVALID_PREFERENCE';end if;
  select * into a from public.payment_attempts where id=p_attempt_id for update;
  if not found or a.status not in ('creating','pending') then raise exception 'PAYMENT_ATTEMPT_NOT_ACTIVE';end if;
  if a.provider_preference_id is not null and a.provider_preference_id<>p_preference_id then raise exception 'PREFERENCE_ID_CONFLICT';end if;
  update public.payment_attempts set provider_preference_id=p_preference_id,status='pending' where id=p_attempt_id;
end; $$;

-- Refunds and chargebacks never release sold numbers. The transaction remains
-- linked to its confirmed assignment for audit and reconciliation.
create function public.record_verified_payment_adjustment(p_provider_payment_id text,p_state text) returns text
language plpgsql security definer set search_path='' as $$
declare p public.payments; o public.orders;
begin
  if p_provider_payment_id is null or length(p_provider_payment_id) not between 1 and 200 or p_state not in ('refunded','charged_back','review') then raise exception 'INVALID_PAYMENT_ADJUSTMENT';end if;
  select * into p from public.payments where provider_payment_id=p_provider_payment_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND';end if;
  perform 1 from public.raffles where id=(select raffle_id from public.orders where id=p.order_id) for update;
  select * into o from public.orders where id=p.order_id for update;
  if p.status=p_state then return 'unchanged';end if;
  update public.payments set status=p_state where id=p.id;
  if p_state='refunded' and o.status='paid' then update public.orders set status='refunded' where id=o.id;end if;
  if p_state in('charged_back','review') then update public.orders set status='review' where id=o.id;end if;
  return p_state;
end; $$;

-- A refund/chargeback webhook can arrive before the original approval event.
-- In that case record the terminal transaction without ever selling numbers.
create function public.record_unapplied_payment_adjustment(p_attempt_id uuid,p_provider_payment_id text,p_amount integer,p_currency text,p_state text) returns text
language plpgsql security definer set search_path='' as $$
declare a public.payment_attempts; o public.orders; p public.payments;
begin
  if p_provider_payment_id is null or length(p_provider_payment_id) not between 1 and 200
    or p_amount is null or p_amount<1 or p_currency is null or p_state not in('refunded','charged_back') then raise exception 'INVALID_PAYMENT_ADJUSTMENT';end if;
  select * into a from public.payment_attempts where id=p_attempt_id;
  if not found then raise exception 'PAYMENT_ATTEMPT_NOT_FOUND';end if;
  perform 1 from public.raffles where id=(select raffle_id from public.orders where id=a.order_id) for update;
  select * into o from public.orders where id=a.order_id for update;
  select * into p from public.payments where provider_payment_id=p_provider_payment_id for update;
  if found then
    if p.order_id<>o.id or p.amount_minor<>p_amount or p.currency<>p_currency then raise exception 'PAYMENT_ID_CONFLICT';end if;
    if p.status in('refunded','charged_back') then return 'unchanged';end if;
    update public.payments set status=p_state where id=p.id;
  else
    if p_amount<>o.total_minor or p_currency<>o.currency then raise exception 'PAYMENT_AMOUNT_MISMATCH';end if;
    insert into public.payments(order_id,provider_payment_id,status,amount_minor,currency,is_live,verified_at)
    values(o.id,p_provider_payment_id,p_state,p_amount,p_currency,false,now());
  end if;
  if o.status='paid' and p_state='refunded' then update public.orders set status='refunded' where id=o.id;
  elsif o.status='paid' and p_state='charged_back' then update public.orders set status='review' where id=o.id;
  elsif o.status='pending' and a.status in('creating','pending','unknown') then
    update public.payment_attempts set status='terminal_unpaid',verification_reference='terminal:'||p_provider_payment_id,verified_at=now() where id=a.id;
  end if;
  return p_state;
end; $$;

create function public.flag_payment_attempt_review(p_attempt_id uuid,p_evidence text) returns void
language plpgsql security definer set search_path='' as $$
declare a public.payment_attempts; o public.orders;
begin
  if p_evidence is null or length(p_evidence) not between 8 and 240 then raise exception 'INVALID_REVIEW_EVIDENCE';end if;
  select * into a from public.payment_attempts where id=p_attempt_id;
  if not found then raise exception 'PAYMENT_ATTEMPT_NOT_FOUND';end if;
  perform 1 from public.raffles where id=(select raffle_id from public.orders where id=a.order_id) for update;
  select * into o from public.orders where id=a.order_id for update;
  if o.status='paid' then return;end if;
  update public.payment_attempts set status='unknown',verification_reference=p_evidence where id=a.id and status in('creating','pending','unknown');
  update public.orders set status='review' where id=o.id and status='pending';
  if not exists(select 1 from public.payment_checks where order_id=o.id and outcome='uncertain') then
    insert into public.payment_checks(order_id,outcome) values(o.id,'uncertain');
  end if;
end; $$;

revoke all on function public.save_sandbox_preference(uuid,text) from public,anon,authenticated;
revoke all on function public.record_verified_payment_adjustment(text,text) from public,anon,authenticated;
revoke all on function public.record_unapplied_payment_adjustment(uuid,text,integer,text,text) from public,anon,authenticated;
revoke all on function public.flag_payment_attempt_review(uuid,text) from public,anon,authenticated;
grant execute on function public.save_sandbox_preference(uuid,text) to service_role;
grant execute on function public.record_verified_payment_adjustment(text,text) to service_role;
grant execute on function public.record_unapplied_payment_adjustment(uuid,text,integer,text,text) to service_role;
grant execute on function public.flag_payment_attempt_review(uuid,text) to service_role;

commit;
