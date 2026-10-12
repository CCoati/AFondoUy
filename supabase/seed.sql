-- Development ONLY. Caller must BEGIN; SET LOCAL app.environment='development'; then run this file and COMMIT.
-- Idempotent: never resets or overwrites existing reservations, numbers, promotions or users.
do $$ begin
  if current_setting('app.environment',true) is distinct from 'development' then raise exception 'DEVELOPMENT_SEED_REQUIRES_EXPLICIT_OPT_IN';end if;
  if exists(select 1 from public.payments where is_live) then raise exception 'SEED_REFUSED_LIVE_PAYMENTS_EXIST';end if;
  if exists(select 1 from public.raffles where id='d3e00000-0000-4000-8000-000000000003' and not is_demo) then raise exception 'SEED_ID_CONFLICT';end if;
end; $$;
insert into public.raffles(id,slug,title,description,terms,status,number_count,price_minor,reservation_minutes,is_demo) values
('d3e00000-0000-4000-8000-000000000003','demo-db-bmw-racing','[DEMO] BMW de competición','Premio presentado a partir de fotos compartidas; imágenes mejoradas con IA. Sorteo ficticio para desarrollo.','PRUEBA: los datos de precio e inventario son ilustrativos; no existe sorteo comercial, entrega ni cobro. Usar datos ficticios.','active',200,100000,10,true)
on conflict(id) do nothing;
insert into public.raffle_numbers(raffle_id,number)
select r.id,n from public.raffles r cross join lateral generate_series(1,r.number_count) n
where r.id='d3e00000-0000-4000-8000-000000000003' on conflict do nothing;
insert into public.promotions(id,raffle_id,name,quantity,bundle_price_minor,starts_at,ends_at,enabled) values
('d3e00000-0000-4000-9000-000000000003','d3e00000-0000-4000-8000-000000000003','Pack de 3 · DEMO',3,270000,now()-interval '1 day',now()+interval '1 year',true),
('d3e00000-0000-4000-9000-000000000004','d3e00000-0000-4000-8000-000000000003','Pack de 5 · DEMO',5,425000,now()-interval '1 day',now()+interval '1 year',true)
on conflict(id) do nothing;
-- No auth users, passwords, participant PII, sold numbers or winners are fabricated.
