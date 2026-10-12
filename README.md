# A FONDO UY

Plataforma web mobile-first para sorteos en Uruguay, construida con Next.js App Router, React, TypeScript estricto, Tailwind CSS, Supabase y Netlify. El estado actual es **preproducción**: los premios de portada y `/demo` son demostrativos, Mercado Pago solo admite credenciales de prueba y no se reciben pagos reales.

## Requisitos e instalación

- Node.js `>=22 <25` (configuración Netlify y `.nvmrc`: 24).
- npm y acceso al repositorio.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Abrí `http://localhost:3000`. Sin configurar Supabase, la interfaz demostrativa funciona sin crear reservas ni órdenes. Para probar reservas conectadas, usá exclusivamente un proyecto Supabase nuevo de desarrollo y seguí [docs/SUPABASE.md](docs/SUPABASE.md).

## Configuración

`.env.example` contiene todas las variables reconocidas. Los secretos se configuran en `.env.local` o en el gestor de variables del proveedor; nunca en código cliente, GitHub ni valores `NEXT_PUBLIC_`.

| Variable | Alcance y uso |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Origen HTTPS definitivo en despliegues; origen local durante desarrollo. Canonical, sitemap, enlaces y validación de origen. |
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave pública, sujeta a RLS. |
| `SUPABASE_SERVICE_ROLE_KEY` | Secreto de servidor para operaciones transaccionales y tareas programadas. Nunca exponerlo. |
| `RESERVATIONS_ENABLED` | `false` por defecto. Mantenerlo apagado hasta terminar pruebas de integración en el proyecto correcto. |
| `MERCADOPAGO_MODE` | Solo `sandbox`; cualquier otro valor desactiva el cliente de pagos. |
| `MERCADOPAGO_ACCESS_TOKEN` | Token de prueba `TEST-` exclusivamente. |
| `MERCADOPAGO_WEBHOOK_SECRET` | Secreto de firma de notificaciones de prueba. |
| `MERCADOPAGO_EXPECTED_COLLECTOR_ID` | ID de la cuenta receptora de prueba que se valida contra el pago consultado. |
| `PAYMENT_RECONCILIATION_SECRET` | Bearer de 32+ caracteres para `/api/internal/payments/reconcile`; solo sandbox. |
| `ORDER_LOOKUP_SECRET` | Secreto aleatorio de 32+ bytes para firmar accesos privados a comprobantes. |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Correo transaccional opcional. Verificar el dominio remitente antes de enviar. |
| `ADMIN_ALERT_EMAIL` | Destino opcional de avisos operativos, sin datos personales. |

No incluyas documentos de identidad: el flujo actual no los solicita. La clave de Supabase para navegador es publicable; la clave de servicio, MP, Resend y los secretos de firma son solo de servidor.

## Supabase: desarrollo aislado

1. Creá un proyecto nuevo de desarrollo y guardá sus credenciales en `.env.local`.
2. Revisá [docs/SUPABASE.md](docs/SUPABASE.md), verificá que el proyecto no contenga datos ajenos y aplicá en orden las siete migraciones de `supabase/migrations/` (`202610090001` y `202610110001` a `202610110006`). Las pruebas se ejecutan sobre una base aislada y no aplican cambios al proyecto remoto.
3. Verificá URL, publishable key y clave de servicio. No copies secretos a tickets o capturas.
4. Creá y verificá el primer usuario Auth; ejecutá `supabase/admin/first-owner.sql` en un entorno confiable, sustituyendo ambos marcadores por el mismo usuario/email verificados. La operación falla si ya hay un propietario activo.
5. Mantené `RESERVATIONS_ENABLED=false` hasta completar las pruebas contra ese Supabase. Para datos ficticios, usá el seed de desarrollo únicamente con su opt-in documentado.
6. Configurá URL de recuperación y SMTP en Supabase Auth. Realtime publica solo la proyección pública de disponibilidad.

Las migraciones crean RLS, restricciones únicas, funciones transaccionales, políticas de Storage y permisos explícitos. No las apliques a una base con actividad previa sin respaldo verificado y plan de conciliación. Consultá [docs/RESERVAS.md](docs/RESERVAS.md) para expiración, pagos inciertos y concurrencia.

## Desarrollo y pruebas

```sh
npm run dev
npm run typecheck
npm run lint
npm test
npm run test:db
npm run build
npm start
npm run test:smoke
```

`npm run check` agrupa generación de tipos, TypeScript, ESLint, pruebas unitarias y build. `test:db` arranca PostgreSQL temporal aislado, aplica migraciones y ejecuta escenarios de integridad/concurrencia; no requiere Supabase. `test:smoke` necesita la aplicación sirviendo en `127.0.0.1:3000`. El escaneo de dependencias `npm audit` requiere acceso al registro de npm.

## Estado implementado

