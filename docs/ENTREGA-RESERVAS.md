# Entrega: interfaz, reservas y Supabase

Fecha: 11 de octubre de 2026. Implementación local; no se desplegó ni se modificó un proyecto remoto. Los pagos reales siguen bloqueados.

## Resultado

Interfaz motorsport responsive con logo oficial, galería, sorteos demostrativos identificados, selector reutilizable y carrito. La selección local no constituye una reserva. La cotización se calcula en servidor y la reserva conectada se confirma exclusivamente mediante una transacción PostgreSQL.

Cada sorteo tiene inventario independiente, inicialmente 200 números y UYU 1.000 por número. Incluye selección manual y aleatoria, filtros, cinco estados, promociones configurables, disponibilidad Realtime con sondeo de respaldo y recuperación privada de reservas mediante cookie HttpOnly. El máximo por reserva es 20 números.

Las reservas vencidas con pagos inciertos conservan sus números. La confirmación crea una asignación única e inmutable; los pagos tardíos sin inventario disponible pasan a conciliación, sin reasignar números de otro comprador. El procedimiento de devolución real requiere el futuro adaptador del procesador.

## Archivos y responsabilidades

| Ubicación | Contenido |
| --- | --- |
| `src/domain/` | Contratos Zod, formatos, límites, dinero y fixtures demo |
| `src/components/numbers/` | Grilla, cotización, disponibilidad, formulario y estado de reserva |
| `src/components/demo/` | Galería y selección demostrativa sin reservas reales |
| `src/app/api/` | Cotización, sesión invitada, reservas y disponibilidad; pagos bloqueados |
| `src/lib/reservations/` | Acceso privado al servidor, cookies, validación HTTP y precios demo |
| `src/lib/supabase/`, `src/lib/auth.ts`, `src/proxy.ts` | Clientes seguros, renovación de sesión y permisos administrativos |
| `src/app/acceso/` | Inicio de sesión y recuperación de contraseña con token de un solo uso |
| `src/app/admin/` | Inventario, promociones, bloqueos, conciliaciones y roles para propietarios |
| `src/lib/raffle-media.ts`, `src/components/prize-gallery.tsx` | Galería publicada desde Storage privado y resultados sin datos personales |
| `supabase/migrations/` | Cuatro migraciones versionadas: modelo, reservas, administración y base Supabase |
| `supabase/admin/` | Inspección previa de solo lectura y designación segura del primer propietario |
| `supabase/seed.sql` | Dos sorteos de desarrollo identificados, sin compradores ni ganadores inventados |
| `netlify/functions/expire-reservations.ts` | Liberación segura programada cada minuto |
| `tests/` | Pruebas unitarias, PostgreSQL real aislado y comprobaciones HTTP |
| `docs/qa/` | Capturas de revisión móvil, tablet y escritorio |

## Decisiones de seguridad

- RLS en todas las tablas públicas y funciones con permisos explícitos. Las escrituras críticas, incluso desde service_role, pasan por procedimientos autorizados.
- Roles canónicos en `profiles`; los metadatos de registro nunca conceden administración. Solo un propietario puede cambiar roles y no puede desactivar al último propietario activo.
- Compradores sin cuenta. Datos de contacto, órdenes, pagos y asociaciones privadas no son accesibles al público.
- Realtime publica únicamente sorteo, número, estado y revisión, sin identificar compradores.
- Precios enteros en centésimos, promociones calculadas en servidor e idempotencia para solicitudes y pagos.
- Bloqueos transaccionales y restricciones únicas evitan doble asignación. La selección visual y los temporizadores del navegador no modifican la propiedad de un número.
- Recuperación de contraseña verifica el token de recuperación al enviar la nueva contraseña; abrir el enlace no lo consume. La ruta no comparte el token mediante Referer y no se almacena en caché.

## Verificación

- TypeScript estricto, ESLint y compilación de producción completados correctamente.
- 9 pruebas unitarias aprobadas.
- 29 escenarios sobre PostgreSQL real local aprobados: incluyen 30 compradores simultáneos intentando reservar el mismo número, confirmaciones concurrentes, carreras de vencimiento/pago, pagos tardíos, inventarios independientes, RLS, roles, Storage, webhooks y seed idempotente.
- Comprobaciones HTTP de rutas públicas, protección administrativa, recuperación, reservas privadas, precios, entradas manipuladas y bloqueo de pagos.
- Revisión visual en móvil (375/390 px), tablet (768 px) y escritorio (1440 px), sin desbordamiento horizontal. Se comprobaron selección, limpieza, azar, filtros, resumen y carrito demo.

Las pruebas locales adaptan mínimamente las tablas de Auth y Storage. No sustituyen la validación de correos, sesiones, Storage y suscripciones contra Supabase real.

## Configuración y trabajo pendiente

Seguir [SUPABASE.md](SUPABASE.md) para inspección previa, cuatro migraciones, variables, primer propietario, plantilla de recuperación, Storage, Realtime y seed. El MCP de Supabase ya está conectado, pero el proyecto encontrado pertenece a otro intento y no se modificó. Se está creando uno nuevo; la herramienta de costo no está disponible, así que todavía no se aplicaron migraciones remotas ni se enviaron correos. Ver [estado de conexión](CONEXION-SUPABASE.md).

Antes de habilitar una operación real: conectar un proyecto de desarrollo, ejecutar allí pruebas de integración, configurar SMTP y límites de autenticación, verificar la tarea programada en Netlify y revisar respaldos y observabilidad. Falta una interfaz de carga de imágenes y publicación/verificación de resultados; sus procedimientos seguros ya están preparados.

La integración de Mercado Pago, consulta y cancelación segura de intentos, conciliación y devoluciones automáticas requiere autorización del procesador y revisión legal. Los documentos legales siguen provisionales y la indexación está deshabilitada. No hay un interruptor que habilite cobros reales.

Ver también [contrato de reservas](RESERVAS.md), [plan Supabase](PLAN-SUPABASE.md) y [procedencia de imágenes](IMAGENES-DEMO.md).
