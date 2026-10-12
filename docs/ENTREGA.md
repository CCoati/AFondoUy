# Entrega inicial — A FONDO UY

Documento histórico de la primera etapa. El estado vigente está en [ENTREGA-RESERVAS.md](ENTREGA-RESERVAS.md) y [RESERVAS.md](RESERVAS.md).

Fecha: 9 de octubre de 2026 (Uruguay).

## Resultado

Proyecto Next.js App Router compilable con TypeScript estricto, React, Tailwind, Zod y clientes oficiales de Supabase. Se reutilizó `logo.png`, único archivo previo. No había repositorio Git ni código para integrar. No se creó un repositorio remoto ni se publicó el sitio.

La portada utiliza negro, blanco y rojo con estética deportiva. Los estados vacíos no inventan premios, ventas ni ganadores. Los sorteos se consultan desde Supabase cuando se configura; sin configuración, el sitio puede revisarse localmente. El panel administrativo es una base protegida, sin gestión operativa todavía.

## Archivos creados

Las rutas siguientes son relativas a la raíz del proyecto.

| Archivos | Función |
| --- | --- |
| `package.json`, `package-lock.json` | Dependencias exactas, instalación reproducible y comandos |
| `tsconfig.json`, `next-env.d.ts` | TypeScript estricto y tipos Next |
| `next.config.ts` | Encabezados de seguridad y configuración Next |
| `postcss.config.mjs`, `eslint.config.mjs` | Estilos y análisis estático |
| `.nvmrc`, `.gitignore`, `.env.example` | Runtime, exclusión de secretos y configuración documentada |
| `netlify.toml` | Preparación para Netlify con Node 24 |
| `public/logo.png` | Copia del logo original, conservado sin modificaciones |
| `src/app/layout.tsx`, `src/app/globals.css` | Estructura, metadatos y diseño responsive |
| `src/app/page.tsx` | Portada con catálogo o estado vacío |
| `src/app/sorteos/[slug]/page.tsx` | Detalle de un sorteo real publicable |
| `src/app/resultados/page.tsx` | Historial inicial de sorteos |
| `src/app/carrito/page.tsx` | Estado inicial de la futura selección |
| `src/app/preguntas-frecuentes/page.tsx` | FAQ accesible con desplegables nativos |
| `src/app/terminos/page.tsx`, `src/app/privacidad/page.tsx` | Documentos expresamente provisionales |
| `src/app/acceso/page.tsx`, `src/app/acceso/actions.ts` | Login/logout administrativo con validación en servidor |
| `src/app/admin/layout.tsx`, `src/app/admin/page.tsx` | Verificación de identidad y membresía; panel inicial |
| `src/app/not-found.tsx`, `src/app/error.tsx` | Ausencia de páginas y recuperación de errores |
| `src/app/robots.ts` | Bloqueo temporal de indexación |
| `src/app/api/reservas/route.ts`, `src/app/api/checkout/route.ts`, `src/app/api/webhooks/mercadopago/route.ts` | Operaciones bloqueadas por servidor, HTTP 503 |
| `src/components/brand.tsx`, `site-shell.tsx`, `page-heading.tsx`, `raffle-list.tsx` | Componentes reutilizables (todos en `src/components`) |
| `src/domain/raffle.ts` | Modelos Zod, numeración, moneda y contrato inicial de reservas |
| `src/lib/env.ts`, `auth.ts`, `raffles.ts`, `payments.ts` | Entorno, autorización, lectura y bloqueo de pagos (todos en `src/lib`) |
| `src/lib/supabase/server.ts`, `src/proxy.ts` | Clientes de servidor y renovación de sesión sin caché compartida |
| `supabase/migrations/202610090001_initial_schema.sql` | 12 tablas, índices, restricciones, RLS y bucket privado |
| `tests/raffle.test.ts`, `tests/smoke.mjs` | Pruebas de reglas y comprobaciones HTTP locales |
| `README.md`, `docs/ARQUITECTURA.md`, `docs/ENTREGA.md` | Inicio, plan previo y entrega |
| `docs/vista-inicial.jpg` | Captura de la portada revisada en navegador |

`node_modules` y `.next` son resultados locales ignorados, no archivos fuente a versionar.

## Decisiones técnicas

