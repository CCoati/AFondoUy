begin;

-- Result evidence is readable only when its result is publicly verified.
alter table public.draw_results add column draw_mode text;
alter table public.draw_results add constraint draw_results_mode_check
  check (draw_mode is null or draw_mode in ('national_lottery','public_draw','notary','other'));

drop view public.public_results;
create view public.public_results with(security_invoker=true) as
select d.id,d.raffle_id,r.title,r.slug,d.winning_number,d.drawn_at,d.draw_mode,d.evidence_path
from public.draw_results d join public.raffles r on r.id=d.raffle_id where r.is_demo=false;
revoke all on public.public_results from public,anon,authenticated;
grant select on public.public_results to anon,authenticated,service_role;

drop policy if exists published_result_evidence on storage.objects;
create policy published_result_evidence on storage.objects for select to anon,authenticated using (
  bucket_id='raffle-evidence' and exists (
    select 1 from public.draw_results d join public.raffles r on r.id=d.raffle_id
    where d.evidence_path=name and d.published_at<=now() and r.status='drawn' and r.is_demo=false
      and public.has_verified_result(d.id)
  )
);

-- This function is only callable with the server service key. The web layer
-- first validates a short-lived, mailbox-delivered signed capability token.
create function public.secure_order_receipt(p_order_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.orders; res public.reservations; r public.raffles; pay_state text;
begin
  if p_order_id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  select * into o from public.orders where id=p_order_id;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  select * into res from public.reservations where order_id=o.id;
  select * into r from public.raffles where id=o.raffle_id;
  select case
    when exists(select 1 from public.payments where order_id=o.id and status='refunded') then 'refunded'
    when exists(select 1 from public.payments where order_id=o.id and status in('charged_back','review')) then 'review'
    when exists(select 1 from public.payments where order_id=o.id and status='approved') then 'approved'
    when exists(select 1 from public.payment_attempts where order_id=o.id and status='terminal_unpaid') then 'rejected'
    when exists(select 1 from public.payment_attempts where order_id=o.id and status in('creating','pending','unknown')) then 'pending'
    else 'not_started' end into pay_state;
  return jsonb_build_object('orderId',o.id,'raffleId',o.raffle_id,'raffleTitle',r.title,'raffleSlug',r.slug,
    'status',o.status,'reservationStatus',res.status,'numberCount',r.number_count,'expiresAt',res.expires_at,
    'serverNow',clock_timestamp(),'totalMinor',o.total_minor,'subtotalMinor',o.subtotal_minor,
    'discountMinor',o.discount_minor,'currency',o.currency,'paymentStatus',pay_state,
    'numbers',(select jsonb_agg(number order by number) from public.order_items where order_id=o.id));
end; $$;
revoke all on function public.secure_order_receipt(uuid) from public,anon,authenticated;
grant execute on function public.secure_order_receipt(uuid) to service_role;

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  kind text not null check(kind in('purchase_confirmation')),
  state text not null default 'pending' check(state in('pending','sending','sent')),
  attempts integer not null default 0 check(attempts>=0),
  claim_token uuid,
  locked_until timestamptz,
  delivered_at timestamptz,
  unique(order_id,kind)
);
alter table public.notification_deliveries enable row level security;
revoke all on public.notification_deliveries from public,anon,authenticated,service_role;
grant select,insert,update on public.notification_deliveries to service_role;
create function public.claim_notification_delivery(p_order_id uuid,p_kind text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare n public.notification_deliveries; token uuid:=gen_random_uuid();
begin
  if p_order_id is null or p_kind<>'purchase_confirmation' then raise exception 'INVALID_NOTIFICATION';end if;
  insert into public.notification_deliveries(order_id,kind) values(p_order_id,p_kind) on conflict(order_id,kind) do nothing;
  select * into n from public.notification_deliveries where order_id=p_order_id and kind=p_kind for update;
  if n.state='sent' or (n.state='sending' and n.locked_until>now()) then return null;end if;
  update public.notification_deliveries set state='sending',attempts=attempts+1,claim_token=token,locked_until=now()+interval '2 minutes' where id=n.id;
  return jsonb_build_object('id',n.id,'claimToken',token);
end; $$;
create function public.finish_notification_delivery(p_id uuid,p_claim uuid,p_sent boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_id is null or p_claim is null or p_sent is null then raise exception 'INVALID_NOTIFICATION_CLAIM';end if;
  update public.notification_deliveries set state=case when p_sent then 'sent' else 'pending' end,
    delivered_at=case when p_sent then now() else null end,claim_token=null,locked_until=null
  where id=p_id and state='sending' and claim_token=p_claim;
  if not found then raise exception 'NOTIFICATION_CLAIM_LOST';end if;
end; $$;
revoke all on function public.claim_notification_delivery(uuid,text) from public,anon,authenticated;
revoke all on function public.finish_notification_delivery(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.claim_notification_delivery(uuid,text) to service_role;
grant execute on function public.finish_notification_delivery(uuid,uuid,boolean) to service_role;

-- Extend the audited result command with a factual draw mode, while allowing
-- existing callers to omit it until they are updated.
drop function public.admin_record_result(uuid,integer,timestamptz,text,boolean);
create function public.admin_record_result(p_raffle_id uuid,p_number integer,p_drawn_at timestamptz,p_evidence text,p_publish boolean,p_draw_mode text default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.raffles; result_id uuid;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED';end if;
  select * into r from public.raffles where id=p_raffle_id for update;
  if not found or r.status not in('closed','drawn') then raise exception 'RAFFLE_NOT_CLOSED';end if;
  if p_drawn_at is null or p_drawn_at>now() or p_evidence is null or length(trim(p_evidence)) not between 8 and 500 or p_publish is null
    or (p_draw_mode is not null and p_draw_mode not in('national_lottery','public_draw','notary','other')) then raise exception 'INVALID_RESULT';end if;
  if not exists(select 1 from storage.objects where bucket_id='raffle-evidence' and name=p_evidence) then raise exception 'EVIDENCE_REQUIRED';end if;
  if exists(select 1 from public.draw_results where raffle_id=r.id) then raise exception 'RESULT_ALREADY_EXISTS';end if;
  insert into public.draw_results(raffle_id,winning_number,drawn_at,evidence_path,published_at,draw_mode)
    values(r.id,p_number,p_drawn_at,trim(p_evidence),case when p_publish then now() else null end,p_draw_mode) returning id into result_id;
  insert into public.winners(result_id,raffle_id,winning_number,verified_by) values(result_id,r.id,p_number,auth.uid());
  update public.raffles set status='drawn',draw_at=p_drawn_at where id=r.id;
  insert into public.audit_events(actor_id,action,entity_id) values(auth.uid(),'result_recorded',result_id);return result_id;
end; $$;
revoke all on function public.admin_record_result(uuid,integer,timestamptz,text,boolean,text) from public,anon,authenticated;
grant execute on function public.admin_record_result(uuid,integer,timestamptz,text,boolean,text) to authenticated;

commit;
