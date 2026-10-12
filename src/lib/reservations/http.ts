import "server-only";
import { z } from "zod";
import { getSiteUrl } from "@/lib/env";
const errors: Record<string, [number, string]> = {
  OWNER_REQUIRED: [403,"Solo el propietario puede gestionar permisos administrativos."],
  LAST_OWNER_REQUIRED: [409,"Debe quedar al menos un propietario activo."],
  VERIFIED_USER_REQUIRED: [422,"La cuenta debe existir y tener su correo verificado."],
  PROFILE_NOT_FOUND: [404,"No encontramos el perfil de esa cuenta."],
  NUMBERS_UNAVAILABLE: [409, "Algunos números ya no están disponibles. Actualizamos la grilla para que puedas elegir otros."],
  PRICE_CHANGED: [409, "La promoción cambió. Revisá el nuevo total antes de continuar."],
  ACTIVE_RESERVATION_EXISTS: [409, "Ya tenés una reserva activa para este sorteo. Esperá su resolución antes de iniciar otra."],
  IDEMPOTENCY_CONFLICT: [409, "Esta solicitud ya se utilizó. Volvé a revisar tu selección."],
  RATE_LIMITED: [429, "Alcanzaste el límite de reservas por hora. Intentá más tarde."],
  RESERVATION_NOT_FOUND: [404, "No encontramos una reserva asociada a esta sesión."],
  RAFFLE_UNAVAILABLE: [404, "Este sorteo no está disponible para reservar."],
  SESSION_REQUIRED: [401, "No pudimos recuperar tu sesión. Habilitá las cookies y volvé a intentar."],
  ORIGIN_DENIED: [403, "No pudimos validar el origen de la solicitud. Recargá la página."],
  UNCONFIGURED: [503, "Las reservas todavía no están habilitadas. Tu selección no bloquea números."],
  INVENTORY_IN_USE: [409, "No se puede cambiar la cantidad: este sorteo ya tiene actividad."],
  INVALID_PROMOTION: [422, "Revisá el precio, la cantidad y las fechas de la promoción."],
};
export function json(data: unknown, status = 200) { return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } }); }
export function failure(error: unknown) {
  if (error instanceof z.ZodError || error instanceof SyntaxError) return json({ code: "INVALID_INPUT", message: "Revisá los datos ingresados y la cantidad de números." }, 422);
  const code = error && typeof error === "object" && "message" in error ? String(error.message) : "UNKNOWN";
  const [status, message] = errors[code] ?? [503, "No pudimos completar la operación. Tu selección sigue disponible; intentá nuevamente."];
  return json({ code: errors[code] ? code : "UNAVAILABLE", message }, status);
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin"), allowed = [new URL(getSiteUrl()).origin];
  if (process.env.NODE_ENV === "development") allowed.push("http://localhost:3000", "http://127.0.0.1:3000");
  if (!origin || !allowed.includes(origin)) throw new Error("ORIGIN_DENIED");
}
export async function readJson(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new SyntaxError();
  const reader = request.body?.getReader(); if (!reader) throw new SyntaxError();
  const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > 8192) { await reader.cancel(); throw new SyntaxError(); } chunks.push(value); } }
  finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
