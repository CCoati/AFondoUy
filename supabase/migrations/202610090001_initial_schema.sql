-- Initial schema only. Reservation/payment transactions are not implemented yet.
-- Apply to a NEW Supabase development project, then test RLS before real data.
begin;

create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admin_users where user_id = (select auth.uid()));
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create table public.raffles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (length(title) between 1 and 160),
  description text not null default '',
  terms text not null default '',
  status text not null default 'draft' check (status in ('draft','active','closed','drawn','cancelled')),
  currency text not null default 'UYU' check (currency = 'UYU'),
  price_minor integer not null default 100000 check (price_minor between 1 and 100000000),
  number_count integer not null default 200 check (number_count between 1 and 10000),
  image_path text,
  draw_at timestamptz,
  created_at timestamptz not null default now(),
  check (status = 'draft' or length(trim(terms)) > 0)
);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(full_name) between 2 and 160),
  email text not null check (length(email) between 3 and 254),
  phone text not null check (length(phone) between 6 and 32),
  privacy_version text not null,
  created_at timestamptz not null default now()
);

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  raffle_id uuid not null references public.raffles(id),
  name text not null,
  quantity integer not null check (quantity between 2 and 20),
  bundle_price_minor integer not null check (bundle_price_minor > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  enabled boolean not null default false,
  check (ends_at > starts_at),
  unique (id, raffle_id)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  raffle_id uuid not null references public.raffles(id),
  participant_id uuid not null references public.participants(id),
  promotion_id uuid,
  idempotency_key uuid not null unique,
  status text not null default 'pending' check (status in ('pending','paid','expired','cancelled','review','refunded')),
  currency text not null default 'UYU' check (currency = 'UYU'),
  subtotal_minor integer not null check (subtotal_minor > 0),
  discount_minor integer not null default 0 check (discount_minor >= 0),
  total_minor integer not null check (total_minor > 0),
  terms_version text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (expires_at > created_at),
  check (discount_minor < subtotal_minor and total_minor = subtotal_minor - discount_minor),
  unique (id, raffle_id),
  foreign key (promotion_id, raffle_id) references public.promotions(id, raffle_id)
);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  raffle_id uuid not null references public.raffles(id),
  order_id uuid not null unique,
  status text not null default 'active' check (status in ('active','expired','converted','cancelled')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (expires_at > created_at),
  unique (id, raffle_id),
  foreign key (order_id, raffle_id) references public.orders(id, raffle_id)
);

create table public.raffle_numbers (
  raffle_id uuid not null references public.raffles(id),
  number integer not null check (number between 1 and 10000),
  state text not null default 'available' check (state in ('available','reserved','sold')),
  reservation_id uuid,
  primary key (raffle_id, number),
  foreign key (reservation_id, raffle_id) references public.reservations(id, raffle_id),
  check ((state = 'available' and reservation_id is null) or (state in ('reserved','sold') and reservation_id is not null))
);

create function public.check_number_range() returns trigger
language plpgsql set search_path = '' as $$
declare max_number integer;
begin
  select number_count into max_number from public.raffles where id = new.raffle_id for share;
  if max_number is null or new.number > max_number then
    raise exception 'Number outside raffle range';
  end if;
  return new;
end;
$$;
create trigger raffle_number_range before insert or update on public.raffle_numbers
for each row execute function public.check_number_range();

create function public.lock_raffle_configuration() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.number_count <> old.number_count and exists (select 1 from public.raffle_numbers where raffle_id = old.id) then
    raise exception 'Number count cannot change after numbers have been generated';
  end if;
  if exists (select 1 from public.orders where raffle_id = old.id) and
    (new.price_minor <> old.price_minor or new.terms <> old.terms) then
    raise exception 'Price and terms cannot change after orders exist';
  end if;
  return new;
end;
$$;
create trigger raffle_configuration before update on public.raffles
for each row execute function public.lock_raffle_configuration();

