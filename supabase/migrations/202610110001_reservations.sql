-- Atomic inventory, server pricing, safe expiration and immutable confirmations.
begin;

alter table public.raffles add column reservation_minutes integer not null default 10 check (reservation_minutes between 1 and 60);
alter table public.orders add column guest_hash text;
alter table public.orders add column request_fingerprint text;
alter table public.orders add column price_breakdown jsonb not null default '[]';
alter table public.orders add constraint guest_hash_format check (guest_hash is null or guest_hash ~ '^[a-f0-9]{64}$');
create unique index one_open_order_per_guest_raffle on public.orders(guest_hash, raffle_id)
where guest_hash is not null and status = 'pending';

alter table public.raffle_numbers drop constraint raffle_numbers_state_check;
alter table public.raffle_numbers drop constraint raffle_numbers_check;
alter table public.raffle_numbers add constraint number_state_valid check (state in ('available','reserved','sold','blocked'));
alter table public.raffle_numbers add constraint number_owner_valid check (
  (state in ('available','blocked') and reservation_id is null) or
  (state in ('reserved','sold') and reservation_id is not null)
);

create table public.confirmed_numbers (
  raffle_id uuid not null,
  number integer not null,
  order_id uuid not null,
  participant_id uuid not null references public.participants(id),
  confirmed_at timestamptz not null default now(),
  primary key (raffle_id, number),
  foreign key (raffle_id, number) references public.raffle_numbers(raffle_id, number),
  foreign key (order_id, raffle_id) references public.orders(id, raffle_id)
);

create table public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  status text not null default 'creating' check (status in ('creating','pending','unknown','approved','terminal_unpaid')),
  external_reference text not null unique,
  verification_reference text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  check (status <> 'terminal_unpaid' or (verified_at is not null and length(verification_reference) >= 8))
);
create unique index one_unresolved_payment_attempt on public.payment_attempts(order_id) where status in ('creating','pending','unknown');
create index payment_attempt_order on public.payment_attempts(order_id);

create table public.reconciliation_cases (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  payment_id uuid not null unique references public.payments(id),
  reason text not null check (reason in ('late_payment','amount_mismatch','duplicate_payment')),
  status text not null default 'refund_required' check (status in ('refund_required','review','resolved')),
  note text,
  created_at timestamptz not null default now()
);
alter table public.payments drop constraint payments_currency_check;
alter table public.payments add constraint payment_currency_valid check (currency ~ '^[A-Z]{3}$');
create table public.payment_checks (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  outcome text not null check (outcome in ('no_attempt','terminal_unpaid','uncertain')),
  checked_at timestamptz not null default now()
);
create table public.number_blocks (
  raffle_id uuid not null,
  number integer not null,
  reason text not null check (length(reason) between 3 and 300),
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (raffle_id, number),
  foreign key (raffle_id, number) references public.raffle_numbers(raffle_id, number)
);
create table public.reservation_limits (
  guest_hash text primary key,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0
);

-- A separate safe projection is the ONLY inventory table published to Realtime.
create table public.number_availability (
  raffle_id uuid not null references public.raffles(id),
  number integer not null,
  state text not null check (state in ('available','reserved','sold','blocked')),
  revision bigint not null default 1,
  primary key (raffle_id, number)
);
insert into public.number_availability(raffle_id,number,state) select raffle_id,number,state from public.raffle_numbers;

create function public.sync_number_availability() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    delete from public.number_availability where raffle_id = old.raffle_id and number = old.number;
    return old;
  end if;
  insert into public.number_availability(raffle_id,number,state) values(new.raffle_id,new.number,new.state)
  on conflict(raffle_id,number) do update set state=excluded.state, revision=public.number_availability.revision+1;
  return new;
end;
$$;
create trigger sync_number_availability after insert or update or delete on public.raffle_numbers
for each row execute function public.sync_number_availability();

create function public.protect_confirmed_number() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'confirmed_numbers' then raise exception 'CONFIRMED_IMMUTABLE'; end if;
  if old.state = 'sold' and (tg_op = 'DELETE' or new.state <> 'sold' or new.reservation_id is distinct from old.reservation_id or new.raffle_id <> old.raffle_id or new.number <> old.number) then
    raise exception 'CONFIRMED_IMMUTABLE';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
