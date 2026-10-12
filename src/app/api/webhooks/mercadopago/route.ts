import { z } from "zod";
import { getSandboxPaymentConfig, mercadopagoClients, sendCriticalPaymentAlert, WebhookSignatureValidator } from "@/lib/payments";
import { reservationDatabase } from "@/lib/reservations/server";
import { processSandboxPayment } from "@/lib/payments/process";

export const runtime = "nodejs";

function reply(status: number, message: string) {
  return Response.json({ received: status < 300, message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const config = getSandboxPaymentConfig();
  if (!config) return reply(503, "Webhook sandbox no configurado.");

  const url = new URL(request.url);
  const paymentId = url.searchParams.get("data.id") ?? url.searchParams.get("id");
  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 8192) return reply(413, "Notificación demasiado grande.");
    body = JSON.parse(raw);
  } catch { return reply(400, "Notificación inválida."); }

  const notificationSchema = z.object({ id: z.union([z.string(), z.number()]), type: z.string().optional(), topic: z.string().optional(), action: z.string().optional(), data: z.object({ id: z.union([z.string(), z.number()]) }) });
  const notification = notificationSchema.safeParse(body);
  if (!notification.success) return reply(400, "Faltan datos de la notificación.");
  const dataId = String(notification.data.data.id);
  if (paymentId !== dataId || !["payment", "payments"].includes(notification.data.type ?? notification.data.topic ?? url.searchParams.get("type") ?? url.searchParams.get("topic") ?? "")) {
    return reply(400, "La notificación no corresponde a un pago.");
  }
  try {
    WebhookSignatureValidator.validate({
      xSignature: request.headers.get("x-signature"),
      xRequestId: request.headers.get("x-request-id"),
      dataId,
      secret: config.webhookSecret,
    });
  } catch { return reply(401, "Firma de notificación no válida."); }

  const db = reservationDatabase();
  const eventId = String(notification.data.id);
  const { data: claim, error: claimError } = await db.rpc("claim_webhook_event", { p_event: eventId, p_payment: dataId });
  if (claimError) {
    try { await sendCriticalPaymentAlert({ incident: "webhook-claim-failed", reference: dataId }); } catch { /* Alert delivery must not mask payment retry. */ }
    return reply(503, "No se pudo registrar la notificación.");
  }
  if (!claim) return reply(200, "Evento duplicado ya recibido.");

  try {
    const { payment } = mercadopagoClients(config.token);
    const result = await processSandboxPayment(db, payment, dataId, config.collectorId);
    if (result === "mismatch") {
      // A mismatched but authentic event is acknowledged without changing any order or number.
      const { error } = await db.rpc("finish_webhook_event", { p_event: eventId, p_claim: claim, p_success: true });
      if (error) throw error;
      return reply(202, "Pago en revisión; no se confirmó ningún número.");
    }
    const { error: finishError } = await db.rpc("finish_webhook_event", { p_event: eventId, p_claim: claim, p_success: true });
    if (finishError) throw finishError;
    return reply(200, result === "confirmed" ? "Pago verificado." : "Estado del pago actualizado.");
  } catch {
    await db.rpc("finish_webhook_event", { p_event: eventId, p_claim: claim, p_success: false });
    try { await sendCriticalPaymentAlert({ incident: "webhook-processing-failed", reference: dataId }); } catch { /* Keep provider retries independent from alert delivery. */ }
    return reply(503, "No se pudo procesar el pago; se reintentará la notificación.");
  }
}