create table public.order_items (
  order_id uuid not null,
  raffle_id uuid not null,
  number integer not null,
  unit_price_minor integer not null check (unit_price_minor > 0),
  primary key (order_id, number),
  foreign key (order_id, raffle_id) references public.orders(id, raffle_id),
  foreign key (raffle_id, number) references public.raffle_numbers(raffle_id, number)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  provider text not null default 'mercadopago' check (provider = 'mercadopago'),
  provider_payment_id text not null unique,
  status text not null check (status in ('pending','approved','rejected','refunded','charged_back','review')),
  amount_minor integer not null check (amount_minor > 0),
  currency text not null check (currency = 'UYU'),
  is_live boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider_event_id text not null unique,
  provider_payment_id text not null,
  state text not null default 'received' check (state in ('received','processed','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create table public.draw_results (
  id uuid primary key default gen_random_uuid(),
  raffle_id uuid not null unique references public.raffles(id),
  winning_number integer not null,
  drawn_at timestamptz not null,
  evidence_path text not null,
  published_at timestamptz,
  foreign key (raffle_id, winning_number) references public.raffle_numbers(raffle_id, number)
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_id uuid,
  created_at timestamptz not null default now()
);

create index raffles_public_list on public.raffles(status, created_at desc);
create index orders_participant on public.orders(participant_id);
create index orders_raffle on public.orders(raffle_id);
create index orders_expiry on public.orders(expires_at) where status = 'pending';
create index reservations_expiry on public.reservations(expires_at) where status = 'active';
create index numbers_reservation on public.raffle_numbers(reservation_id);
create index payments_order on public.payments(order_id);
create index webhook_processing on public.webhook_events(state, received_at);

-- Explicit read-only grants. Browser clients cannot write to any business table.
do $$
declare table_name text;
begin
  foreach table_name in array array['admin_users','raffles','participants','promotions','orders','reservations','raffle_numbers','order_items','payments','webhook_events','draw_results','audit_events'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant select on public.%I to authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
    if table_name <> 'admin_users' then
      execute format('create policy admin_read on public.%I for select to authenticated using ((select public.is_admin()))', table_name);
    end if;
  end loop;
end;
$$;

create policy own_admin_membership on public.admin_users for select to authenticated
using (user_id = (select auth.uid()));

grant select on public.raffles to anon;
create policy published_raffles on public.raffles for select to anon, authenticated
using (status in ('active','closed','drawn'));

grant select (raffle_id, number, state) on public.raffle_numbers to anon;
create policy published_numbers on public.raffle_numbers for select to anon, authenticated
using (exists (select 1 from public.raffles r where r.id = raffle_id and r.status in ('active','closed','drawn')));

-- No public reservation_id, even for authenticated non-admins.
revoke select on public.raffle_numbers from authenticated;
grant select (raffle_id, number, state) on public.raffle_numbers to authenticated;

grant select on public.promotions to anon;
create policy current_promotions on public.promotions for select to anon, authenticated
using (enabled and starts_at <= now() and ends_at > now() and exists (
  select 1 from public.raffles r where r.id = raffle_id and r.status = 'active'
));

grant select on public.draw_results to anon;
create policy published_results on public.draw_results for select to anon, authenticated
using (published_at is not null and published_at <= now() and exists (
  select 1 from public.raffles r where r.id = raffle_id and r.status = 'drawn'
));

-- Private staging bucket. Public image publishing is a separate reviewed workflow.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('raffle-images', 'raffle-images', false, 5242880, array['image/jpeg','image/png','image/webp']);
create policy admin_image_read on storage.objects for select to authenticated
using (bucket_id = 'raffle-images' and (select public.is_admin()));
create policy admin_image_insert on storage.objects for insert to authenticated
with check (bucket_id = 'raffle-images' and (select public.is_admin()));
create policy admin_image_update on storage.objects for update to authenticated
using (bucket_id = 'raffle-images' and (select public.is_admin()))
with check (bucket_id = 'raffle-images' and (select public.is_admin()));
create policy admin_image_delete on storage.objects for delete to authenticated
using (bucket_id = 'raffle-images' and (select public.is_admin()));

commit;