- Portada, catálogo, ficha de premio, resultados, términos, privacidad, transparencia, FAQ y experiencia demostrativa responsive.
- Inventario independiente por sorteo; configuración inicial 200 números `001–200`, UYU 1.000 por número; selección, filtros y promociones cotizadas del lado servidor.
- Reservas PostgreSQL atómicas e idempotentes, con límite temporal, expiración programada y números vendidos inmutables.
- Checkout con formulario de nombre, correo, WhatsApp, consentimiento de condiciones y Mercado Pago como método validado por el servidor; los datos de tarjeta se ingresan en Checkout Pro. El carrito `/carrito` solo permite simular el recorrido y no envía ni persiste datos.
- Panel administrativo protegido, auditoría, gestión de inventario/promociones, roles y consultas privadas.
- Consultas seguras de participación mediante enlace firmado; correo Resend opcional.
- Checkout Pro y webhooks implementados **solo para sandbox**. Se valida firma, pago consultado, moneda, importe, referencia, cuenta y estado; ningún retorno del navegador confirma una compra.

Los sorteos, precios, cifras y fotos identificados como demo no son oferta real. Términos, privacidad y transparencia son borradores sujetos a revisión jurídica uruguaya. Ver [docs/EXPERIENCIA.md](docs/EXPERIENCIA.md) y [docs/IMAGENES-DEMO.md](docs/IMAGENES-DEMO.md).

## Netlify y dominio

El proyecto usa `netlify.toml`, Node 24 y `npm run build`. Netlify detecta Next.js y aplica su adaptador OpenNext automáticamente; el despliegue no se ha probado en una cuenta Netlify. Conectá un repositorio Git y configurá las variables anteriores por entorno en Netlify. Confirmá que `NEXT_PUBLIC_SITE_URL` use el dominio HTTPS asignado y que `RESERVATIONS_ENABLED` permanezca `false` durante la validación.

La función `netlify/functions/expire-reservations.ts` programa expiraciones cada minuto. Netlify ejecuta Scheduled Functions solo en deploy publicado; las vistas previas no disparan el cron automáticamente. Revisá logs y ejecución manual en el panel de Netlify. La función de conciliación de pagos es un endpoint protegido, pero todavía no hay una tarea programada desplegada que lo invoque. Los webhooks deben apuntar al dominio publicado de pruebas.

Para GitHub, conectá el remoto de la organización y revisá el primer push: este directorio aún no tiene repositorio Git ni remoto configurado. `.gitignore` excluye `.env*` salvo `.env.example`, `node_modules`, `.next`, `.netlify`, datos de prueba y logs. Habilitá HTTPS y configurá el dominio en Netlify antes de cambiar `NEXT_PUBLIC_SITE_URL`.

## Operación, observabilidad y recuperación

Hay encabezados HTTP de seguridad, errores de API normalizados, registros básicos de la tarea programada, auditoría administrativa en base de datos y alertas por email opcionales para incidentes de pagos. No hay plataforma centralizada de trazas/métricas, alertas de SLO, ni dashboard externo de errores. Configurá alertas para fallos de Functions, webhooks, conciliación, correo pendiente, reservas antiguas e indisponibilidad de Supabase, sin registrar tokens ni información personal.

Definí retención, frecuencia y acceso restringido a los backups de Supabase antes de usar datos reales. Ejecutá y documentá una restauración de prueba y un plan de recuperación antes del lanzamiento. No se ha probado todavía un backup/restore de un proyecto Supabase real.

## Límites y pendientes de producción

- No existe elegibilidad confirmada de Mercado Pago para rifas remuneradas en Uruguay; no hay credenciales productivas ni cobros reales habilitados.
- Falta revisión de abogado uruguayo, autorización legal aplicable, reglas finales de cancelación/reembolso, datos del organizador y condiciones de entrega del premio.
- Falta prueba de integración end-to-end contra un Supabase nuevo, correo real controlado, notificaciones reales de sandbox y ejecución del cron en Netlify.
- Requiere configurar GitHub, Netlify, dominio HTTPS, variables protegidas y backups/restauración.
- No se ha confirmado el escaneo remoto de vulnerabilidades: el registro npm no estuvo accesible durante la auditoría. Las dependencias directas están fijadas y existe `package-lock.json`.
- No se ha certificado aquí la matriz visual completa de 320, 375, 390, 768, 1024 y 1440 px ni Core Web Vitals de campo.
- La CSP ahora limita los orígenes por defecto y deriva los de Supabase de su URL configurada; permite scripts y estilos inline para conservar la representación actual. Antes de publicar, evaluar nonces/hashes CSP estricta y probarla con Supabase conectado.

El informe de esta revisión está en [docs/AUDITORIA-DESPLIEGUE.md](docs/AUDITORIA-DESPLIEGUE.md). La aplicación **no está lista para producción** mientras sigan pendientes elegibilidad, cumplimiento, integración externa y endurecimiento operativo.
