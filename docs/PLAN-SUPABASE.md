# Ampliación de Supabase — 11/10/2026

Se conservan las tres migraciones existentes y sus transacciones de reserva. La cuarta migración será aditiva: perfiles y roles, galería, vínculo privado de ganadores, auditoría ampliada y control de procesamiento de webhooks.

- `profiles` será la fuente de autorización (`viewer`, `admin`, `owner`, activo/inactivo). Se migrarán las membresías de `admin_users` sin eliminar esa tabla; quedará como legado de solo lectura. Ningún dato editable de Auth determinará un rol.
- `reservation_numbers` será una vista con `security_invoker`, derivada de `reservations` y `order_items`: conserva también reservas vencidas sin duplicar su lista de números.
- `winners` enlazará un resultado con una asignación confirmada. La identidad se obtiene de `confirmed_numbers` solo en consultas privadas; el resultado público no contiene participantes.
- `audit_logs` expondrá de forma privada los eventos de auditoría existentes, sin una segunda tabla de historial.
- `raffle_images` referenciará objetos de Storage con orden, texto alternativo y estado de publicación. El bucket seguirá privado; solo imágenes publicadas de sorteos publicados podrán leerse públicamente con URL firmada.
- Auth: acceso y recuperación en servidor, cookies persistentes HttpOnly, verificación remota de identidad y rol en cada operación; recuperación de contraseña verificada mediante token de Supabase. No hay signup público.
- Seed separado, explícitamente habilitado para desarrollo, idempotente y sin crear administradores, contraseñas, ventas ni ganadores.

Orden: migración y pruebas de integridad/roles → autenticación y recuperación → conexión de galería/resultados → seed y procedimiento del primer owner → documentación y pruebas de producción. No se aplicará nada a un proyecto remoto sin inspeccionarlo primero.
