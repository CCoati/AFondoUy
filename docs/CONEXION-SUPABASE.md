# Conexión de A FONDO UY con Supabase

## Estado actual

- Proyecto Supabase: `A fondo UY` (`tfpvrgtmmwqriwcedqlm`), organización `NOVA Studio`.
- Región del proyecto conectado: `us-west-2`.
- Esquema anterior incompatible eliminado con autorización del usuario.
- Siete migraciones de A FONDO UY aplicadas; 24 tablas de negocio con RLS activado.
- Cargado únicamente un sorteo de demostración, `[DEMO] BMW de competición`, 200 números a UYU 1.000 y packs de 3/5.
- No existen cuentas Auth aún. El alta del primer propietario debe hacerse desde Supabase Dashboard después de iniciar sesión manualmente.
- `.env.local` tiene la URL y la clave publicable. La clave `service_role` no se recuperó ni se escribió en el proyecto.
- Reservas del backend desactivadas mientras no se configure `SUPABASE_SERVICE_ROLE_KEY`. Mercado Pago permanece en sandbox.

## Preparación de otro entorno

1. Usar un proyecto de desarrollo separado. Confirmar el costo y la región antes de crear proyectos adicionales.
2. Aplicar en orden los siete archivos de `supabase/migrations`.
3. Si el proyecto contiene el esquema del intento anterior, detenerse y revisar `supabase/admin/preflight.sql`; el reinicio aplicado a este proyecto fue destructivo y eliminó su sorteo, orden, pago y números anteriores.
4. Configurar `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` en `.env.local`. No poner claves privadas en variables `NEXT_PUBLIC_*`.
5. Para reservas, guardar `SUPABASE_SERVICE_ROLE_KEY` únicamente como secreto del servidor y habilitar `RESERVATIONS_ENABLED=true` después de probar concurrencia en un proyecto no productivo.
6. Mantener las credenciales de Mercado Pago en modo de prueba; no activar cobros reales sin autorización legal y del procesador.

## Primer administrador

1. En Authentication → Sign In / Providers, habilitar email/contraseña, exigir correo verificado y desactivar registros públicos.
2. En Authentication → Users, invitar el correo administrador. La persona define su contraseña desde el correo; no se comparte ni se guarda en el código.
3. Cuando el correo figure verificado, copiar su UUID y ejecutar `supabase/admin/first-owner.sql` en el SQL Editor confiable, reemplazando ambos marcadores por el UUID y el mismo correo verificado.
4. Configurar URL/redirect de recuperación para el entorno local y probar el login en `/acceso`.

## Verificaciones y límites

La base remota se verificó con migraciones, recuento de tablas y RLS, funciones de reserva, seed y permisos del predicado administrativo. El rol `anon` ya no puede ejecutar `is_admin()`. Los avisos de funciones `SECURITY DEFINER` autorizadas a `authenticated` corresponden a RPC administrativas que verifican el rol dentro de la función; revisar también los resultados de Advisors al continuar.

Las pruebas unitarias y lint pasan. La prueba local PostgreSQL falló por bloqueo de conexión loopback del entorno (`EACCES 127.0.0.1`); `next typegen`/build falla al canonicalizar el directorio del workspace en SWC. El chequeo TypeScript directo pasa. No se verificó una sesión Auth real porque la sesión del Dashboard requiere que el dueño inicie sesión manualmente.
