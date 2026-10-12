# Experiencia, comunicación y transparencia

## Consulta privada

La confirmación de pago puede incluir un enlace personal firmado con HMAC por `ORDER_LOOKUP_SECRET`. El enlace vence a los 30 días de creada la orden. Al abrirlo, el servidor lo valida, establece una cookie `HttpOnly`, `Secure` en producción y `SameSite=Strict`, y limpia el token de la URL. La consulta requiere ese enlace; una referencia, cédula o teléfono no permite recuperar compras. La función `secure_order_receipt` está concedida únicamente a `service_role` y devuelve los números y el estado de pago, sin datos de contacto.

Si el correo no está configurado, el webhook no falla ni revierte una compra ya confirmada. Para el lanzamiento se debe configurar Resend y el secreto de consulta; el envío queda en `notification_deliveries` con concesión y estado idempotente para impedir envíos simultáneos o reintentos innecesarios. La API de Resend mantiene sus claves de idempotencia por una ventana acotada; la tabla local registra la entrega confirmada y permite volver a intentar fallos.

## Correo transaccional

Configurar en el servidor `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `ORDER_LOOKUP_SECRET` (32 bytes aleatorios como mínimo) y opcionalmente `ADMIN_ALERT_EMAIL`. Verificar el dominio remitente en Resend antes de enviar. El mensaje de confirmación contiene nombre de saludo, sorteo, referencia, números, total y enlace privado. Los avisos críticos incluyen solo un tipo de incidente y una referencia interna, nunca nombre, cédula, teléfono o email del participante.

Si falta configuración, no se envía el mensaje; el estado de pago persiste como confirmado. En producción deben monitorizarse los eventos `notification_deliveries` pendientes y las alertas operativas.

## Resultados y evidencia

El resultado público sale de `public_results`, que solo devuelve resultados registrados, publicados y asociados a un número confirmado. La vista excluye sorteos DEMO. El campo de modalidad es opcional para registros históricos; si no existe, la interfaz comunica que está pendiente. Las actas permanecen en el bucket privado `raffle-evidence`: Storage permite lectura solo cuando el sorteo real y el resultado verificado están publicados; la página entrega URLs firmadas breves. La identidad del ganador nunca se consulta ni presenta en esa vista.

El panel solicita modalidad, número, fecha y acta al registrar un resultado. La acción mantiene controles de administrador y auditoría existentes; el resultado permanece inmutable.

## Transparencia legal

`/terminos` y `/privacidad` son borradores con `noindex`. `/transparencia` expone literalmente los campos aún no proporcionados: organizador, autorización, política comercial de cancelaciones, reembolsos y entrega. No se afirma que la autorización exista. Cada ficha conserva sus bases individuales. Es obligatorio completar esa información y solicitar revisión de un profesional del derecho uruguayo antes de ofrecer participaciones o pagos reales.

## SEO y estados de interfaz

Las fichas de sorteos reales activos generan título, descripción, canonical y Open Graph a partir de los datos publicados. DEMO y fichas cerradas no se indexan. `sitemap.xml` incluye sorteos reales activos y páginas públicas; necesita `NEXT_PUBLIC_SITE_URL` HTTPS para emitir URLs. `robots.txt` excluye administración, checkout y consulta privada. Los listados de sorteos y resultados incluyen skeletons accesibles, vacíos explicativos y errores comprensibles. Se mantiene soporte de foco visible, enlace para saltar al contenido y preferencia de movimiento reducido.

## Migración y verificación

Aplicar `202610110006_participation_transparency.sql` después de las migraciones existentes en una base de desarrollo nueva, nunca sobre un proyecto distinto o con ventas sin respaldo. La migración añade modalidad de resultado, políticas de evidencia pública condicionada, recibo privado de servidor y cola de notificaciones. Verificar `npm test`, `npm run test:db`, `npm run typecheck`, `npm run lint` y `npm run build`.
