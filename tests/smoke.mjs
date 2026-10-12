import assert from "node:assert/strict";

// Run against a local production build WITHOUT Supabase environment variables.
const base = process.env.BASE_URL || "http://127.0.0.1:3000";
const origin = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const headers = { "Content-Type": "application/json", Origin: origin };
for (const path of ["/", "/carrito", "/sorteos", "/resultados", "/preguntas-frecuentes", "/terminos", "/privacidad", "/acceso", "/acceso/recuperar", "/acceso/restablecer"]) {
  const response = await fetch(`${base}${path}`);
  assert.equal(response.status, 200, path);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  const csp = response.headers.get("content-security-policy") ?? "";
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(await response.text(), /A FONDO/);
  console.log(`PASS GET ${path}: 200 + security headers`);
}
for (const path of ["/participacion", "/transparencia"]) {
  const response=await fetch(`${base}${path}`);assert.equal(response.status,200,path);assert.match(await response.text(),/A FONDO|participación|Información verificable/i);
}
const admin = await fetch(`${base}/admin`, { redirect: "manual" });
assert.equal(admin.status, 307);
assert.match(admin.headers.get("location"), /\/acceso(?:\?estado=configuracion)?$/);
assert.match(admin.headers.get("cache-control"), /no-store/);
console.log("PASS /admin: redirects without configuration, no cache");
const checkoutDisabled = await fetch(`${base}/api/checkout`, { method: "POST", headers, body: JSON.stringify({ orderId: "76e5aa7a-3edc-4e72-9fba-4f0f66d7ace1" }) });
assert.equal(checkoutDisabled.status, 503); assert.equal((await checkoutDisabled.json()).code, "SANDBOX_NOT_CONFIGURED"); assert.match(checkoutDisabled.headers.get("cache-control"), /no-store/);
const webhookDisabled = await fetch(`${base}/api/webhooks/mercadopago`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
assert.equal(webhookDisabled.status, 503); assert.match(webhookDisabled.headers.get("cache-control"), /no-store/);
const reconcileProtected = await fetch(`${base}/api/internal/payments/reconcile`, { method: "POST" }); assert.equal(reconcileProtected.status, 401);
console.log("PASS checkout and webhook blocked without sandbox config; reconciliation requires its secret");
const missingRaffle=await fetch(`${base}/sorteos/no-existe`);assert.match(await missingRaffle.text(),/Sorteo no encontrado/);
const robots=await (await fetch(`${base}/robots.txt`)).text();assert.match(robots,/Allow:\s*\//);assert.match(robots,/Disallow:\s*\/admin\//);assert.match(robots,/Disallow:\s*\/checkout\//);
console.log("PASS missing raffle shows a not-found page; public SEO enabled, private routes blocked");
const reserve=await fetch(`${base}/api/reservas`,{method:"POST",headers,body:"{}"});
assert.equal(reserve.status,503);assert.equal((await reserve.json()).code,"UNCONFIGURED");
assert.match(reserve.headers.get("cache-control"),/no-store/);
const foreign=await fetch(`${base}/api/reservas`,{method:"POST",headers:{...headers,Origin:"https://untrusted.invalid"},body:"{}"});
assert.equal(foreign.status,403);
for(const [quantity,total] of [[0,0],[3,270000],[5,425000],[8,695000],[20,1700000]]) {
  const response=await fetch(`${base}/api/demo/cotizacion`,{method:"POST",headers,body:JSON.stringify({raffleId:"coupe-gt",quantity})});
  assert.equal(response.status,200);assert.equal((await response.json()).totalMinor,total);
}
for(const body of [{raffleId:"coupe-gt",quantity:21},{raffleId:"coupe-gt",quantity:5,discount:999999},{raffleId:"coupe-gt",quantity:-1}]) {
  const response=await fetch(`${base}/api/demo/cotizacion`,{method:"POST",headers,body:JSON.stringify(body)});assert.equal(response.status,422);
}
const oversized=await fetch(`${base}/api/demo/cotizacion`,{method:"POST",headers,body:JSON.stringify({padding:"x".repeat(9000)})});assert.equal(oversized.status,422);
assert.equal((await fetch(`${base}/demo/sorteos/coupe-gt`)).status,200);
for(const slug of ["audio-studio","chrono-steel"]) assert.match(await (await fetch(`${base}/demo/sorteos/${slug}`)).text(),/No encontramos esa página|NEXT_HTTP_ERROR_FALLBACK;404/);
console.log("PASS server pricing 0/3/5/8/20, strict validation, size limit, CSRF, disabled reservations, retired demo pages");
const ownerPage=await fetch(`${base}/admin/cuentas`,{redirect:"manual"});assert.equal(ownerPage.status,307);
const reset=await fetch(`${base}/acceso/restablecer?token_hash=invalid&type=recovery`);
assert.equal(reset.headers.get("referrer-policy"),"no-referrer");assert.match(reset.headers.get("cache-control"),/no-store/);
assert.match(await reset.text(),/Solicitar enlace/);
const reservation=await fetch(`${base}/api/reservas/76e5aa7a-3edc-4e72-9fba-4f0f66d7ace1`);assert.equal(reservation.status,401);
console.log("PASS protected role management, safe reset-link page and private receipt without cookie");
