# Auditoría de preparación para despliegue

**Fecha:** 12 de octubre de 2026  
**Resultado:** compilación local aprobada; despliegue productivo no aprobado.

## Implementado y verificado localmente

- `npm run check` con Node 24.19.0: tipos de rutas Next.js, TypeScript estricto, ESLint, 16 pruebas unitarias y build optimizado de Next.js 16.4.0 completados.
- `npm run test:db`: 38 escenarios en PostgreSQL temporal aislado. Incluyó 30 conexiones simultáneas compitiendo por el número `001` (una sola reserva), idempotencia, manipulación de importe, RLS, funciones privadas, pagos repetidos/tardíos, expiración y ausencia de doble asignación.
- `npm run test:smoke`: 14 grupos de comprobaciones HTTP aprobados en el servidor local. Verificó rutas públicas, cabeceras de seguridad, acceso administrativo, CSRF, límites de entrada, cotizaciones y bloqueo de pagos sin configuración sandbox.
- Inspección de `.next/static`: no se encontraron cadenas correspondientes a `SUPABASE_SERVICE_ROLE_KEY`, tokens de Mercado Pago/Resend ni secretos de consulta/conciliación.
- Dependencias directas con versiones fijadas y `package-lock.json` presente. Sin paquetes superfluos para animación o visualización.
- Next.js usa `next/image`, atributos `sizes` y carga diferida predeterminada en imágenes fuera del hero/galería inicial. Netlify documenta integración OpenNext automática y entrega de imágenes mediante su CDN.
- `.gitignore` excluye `.env*` excepto `.env.example`, artefactos Next/Netlify, dependencias, logs y datos temporales. No se encontró repositorio Git ni remoto local.
- `netlify/functions/expire-reservations.ts` declara ejecución cada minuto; usa la clave de servicio únicamente en servidor y una función SQL restringida.

## Riesgos o verificaciones pendientes

| Prioridad | Estado | Hallazgo |
| --- | --- | --- |
| Bloqueante | Pendiente | Mercado Pago no confirmó elegibilidad de rifas remuneradas para Uruguay y esta cuenta/modalidad. El código productivo está bloqueado; solo se permiten credenciales `TEST-` y modo sandbox. No se verificaron credenciales, webhook público ni checkout de extremo a extremo. |
| Bloqueante | Pendiente | Términos y privacidad son borradores. Faltan dictamen legal local, autorización aplicable, organizador y condiciones definitivas de sorteo, reembolso y entrega. |
| Bloqueante | Pendiente | Las comprobaciones de PostgreSQL usan un motor local con adaptaciones de Auth/Storage; no equivalen a validar el proyecto Supabase nuevo, SMTP, Auth, Storage y Realtime reales. No se modificó ningún Supabase remoto. |
| Alta | Parcial | Se agregó `default-src 'self'`, lista de scripts y estilos, fuentes/imágenes/conexiones restringidas y orígenes Supabase derivados de la URL. Para mantener la UI actual permite `unsafe-inline`; evaluar nonces/hashes CSP estricta y verificarla con Supabase real antes de publicar. |
| Alta | Pendiente | No hay escaneo de vulnerabilidades confirmado: `npm audit --omit=dev` no pudo conectar a `registry.npmjs.org` por resolución de DNS del entorno. Repetir desde CI/red autorizada antes del lanzamiento. |
| Alta | Pendiente | No hay configuración GitHub/Netlify ejecutada, dominio ni HTTPS comprobados. Este checkout no tiene `.git` o remoto; la integración Netlify solo está preparada por configuración. |
| Alta | Pendiente | La conciliación de pagos tiene un endpoint protegido, pero falta el cron desplegado que lo invoque y la observación de resultados. Las reservas inciertas se conservan de forma segura hasta verificar estado. |
| Media | Pendiente | La matriz de 320, 375, 390, 768, 1024 y 1440 px no se revalidó completa en navegador en esta auditoría. Tampoco se midieron LCP/INP/CLS reales ni se ejecutó Lighthouse sobre un deploy. |
| Media | Observación | Las imágenes fuente demostrativas son PNG grandes (aprox. 2.2–2.9 MB cada una). El componente Next Image y la CDN de Netlify pueden servir variantes optimizadas, pero falta medir bytes entregados y LCP desde un deploy real. |
| Media | Pendiente | Observabilidad disponible: registros básicos de Functions, auditoría en DB y correo opcional de incidentes. Faltan métricas/trazas centralizadas, umbrales/alertas operativas, política aprobada de backups y un ejercicio real de restauración. |

## Configuración Netlify revisada

`netlify.toml` declara `npm run build`, publicación `.next`, Node 24 y desactiva telemetría. La integración actual de Netlify detecta Next.js y configura OpenNext automáticamente; no se fijó una versión de adaptador. La función `expire-reservations` tiene cron por código (`* * * * *`). Las tareas programadas de Netlify se ejecutan en deploys publicados, no automáticamente en Deploy Previews, y tienen límite de 30 segundos según la documentación consultada.

La conciliación periódica no está conectada a una tarea programada. Agregarla requiere una URL pública de pruebas, `PAYMENT_RECONCILIATION_SECRET` protegido y una verificación de ejecución que nunca libere inventario con un estado de pago incierto.

## Decisión

La aplicación compila y sus invariantes principales de reservas y asignación única pasan las pruebas locales. **No se debe declarar lista para producción ni activar reservas conectadas o pagos reales** hasta resolver los bloqueantes y completar las pruebas externas. El cambio de esta auditoría se limita a documentación operativa; no altera datos ni habilita pagos.

## Fuentes de plataforma

- [Netlify: Next.js y OpenNext](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/)
- [Netlify: Scheduled Functions](https://docs.netlify.com/build/functions/scheduled-functions/)
- [Next.js 16: despliegue](https://nextjs.org/docs/app/getting-started/deploying)
