begin;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check(length(display_name)<=100),
  role text not null default 'viewer' check(role in('viewer','admin','owner')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Metadata supplied during signup is deliberately ignored, including role/display_name.
insert into public.profiles(user_id) select id from auth.users;
update public.profiles set role='admin' where user_id in(select user_id from public.admin_users);
create function public.create_auth_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.profiles(user_id) values(new.id);return new;end; $$;
create trigger auth_user_profile after insert on auth.users for each row execute function public.create_auth_profile();
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles where user_id=(select auth.uid()) and is_active and role in('admin','owner'));
$$;
create function public.is_owner() returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles where user_id=(select auth.uid()) and is_active and role='owner');
$$;
alter table public.profiles enable row level security;
revoke all on public.profiles from public,anon,authenticated,service_role;
grant select on public.profiles to authenticated,service_role;
create policy profile_self on public.profiles for select to authenticated using(user_id=(select auth.uid()));
create policy profiles_admin on public.profiles for select to authenticated using((select public.is_admin()));
revoke insert,update,delete on public.admin_users from service_role;
comment on table public.admin_users is 'Legacy membership snapshot. Authorization uses profiles since migration 202610110003.';

alter table public.audit_events add column details jsonb not null default '{}' check(jsonb_typeof(details)='object');
create index audit_entity_time on public.audit_events(entity_id,created_at desc);
create index audit_actor_time on public.audit_events(actor_id,created_at desc);
create view public.audit_logs with(security_invoker=true) as select id,actor_id,action,entity_id,details,created_at from public.audit_events;
revoke all on public.audit_logs from public,anon,authenticated;
grant select on public.audit_logs to authenticated,service_role;

-- Trusted SQL editor/server only. Exact UUID + verified email prevent granting a wrong account.
create function public.bootstrap_first_owner(p_user_id uuid,p_expected_email text) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('admin-role-management',0));
  if exists(select 1 from public.profiles where role='owner' and is_active) then raise exception 'OWNER_ALREADY_EXISTS';end if;
  if not exists(select 1 from auth.users where id=p_user_id and lower(email)=lower(trim(p_expected_email)) and email_confirmed_at is not null) then raise exception 'VERIFIED_USER_REQUIRED';end if;
  update public.profiles set role='owner',is_active=true,updated_at=now() where user_id=p_user_id;
  if not found then raise exception 'PROFILE_NOT_FOUND';end if;
  insert into public.audit_events(actor_id,action,entity_id,details) values(p_user_id,'first_owner_designated',p_user_id,jsonb_build_object('role','owner','source','trusted_bootstrap'));
end; $$;
create function public.admin_set_role(p_user_id uuid,p_role text,p_active boolean) returns void
language plpgsql security definer set search_path='' as $$
declare previous public.profiles;
begin
  perform pg_advisory_xact_lock(hashtextextended('admin-role-management',0));
  if not public.is_owner() then raise exception 'OWNER_REQUIRED';end if;
  if p_role is null or p_role not in('viewer','admin','owner') or p_active is null then raise exception 'INVALID_ROLE';end if;
  select * into previous from public.profiles where user_id=p_user_id for update;
  if not found then raise exception 'PROFILE_NOT_FOUND';end if;
  if p_role in('admin','owner') and not exists(select 1 from auth.users where id=p_user_id and email_confirmed_at is not null) then raise exception 'VERIFIED_USER_REQUIRED';end if;
  if previous.role='owner' and previous.is_active and (p_role<>'owner' or not p_active)
    and not exists(select 1 from public.profiles where role='owner' and is_active and user_id<>p_user_id) then raise exception 'LAST_OWNER_REQUIRED';end if;
  update public.profiles set role=p_role,is_active=p_active,updated_at=now() where user_id=p_user_id;
  insert into public.audit_events(actor_id,action,entity_id,details) values(auth.uid(),'role_changed',p_user_id,jsonb_build_object('before',previous.role,'after',p_role,'active',p_active));
end; $$;

