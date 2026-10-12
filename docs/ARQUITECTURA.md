# A FONDO UY — plan previo a implementación

Fecha: 9 de octubre de 2026. Alcance de esta entrega: base compilable, interfaz inicial, integración de lectura opcional, control de acceso y esquema SQL. No es una plataforma habilitada para vender.

## Inspección y reutilización

La carpeta inicial solo contiene `logo.png`, sin código, manifiestos ni repositorio Git. Conservar el original y reutilizar una copia en `public/`. No se inspeccionaron carpetas ajenas al proyecto.

## Referencia y UX

Se revisó el HTML público de https://www.rifakawasaki.shop/ el 9/10/2026. Patrones útiles: selección manual/aleatoria, resumen de selección, precio visible, explicación del sorteo y preguntas frecuentes. No se comprobó el backend ni el proceso de cobro. No reutilizar textos, código, imágenes de premios ni identidad de esa página.

Mejoras propuestas: UYU inequívoco, números 001–200, estados de reserva separados de venta, errores recuperables, navegación por teclado, resumen persistente en móvil y condiciones visibles antes de pagar. No afirmar premios, ganadores, ventas, autorizaciones o disponibilidad que no existan en los datos.

Identidad: logo proporcionado, carbón/blanco/rojo, composición deportiva y minimalista, fuentes del sistema sin descargas externas. Portada editorial con estado vacío honesto.

## Arquitectura

Next.js App Router y Server Components para páginas públicas. React cliente solo donde haya interacción. TypeScript estricto, Zod en fronteras de datos. Servicios de servidor separados de reglas puras y componentes. Tailwind CSS para estilos. Netlify ejecutará Next.js mediante su adaptador automático OpenNext; no exportar estáticamente las rutas de servidor.

Supabase PostgreSQL será la fuente de verdad. Supabase Auth solo para administradores; cada acceso comprobará usuario contra Auth y pertenencia a `admin_users`. RLS protegerá tablas; la clave pública nunca concede acceso a participantes, pedidos o pagos. Storage almacenará imágenes públicas aprobadas; la carga administrativa queda para otra fase. No usar service-role en el navegador.

```text
src/
  app/                 # Páginas, layouts y endpoints
  components/          # Interfaz reutilizable
  domain/              # Modelos, validaciones, moneda, selección
  lib/                 # Entorno, Supabase, autorización, lectura
supabase/migrations/   # Esquema versionado y RLS
tests/                 # Reglas y validaciones críticas
docs/                  # Plan, verificación y siguientes etapas
public/                # Logo proporcionado
```

## Modelo inicial

| Entidad | Propósito y restricciones |
| --- | --- |
| admin_users | Referencia a auth.users; asignación manual por operador confiable |
| raffles | Slug único, estado borrador/activo/cerrado/sorteado/cancelado, precio en centésimos, moneda UYU, cantidad y bases |
| participants | Datos privados mínimos del comprador invitado; sin cuenta obligatoria |
| orders | Sorteo, participante, totales inmutables, estado, vencimiento y clave de idempotencia |
| reservations | Pedido, vencimiento y estado; titularidad validada en servidor |
| raffle_numbers | Clave (sorteo, número), estado disponible/reservado/vendido, reserva actual; evita duplicación |
| order_items | Foto histórica de los números y precios del pedido; referencia compuesta al mismo sorteo |
| payments | ID externo único, monto, moneda, estado, pedido; sin datos de tarjeta |
| webhook_events | ID de evento único y estado de procesamiento; sin payload personal innecesario |
| promotions | Packs de cantidad/precio, vigencia y alcance por sorteo; sin acumulación implícita |
| draw_results | Número ganador del mismo sorteo, fecha, evidencia y publicación explícita |
| audit_events | Registro privado de acciones administrativas |

Valores iniciales: 200 números, 100000 centésimos = UYU 1.000 por número, numeración desde 1 formateada con mínimo 3 dígitos. Cantidad configurable hasta 10000 en este modelo. Base de datos en UTC; presentación America/Montevideo.

