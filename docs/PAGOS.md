# Checkout de A FONDO UY

La integración usa el SDK oficial `mercadopago` y Checkout Pro con preferencias creadas desde el servidor. Solo existe el modo `sandbox`; para abrirlo se necesitan credenciales de prueba `TEST-`, el secreto de Webhooks y el identificador esperado de la cuenta receptora. Credenciales `APP_USR-` y notificaciones `live_mode=true` siempre se rechazan. No hay una opción de producción en la aplicación.

## Secuencia

1. El navegador crea una reserva temporal mediante `reserve_numbers`; el importe y promociones se calculan en PostgreSQL.
2. El checkout vuelve a leer el recibo privado usando la cookie `afondo_guest`; no acepta precio, descuento ni moneda del cliente.
3. `begin_payment_attempt` liga un intento idempotente antes de llamar a Mercado Pago. La preferencia usa una clave de idempotencia derivada del intento, vence con la reserva y lleva una referencia externa aleatoria.
4. El webhook valida `x-signature` con el SDK oficial, reclama el evento de manera idempotente y consulta el pago a través de la API oficial.
5. El backend compara el ID, la referencia, la cuenta receptora, `live_mode`, moneda UYU e importe con la orden guardada. Solo entonces llama a `apply_verified_payment`, que confirma todos los números en una transacción.
6. La página de compra lee el estado privado desde la base; los parámetros `success`, `pending` y `failure` de retorno nunca cambian el estado. Los reembolsos y contracargos quedan registrados y mantienen los números vendidos ligados a su compra original.

Un rechazo verificado permite que venza la reserva. Un intento pendiente o incierto bloquea la liberación automática. La conciliación protegida consulta pagos por referencia externa cada intento y solo libera una reserva vencida si, luego del margen de espera, la consulta exacta de Mercado Pago no encuentra transacciones. Un pago que aparezca tarde se marca para conciliación/devolución y no reasigna números ya vendidos. Reembolsos y contracargos recibidos antes del webhook de aprobación también se registran sin confirmar números.

## Configuración de sandbox

Aplicar las migraciones versionadas al proyecto Supabase de desarrollo y configurar en el servidor (nunca como variables `NEXT_PUBLIC_*`):

```dotenv
RESERVATIONS_ENABLED=true
MERCADOPAGO_MODE=sandbox
MERCADOPAGO_ACCESS_TOKEN=TEST-...
MERCADOPAGO_WEBHOOK_SECRET=...
MERCADOPAGO_EXPECTED_COLLECTOR_ID=...
NEXT_PUBLIC_SITE_URL=https://tu-url-de-pruebas
```

El proyecto Supabase debe ser exclusivo de pruebas. Configurar el webhook de pago de la aplicación de prueba en Mercado Pago hacia `/api/webhooks/mercadopago`. Para recibir notificaciones en desarrollo, la URL tiene que ser públicamente accesible por HTTPS.

Para conciliar notificaciones que no lleguen, configurar un secreto aleatorio de al menos 32 caracteres en `PAYMENT_RECONCILIATION_SECRET` y un cron externo que envíe un `POST` cada cinco minutos a `/api/internal/payments/reconcile` con `Authorization: Bearer <secreto>`. La ruta solo admite credenciales sandbox `TEST-`.

Para enviar el correo de confirmación después de una aprobación verificada, configurar `RESEND_API_KEY` y `RESEND_FROM_EMAIL` con un remitente validado en Resend. La solicitud usa una clave idempotente por orden; si no se configura Resend, el estado privado de la compra sigue disponible en la web y el correo no se envía.

## Verificación y pendientes

`npm test` cubre validación de importes, correspondencia de pago y firma del SDK. `npm run test:db` aplica todas las migraciones a PostgreSQL aislado y ejercita carreras de reserva, webhooks repetidos, pago tardío, vencimientos, restricciones RLS, reembolsos y contracargos. Estas pruebas no sustituyen una prueba de integración con una cuenta sandbox de Mercado Pago.

Antes de cualquier eventual evaluación para producción siguen pendientes: confirmación escrita de Mercado Pago para la cuenta y modalidad exactas; autorización legal uruguaya aplicable a la rifa y al canal de venta; completar pruebas integrales con cuenta sandbox y Webhooks reales; configurar monitorización de conciliación y correo. Aunque se consiga esa documentación, este código no tiene modo productivo y debe revisarse por separado antes de procesar cobros reales.
