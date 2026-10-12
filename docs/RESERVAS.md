# Selección y reservas — contrato de implementación

Fecha: 11 de octubre de 2026. Extiende el diseño de demostración y el esquema inicial. Los pagos reales permanecen deshabilitados.

## Invariantes

1. La selección es local. Solo una transacción PostgreSQL crea una reserva.
2. Bloqueo por sorteo más bloqueo de filas en orden de número: validar, cotizar, crear pedido y reservar se confirman o revierten juntos.
3. Los precios/promociones se resuelven en servidor, usando la combinación de packs más conveniente. El cliente no manda descuentos ni un precio a cobrar. Un total esperado sirve solo para detectar cambios de cotización.
4. Cada número confirmado tiene una fila inmutable en `confirmed_numbers`, con clave primaria `(raffle_id, number)` y propietario. Los números vendidos nunca vuelven a estar disponibles mediante vencimiento o bloqueo administrativo.
5. Expirar una reserva sin intentos de pago requiere verificarlo dentro de la transacción. Un intento iniciado, pendiente o incierto bloquea la liberación hasta recibir una verificación confiable. La ausencia de webhook no prueba ausencia de pago.
6. Pago aprobado tardío: confirmar solo si el pedido conserva todos los números; de lo contrario crear un caso de conciliación/devolución. Nunca reasignar números vendidos a otra persona.
7. Idempotencia por solicitud y sesión invitada, restricciones de duplicación, cuotas de reserva y caché deshabilitada en datos sensibles.

## Separación de modos

- `/demo/sorteos/*`: inventario ilustrativo sin efectos financieros; cotización de promociones solicitada al servidor.
- `/sorteos/*`: inventario PostgreSQL, cotización real del servidor, reservas si el entorno está habilitado.
- `/checkout/[id]`: el identificador del pedido aparece en la URL, pero no permite leer la reserva sin la cookie invitada opaca HttpOnly correspondiente. No se envían datos de contacto al navegador en el recibo.
- API de pagos y webhook: bloqueadas hasta autorización del procesador y validación legal. Se implementa el núcleo transaccional para aplicar pagos verificados, pero no se acepta una aprobación enviada por el navegador.

## Política de promociones

Packs combinables y repetibles; algoritmo de programación dinámica elige el menor total para la cantidad, comparando todos los packs activos y unidades. Ejemplos: 3 por UYU 2700 y 5 por UYU 4250. Para 6 números puede convenir 5 + 1. La cotización y sus componentes se guardan en el pedido y no cambian al modificar promociones después.

## Actualización y desconexión

Realtime publica únicamente sorteo, número, estado y revisión; nunca pedidos, participantes ni identificadores de reserva. Los eventos invalidan la vista, que vuelve a leer una instantánea. Sondeo de respaldo y resincronización al recuperar conexión. Durante errores se conserva la selección visible y se bloquea iniciar checkout hasta actualizar. La disponibilidad se vuelve a comprobar siempre dentro de la transacción.

## Vencimiento y conciliación

Una tarea programada procesa reservas vencidas. Si el adaptador del proveedor no puede verificar un intento iniciado, la reserva se conserva para revisión. No se interpreta un timeout, una búsqueda sin resultados o una notificación ausente como autorización para liberar. Las verificaciones terminales y los pagos aprobados solo pueden aplicarse mediante funciones privadas de servidor. Las devoluciones quedan en una cola auditable; esta aplicación no ejecuta transferencias reales en esta etapa.

## Verificación

La suite ampliada de reservas y Supabase ejecutó 29 escenarios PostgreSQL con conexiones independientes: 30 compradores compitiendo por un número, operación todo-o-nada, idempotencia simultánea, rangos, bloqueo administrativo, promoción modificada, expiración sin pago, incertidumbre, pago tardío, diez confirmaciones concurrentes del mismo pago, protección de asignaciones vendidas, recibos privados y tarea programada. Las pruebas usan una base aislada con adaptaciones mínimas de `auth`/`storage`, sin credenciales ni datos de producción. El despliegue Supabase y su transporte Realtime todavía requieren una prueba de integración con credenciales de desarrollo.