- Importes enteros: 100000 centésimos corresponden a UYU 1.000; 200 números por defecto, del 001 al 200.
- Lectura pública separada de sesiones administrativas; las páginas con datos son dinámicas.
- Zod valida tanto entradas previstas como datos recibidos de Supabase. No hay escritura de participantes en esta etapa.
- La autenticación consulta Auth mediante `getUser`; el rol se comprueba en una tabla privada. No se confía en metadata editable por usuarios.
- RLS y permisos de solo lectura para clientes; sin escrituras de negocio públicas. Solo administradores autorizados pueden trabajar con el bucket privado.
- Unicidad compuesta de número/sorteo y referencias que evitan mezclar sorteos en pedidos/reservas. Las restricciones no sustituyen la futura transacción de reserva y confirmación.
- Sin credenciales privadas, SDK de pagos, analítica externa ni fuentes remotas. CSS y fuentes del sistema reducen dependencias de red.
- No hay interruptor de cobros: los endpoints están bloqueados en código. No aceptan un pago como aprobado por recibir un JSON o un retorno del navegador.
- Node 24.19.0 para verificación. Se detectó Node 20 global; no se modificó la instalación del usuario.

## Verificación realizada

| Comprobación | Resultado |
| --- | --- |
| Generación de tipos Next + TypeScript | Correcta, sin errores |
| ESLint final | Correcto, sin errores ni advertencias |
| Pruebas de reglas | 4/4 correctas: numeración, importes, validación de reservas y esquema público |
| Compilación de producción final | Correcta, Next.js 16.4.0; 10 páginas estáticas generadas y rutas dinámicas reconocidas |
| Siete rutas públicas y acceso | HTTP 200 con encabezados esperados |
| `/admin` sin configuración | HTTP 307 hacia acceso, caché privada/no-store |
| POST reservas/checkout/webhook | HTTP 503, código `PAYMENTS_NOT_ENABLED`, sin caché |
| Sorteo inexistente | HTTP 404 |
| Robots | Indexación bloqueada |
| Revisión visual | Portada de escritorio y tamaño móvil; sin desbordamiento horizontal en móvil (ancho de contenido = ancho visible de 375 px) |
| Navegación y FAQ | Enlace funciona y respuesta se despliega correctamente |
| Consola del navegador | Sin errores capturados durante la revisión |
| Auditoría de producción (`--omit=dev`) | 0 vulnerabilidades reportadas |

La sandbox bloqueó inicialmente el acceso a npm y la resolución de rutas de Next en Windows. Se usaron las escalaciones aprobadas para instalar y compilar. La vista local se utilizó para QA y se detiene al terminar; iniciar con `npm run dev` para revisarla nuevamente.

## Aviso pendiente de dependencias de desarrollo

`npm audit` completo reporta 5 entradas de severidad alta en la cadena `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces`. El aviso raíz es https://github.com/advisories/GHSA-vfj7-8cjw-p6xm (agotamiento de pila con patrones anidados). `braces@3.0.3` era la última versión consultada y seguía afectada.

No son cinco vulnerabilidades independientes del runtime ni afectan a la auditoría de producción; son cinco paquetes de desarrollo afectados por una misma cadena. Se conserva el aviso visible y se evita procesar patrones de lint no confiables. Revisar parche/actualización antes de integrar CI con entradas externas. No se ejecutó `npm audit fix --force`: proponía degradar eslint-config-next a una versión mayor antigua incompatible con la base elegida.

## No verificado todavía

No se proporcionaron proyecto ni credenciales Supabase. La migración está preparada pero NO aplicada ni ejecutada contra PostgreSQL. RLS, Storage, sesiones reales, renovación de tokens y permisos de usuarios reales requieren pruebas de integración. No se probaron concurrencia, pagos, entregabilidad de correo, despliegue Netlify ni autorización legal. La revisión visual no equivale a una auditoría WCAG completa ni cubre todos los dispositivos.

## Próximas etapas

1. Revisar la modalidad legal, identidad del organizador, permisos aplicables y elegibilidad explícita del procesador. Aprobar bases y política de privacidad; no considerar los textos preparatorios como documentos definitivos.
2. Crear Supabase de desarrollo, aplicar/revisar migración, generar tipos DB y probar RLS con tres roles. Configurar MFA administrativo, límites de login, auditoría y secretos por entorno.
3. Implementar CRUD de sorteos y promociones, publicación de imágenes y generación transaccional de números. Paginar catálogos mayores a 50 sorteos.
4. Implementar selector manual/aleatorio, carrito de un sorteo, reservas atómicas con vencimiento, idempotencia y límites distribuidos. Pruebas de dos compradores simultáneos y carreras de expiración/confirmación.
5. Implementar checkout de invitado y Mercado Pago sandbox si existe elegibilidad. Verificar firma, consulta del pago, monto/moneda/referencia/cuenta y eventos duplicados o fuera de orden; definir reembolsos y reconciliación.
6. Implementar confirmación al participante, historial verificable, publicación de resultados y actas sin exponer datos personales.
7. Ensayar Netlify, políticas de caché, backups/restauración y monitoreo. Completar CSP, accesibilidad, SEO y pruebas de carga. Mantener pagos reales bloqueados hasta cumplir los requisitos.
