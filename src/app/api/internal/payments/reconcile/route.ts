import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getSandboxPaymentConfig, mercadopagoClients, sendCriticalPaymentAlert } from "@/lib/payments";
import { processSandboxPayment } from "@/lib/payments/process";
import { reservationDatabase } from "@/lib/reservations/server";

export const runtime = "nodejs";
const attemptsSchema = z.array(z.object({ id: z.uuid(), order_id: z.uuid(), external_reference: z.string().min(1) }));
const searchSchema = z.object({ results: z.array(z.object({ id: z.union([z.string(), z.number()]).optional() })).optional() });

function authorized(request: Request) {
  const secret = process.env.PAYMENT_RECONCILIATION_SECRET;
  const supplied = /^Bearer\s+([^\s]+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!secret || secret.length < 32 || !supplied || Buffer.byteLength(secret) !== Buffer.byteLength(supplied)) return false;
  return timingSafeEqual(Buffer.from(secret), Buffer.from(supplied));
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ message: "No autorizado." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const config = getSandboxPaymentConfig();
  if (!config) return Response.json({ message: "La conciliación de pagos de prueba no está configurada." }, { status: 503 });
  try {
    const db = reservationDatabase();
    const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data, error } = await db.from("payment_attempts").select("id,order_id,external_reference")
      .in("status", ["pending", "unknown"]).lt("created_at", cutoff).limit(25);
    if (error) throw error;
    const attempts = attemptsSchema.parse(data);
    const { payment } = mercadopagoClients(config.token);
    const outcomes: string[] = [];
    for (const attempt of attempts) {
      const found = await payment.search({ options: { external_reference: attempt.external_reference, limit: 10, sort: "date_last_updated", criteria: "desc" } });
      const results = searchSchema.parse(found).results ?? [];
      const ids = [...new Set(results.map(result => result.id === undefined ? "" : String(result.id)).filter(Boolean))];
      if (ids.length) {
        for (const id of ids) outcomes.push(await processSandboxPayment(db, payment, id, config.collectorId));
        continue;
      }

      // Release only after the reservation is well past expiry and an exact
      // provider-side search found no transaction for this attempt.
      const { data: orderData, error: orderError } = await db.from("orders").select("expires_at")
        .eq("id", attempt.order_id).single();
      if (orderError) throw orderError;
      const safeAfter = Date.parse(orderData.expires_at) + 15 * 60 * 1000;
      if (Date.now() < safeAfter) continue;
      const { error: markError } = await db.rpc("record_verified_unpaid", {
        p_attempt_id: attempt.id,
        p_evidence: `mercadopago:search-empty:${attempt.external_reference}:${new Date().toISOString()}`,
      });
      if (markError && !String(markError.message).includes("PAYMENT_ALREADY_APPROVED")) throw markError;
      const { error: expireError } = await db.rpc("expire_unpaid_order", { p_order_id: attempt.order_id });
      if (expireError) throw expireError;
      outcomes.push("expired_after_provider_check");
    }
    return Response.json({ checked: attempts.length, outcomes }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    try { await sendCriticalPaymentAlert({ incident: "payment-reconciliation-failed", reference: new Date().toISOString().slice(0, 13) }); } catch { /* Alert failures do not prevent the scheduled retry. */ }
    return Response.json({ message: "No se pudo completar la conciliación; se volverá a intentar." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