## Concurrencia y pagos: contrato para la siguiente fase

Una única transacción PostgreSQL deberá bloquear los números solicitados en orden estable (`FOR UPDATE`), liberar reservas vencidas bajo el mismo bloqueo, verificar estado/precio/promoción, crear pedido/reserva y asignar números. Si uno ya no está disponible, revertir todo y devolver 409. Nunca resolver exclusividad en memoria de una función Netlify ni confiar en importes enviados por el cliente. La selección visual no constituye una reserva.

TTL inicial propuesto: 10 minutos, configurable en servidor. Expiración perezosa al reservar más tarea programada de limpieza. Carrito inicialmente de un sorteo por pedido; múltiples sorteos independientes, sin cobro cruzado. Límite propuesto 20 números por pedido y rate limiting distribuido antes de abrir reservas.

Mercado Pago sujeto a elegibilidad: integración futura con checkout alojado; firma de webhook, consulta autenticada del pago al proveedor, comparación de referencia/monto/moneda/cuenta receptora/modo, idempotencia y transición transaccional a vendido. Pago tardío sobre número reasignado: revisión/reembolso, nunca vender dos veces. Los retornos del navegador no confirman pagos. Registrar eventos durables y reconciliar fallos. No almacenar tarjetas ni marcar pago aprobado desde un formulario.

En esta etapa los endpoints de reserva/checkout/webhook responderán 503 y no ejecutarán efectos. Ni una variable de entorno podrá activar cobros: el adaptador todavía no existe. Habilitarlo exige implementación, pruebas y verificación documentada legal y del procesador.

## Dependencias y justificación

- Next.js, React, React DOM: App Router y renderizado.
- TypeScript y tipos: chequeo estricto.
- Tailwind CSS y PostCSS: estilos sin biblioteca de componentes.
- Zod: validación de entradas, entorno y filas externas.
- @supabase/supabase-js y @supabase/ssr: clientes oficiales y cookies de administrador.
- server-only: impedir importar integración privada al cliente.
- tsx: ejecutar pruebas TypeScript con el runner nativo de Node.
- ESLint y eslint-config-next: comprobación estática del framework.

No añadir ORM, SDK de Mercado Pago, estado global ni biblioteca de UI hasta justificar su necesidad. Versiones exactas y lockfile al instalar. Node 24 como runtime del proyecto, usando el runtime disponible en el entorno (Node global 20 no se utilizará).

## Orden y criterios de aceptación

1. Configuración Next/TS/Tailwind, variables documentadas y Netlify.
2. Migración inicial con claves, restricciones y RLS; sin datos de demostración.
3. Portada, sorteo, historial, carrito vacío y páginas legales marcadas como pendientes de revisión.
4. Lectura de sorteos reales y acceso admin protegido; configuración ausente debe cerrar acceso.
5. Comprobación de tipos, lint, pruebas de reglas, build de producción y revisión de rutas.
6. Después: aplicar migración en Supabase de desarrollo, generar tipos, probar RLS y CRUD administrativo.
7. Después: reservas atómicas y promociones; pruebas concurrentes y expiración.
8. Después: checkout sandbox, webhooks, reembolsos y reconciliación; pruebas de fallos e idempotencia.
9. Antes de producción: autorizaciones, textos legales, MFA, rate limiting, monitorización, backups y despliegue de ensayo Netlify.

## Fuentes oficiales consultadas

- https://nextjs.org/docs/app/getting-started/installation
- https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/
- https://supabase.com/docs/guides/auth/server-side/creating-a-client
- https://www.gub.uy/tramites/solicitud-autorizacion-rifas

El trámite nacional consultado menciona emisiones superiores a 2000 UR; eso NO determina exención para otras rifas ni autorización de esta plataforma. Revisar la modalidad concreta, alcance territorial y requisitos departamentales con asesoramiento profesional. No se obtuvo confirmación de elegibilidad de Mercado Pago; no inferirla de la existencia de otras webs ni de políticas de Mercado Libre.
