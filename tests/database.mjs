import EmbeddedPostgres from 'embedded-postgres';
import { Client } from 'pg';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn } from 'node:child_process';
const { default: getBinaries } = await import(new URL('./binary.js', import.meta.resolve('embedded-postgres')));

const server = net.createServer();
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
await new Promise(r => server.close(r));
const password = randomBytes(24).toString('hex');
const directory = resolve('.test-data', `postgres-${Date.now()}`);
await mkdir(directory, { recursive: true });
const postgres = new EmbeddedPostgres({ databaseDir: directory, user: 'postgres', password, port,
  persistent: true, createPostgresUser: false, authMethod: 'scram-sha-256',
  initdbFlags: ['--encoding=UTF8'],
  postgresFlags: ['-h', '127.0.0.1'], onLog: message => { if(process.env.PG_TEST_DEBUG) console.log(message); }, onError: console.error });
const clients = [];
const connect = async (role) => {
  const c = new Client({ host: '127.0.0.1', port, user: 'postgres', password, database: 'postgres' });
  await c.connect(); clients.push(c);
  if (role) await c.query(`set role ${role}`);
  return c;
};
let passed = 0;
let started = false;
const binary = await getBinaries();
const execute = (file,args) => new Promise((resolve,reject) => {
  const child=spawn(file,args,{windowsHide:true,stdio:'ignore'});
  child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error(`pg_ctl exit ${code}; inspect ${directory}/server.log`)));
});
async function test(name, fn) { await fn(); passed++; console.log(`PASS ${name}`); }
const hash = value => createHash('sha256').update(value).digest('hex');
try {
  await postgres.initialise();
  // pg_ctl creates a restricted Windows token even when the desktop process is elevated.
  await execute(binary.pg_ctl, ['start','-D',directory,'-l',resolve(directory,'server.log'),'-o',`-h 127.0.0.1 -p ${port} -c wal_level=logical`,'-w'], { windowsHide: true });
  started = true;
  const root = await connect();
  await root.query(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid,bucket_id text,name text); alter table storage.objects enable row level security;
    grant usage on schema storage to anon,authenticated,service_role;grant select on storage.objects to anon,authenticated;grant insert,update,delete on storage.objects to authenticated;
    create publication supabase_realtime;`);
  const legacyId=randomUUID();
  for (const file of (await readdir('supabase/migrations')).filter(f => f.endsWith('.sql')).sort()) {
    if(file==='202610110003_supabase_foundation.sql') {
      await root.query("insert into auth.users(id,email,email_confirmed_at) values($1,'legacy@example.invalid',now())",[legacyId]);
      await root.query('insert into admin_users(user_id) values($1)',[legacyId]);
    }
    await root.query(await readFile(`supabase/migrations/${file}`, 'utf8'));
  }
  const service = await connect('service_role');
  const adminId = randomUUID();
  await root.query("insert into auth.users(id,email,email_confirmed_at) values($1,'owner@example.invalid',now())", [adminId]);
  await service.query("select bootstrap_first_owner($1,'owner@example.invalid')",[adminId]);
  const admin = await connect('authenticated');
  await admin.query("select set_config('request.jwt.claim.sub',$1,false)", [adminId]);
  const raffle = (await admin.query("select admin_create_raffle('Prueba aislada','prueba',200,100000,10) id")).rows[0].id;
  await root.query("update raffles set status='active',terms='Bases exclusivas de prueba' where id=$1", [raffle]);
  const reserve = async (c, numbers, guest=randomUUID(), key=randomUUID(), expected=100000*numbers.length) => {
    const fingerprint=hash(JSON.stringify({numbers,guest,expected}));
    return (await c.query('select reserve_numbers($1,$2,$3,$4,$5,$6,$7,$8,$9) receipt',
      [raffle,numbers,hash(guest),key,fingerprint,expected,'Persona de prueba','test@example.invalid','099000000'])).rows[0].receipt;
  };
  const age = async id => { for (const table of ['orders','reservations']) await root.query(`update ${table} set created_at=now()-interval '20 minutes',expires_at=now()-interval '10 minutes' where ${table==='orders'?'id':'order_id'}=$1`, [id]); };
  const attempt = async id => (await service.query('select begin_payment_attempt($1) id',[id])).rows[0].id;
  const approve = async (id, payment=randomUUID(), amount=100000, currency='UYU') => (await service.query('select apply_verified_payment($1,$2,$3,$4,false) result',[id,payment,amount,currency])).rows[0].result;
  const expire = async id => (await service.query('select expire_unpaid_order($1) outcome',[id])).rows[0].outcome;

  await test('200 números y proyección pública generados', async () => {
    assert.equal((await root.query('select count(*) from number_availability')).rows[0].count,'200');
  });
  await test('30 conexiones compiten por 001: una sola reserva', async () => {
    const buyers=await Promise.all(Array.from({length:30},()=>connect('service_role')));
    const results=await Promise.allSettled(buyers.map(c=>reserve(c,[1])));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    for(const r of results.filter(r=>r.status==='rejected')) assert.match(r.reason.message,/NUMBERS_UNAVAILABLE/);
    assert.equal((await root.query('select count(*) from orders')).rows[0].count,'1');
  });
  await test('idempotencia simultánea y rechazo de reutilización alterada', async () => {
    const key=randomUUID(),guest=randomUUID();
    const results=await Promise.all([reserve(service,[2],guest,key),reserve(clients[5],[2],guest,key)]);
    assert.equal(results[0].orderId,results[1].orderId);
    await assert.rejects(reserve(service,[3],guest,key),/IDEMPOTENCY_CONFLICT/);
  });
  await test('todo o nada, duplicados, rango y precio manipulado', async () => {
    await assert.rejects(reserve(service,[1,3]),/NUMBERS_UNAVAILABLE/);
    assert.equal((await root.query('select state from raffle_numbers where number=3')).rows[0].state,'available');
    await assert.rejects(reserve(service,[3,3]),/INVALID_NUMBERS/);
    await assert.rejects(reserve(service,[201]),/INVALID_NUMBERS/);
    await assert.rejects(reserve(service,[3],undefined,undefined,1),/PRICE_CHANGED/);
  });
  await test('promociones óptimas, edición y desactivación en servidor', async () => {
    const ids=[];
    for(const [q,total] of [[3,270000],[5,425000]]) ids.push((await admin.query("select admin_save_promotion(null,$1,'Pack demo',$2,$3,now()-interval '1 day',now()+interval '1 day',true) id",[raffle,q,total])).rows[0].id);
    const quote=async n=>(await service.query('select quote_numbers($1,$2) q',[raffle,n])).rows[0].q;
    assert.equal((await quote(0)).totalMinor,0);
    assert.equal((await quote(8)).totalMinor,695000);
    assert.equal((await quote(10)).totalMinor,850000);
    await admin.query('select admin_toggle_promotion($1,false)',[ids[1]]);
    assert.equal((await quote(5)).totalMinor,470000);
    await admin.query("select admin_save_promotion($1,$2,'Pack ajustado',3,260000,now()-interval '1 day',now()+interval '1 day',true)",[ids[0],raffle]);
    assert.equal((await quote(3)).totalMinor,260000);
    await admin.query('select admin_toggle_promotion($1,false)',[ids[0]]);
  });
  await test('panel: resumen administrativo usa cifras reales y excluye demos',async()=>{
    const summary=(await admin.query('select admin_dashboard_summary(7) value')).rows[0].value;
    assert.equal(summary.numbers_available,198);
    assert.equal(summary.numbers_sold,0);
    assert.equal(summary.revenue_confirmed_minor,0);
    assert.equal(summary.sales_by_day.length,7);
    assert.ok(Array.isArray(summary.activity));
  });
  await test('panel: editar sorteo audita y respeta precio/bases de órdenes',async()=>{
    await admin.query("select admin_update_raffle($1,'Prueba editada','prueba','Descripción revisada','Bases exclusivas de prueba',null,100000,'paused')",[raffle]);
    assert.equal((await root.query('select status,title from raffles where id=$1',[raffle])).rows[0].status,'paused');
    await admin.query("select admin_update_raffle($1,'Prueba editada','prueba','Descripción revisada','Bases exclusivas de prueba',null,100000,'active')",[raffle]);
    await assert.rejects(admin.query("select admin_update_raffle($1,'Prueba','prueba','', 'Bases modificadas',null,100000,'active')",[raffle]),/RAFFLE_HAS_ORDERS/);
    assert.ok((await root.query("select count(*) from audit_events where action='raffle_updated' and entity_id=$1",[raffle])).rows[0].count>0);
  });
  await test('panel: funciones administrativas denegadas a anon y usuarios comunes',async()=>{
    const anon=await connect('anon');
    await assert.rejects(anon.query('select admin_dashboard_summary(7)'),/permission denied/);
    const stranger=await connect('authenticated');
    await stranger.query("select set_config('request.jwt.claim.sub',$1,false)",[randomUUID()]);
    await assert.rejects(stranger.query('select admin_dashboard_summary(7)'),/ADMIN_REQUIRED/);
    await assert.rejects(stranger.query("select admin_update_raffle($1,'Malicioso','malicioso','','',null,100000,'active')",[raffle]),/ADMIN_REQUIRED/);
    await assert.rejects(stranger.query("select admin_save_platform_setting('business_name','Otro')"),/OWNER_REQUIRED/);
  });
  await test('panel: ajustes de comercio solo para propietario y con auditoría',async()=>{
    await admin.query("select admin_save_platform_setting('business_name','A FONDO UY · prueba')");
    assert.equal((await admin.query("select value from platform_settings where key='business_name'")).rows[0].value,'A FONDO UY · prueba');
    await assert.rejects(admin.query("select admin_save_platform_setting('contact_email','correo-invalido')"),/INVALID_SETTING/);
    assert.equal((await root.query("select count(*) from audit_events where action='platform_setting_updated'")).rows[0].count,'1');
  });
  await test('bloqueo administrativo no afecta reservados; no compra de bloqueados', async () => {
    await admin.query("select admin_set_blocked($1,array[4],true,'Control de prueba')",[raffle]);
    await assert.rejects(reserve(service,[4]),/NUMBERS_UNAVAILABLE/);
    await assert.rejects(admin.query("select admin_set_blocked($1,array[1],true,'Prueba')",[raffle]),/NUMBERS_UNAVAILABLE/);
    await admin.query("select admin_set_blocked($1,array[4],false,'Liberación de prueba')",[raffle]);
  });
  await test('vencimiento sin intento de pago libera con evidencia', async () => {
    const r=await reserve(service,[5]); await age(r.orderId);
    assert.equal(await expire(r.orderId),'expired');
    assert.equal((await root.query('select outcome from payment_checks where order_id=$1',[r.orderId])).rows[0].outcome,'no_attempt');
    await reserve(service,[5]);
  });
  await test('pago incierto conserva números; verificación terminal permite liberar', async () => {
    const r=await reserve(service,[6]),a=await attempt(r.orderId); await age(r.orderId);
    assert.equal(await expire(r.orderId),'held_for_payment_verification');
    await assert.rejects(reserve(service,[6]),/NUMBERS_UNAVAILABLE/);
    await service.query("select record_verified_unpaid($1,'proveedor:cancelado-verificado')",[a]);
    assert.equal(await expire(r.orderId),'expired');
  });
  await test('pago tardío tras reasignación va a devolución; mismo visitante puede tener nuevo pedido', async () => {
    const guest=randomUUID(),old=await reserve(service,[7],guest),a=await attempt(old.orderId);
    await service.query("select record_verified_unpaid($1,'proveedor:rechazado-verificado')",[a]);
    await age(old.orderId); await expire(old.orderId);
    const current=await reserve(service,[7],guest),b=await attempt(current.orderId);
    assert.equal((await approve(a)).status,'refund_required');
    assert.equal((await approve(b)).status,'confirmed');
    const rows=(await root.query('select order_id from confirmed_numbers where number=7')).rows;
    assert.deepEqual(rows,[{order_id:current.orderId}]);
  });
  await test('preferencia sandbox queda ligada una sola vez a su intento',async()=>{
    const r=await reserve(service,[17]),a=await attempt(r.orderId),preference='test-preference-unique-17';
    await service.query('select save_sandbox_preference($1,$2)',[a,preference]);
    await service.query('select save_sandbox_preference($1,$2)',[a,preference]);
    assert.equal((await root.query('select provider_preference_id from payment_attempts where id=$1',[a])).rows[0].provider_preference_id,preference);
    await assert.rejects(service.query('select save_sandbox_preference($1,$2)',[a,'different-preference']),/PREFERENCE_ID_CONFLICT/);
    await assert.rejects(admin.query('select save_sandbox_preference($1,$2)',[a,preference]),/permission denied/);
  });
  await test('reembolso y contracargo preservan el número vendido y su asignación única',async()=>{
    const refunded=await reserve(service,[18]),refundAttempt=await attempt(refunded.orderId),refundId='sandbox-refund-18';
    assert.equal((await approve(refundAttempt,refundId)).status,'confirmed');
    assert.equal((await service.query("select record_verified_payment_adjustment($1,'refunded') state",[refundId])).rows[0].state,'refunded');
    assert.equal((await root.query('select status from orders where id=$1',[refunded.orderId])).rows[0].status,'refunded');
    const charged=await reserve(service,[19]),chargeAttempt=await attempt(charged.orderId),chargeId='sandbox-chargeback-19';
    assert.equal((await approve(chargeAttempt,chargeId)).status,'confirmed');
    assert.equal((await service.query("select record_verified_payment_adjustment($1,'charged_back') state",[chargeId])).rows[0].state,'charged_back');
    assert.equal((await root.query('select status from orders where id=$1',[charged.orderId])).rows[0].status,'review');
    const partial=await reserve(service,[20]),partialAttempt=await attempt(partial.orderId),partialId='sandbox-partial-refund-20';
    assert.equal((await approve(partialAttempt,partialId)).status,'confirmed');
    await service.query("select record_verified_payment_adjustment($1,'review')",[partialId]);
    assert.equal((await root.query('select status from orders where id=$1',[partial.orderId])).rows[0].status,'review');
    for(const n of [18,19,20]) {
      assert.equal((await root.query('select state from raffle_numbers where number=$1',[n])).rows[0].state,'sold');
      assert.equal((await root.query('select count(*) from confirmed_numbers where number=$1',[n])).rows[0].count,'1');
      await assert.rejects(reserve(service,[n]),/NUMBERS_UNAVAILABLE/);
    }
  });
  await test('reembolso recibido antes del webhook de aprobación no confirma números',async()=>{
    const r=await reserve(service,[22]),a=await attempt(r.orderId),payment='sandbox-refund-first-22';
    assert.equal((await service.query("select record_unapplied_payment_adjustment($1,$2,100000,'UYU','refunded') state",[a,payment])).rows[0].state,'refunded');
    assert.equal((await root.query('select status from payments where provider_payment_id=$1',[payment])).rows[0].status,'refunded');
    assert.equal((await root.query('select count(*) from confirmed_numbers where number=22')).rows[0].count,'0');
    await age(r.orderId);
    assert.equal(await expire(r.orderId),'expired');
    assert.equal((await root.query('select state from raffle_numbers where number=22')).rows[0].state,'available');
  });
  await test('webhooks concurrentes idempotentes, venta inmutable y pago duplicado', async () => {
    const r=await reserve(service,[8]),a=await attempt(r.orderId),payment=randomUUID();
    const result=await Promise.all(Array.from({length:10},(_,i)=>approveWith(clients[5+i],a,payment)));
    assert.ok(result.every(r=>r.status==='confirmed'));
    assert.equal((await approve(a)).reason,'duplicate_payment');
    await assert.rejects(reserve(service,[8]),/NUMBERS_UNAVAILABLE/);
    await assert.rejects(root.query("update raffle_numbers set state='available',reservation_id=null where number=8"),/CONFIRMED_IMMUTABLE/);
    await assert.rejects(root.query('delete from confirmed_numbers where number=8'),/CONFIRMED_IMMUTABLE/);
    await assert.rejects(root.query('insert into confirmed_numbers select * from confirmed_numbers where number=8'),/duplicate key/);
  });
  async function approveWith(c,a,p) { return (await c.query("select apply_verified_payment($1,$2,100000,'UYU',false) result",[a,p])).rows[0].result; }
  await test('moneda o importe incorrectos: conciliación sin venta',async()=>{
    for(const [n,amount,currency] of [[9,1,'UYU'],[10,100000,'USD']]) {
      const r=await reserve(service,[n]),a=await attempt(r.orderId);
      assert.equal((await approve(a,randomUUID(),amount,currency)).reason,'amount_mismatch');
      assert.equal((await root.query('select count(*) from confirmed_numbers where number=$1',[n])).rows[0].count,'0');
    }
  });
  await test('pago verificable pero incongruente queda en revisión y no libera números',async()=>{
    const r=await reserve(service,[21]),a=await attempt(r.orderId);
    await service.query("select flag_payment_attempt_review($1,'verified-mismatch:987654321')",[a]);
    await age(r.orderId);
    assert.equal(await expire(r.orderId),'held_for_payment_verification');
    assert.equal((await root.query('select state from raffle_numbers where number=21')).rows[0].state,'reserved');
    await service.query("select record_verified_unpaid($1,'mercadopago:terminal-status')",[a]);
    assert.equal(await expire(r.orderId),'expired');
  });
  await test('carrera vencimiento / pago confirmado nunca libera al ganador',async()=>{
    const r=await reserve(service,[11]),a=await attempt(r.orderId);await age(r.orderId);
    await Promise.all([expire(r.orderId),approveWith(clients[5],a,randomUUID())]);
    assert.equal((await root.query('select state from raffle_numbers where number=11')).rows[0].state,'sold');
    assert.equal(await expire(r.orderId),'unchanged');
  });
  await test('RLS y funciones privadas inaccesibles al comprador',async()=>{
    const anon=await connect('anon');
    assert.equal((await anon.query('select count(*) from number_availability')).rows[0].count,'200');
    await assert.rejects(anon.query('select * from participants'),/permission denied/);
    await assert.rejects(anon.query('select quote_numbers($1,1)',[raffle]),/permission denied/);
    await assert.rejects(anon.query("update raffle_numbers set state='sold' where number=12"),/permission denied/);
    const stranger=await connect('authenticated');
    assert.equal((await stranger.query('select count(*) from orders')).rows[0].count,'0');
    await assert.rejects(stranger.query('select admin_configure_inventory($1,300,5)',[raffle]),/ADMIN_REQUIRED/);
  });
  await test('inventario usado no se renumera; plazo configurable',async()=>{
    await assert.rejects(admin.query('select admin_configure_inventory($1,300,5)',[raffle]),/INVENTORY_IN_USE/);
    await admin.query('select admin_configure_inventory($1,200,5)',[raffle]);
    const r=await reserve(service,[12]);
    assert.ok(Math.abs(new Date(r.expiresAt)-new Date(r.serverNow)-300000)<2000);
  });
  await test('recibo privado y reserva activa única por visitante',async()=>{
    const guest=randomUUID(),r=await reserve(service,[13],guest);
    await assert.rejects(service.query('select reservation_receipt($1,$2)',[r.orderId,hash('otro visitante')]),/RESERVATION_NOT_FOUND/);
    await assert.rejects(reserve(service,[14],guest),/ACTIVE_RESERVATION_EXISTS/);
  });
  await test('consulta firmada solo en servidor y notificación de compra idempotente',async()=>{
    const r=await reserve(service,[30]),a=await attempt(r.orderId);await approve(a,randomUUID());
    const receipt=(await service.query('select secure_order_receipt($1) value',[r.orderId])).rows[0].value;
    assert.equal(receipt.status,'paid');assert.deepEqual(receipt.numbers,[30]);assert.equal(receipt.raffleTitle,'Prueba editada');
    assert.equal(Object.hasOwn(receipt,'email'),false);assert.equal(Object.hasOwn(receipt,'phone'),false);
    const anon=await connect('anon');await assert.rejects(anon.query('select secure_order_receipt($1)',[r.orderId]),/permission denied/);
    const claim=(await service.query("select claim_notification_delivery($1,'purchase_confirmation') value",[r.orderId])).rows[0].value;
    assert.ok(claim.id);assert.equal((await service.query("select claim_notification_delivery($1,'purchase_confirmation') value",[r.orderId])).rows[0].value,null);
    await service.query('select finish_notification_delivery($1,$2,true)',[claim.id,claim.claimToken]);
    assert.equal((await service.query("select claim_notification_delivery($1,'purchase_confirmation') value",[r.orderId])).rows[0].value,null);
    await assert.rejects(anon.query('select * from notification_deliveries'),/permission denied/);
  });
  await test('tarea programada libera sin pago y mantiene pendientes inciertos',async()=>{
    const free=await reserve(service,[15]),held=await reserve(service,[16]);
    await attempt(held.orderId);await age(free.orderId);await age(held.orderId);
    await service.query('select expire_reservations(100)');
    const states=(await root.query('select number,state from raffle_numbers where number in(15,16) order by number')).rows;
    assert.deepEqual(states,[{number:15,state:'available'},{number:16,state:'reserved'}]);
    await service.query('select expire_reservations(100)');
    assert.equal((await root.query('select count(*) from payment_checks where order_id=$1',[held.orderId])).rows[0].count,'1');
  });
  await test('ningún vendido existe sin confirmación única',async()=>{
    const violations=await root.query("select n.number from raffle_numbers n left join confirmed_numbers c using(raffle_id,number) where (n.state='sold') <> (c.order_id is not null)");
    assert.equal(violations.rowCount,0);
  });
  const viewerId=randomUUID(),unverifiedId=randomUUID();
  await root.query("insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,'viewer@example.invalid',now(),'{\"role\":\"owner\"}'),($2,'unverified@example.invalid',null,'{}')",[viewerId,unverifiedId]);
  const viewer=await connect('authenticated'),publicClient=await connect('anon');
  await viewer.query("select set_config('request.jwt.claim.sub',$1,false)",[viewerId]);
  await test('migración conserva administrador previo sin promover metadatos de signup',async()=>{
    assert.equal((await root.query('select role from profiles where user_id=$1',[legacyId])).rows[0].role,'admin');
    assert.equal((await viewer.query('select role from profiles')).rows[0].role,'viewer');
    assert.equal((await viewer.query('select count(*) from profiles')).rows[0].count,'1');
    await assert.rejects(viewer.query("update profiles set role='owner' where user_id=$1",[viewerId]),/permission denied/);
    await assert.rejects(viewer.query("select admin_set_role($1,'admin',true)",[viewerId]),/OWNER_REQUIRED/);
    await assert.rejects(publicClient.query('select * from profiles'),/permission denied/);
  });
  await test('bootstrap restringido, correo verificado y último propietario protegido',async()=>{
    await assert.rejects(service.query("select bootstrap_first_owner($1,'viewer@example.invalid')",[viewerId]),/OWNER_ALREADY_EXISTS/);
    await assert.rejects(viewer.query("select bootstrap_first_owner($1,'viewer@example.invalid')",[viewerId]),/permission denied/);
    await assert.rejects(admin.query("select admin_set_role($1,'admin',true)",[unverifiedId]),/VERIFIED_USER_REQUIRED/);
    await assert.rejects(admin.query("select admin_set_role($1,'viewer',true)",[adminId]),/LAST_OWNER_REQUIRED/);
    await assert.rejects(admin.query("select admin_set_role($1,'owner',false)",[adminId]),/LAST_OWNER_REQUIRED/);
  });
  await test('revocación de rol inmediata y auditada sin depender del JWT',async()=>{
    await admin.query("select admin_set_role($1,'admin',true)",[viewerId]);
    assert.equal((await viewer.query('select is_admin() yes')).rows[0].yes,true);
    await assert.rejects(viewer.query("select admin_set_role($1,'owner',true)",[viewerId]),/OWNER_REQUIRED/);
    await admin.query("select admin_set_role($1,'admin',false)",[viewerId]);
    assert.equal((await viewer.query('select is_admin() yes')).rows[0].yes,false);
    assert.equal((await viewer.query('select count(*) from orders')).rows[0].count,'0');
    assert.equal((await root.query("select count(*) from audit_logs where entity_id=$1 and action='role_changed'",[viewerId])).rows[0].count,'2');
    await assert.rejects(admin.query("update audit_events set action='alterado'"),/permission denied/);
  });
  await test('service_role no puede editar directamente pagos, números ni roles',async()=>{
    for(const table of ['payments','raffle_numbers','orders','profiles','audit_events']) {
      const assignment=table==='profiles'?"role='owner'":table==='raffle_numbers'?"state='available'":table==='audit_events'?"action='alterado'":"status='paid'";
      await assert.rejects(service.query(`update ${table} set ${assignment} where false`),/permission denied/);
    }
  });
  await test('galería privada, publicación selectiva y rutas de Storage validadas',async()=>{
    const path=`${raffle}/premio.webp`;
    await root.query("insert into storage.objects(id,bucket_id,name) values($1,'raffle-images',$2)",[randomUUID(),path]);
    const img=(await admin.query("select admin_save_image(null,$1,$2,'Imagen de prueba',0,false) id",[raffle,path])).rows[0].id;
    assert.equal((await publicClient.query('select count(*) from raffle_images')).rows[0].count,'0');
    assert.equal((await publicClient.query('select count(*) from storage.objects')).rows[0].count,'0');
    await admin.query("select admin_save_image($1,$2,$3,'Imagen de prueba',0,true)",[img,raffle,path]);
    assert.equal((await publicClient.query('select count(*) from raffle_images')).rows[0].count,'1');
    assert.equal((await publicClient.query('select count(*) from storage.objects')).rows[0].count,'1');
    await assert.rejects(admin.query("select admin_save_image(null,$1,'otro/premio.webp','Imagen de prueba',1,true)",[raffle]),/INVALID_IMAGE/);
    await assert.rejects(viewer.query("insert into storage.objects(id,bucket_id,name) values($1,'raffle-images','intruso.webp')",[randomUUID()]),/row-level security/);
  });
  await test('asociaciones de reservas y auditoría no exponen participantes a usuarios comunes',async()=>{
    await assert.rejects(publicClient.query('select * from reservation_numbers'),/permission denied/);
    assert.equal((await viewer.query('select count(*) from reservation_numbers')).rows[0].count,'0');
    assert.equal((await viewer.query('select count(*) from audit_logs')).rows[0].count,'0');
    assert.ok(Number((await admin.query('select count(*) from reservation_numbers')).rows[0].count)>0);
    await assert.rejects(publicClient.query('select * from winners'),/permission denied/);
  });
  await test('webhook: un trabajador, reintento con fencing e idempotencia tras procesar',async()=>{
    const event=randomUUID();
    const results=await Promise.all([service,clients[5],clients[6]].map(c=>c.query('select claim_webhook_event($1,$2) token',[event,'provider-123'])));
    const tokens=results.map(r=>r.rows[0].token).filter(Boolean);assert.equal(tokens.length,1);
    await assert.rejects(service.query('select finish_webhook_event($1,$2,true)',[event,randomUUID()]),/EVENT_CLAIM_LOST/);
    await service.query('select finish_webhook_event($1,$2,false)',[event,tokens[0]]);
    const next=(await service.query('select claim_webhook_event($1,$2) token',[event,'provider-123'])).rows[0].token;
    assert.notEqual(next,tokens[0]);
    await assert.rejects(service.query('select finish_webhook_event($1,$2,true)',[event,tokens[0]]),/EVENT_CLAIM_LOST/);
    await service.query('select finish_webhook_event($1,$2,true)',[event,next]);
    assert.equal((await service.query('select claim_webhook_event($1,$2) token',[event,'provider-123'])).rows[0].token,null);
    await assert.rejects(service.query('select claim_webhook_event($1,$2)',[event,'other-payment']),/EVENT_ID_CONFLICT/);
    await assert.rejects(viewer.query('select claim_webhook_event($1,$2)',[event,'provider-123']),/permission denied/);
  });
  await test('ganador exige venta confirmada; resultado público sin identidad privada',async()=>{
    await root.query("update raffles set status='closed' where id=$1",[raffle]);
    const evidence=`${raffle}/evidence-test.pdf`;
    await assert.rejects(admin.query("select admin_record_result($1,8,now()-interval '1 minute',$2,true)",[raffle,evidence]),/EVIDENCE_REQUIRED/);
    await root.query("insert into storage.objects(id,bucket_id,name) values($1,'raffle-evidence',$2)",[randomUUID(),evidence]);
    await assert.rejects(admin.query("select admin_record_result($1,14,now()-interval '1 minute',$2,true)",[raffle,evidence]),/WINNER_NOT_CONFIRMED/);
    await admin.query("select admin_record_result($1,8,now()-interval '1 minute',$2,true,'notary')",[raffle,evidence]);
    const published=(await publicClient.query('select * from public_results')).rows;
    assert.equal(published.length,1);assert.equal(published[0].winning_number,8);
    assert.equal(published[0].draw_mode,'notary');assert.equal(published[0].evidence_path,evidence);
    assert.equal((await publicClient.query("select count(*) from storage.objects where bucket_id='raffle-evidence' and name=$1",[evidence])).rows[0].count,'1');
    assert.deepEqual(Object.keys(published[0]).sort(),['draw_mode','drawn_at','evidence_path','id','raffle_id','slug','title','winning_number']);
    assert.equal((await viewer.query('select count(*) from winners')).rows[0].count,'0');
    await assert.rejects(admin.query("select admin_record_result($1,8,now(),$2,true)",[raffle,evidence]),/RESULT_ALREADY_EXISTS/);
  });
  await test('seed requiere opt-in, es idempotente y no modifica datos anteriores',async()=>{
    const seed=await readFile('supabase/seed.sql','utf8');
    await assert.rejects(root.query(seed),/DEVELOPMENT_SEED_REQUIRES_EXPLICIT_OPT_IN/);
    const before=(await root.query('select count(*) from orders')).rows[0].count;
    for(let i=0;i<2;i++) await root.query(`begin;set local app.environment='development';${seed}commit;`);
    assert.equal((await root.query('select count(*) from orders')).rows[0].count,before);
    assert.equal((await root.query("select count(*) from raffles where is_demo")).rows[0].count,'1');
    const rows=(await root.query("select raffle_id,count(*) from raffle_numbers where raffle_id='d3e00000-0000-4000-8000-000000000003' group by raffle_id")).rows;
    assert.equal(rows.length,1);assert.equal(rows[0].count,'200');
    assert.equal((await service.query("select quote_numbers('d3e00000-0000-4000-8000-000000000003',5) q")).rows[0].q.totalMinor,425000);
  });
  await test('todos los datos de negocio tienen RLS activado',async()=>{
    const unsecured=(await root.query("select tablename from pg_tables where schemaname='public' and not rowsecurity")).rows;
    assert.deepEqual(unsecured,[]);
  });
  await test('Realtime publica exclusivamente la proyección sin datos personales',async()=>{
    const published=(await root.query("select tablename from pg_publication_tables where pubname='supabase_realtime'")).rows;
    assert.deepEqual(published,[{tablename:'number_availability'}]);
    const columns=(await publicClient.query('select * from number_availability limit 1')).fields.map(f=>f.name).sort();
    assert.deepEqual(columns,['number','raffle_id','revision','state']);
  });
  await test('conjuntos superpuestos son atómicos; sorteos independientes admiten el mismo número',async()=>{
    const call=async(c,id,numbers)=>c.query('select reserve_numbers($1,$2,$3,$4,$5,$6,$7,$8,$9) receipt',[id,numbers,hash(randomUUID()),randomUUID(),hash(randomUUID()),200000,'Prueba aislada','test@example.invalid','099000000']);
    const id='d3e00000-0000-4000-8000-000000000003';
    const other=(await admin.query("select admin_create_raffle('Independiente','independiente',200,100000,10) id")).rows[0].id;
    await root.query("update raffles set status='active',terms='Prueba aislada' where id=$1",[other]);
    const results=await Promise.allSettled([call(service,id,[1,2]),call(clients[5],id,[2,3])]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.equal((await root.query("select count(*) from raffle_numbers where raffle_id=$1 and state='reserved'",[id])).rows[0].count,'2');
    const independent=(await call(service,other,[1,2])).rows[0].receipt;
    assert.deepEqual(independent.numbers,[1,2]);
    assert.equal((await root.query("select count(*) from raffle_numbers where raffle_id=$1 and state='reserved'",[other])).rows[0].count,'2');
  });
  console.log(`${passed} escenarios PostgreSQL aprobados. Cluster aislado: ${directory}`);
} finally {
  await Promise.allSettled(clients.map(c=>c.end()));
  if (started) await execute(binary.pg_ctl, ['stop','-D',directory,'-m','fast','-w'], { windowsHide: true });
}