create trigger confirmed_immutable before update or delete on public.confirmed_numbers for each row execute function public.protect_confirmed_number();
create trigger sold_immutable before update or delete on public.raffle_numbers for each row execute function public.protect_confirmed_number();

create function public.verify_confirmed_number() returns trigger
language plpgsql set search_path = '' as $$
declare n public.raffle_numbers; owner_order uuid;
begin
  select * into n from public.raffle_numbers where raffle_id=new.raffle_id and number=new.number;
  if n.state='sold' or tg_table_name='confirmed_numbers' then
    select order_id into owner_order from public.reservations where id=n.reservation_id;
    if n.state <> 'sold' or not exists (
      select 1 from public.confirmed_numbers c join public.orders o on o.id=c.order_id
      where c.raffle_id=n.raffle_id and c.number=n.number and c.order_id=owner_order and c.participant_id=o.participant_id and o.status='paid'
    ) then raise exception 'CONFIRMATION_INVARIANT'; end if;
  end if;
  return new;
end;
$$;
create constraint trigger sold_assignment after insert or update on public.raffle_numbers
deferrable initially deferred for each row execute function public.verify_confirmed_number();
create constraint trigger confirmation_assignment after insert on public.confirmed_numbers
deferrable initially deferred for each row execute function public.verify_confirmed_number();