## Endpoints y autorización

| Ruta | Contrato |
| --- | --- |
| POST `/api/sesion` | Inicializa cookie opaca antes de reservar, para recuperar una respuesta perdida |
| POST `/api/cotizacion` | UUID de sorteo + cantidad; descuentos exclusivamente PostgreSQL |
| POST `/api/demo/cotizacion` | Cotización aislada de fixtures; módulo `server-only` |
| GET `/api/sorteos/[id]/numeros` | Solo número y estado; datos públicos bajo RLS |
| POST `/api/reservas` | Contacto, consentimiento, números, clave idempotente y total esperado |
| GET `/api/reservas?raffleId=...` | Recupera el ID de la reserva activa de la cookie actual |
| GET `/api/reservas/[id]` | Recibo privado, sin información de contacto |

Mutaciones: origen exacto permitido, JSON estricto, cuerpo máximo 8 KB, cookies SameSite/HttpOnly/Secure en producción y `no-store`. El servidor calcula un fingerprint canónico para impedir reutilizar una clave idempotente con otros datos. El total enviado por el cliente solo se compara: nunca se usa para cobrar ni guardar un descuento. Auth y membresía se verifican en cada acción administrativa.

## Antes de integrar Mercado Pago

1. Verificar elegibilidad y completar requisitos legales. Los endpoints de pagos siguen bloqueados.
2. El adaptador debe invocar `begin_payment_attempt` **antes** de toda llamada capaz de crear un pago. Persistir su referencia externa e idempotencia.
3. Ante timeout, mantener el intento incierto. No crear otro pago a ciegas.
4. Verificar firma de notificación, consultar el pago al proveedor y validar cuenta receptora, referencia, importe, moneda y modo antes de invocar `apply_verified_payment`. Ninguna función privada acepta llamadas de `anon` o de usuarios comunes.
5. Solo una consulta confiable que determine un estado terminal e incapaz de cobrar puede llamar `record_verified_unpaid`. Una búsqueda vacía no alcanza. Mientras eso no exista, el job conserva los números y deja el pedido en revisión.
6. Si `apply_verified_payment` devuelve `refund_required`, atender `reconciliation_cases`: verificar identidad del pago y motivo, tramitar devolución en el procesador con idempotencia, registrar comprobante y conciliar. **No marcar como resuelto por recibir el webhook ni liberar manualmente un número vendido.** En esta etapa la cola se consulta en el panel; no hay ejecutor de devoluciones ni botón que simule haber devuelto dinero.
7. Reembolsos o contracargos posteriores a una confirmación no habilitan a revender el mismo número. La asignación histórica es inmutable.

## Despliegue y límites operativos

- Aplicar migraciones en desarrollo primero. Si ya existen ventas de una versión ajena, se necesita reconciliar/backfill de confirmaciones antes de migrar; este esquema se probó sobre una base nueva.
- `netlify/functions/expire-reservations.ts` programa un lote de hasta 100 reservas cada minuto. Supabase usa su reloj; el contador del navegador es informativo y nunca libera inventario.
- El bloqueo por sorteo serializa las mutaciones de su inventario. Es deliberado para priorizar integridad; distintos sorteos pueden operar independientemente.
- La cuota de seis reservas exitosas por hora y cookie limita uso accidental, no sustituye protección contra bots. Antes de publicar, incorporar límites de infraestructura/IP y observabilidad de saturación.
- La clave de servicio tiene privilegios amplios: exclusivamente entorno servidor, sin salida en logs o bundles. Publicar solo `number_availability` en Realtime; no añadir tablas de participantes, pedidos o reservas.
- Los administradores pueden modificar promociones; los pedidos ya reservados conservan el precio calculado dentro de su transacción.
- La cantidad de números solo puede cambiar antes de que exista actividad. El plazo sí puede variar para futuras reservas.

Referencias de implementación: [bloqueos PostgreSQL](https://www.postgresql.org/docs/17/explicit-locking.html), [Supabase Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes), [funciones programadas Netlify](https://docs.netlify.com/build/functions/scheduled-functions/).