alter table public.raffles add column is_demo boolean not null default false;
create index orders_guest_recovery on public.orders(guest_hash,raffle_id,created_at desc) where guest_hash is not null;
create table public.raffle_images (
  id uuid primary key default gen_random_uuid(),
  raffle_id uuid not null references public.raffles(id),
  storage_path text not null unique check(length(storage_path)<=300 and storage_path !~ '\.\.'),
  alt_text text not null check(length(trim(alt_text)) between 3 and 200),
  position integer not null check(position between 0 and 29),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique(raffle_id,position)
);
alter table public.raffle_images enable row level security;
revoke all on public.raffle_images from public,anon,authenticated,service_role;
grant select on public.raffle_images to anon,authenticated,service_role;
create policy images_admin on public.raffle_images for select to authenticated using((select public.is_admin()));
create policy images_published on public.raffle_images for select to anon,authenticated using(published_at<=now() and exists(select 1 from public.raffles r where r.id=raffle_id and r.status in('active','closed','drawn')));
create policy published_image_objects on storage.objects for select to anon,authenticated using(
  bucket_id='raffle-images' and exists(select 1 from public.raffle_images i where i.storage_path=name and i.published_at<=now())
);
create function public.admin_save_image(p_id uuid,p_raffle_id uuid,p_path text,p_alt text,p_position integer,p_published boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare image_id uuid;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED';end if;
  perform 1 from public.raffles where id=p_raffle_id for update;
  if not found then raise exception 'RAFFLE_UNAVAILABLE';end if;
  if p_path is null or p_path !~ ('^'||p_raffle_id::text||'/[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp)$') or p_alt is null or length(trim(p_alt)) not between 3 and 200 or p_position is null or p_position not between 0 and 29 or p_published is null then raise exception 'INVALID_IMAGE';end if;
  if not exists(select 1 from storage.objects where bucket_id='raffle-images' and name=p_path) then raise exception 'IMAGE_OBJECT_REQUIRED';end if;
  if p_id is null then
    insert into public.raffle_images(raffle_id,storage_path,alt_text,position,published_at) values(p_raffle_id,p_path,trim(p_alt),p_position,case when p_published then now() else null end) returning id into image_id;
  else
    update public.raffle_images set storage_path=p_path,alt_text=trim(p_alt),position=p_position,published_at=case when p_published then coalesce(published_at,now()) else null end where id=p_id and raffle_id=p_raffle_id returning id into image_id;
    if not found then raise exception 'IMAGE_NOT_FOUND';end if;
  end if;
  insert into public.audit_events(actor_id,action,entity_id) values(auth.uid(),'image_saved',image_id);return image_id;
end; $$;

-- The association is already normalized by reservation -> order -> items. Avoid duplicating it.
create view public.reservation_numbers with(security_invoker=true) as
select r.id reservation_id,r.raffle_id,i.number,r.order_id from public.reservations r join public.order_items i on i.order_id=r.order_id and i.raffle_id=r.raffle_id;
revoke all on public.reservation_numbers from public,anon,authenticated;
grant select on public.reservation_numbers to authenticated,service_role;

alter table public.draw_results add constraint result_identity unique(id,raffle_id,winning_number);
create table public.winners (
  result_id uuid primary key,
  raffle_id uuid not null unique,
  winning_number integer not null,
  verified_at timestamptz not null default now(),
  verified_by uuid not null references auth.users(id),
  foreign key(result_id,raffle_id,winning_number) references public.draw_results(id,raffle_id,winning_number),
  foreign key(raffle_id,winning_number) references public.confirmed_numbers(raffle_id,number)
);
alter table public.winners enable row level security;
create index winners_verifier on public.winners(verified_by);
revoke all on public.winners from public,anon,authenticated,service_role;
grant select on public.winners to authenticated,service_role;
create policy winners_admin on public.winners for select to authenticated using((select public.is_admin()));
-- Public results contain no participant linkage. A confirmed assignment is mandatory for new publications.
create function public.verify_result_assignment() returns trigger language plpgsql set search_path='' as $$
begin
  if not exists(select 1 from public.confirmed_numbers where raffle_id=new.raffle_id and number=new.winning_number) then raise exception 'WINNER_NOT_CONFIRMED';end if;
  return new;
end; $$;
create trigger verify_result_assignment before insert or update on public.draw_results for each row execute function public.verify_result_assignment();
create function public.has_verified_result(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.winners where result_id=p_id); $$;
drop policy published_results on public.draw_results;
create policy published_results on public.draw_results for select to anon,authenticated using(published_at<=now() and public.has_verified_result(id) and exists(select 1 from public.raffles r where r.id=raffle_id and r.status='drawn'));
create view public.public_results with(security_invoker=true) as
select d.id,d.raffle_id,r.title,r.slug,d.winning_number,d.drawn_at from public.draw_results d join public.raffles r on r.id=d.raffle_id;
revoke all on public.public_results from public,anon,authenticated;
grant select on public.public_results to anon,authenticated,service_role;
create function public.admin_record_result(p_raffle_id uuid,p_number integer,p_drawn_at timestamptz,p_evidence text,p_publish boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.raffles; result_id uuid;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED';end if;
  select * into r from public.raffles where id=p_raffle_id for update;
  if not found or r.status not in('closed','drawn') then raise exception 'RAFFLE_NOT_CLOSED';end if;
  if p_drawn_at is null or p_drawn_at>now() or p_evidence is null or length(trim(p_evidence)) not between 8 and 500 or p_publish is null then raise exception 'INVALID_RESULT';end if;
  if exists(select 1 from public.draw_results where raffle_id=r.id) then raise exception 'RESULT_ALREADY_EXISTS';end if;
  insert into public.draw_results(raffle_id,winning_number,drawn_at,evidence_path,published_at) values(r.id,p_number,p_drawn_at,trim(p_evidence),case when p_publish then now() else null end) returning id into result_id;
  insert into public.winners(result_id,raffle_id,winning_number,verified_by) values(result_id,r.id,p_number,auth.uid());
  update public.raffles set status='drawn',draw_at=p_drawn_at where id=r.id;
  insert into public.audit_events(actor_id,action,entity_id) values(auth.uid(),'result_recorded',result_id);return result_id;
end; $$;

alter table public.webhook_events drop constraint webhook_events_state_check;
alter table public.webhook_events add constraint webhook_state_valid check(state in('received','processing','processed','failed'));
alter table public.webhook_events add column claim_token uuid;
alter table public.webhook_events add column locked_until timestamptz;
create function public.claim_webhook_event(p_event text,p_payment text) returns uuid
language plpgsql security definer set search_path='' as $$
declare e public.webhook_events; token uuid:=gen_random_uuid();
begin
  if p_event is null or length(p_event) not between 1 and 200 or p_payment is null or length(p_payment) not between 1 and 200 then raise exception 'INVALID_EVENT';end if;
  insert into public.webhook_events(provider_event_id,provider_payment_id) values(p_event,p_payment) on conflict(provider_event_id) do nothing;
  select * into e from public.webhook_events where provider_event_id=p_event for update;
  if e.provider_payment_id<>p_payment then raise exception 'EVENT_ID_CONFLICT';end if;
  if e.state='processed' or e.attempts>=10 or (e.state='processing' and e.locked_until>now()) then return null;end if;
  update public.webhook_events set state='processing',attempts=attempts+1,claim_token=token,locked_until=now()+interval '1 minute' where id=e.id;
  return token;
end; $$;
create function public.finish_webhook_event(p_event text,p_claim uuid,p_success boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_success is null then raise exception 'INVALID_EVENT';end if;
  update public.webhook_events set state=case when p_success then 'processed' else 'failed' end,processed_at=case when p_success then now() else null end,locked_until=null
  where provider_event_id=p_event and claim_token=p_claim and state='processing';
  if not found then raise exception 'EVENT_CLAIM_LOST';end if;
end; $$;

-- Business writes happen ONLY through the reviewed transaction procedures, including for service_role.
do $$ declare t text;proc record;begin
  foreach t in array array['raffles','participants','promotions','orders','reservations','raffle_numbers','order_items','payments','webhook_events','draw_results','audit_events','confirmed_numbers','payment_attempts','reconciliation_cases','payment_checks','number_blocks','reservation_limits','number_availability'] loop
    execute format('revoke insert,update,delete,truncate,references,trigger on public.%I from service_role',t);
  end loop;
  for proc in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('create_auth_profile','is_owner','bootstrap_first_owner','admin_set_role','admin_save_image','verify_result_assignment','has_verified_result','admin_record_result','claim_webhook_event','finish_webhook_event') loop
    execute format('revoke all on function %s from public,anon,authenticated',proc.signature);
    if proc.proname in('bootstrap_first_owner','claim_webhook_event','finish_webhook_event') then execute format('grant execute on function %s to service_role',proc.signature);end if;
    if proc.proname in('is_owner','admin_set_role','admin_save_image','admin_record_result') then execute format('grant execute on function %s to authenticated',proc.signature);end if;
    if proc.proname='has_verified_result' then execute format('grant execute on function %s to anon,authenticated',proc.signature);end if;
  end loop;
end; $$;
commit;