-- Dynamic programming: best combination of repeatable packs + individual units.
create function public.quote_numbers(p_raffle_id uuid,p_quantity integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.raffles; costs bigint[] := array[0::bigint]; paths jsonb[] := array['[]'::jsonb];
  i integer; pack record; candidate bigint; best bigint; detail jsonb;
begin
  if p_quantity is null or p_quantity < 0 or p_quantity > 20 then raise exception 'INVALID_QUANTITY'; end if;
  select * into r from public.raffles where id=p_raffle_id;
  if not found or r.status <> 'active' then raise exception 'RAFFLE_UNAVAILABLE'; end if;
  for i in 1..p_quantity loop
    best := costs[i]+r.price_minor;
    detail := paths[i] || jsonb_build_array(jsonb_build_object('name','Número individual','quantity',1,'totalMinor',r.price_minor));
    for pack in select * from public.promotions where raffle_id=r.id and enabled and starts_at<=now() and ends_at>now() and quantity<=i order by id loop
      candidate := costs[i-pack.quantity+1]+pack.bundle_price_minor;
      if candidate < best then
        best := candidate;
        detail := paths[i-pack.quantity+1] || jsonb_build_array(jsonb_build_object('id',pack.id,'name',pack.name,'quantity',pack.quantity,'totalMinor',pack.bundle_price_minor));
      end if;
    end loop;
    costs[i+1] := best; paths[i+1] := detail;
  end loop;
  return jsonb_build_object('quantity',p_quantity,'unitPriceMinor',r.price_minor,'subtotalMinor',r.price_minor::bigint*p_quantity,
    'totalMinor',costs[p_quantity+1],'discountMinor',r.price_minor::bigint*p_quantity-costs[p_quantity+1],
    'currency','UYU','breakdown',paths[p_quantity+1],'reservationMinutes',r.reservation_minutes);
end;
$$;

create function public.reservation_receipt(p_order_id uuid,p_guest_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare o public.orders; res public.reservations;
begin
  select * into o from public.orders where id=p_order_id and guest_hash=p_guest_hash;
  if not found then raise exception 'RESERVATION_NOT_FOUND'; end if;
  select * into res from public.reservations where order_id=o.id;
  return jsonb_build_object('orderId',o.id,'raffleId',o.raffle_id,'status',o.status,'reservationStatus',res.status,
    'numberCount',(select number_count from public.raffles where id=o.raffle_id),
    'expiresAt',res.expires_at,'serverNow',clock_timestamp(),'totalMinor',o.total_minor,'subtotalMinor',o.subtotal_minor,
    'discountMinor',o.discount_minor,'currency',o.currency,'breakdown',o.price_breakdown,
    'numbers',(select jsonb_agg(number order by number) from public.order_items where order_id=o.id));
end;
$$;

create function public.reserve_numbers(p_raffle_id uuid,p_numbers integer[],p_guest_hash text,p_idempotency_key uuid,
  p_fingerprint text,p_expected_total integer,p_name text,p_email text,p_phone text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.raffles; existing public.orders; q jsonb; participant uuid; order_uuid uuid:=gen_random_uuid();
  reservation_uuid uuid:=gen_random_uuid(); expiry timestamptz; limit_row public.reservation_limits; n integer;
begin
  if p_guest_hash is null or p_guest_hash !~ '^[a-f0-9]{64}$' or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$'
    or p_idempotency_key is null then raise exception 'INVALID_SESSION'; end if;
  if p_numbers is null or cardinality(p_numbers)<1 or cardinality(p_numbers)>20
    or cardinality(p_numbers)<>(select count(distinct x) from unnest(p_numbers) x) then raise exception 'INVALID_NUMBERS'; end if;
  if p_name is null or length(trim(p_name)) not between 2 and 160 or p_email is null or length(p_email) not between 3 and 254
    or p_phone is null or length(p_phone) not between 6 and 32 then raise exception 'INVALID_CONTACT'; end if;
  perform pg_advisory_xact_lock(hashtextextended('guest:'||p_guest_hash,0));
  perform pg_advisory_xact_lock(hashtextextended('idem:'||p_idempotency_key::text,0));
  select * into existing from public.orders where idempotency_key=p_idempotency_key;
  if found then
    if existing.guest_hash<>p_guest_hash or existing.request_fingerprint<>p_fingerprint then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return public.reservation_receipt(existing.id,p_guest_hash);
  end if;
  select * into r from public.raffles where id=p_raffle_id for update;
  if not found or r.status<>'active' then raise exception 'RAFFLE_UNAVAILABLE'; end if;
  if exists(select 1 from unnest(p_numbers) x where x<1 or x>r.number_count) then raise exception 'INVALID_NUMBERS'; end if;
  if exists(select 1 from public.orders o join public.reservations s on s.order_id=o.id where o.guest_hash=p_guest_hash and o.raffle_id=r.id and s.status='active') then raise exception 'ACTIVE_RESERVATION_EXISTS'; end if;
  insert into public.reservation_limits(guest_hash) values(p_guest_hash) on conflict do nothing;
  select * into limit_row from public.reservation_limits where guest_hash=p_guest_hash for update;
  if limit_row.window_started_at < now()-interval '1 hour' then
    update public.reservation_limits set attempts=0,window_started_at=now() where guest_hash=p_guest_hash;
    limit_row.attempts:=0;
  end if;
  if limit_row.attempts>=6 then raise exception 'RATE_LIMITED'; end if;
  -- Lock in ascending order; never opportunistically release an expired payment here.
  perform 1 from public.raffle_numbers where raffle_id=r.id and number=any(p_numbers) order by number for update;
  select count(*) into n from public.raffle_numbers where raffle_id=r.id and number=any(p_numbers) and state='available';
  if n<>cardinality(p_numbers) then raise exception 'NUMBERS_UNAVAILABLE'; end if;
  q:=public.quote_numbers(r.id,cardinality(p_numbers));
  if p_expected_total is null or p_expected_total<>(q->>'totalMinor')::integer then raise exception 'PRICE_CHANGED'; end if;
  expiry:=now()+make_interval(mins=>r.reservation_minutes);
  insert into public.participants(full_name,email,phone,privacy_version) values(trim(p_name),lower(trim(p_email)),trim(p_phone),'reservation-v1') returning id into participant;
  insert into public.orders(id,raffle_id,participant_id,idempotency_key,guest_hash,request_fingerprint,subtotal_minor,discount_minor,total_minor,price_breakdown,terms_version,expires_at)
  values(order_uuid,r.id,participant,p_idempotency_key,p_guest_hash,p_fingerprint,(q->>'subtotalMinor')::integer,(q->>'discountMinor')::integer,(q->>'totalMinor')::integer,q->'breakdown','reservation-v1',expiry);
  insert into public.reservations(id,raffle_id,order_id,expires_at) values(reservation_uuid,r.id,order_uuid,expiry);
  insert into public.order_items(order_id,raffle_id,number,unit_price_minor) select order_uuid,r.id,x,r.price_minor from unnest(p_numbers) x;
  update public.raffle_numbers set state='reserved',reservation_id=reservation_uuid where raffle_id=r.id and number=any(p_numbers);
  update public.reservation_limits set attempts=attempts+1 where guest_hash=p_guest_hash;
  return public.reservation_receipt(order_uuid,p_guest_hash);
end;
$$;

-- Must be called BEFORE any network request that can create a payment.
create function public.begin_payment_attempt(p_order_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare o public.orders; attempt uuid;
begin
  perform 1 from public.raffles where id=(select raffle_id from public.orders where id=p_order_id) for update;
  select * into o from public.orders where id=p_order_id for update;
  if not found or o.status<>'pending' or o.expires_at<=now() then raise exception 'RESERVATION_NOT_PAYABLE'; end if;
  select id into attempt from public.payment_attempts where order_id=o.id and status<>'terminal_unpaid';
  if found then return attempt; end if;
  insert into public.payment_attempts(order_id,external_reference) values(o.id,o.id::text||':'||gen_random_uuid()::text) returning id into attempt;
  return attempt;
end;
$$;

-- Only a trusted provider adapter can attest a TERMINAL unpaid state, never the browser.
create function public.record_verified_unpaid(p_attempt_id uuid,p_evidence text) returns void
language plpgsql security definer set search_path = '' as $$
declare attempt public.payment_attempts;
begin
  if p_evidence is null or length(p_evidence)<8 then raise exception 'VERIFICATION_REQUIRED'; end if;
  perform 1 from public.raffles where id=(select o.raffle_id from public.orders o join public.payment_attempts a on a.order_id=o.id where a.id=p_attempt_id) for update;
  select * into attempt from public.payment_attempts where id=p_attempt_id for update;
  if not found or attempt.status='approved' or exists(select 1 from public.payments where order_id=attempt.order_id and status='approved') then raise exception 'PAYMENT_ALREADY_APPROVED'; end if;
  update public.payment_attempts set status='terminal_unpaid',verification_reference=p_evidence,verified_at=now() where id=attempt.id;
end;
$$;

create function public.expire_unpaid_order(p_order_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare o public.orders; res public.reservations; outcome text;
begin
  perform 1 from public.raffles where id=(select raffle_id from public.orders where id=p_order_id) for update;
  select * into o from public.orders where id=p_order_id for update;
  if not found or o.status not in ('pending','review') or o.expires_at>now() then return 'unchanged'; end if;
  select * into res from public.reservations where order_id=o.id for update;
  if res.status<>'active' then return 'unchanged'; end if;
  if exists(select 1 from public.payment_attempts where order_id=o.id and status<>'terminal_unpaid') or
    exists(select 1 from public.payments where order_id=o.id and status not in ('rejected','refunded')) then
    update public.orders set status='review' where id=o.id;
    if not exists(select 1 from public.payment_checks c where c.order_id=o.id and c.outcome='uncertain') then
      insert into public.payment_checks(order_id,outcome) values(o.id,'uncertain');
    end if;
    return 'held_for_payment_verification';
  end if;
  outcome:=case when exists(select 1 from public.payment_attempts where order_id=o.id) then 'terminal_unpaid' else 'no_attempt' end;
  insert into public.payment_checks(order_id,outcome) values(o.id,outcome);
  perform 1 from public.raffle_numbers where reservation_id=res.id order by number for update;
  update public.raffle_numbers set state='available',reservation_id=null where reservation_id=res.id and state='reserved';
  update public.reservations set status='expired' where id=res.id;
  update public.orders set status='expired' where id=o.id;
  return 'expired';
end;
$$;

create function public.expire_reservations(p_limit integer default 50) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare item record; outcome text; result jsonb:='[]';
begin
  if p_limit<1 or p_limit>200 then raise exception 'INVALID_LIMIT'; end if;
  for item in select id from public.orders where (status='pending' or (status='review'
    and not exists(select 1 from public.payment_attempts where order_id=orders.id and status<>'terminal_unpaid')
    and not exists(select 1 from public.payments where order_id=orders.id and status not in ('rejected','refunded')))) and expires_at<=now()
    and exists(select 1 from public.reservations where order_id=orders.id and status='active')
    order by raffle_id,id limit p_limit loop
    outcome:=public.expire_unpaid_order(item.id);
    result:=result||jsonb_build_array(jsonb_build_object('orderId',item.id,'outcome',outcome));
  end loop;
  return result;
end;
$$;

create function public.apply_verified_payment(p_attempt_id uuid,p_provider_id text,p_amount integer,p_currency text,p_is_live boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare attempt public.payment_attempts; o public.orders; res public.reservations; payment public.payments;
  reason text; owned integer; required integer;
begin
  if p_provider_id is null or length(p_provider_id)<1 or p_amount is null or p_amount<1 or p_currency is null then raise exception 'INVALID_PAYMENT'; end if;
  perform pg_advisory_xact_lock(hashtextextended('payment:'||p_provider_id,0));
  select * into attempt from public.payment_attempts where id=p_attempt_id;
  if not found then raise exception 'PAYMENT_ATTEMPT_NOT_FOUND'; end if;
  perform 1 from public.raffles where id=(select raffle_id from public.orders where id=attempt.order_id) for update;
  select * into o from public.orders where id=attempt.order_id for update;
  select * into payment from public.payments where provider_payment_id=p_provider_id;
  if found then
    if payment.order_id<>o.id or payment.amount_minor<>p_amount or payment.currency<>p_currency then raise exception 'PAYMENT_ID_CONFLICT'; end if;
    return jsonb_build_object('status',case when exists(select 1 from public.reconciliation_cases where payment_id=payment.id) then 'refund_required' when o.status='paid' then 'confirmed' else 'review' end,'orderId',o.id);
  end if;
  insert into public.payments(order_id,provider_payment_id,status,amount_minor,currency,is_live,verified_at)
  values(o.id,p_provider_id,'approved',p_amount,p_currency,p_is_live,now()) returning * into payment;
  select * into res from public.reservations where order_id=o.id for update;
  perform 1 from public.raffle_numbers where raffle_id=o.raffle_id and number in(select number from public.order_items where order_id=o.id) order by number for update;
  select count(*) into required from public.order_items where order_id=o.id;
  select count(*) into owned from public.raffle_numbers where reservation_id=res.id and state='reserved';
  if o.status='paid' then reason:='duplicate_payment';
  elsif p_amount<>o.total_minor or p_currency<>o.currency then reason:='amount_mismatch';
  elsif res.status<>'active' or o.status not in ('pending','review') or owned<>required or required=0 then reason:='late_payment';
  end if;
  update public.payment_attempts set status='approved',verified_at=now(),verification_reference=p_provider_id where id=attempt.id;
  if reason is not null then
    insert into public.reconciliation_cases(order_id,payment_id,reason) values(o.id,payment.id,reason);
    if o.status<>'paid' then update public.orders set status='review' where id=o.id; end if;
    return jsonb_build_object('status','refund_required','reason',reason,'orderId',o.id);
  end if;
  insert into public.confirmed_numbers(raffle_id,number,order_id,participant_id)
    select raffle_id,number,o.id,o.participant_id from public.order_items where order_id=o.id;
  update public.raffle_numbers set state='sold' where reservation_id=res.id and state='reserved';
  update public.reservations set status='converted' where id=res.id;
  update public.orders set status='paid' where id=o.id;
  return jsonb_build_object('status','confirmed','orderId',o.id);
end;
$$;

-- Backfill configured inventory; no fabricated orders, customers or sold numbers.
insert into public.raffle_numbers(raffle_id,number)
select r.id,n from public.raffles r cross join lateral generate_series(1,r.number_count) n on conflict do nothing;

do $$
declare table_name text; proc record;
begin
  foreach table_name in array array['confirmed_numbers','payment_attempts','reconciliation_cases','payment_checks','number_blocks','reservation_limits','number_availability'] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('revoke all on public.%I from anon,authenticated',table_name);
    execute format('grant all on public.%I to service_role',table_name);
    if table_name not in ('reservation_limits','number_availability') then
      execute format('grant select on public.%I to authenticated',table_name);
      execute format('create policy admin_read on public.%I for select to authenticated using ((select public.is_admin()))',table_name);
    end if;
  end loop;
  for proc in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('sync_number_availability','protect_confirmed_number','verify_confirmed_number','quote_numbers','reservation_receipt','reserve_numbers','begin_payment_attempt','record_verified_unpaid','expire_unpaid_order','expire_reservations','apply_verified_payment') loop
    execute format('revoke all on function %s from public,anon,authenticated',proc.signature);
    execute format('grant execute on function %s to service_role',proc.signature);
  end loop;
end;
$$;
grant select on public.number_availability to anon,authenticated;
create policy public_inventory on public.number_availability for select to anon,authenticated using (
  exists(select 1 from public.raffles r where r.id=raffle_id and r.status in ('active','closed','drawn'))
);
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    alter publication supabase_realtime add table public.number_availability;
  end if;
end; $$;
commit;
